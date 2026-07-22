#!/usr/bin/env python3
"""Compute native recovery and sequence diversity for recorded design FASTA files."""

from __future__ import annotations

import argparse
import csv
import itertools
import json
import math
import statistics
import sys
from collections import Counter
from pathlib import Path


ALLOWED_RESIDUES = set("ACDEFGHIKLMNPQRSTVWYX")


def read_fasta(path: Path) -> list[tuple[str, str]]:
    records: list[tuple[str, str]] = []
    identifier: str | None = None
    sequence: list[str] = []
    for line_number, raw_line in enumerate(path.read_text(encoding="utf-8").splitlines(), start=1):
        line = raw_line.strip()
        if not line:
            continue
        if line.startswith(">"):
            if identifier is not None:
                records.append((identifier, "".join(sequence).upper()))
            identifier = line[1:].strip().split()[0] if line[1:].strip() else ""
            if not identifier:
                raise ValueError(f"empty FASTA identifier at line {line_number} in {path}")
            sequence = []
        elif identifier is None:
            raise ValueError(f"sequence before first FASTA header at line {line_number} in {path}")
        else:
            sequence.append("".join(line.split()))
    if identifier is not None:
        records.append((identifier, "".join(sequence).upper()))
    if not records:
        raise ValueError(f"no FASTA records found in {path}")
    identifiers = [identifier for identifier, _ in records]
    if len(identifiers) != len(set(identifiers)):
        raise ValueError(f"duplicate FASTA identifiers in {path}")
    for identifier, value in records:
        invalid = sorted(set(value) - ALLOWED_RESIDUES)
        if invalid:
            raise ValueError(f"invalid residues for {identifier}: {''.join(invalid)}")
    return records


def mean_or_none(values: list[float]) -> float | None:
    return statistics.fmean(values) if values else None


def position_entropy(sequences: list[str], indexes: list[int]) -> float | None:
    if not indexes:
        return None
    entropies: list[float] = []
    for index in indexes:
        counts = Counter(sequence[index] for sequence in sequences)
        total = sum(counts.values())
        entropies.append(-sum((count / total) * math.log2(count / total) for count in counts.values()))
    return statistics.fmean(entropies)


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--manifest", required=True, type=Path)
    parser.add_argument("--output-json", required=True, type=Path)
    parser.add_argument("--output-csv", required=True, type=Path)
    parser.add_argument("--skip-first-record", action="store_true", help="Explicitly skip the first design FASTA record, commonly the ProteinMPNN native record")
    args = parser.parse_args()

    try:
        manifest = json.loads(args.manifest.read_text(encoding="utf-8"))
        base_dir = args.manifest.resolve().parent
        native_path = Path(manifest["inputs"]["native_fasta"]["path"])
        design_path = Path(manifest["outputs"]["design_fasta"]["path"])
        native_path = native_path if native_path.is_absolute() else base_dir / native_path
        design_path = design_path if design_path.is_absolute() else base_dir / design_path
        native_records = read_fasta(native_path)
        if len(native_records) != 1:
            raise ValueError("native FASTA must contain exactly one record")
        designs = read_fasta(design_path)
        if args.skip_first_record:
            designs = designs[1:]
        if not designs:
            raise ValueError("no design records remain after input processing")
        native_id, native = native_records[0]
        length = len(native)
        if length == 0:
            raise ValueError("native sequence is empty")
        for candidate_id, sequence in designs:
            if len(sequence) != length:
                raise ValueError(f"length mismatch for {candidate_id}: expected {length}, got {len(sequence)}")
        raw_positions = manifest["design_protocol"]["design_positions"]
        if not isinstance(raw_positions, list) or not raw_positions:
            raise ValueError("manifest design_positions must be a non-empty list")
        if any(not isinstance(position, int) or position < 1 or position > length for position in raw_positions):
            raise ValueError(f"design_positions must be within 1..{length}")
        if len(raw_positions) != len(set(raw_positions)):
            raise ValueError("design_positions must be unique")
        designed_indexes = [position - 1 for position in raw_positions]
    except (OSError, KeyError, TypeError, ValueError, json.JSONDecodeError) as exc:
        print(f"error: {exc}", file=sys.stderr)
        return 1

    rows: list[dict[str, object]] = []
    sequences = [sequence for _, sequence in designs]
    for candidate_id, sequence in designs:
        matches_all = sum(a == b for a, b in zip(native, sequence))
        matches_designed = sum(native[index] == sequence[index] for index in designed_indexes)
        rows.append(
            {
                "candidate_id": candidate_id,
                "sequence_length": length,
                "native_recovery_all": matches_all / length,
                "native_recovery_designed": matches_designed / len(designed_indexes),
                "mutations_all": length - matches_all,
                "mutations_designed": len(designed_indexes) - matches_designed,
            }
        )

    pairwise_distances = [
        sum(a != b for a, b in zip(left, right)) / length
        for left, right in itertools.combinations(sequences, 2)
    ]
    summary = {
        "benchmark_id": manifest.get("benchmark_id"),
        "interpretation_scope": "sequence recovery and sampled diversity only",
        "native_id": native_id,
        "sequence_length": length,
        "design_positions": raw_positions,
        "candidate_count": len(rows),
        "aggregate": {
            "mean_native_recovery_all": mean_or_none([float(row["native_recovery_all"]) for row in rows]),
            "mean_native_recovery_designed": mean_or_none([float(row["native_recovery_designed"]) for row in rows]),
            "mean_pairwise_sequence_distance": mean_or_none(pairwise_distances),
            "unique_fraction": len(set(sequences)) / len(sequences),
            "mean_position_entropy_bits": position_entropy(sequences, list(range(length))),
            "mean_designed_position_entropy_bits": position_entropy(sequences, designed_indexes),
        },
        "candidates": rows,
        "limitations": [
            "These metrics do not establish stability, folding, expression, binding, activity, or function.",
            "Native recovery is a benchmark metric, not an optimization objective that is universally better when higher.",
        ],
    }

    args.output_json.parent.mkdir(parents=True, exist_ok=True)
    args.output_csv.parent.mkdir(parents=True, exist_ok=True)
    args.output_json.write_text(json.dumps(summary, indent=2, sort_keys=True) + "\n", encoding="utf-8")
    with args.output_csv.open("w", encoding="utf-8", newline="") as handle:
        writer = csv.DictWriter(handle, fieldnames=list(rows[0]))
        writer.writeheader()
        writer.writerows(rows)
    print(json.dumps({"candidate_count": len(rows), "output_json": str(args.output_json), "output_csv": str(args.output_csv)}))
    return 0


if __name__ == "__main__":
    sys.exit(main())

