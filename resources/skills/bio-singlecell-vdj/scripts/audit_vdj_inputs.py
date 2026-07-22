#!/usr/bin/env python3
"""Audit matched 10x GEX/BCR inputs and emit a deterministic pairing contract."""

from __future__ import annotations

import argparse
import csv
import gzip
import hashlib
import json
import re
import sys
from collections import Counter, defaultdict
from pathlib import Path
from typing import Iterable, TextIO


REQUIRED_CONTIG_COLUMNS = {"barcode", "chain", "productive"}
BCR_LOCI = {"IGH", "IGK", "IGL"}
SHA256_RE = re.compile(r"^[0-9a-fA-F]{64}$")


class ContractError(ValueError):
    """Raised when an input cannot satisfy the audit contract."""


def open_text(path: Path) -> TextIO:
    if path.suffix.lower() == ".gz":
        return gzip.open(path, "rt", encoding="utf-8-sig", newline="")
    return path.open("r", encoding="utf-8-sig", newline="")


def sha256_file(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        for block in iter(lambda: handle.read(1024 * 1024), b""):
            digest.update(block)
    return digest.hexdigest()


def parse_bool(value: str, field: str) -> bool:
    normalized = value.strip().lower()
    if normalized in {"true", "t", "1", "yes"}:
        return True
    if normalized in {"false", "f", "0", "no"}:
        return False
    raise ContractError(f"Unrecognized boolean in {field}: {value!r}")


def normalize_barcode(barcode: str, policy: str) -> str:
    barcode = barcode.strip()
    if policy == "strip-10x-suffix":
        return re.sub(r"-[0-9]+$", "", barcode)
    return barcode


def read_gex_barcodes(path: Path, policy: str) -> tuple[set[str], int, int]:
    raw: list[str] = []
    with open_text(path) as handle:
        for line in handle:
            value = line.rstrip("\r\n").split("\t", 1)[0].strip()
            if value and value.lower() != "barcode":
                raw.append(value)
    if not raw:
        raise ContractError("GEX barcode file is empty")
    normalized = [normalize_barcode(value, policy) for value in raw]
    collisions = len(set(raw)) - len(set(normalized))
    if collisions:
        raise ContractError(
            f"Barcode policy {policy!r} creates {collisions} GEX barcode collision(s)"
        )
    return set(normalized), len(raw), len(set(raw))


def read_contigs(path: Path, policy: str) -> tuple[list[dict[str, str]], set[str]]:
    with open_text(path) as handle:
        reader = csv.DictReader(handle)
        columns = set(reader.fieldnames or [])
        missing = REQUIRED_CONTIG_COLUMNS - columns
        if missing:
            raise ContractError(f"Contig table is missing required columns: {sorted(missing)}")
        rows = []
        for row in reader:
            row = {key: (value or "").strip() for key, value in row.items()}
            row["normalized_barcode"] = normalize_barcode(row["barcode"], policy)
            rows.append(row)
    if not rows:
        raise ContractError("Contig table has no records")
    by_normalized: dict[str, set[str]] = defaultdict(set)
    for row in rows:
        by_normalized[row["normalized_barcode"]].add(row["barcode"])
    collisions = {key for key, values in by_normalized.items() if len(values) > 1}
    if collisions:
        raise ContractError(
            f"Barcode policy {policy!r} creates {len(collisions)} VDJ barcode collision(s)"
        )
    return rows, columns


def validate_provenance(path: Path | None) -> tuple[str, list[str]]:
    blocked = []
    if path is None:
        return "blocked_missing_igblast_germline_provenance", [
            "SHM requires IgBLAST and germline provenance"
        ]
    data = json.loads(path.read_text(encoding="utf-8"))
    if data.get("schema") != "openbioscience.igblast_germline_provenance.v1":
        raise ContractError("Unsupported IgBLAST provenance schema")
    required_strings = [
        ("igblast.version", data.get("igblast", {}).get("version")),
        ("igblast.command", data.get("igblast", {}).get("command")),
        ("germline.species", data.get("germline", {}).get("species")),
        ("germline.release", data.get("germline", {}).get("release")),
        ("germline.source", data.get("germline", {}).get("source")),
    ]
    for name, value in required_strings:
        if not isinstance(value, str) or not value.strip():
            raise ContractError(f"Missing provenance field: {name}")
    files = data.get("germline", {}).get("files", [])
    roles = {item.get("role") for item in files if isinstance(item, dict)}
    if not {"V", "D", "J"}.issubset(roles):
        raise ContractError("Germline provenance must include V, D, and J files")
    checksum_records = list(files) + [data.get("query", {}), data.get("result", {})]
    for item in checksum_records:
        if not isinstance(item, dict) or not item.get("path"):
            raise ContractError("Every provenance file requires a path")
        if not SHA256_RE.fullmatch(str(item.get("sha256", ""))):
            raise ContractError(f"Invalid SHA-256 for provenance file: {item.get('path')}")
    blocked.append("SHM values remain blocked until the IgBLAST AIRR result is parsed and validated")
    return "eligible_for_downstream_shm", blocked


def write_tsv(path: Path, fieldnames: list[str], rows: Iterable[dict[str, object]]) -> None:
    with path.open("w", encoding="utf-8", newline="") as handle:
        writer = csv.DictWriter(handle, fieldnames=fieldnames, delimiter="\t", extrasaction="ignore")
        writer.writeheader()
        writer.writerows(rows)


def audit(args: argparse.Namespace) -> dict[str, object]:
    gex_path = Path(args.gex_barcodes).resolve()
    contig_path = Path(args.contigs).resolve()
    for path in (gex_path, contig_path):
        if not path.is_file():
            raise ContractError(f"Input file does not exist: {path}")

    gex, gex_rows, gex_unique = read_gex_barcodes(gex_path, args.barcode_policy)
    contigs, columns = read_contigs(contig_path, args.barcode_policy)
    warnings: list[str] = []
    if "high_confidence" not in columns:
        warnings.append("high_confidence is absent; productive contigs are treated as pairing-eligible")
    if "full_length" not in columns:
        warnings.append("full_length is absent and cannot be audited")

    all_vdj_barcodes = {row["normalized_barcode"] for row in contigs}
    eligible_by_cell: dict[str, list[dict[str, str]]] = defaultdict(list)
    productive_count = 0
    unsupported_loci = Counter()
    for row in contigs:
        productive = parse_bool(row["productive"], "productive")
        if not productive:
            continue
        productive_count += 1
        high_confidence = (
            parse_bool(row["high_confidence"], "high_confidence")
            if "high_confidence" in columns
            else True
        )
        locus = row["chain"].upper()
        if locus not in BCR_LOCI:
            unsupported_loci[locus or "missing"] += 1
            continue
        if high_confidence:
            eligible_by_cell[row["normalized_barcode"]].append(row)

    qc_rows: list[dict[str, object]] = []
    paired_rows: list[dict[str, object]] = []
    status_counts = Counter()
    accepted_pairs = 0
    for barcode in sorted(gex | all_vdj_barcodes):
        eligible = eligible_by_cell.get(barcode, [])
        heavy = [row for row in eligible if row["chain"].upper() == "IGH"]
        light = [row for row in eligible if row["chain"].upper() in {"IGK", "IGL"}]
        if len(heavy) > 1 and len(light) > 1:
            status = "multichain_both"
        elif len(heavy) > 1:
            status = "multichain_heavy"
        elif len(light) > 1:
            status = "multichain_light"
        elif not heavy:
            status = "no_productive_heavy"
        elif not light:
            status = "no_productive_light"
        else:
            status = "paired_single"
        status_counts[status] += 1
        qc_rows.append(
            {
                "cell_id": barcode,
                "in_gex": str(barcode in gex).lower(),
                "in_vdj": str(barcode in all_vdj_barcodes).lower(),
                "n_eligible_igh": len(heavy),
                "n_eligible_light": len(light),
                "pairing_status": status,
            }
        )
        if status != "paired_single" or barcode not in gex:
            continue
        heavy_row, light_row = heavy[0], light[0]
        if not heavy_row.get("cdr3_nt") or not light_row.get("cdr3_nt"):
            warnings.append(f"Pair {barcode} excluded from clonotyping because cdr3_nt is missing")
            continue
        clone_key = "\t".join(
            [heavy_row["cdr3_nt"], light_row["chain"].upper(), light_row["cdr3_nt"]]
        )
        clone_id = "clone_" + hashlib.sha256(clone_key.encode("utf-8")).hexdigest()[:16]
        pair_id = f"{args.sample_id}:{barcode}"
        accepted_pairs += 1
        for row in (heavy_row, light_row):
            paired_rows.append(
                {
                    "sequence_id": row.get("contig_id") or f"{pair_id}:{row['chain'].upper()}",
                    "sequence": row.get("sequence", ""),
                    "sequence_aa": row.get("aa_sequence", ""),
                    "productive": "T",
                    "v_call": row.get("v_gene", ""),
                    "d_call": row.get("d_gene", ""),
                    "j_call": row.get("j_gene", ""),
                    "c_call": row.get("c_gene", ""),
                    "junction": row.get("cdr3_nt", ""),
                    "junction_aa": row.get("cdr3", ""),
                    "cell_id": barcode,
                    "locus": row["chain"].upper(),
                    "pair_id": pair_id,
                    "clone_id": clone_id,
                    "sample_id": args.sample_id,
                }
            )

    shm_status, shm_blocks = validate_provenance(
        Path(args.igblast_provenance).resolve() if args.igblast_provenance else None
    )
    output_dir = Path(args.output_dir).resolve()
    reports_dir = output_dir / "reports"
    tables_dir = output_dir / "tables"
    reports_dir.mkdir(parents=True, exist_ok=True)
    tables_dir.mkdir(parents=True, exist_ok=True)
    qc_fields = [
        "cell_id",
        "in_gex",
        "in_vdj",
        "n_eligible_igh",
        "n_eligible_light",
        "pairing_status",
    ]
    airr_fields = [
        "sequence_id",
        "sequence",
        "sequence_aa",
        "productive",
        "v_call",
        "d_call",
        "j_call",
        "c_call",
        "junction",
        "junction_aa",
        "cell_id",
        "locus",
        "pair_id",
        "clone_id",
        "sample_id",
    ]
    write_tsv(tables_dir / "barcode_join_qc.tsv", qc_fields, qc_rows)
    write_tsv(tables_dir / "paired_airr_rearrangements.tsv", airr_fields, paired_rows)

    matched_vdj = all_vdj_barcodes & gex
    report: dict[str, object] = {
        "schema": "openbioscience.singlecell_vdj.audit.v1",
        "sampleId": args.sample_id,
        "inputs": {
            "gexBarcodes": {"path": str(gex_path), "sha256": sha256_file(gex_path)},
            "contigs": {"path": str(contig_path), "sha256": sha256_file(contig_path)},
        },
        "barcodePolicy": args.barcode_policy,
        "barcodeCollisions": 0,
        "counts": {
            "gexBarcodeRows": gex_rows,
            "gexUniqueBarcodes": gex_unique,
            "vdjCells": len(all_vdj_barcodes),
            "vdjCellsMatchedToGex": len(matched_vdj),
            "vdjCellsMissingFromGex": len(all_vdj_barcodes - gex),
            "gexCellsWithoutVdj": len(gex - all_vdj_barcodes),
            "contigs": len(contigs),
            "productiveContigs": productive_count,
            "acceptedPairs": accepted_pairs,
            "pairedAirrRows": len(paired_rows),
        },
        "vdjToGexJoinRate": round(len(matched_vdj) / len(all_vdj_barcodes), 6),
        "pairingStatusCounts": dict(sorted(status_counts.items())),
        "unsupportedProductiveLoci": dict(sorted(unsupported_loci.items())),
        "pairingFilter": "productive=true and high_confidence=true when available",
        "clonotypeDefinition": "exact paired nucleotide junctions: (IGH cdr3_nt, light locus, light cdr3_nt)",
        "shmStatus": shm_status,
        "blockedClaims": shm_blocks,
        "warnings": sorted(set(warnings)),
        "outputs": {
            "barcodeJoinQc": str(tables_dir / "barcode_join_qc.tsv"),
            "pairedAirrRearrangements": str(tables_dir / "paired_airr_rearrangements.tsv"),
        },
    }
    report_path = reports_dir / "vdj_input_audit.json"
    report_path.write_text(json.dumps(report, indent=2, sort_keys=True) + "\n", encoding="utf-8")
    return report


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--gex-barcodes", required=True)
    parser.add_argument("--contigs", required=True)
    parser.add_argument("--sample-id", required=True)
    parser.add_argument("--output-dir", required=True)
    parser.add_argument(
        "--barcode-policy",
        choices=("exact", "strip-10x-suffix"),
        default="exact",
    )
    parser.add_argument("--igblast-provenance")
    return parser


def main() -> int:
    try:
        report = audit(build_parser().parse_args())
    except (ContractError, json.JSONDecodeError) as exc:
        print(f"contract error: {exc}", file=sys.stderr)
        return 2
    print(json.dumps(report, indent=2, sort_keys=True))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
