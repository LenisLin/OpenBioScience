#!/usr/bin/env python3
"""Utilities for auditable protein variant structure and blind benchmarks."""

from __future__ import annotations

import argparse
import csv
import hashlib
import json
import math
import re
import shutil
import statistics
import tempfile
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Iterable


SCHEMA_PREFIX = "openbioscience.protein_variant_benchmark"
AA3_TO_1 = {
    "ALA": "A", "ARG": "R", "ASN": "N", "ASP": "D", "CYS": "C",
    "GLN": "Q", "GLU": "E", "GLY": "G", "HIS": "H", "ILE": "I",
    "LEU": "L", "LYS": "K", "MET": "M", "PHE": "F", "PRO": "P",
    "SER": "S", "THR": "T", "TRP": "W", "TYR": "Y", "VAL": "V",
    "MSE": "M",
}
AA1 = set("ACDEFGHIKLMNPQRSTVWY")
CANONICAL_MUTATION_RE = re.compile(
    r"^(?:(?P<chain>[^:\s]+):)?(?P<wt>[A-Za-z])(?P<pos>[1-9][0-9]*)(?P<icode>[A-Za-z]?)(?P<mut>[A-Za-z])$"
)
SKEMPI_COMPACT_RE = re.compile(
    r"^(?P<wt>[A-Za-z])(?P<chain>[A-Za-z0-9])(?P<pos>[1-9][0-9]*)(?P<icode>[A-Za-z]?)(?P<mut>[A-Za-z])$"
)
SKEMPI_UNDERSCORE_RE = re.compile(
    r"^(?P<wt>[A-Za-z])_(?P<chain>[^_:\s]+)_(?P<pos>[1-9][0-9]*)(?P<icode>[A-Za-z]?)_(?P<mut>[A-Za-z])$"
)


def utc_now() -> str:
    return datetime.now(timezone.utc).isoformat().replace("+00:00", "Z")


def sha256_file(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        for block in iter(lambda: handle.read(1024 * 1024), b""):
            digest.update(block)
    return digest.hexdigest()


def read_csv(path: Path) -> tuple[list[dict[str, str]], list[str]]:
    with path.open("r", encoding="utf-8-sig", newline="") as handle:
        reader = csv.DictReader(handle)
        if not reader.fieldnames:
            raise ValueError(f"CSV has no header: {path}")
        return list(reader), list(reader.fieldnames)


def write_csv(path: Path, rows: Iterable[dict[str, Any]], fieldnames: list[str]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    with path.open("w", encoding="utf-8", newline="") as handle:
        writer = csv.DictWriter(handle, fieldnames=fieldnames, extrasaction="ignore", lineterminator="\n")
        writer.writeheader()
        for row in rows:
            writer.writerow({key: "" if row.get(key) is None else row.get(key) for key in fieldnames})


def write_json(path: Path, payload: dict[str, Any]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    with path.open("w", encoding="utf-8", newline="\n") as handle:
        json.dump(payload, handle, indent=2, sort_keys=True, allow_nan=False)
        handle.write("\n")


def parse_mutation(value: str) -> dict[str, Any]:
    raw = value.strip()
    match = CANONICAL_MUTATION_RE.fullmatch(raw)
    if not match:
        match = SKEMPI_COMPACT_RE.fullmatch(raw) or SKEMPI_UNDERSCORE_RE.fullmatch(raw)
    if not match:
        raise ValueError("expected one substitution in canonical or SKEMPI mutation form")
    data = match.groupdict()
    wt = data["wt"].upper()
    mutant = data["mut"].upper()
    if wt not in AA1 or mutant not in AA1:
        raise ValueError("wild-type and mutant residues must be standard amino acids")
    if wt == mutant:
        raise ValueError("wild-type and mutant residues are identical")
    chain = data["chain"] or ""
    position = int(data["pos"])
    insertion_code = data["icode"].upper()
    canonical = f"{chain + ':' if chain else ''}{wt}{position}{insertion_code}{mutant}"
    return {
        "canonical_mutation": canonical,
        "chain_hint": chain,
        "wild_type": wt,
        "sequence_position": position,
        "insertion_code_hint": insertion_code,
        "mutant": mutant,
    }


def normalize_rows(rows: list[dict[str, str]], mutation_column: str) -> tuple[list[dict[str, Any]], int]:
    if rows and mutation_column not in rows[0]:
        raise ValueError(f"missing mutation column: {mutation_column}")
    output: list[dict[str, Any]] = []
    rejected = 0
    for index, row in enumerate(rows, start=1):
        item: dict[str, Any] = dict(row)
        item["source_row"] = index
        try:
            item.update(parse_mutation(row.get(mutation_column, "")))
            item["normalization_status"] = "normalized"
            item["normalization_reason"] = ""
        except ValueError as exc:
            rejected += 1
            item.update({
                "canonical_mutation": "", "chain_hint": "", "wild_type": "",
                "sequence_position": "", "insertion_code_hint": "", "mutant": "",
                "normalization_status": "rejected", "normalization_reason": str(exc),
            })
        output.append(item)
    return output, rejected


def command_normalize(args: argparse.Namespace) -> None:
    rows, fields = read_csv(Path(args.input))
    normalized, _ = normalize_rows(rows, args.mutation_column)
    extra = [
        "source_row", "canonical_mutation", "chain_hint", "wild_type",
        "sequence_position", "insertion_code_hint", "mutant",
        "normalization_status", "normalization_reason",
    ]
    write_csv(Path(args.output), normalized, fields + [field for field in extra if field not in fields])


def read_fasta(path: Path) -> str:
    sequence = "".join(
        line.strip() for line in path.read_text(encoding="utf-8-sig").splitlines()
        if line.strip() and not line.startswith(">")
    ).upper()
    if not sequence or any(residue not in AA1 for residue in sequence):
        raise ValueError("FASTA must contain one non-empty standard amino-acid sequence")
    return sequence


def parse_pdb_chain(path: Path, chain: str) -> list[dict[str, Any]]:
    residues: list[dict[str, Any]] = []
    seen: set[tuple[str, str]] = set()
    with path.open("r", encoding="utf-8", errors="replace") as handle:
        for line in handle:
            if not (line.startswith("ATOM  ") or line.startswith("HETATM")) or len(line) < 27 or line[21].strip() != chain:
                continue
            altloc = line[16].strip()
            if altloc not in {"", "A"}:
                continue
            resname = line[17:20].strip().upper()
            auth_seq_id = line[22:26].strip()
            insertion_code = line[26].strip()
            key = (auth_seq_id, insertion_code)
            if key in seen or resname not in AA3_TO_1:
                continue
            seen.add(key)
            residues.append({
                "chain": chain,
                "auth_seq_id": auth_seq_id,
                "insertion_code": insertion_code,
                "structure_wt": AA3_TO_1[resname],
            })
    if not residues:
        raise ValueError(f"no standard ATOM residues found for chain {chain!r}")
    return residues


def global_alignment(reference: str, structure: str) -> tuple[str, str]:
    rows, cols = len(reference) + 1, len(structure) + 1
    score = [[0] * cols for _ in range(rows)]
    trace = [[""] * cols for _ in range(rows)]
    for i in range(1, rows):
        score[i][0], trace[i][0] = -i, "U"
    for j in range(1, cols):
        score[0][j], trace[0][j] = -j, "L"
    for i in range(1, rows):
        for j in range(1, cols):
            diagonal = score[i - 1][j - 1] + (2 if reference[i - 1] == structure[j - 1] else -1)
            up = score[i - 1][j] - 1
            left = score[i][j - 1] - 1
            best = max(diagonal, up, left)
            score[i][j] = best
            trace[i][j] = "D" if diagonal == best else ("U" if up == best else "L")
    aligned_ref: list[str] = []
    aligned_structure: list[str] = []
    i, j = len(reference), len(structure)
    while i or j:
        direction = trace[i][j]
        if direction == "D":
            aligned_ref.append(reference[i - 1]); aligned_structure.append(structure[j - 1]); i -= 1; j -= 1
        elif direction == "U":
            aligned_ref.append(reference[i - 1]); aligned_structure.append("-"); i -= 1
        else:
            aligned_ref.append("-"); aligned_structure.append(structure[j - 1]); j -= 1
    return "".join(reversed(aligned_ref)), "".join(reversed(aligned_structure))


def command_build_map(args: argparse.Namespace) -> None:
    reference = read_fasta(Path(args.fasta))
    residues = parse_pdb_chain(Path(args.pdb), args.chain)
    aligned_ref, aligned_structure = global_alignment(reference, "".join(row["structure_wt"] for row in residues))
    output: list[dict[str, Any]] = []
    ref_index = 0
    structure_index = 0
    for ref_aa, structure_aa in zip(aligned_ref, aligned_structure):
        if ref_aa != "-":
            ref_index += 1
        residue = None
        if structure_aa != "-":
            residue = residues[structure_index]
            structure_index += 1
        if ref_aa == "-":
            continue
        status = "unresolved" if residue is None else ("mapped" if ref_aa == structure_aa else "mismatch")
        output.append({
            "sequence_position": ref_index,
            "reference_wt": ref_aa,
            "chain": args.chain if residue else "",
            "auth_seq_id": residue["auth_seq_id"] if residue else "",
            "insertion_code": residue["insertion_code"] if residue else "",
            "structure_wt": structure_aa if residue else "",
            "mapping_status": status,
        })
    write_csv(Path(args.output), output, [
        "sequence_position", "reference_wt", "chain", "auth_seq_id",
        "insertion_code", "structure_wt", "mapping_status",
    ])


def command_map_residues(args: argparse.Namespace) -> None:
    variants, variant_fields = read_csv(Path(args.variants))
    mapping, _ = read_csv(Path(args.mapping))
    required = {"sequence_position", "reference_wt", "chain", "auth_seq_id", "insertion_code", "structure_wt", "mapping_status"}
    if mapping and not required.issubset(mapping[0]):
        raise ValueError(f"residue map missing columns: {sorted(required - set(mapping[0]))}")
    by_position: dict[str, list[dict[str, str]]] = {}
    for row in mapping:
        by_position.setdefault(row["sequence_position"], []).append(row)
    output: list[dict[str, Any]] = []
    map_fields = ["mapped_chain", "auth_seq_id", "insertion_code", "structure_wt", "mapping_status", "mapping_reason", "residue_key"]
    for row in variants:
        item: dict[str, Any] = dict(row)
        candidates = by_position.get(row.get("sequence_position", ""), [])
        chain_hint = row.get("chain_hint", "")
        if chain_hint:
            candidates = [candidate for candidate in candidates if candidate["chain"] == chain_hint]
        if row.get("normalization_status") != "normalized":
            status, reason, selected = "rejected", "variant was not normalized", None
        elif not candidates:
            status, reason, selected = "unresolved", "no residue-map candidate", None
        elif len(candidates) > 1:
            status, reason, selected = "ambiguous", "multiple residue-map candidates", None
        else:
            selected = candidates[0]
            if selected["mapping_status"] != "mapped":
                status, reason = selected["mapping_status"], "residue map is not an exact match"
            elif row.get("wild_type") != selected["reference_wt"] or row.get("wild_type") != selected["structure_wt"]:
                status, reason = "mismatch", "wild-type residue disagrees with reference or structure"
            elif row.get("insertion_code_hint") and row.get("insertion_code_hint") != selected["insertion_code"]:
                status, reason = "mismatch", "mutation insertion code disagrees with structure mapping"
            else:
                status, reason = "mapped", ""
        item.update({field: "" for field in map_fields})
        item["mapping_status"], item["mapping_reason"] = status, reason
        if selected:
            item.update({
                "mapped_chain": selected["chain"], "auth_seq_id": selected["auth_seq_id"],
                "insertion_code": selected["insertion_code"], "structure_wt": selected["structure_wt"],
                "residue_key": f"{selected['chain']}:{selected['auth_seq_id']}:{selected['insertion_code']}",
            })
        output.append(item)
    write_csv(Path(args.output), output, variant_fields + [field for field in map_fields if field not in variant_fields])


def command_blind(args: argparse.Namespace) -> None:
    source = Path(args.input).resolve()
    rows, fields = read_csv(source)
    required = {args.row_id_column, args.mutation_column, args.target_column}
    if not required.issubset(fields):
        raise ValueError(f"input missing columns: {sorted(required - set(fields))}")
    if len({row[args.row_id_column] for row in rows}) != len(rows):
        raise ValueError("row IDs must be unique")
    normalized, rejected = normalize_rows(rows, args.mutation_column)
    accepted = [row for row in normalized if row["normalization_status"] == "normalized"]
    if not accepted:
        raise ValueError("no valid single substitutions remain after normalization")
    output_dir = Path(args.output_dir).resolve()
    blind_path = output_dir / "blind_features.csv"
    truth_path = Path(args.truth_output).resolve() if args.truth_output else output_dir / "sealed_truth.csv"
    receipt_path = output_dir / "blind_receipt.json"
    derived = ["canonical_mutation", "chain_hint", "wild_type", "sequence_position", "insertion_code_hint", "mutant"]
    blind_fields = [field for field in fields if field != args.target_column] + [field for field in derived if field not in fields]
    write_csv(blind_path, accepted, blind_fields)
    truth_rows = [{args.row_id_column: row[args.row_id_column], "target": row[args.target_column]} for row in accepted]
    write_csv(truth_path, truth_rows, [args.row_id_column, "target"])
    receipt = {
        "schema": f"{SCHEMA_PREFIX}.blind_receipt.v1",
        "state": "blinded",
        "createdAt": utc_now(),
        "source": {"fileName": source.name, "sha256": sha256_file(source)},
        "blindFeatures": {"path": str(blind_path), "sha256": sha256_file(blind_path)},
        "sealedTruth": {"fileName": truth_path.name, "sha256": sha256_file(truth_path)},
        "columns": {"rowId": args.row_id_column, "mutation": args.mutation_column, "target": args.target_column},
        "counts": {"source": len(rows), "blinded": len(accepted), "rejected": rejected},
        "warnings": ["Hash checks do not detect semantically target-derived feature columns."],
    }
    write_json(receipt_path, receipt)


def load_receipt(path: Path, expected_schema: str, expected_state: str) -> dict[str, Any]:
    payload = json.loads(path.read_text(encoding="utf-8"))
    if payload.get("schema") != expected_schema or payload.get("state") != expected_state:
        raise ValueError(f"unexpected receipt schema or state: {path}")
    return payload


def verify_path_hash(record: dict[str, str], label: str) -> Path:
    path = Path(record["path"])
    if not path.is_file() or sha256_file(path) != record["sha256"]:
        raise ValueError(f"{label} is missing or its SHA-256 does not match")
    return path


def command_freeze(args: argparse.Namespace) -> None:
    blind_receipt_path = Path(args.blind_receipt).resolve()
    blind = load_receipt(blind_receipt_path, f"{SCHEMA_PREFIX}.blind_receipt.v1", "blinded")
    blind_path = verify_path_hash(blind["blindFeatures"], "blind feature file")
    blind_rows, _ = read_csv(blind_path)
    predictions_path = Path(args.predictions).resolve()
    predictions, prediction_fields = read_csv(predictions_path)
    required = {args.row_id_column, args.prediction_column}
    if not required.issubset(prediction_fields):
        raise ValueError(f"prediction file missing columns: {sorted(required - set(prediction_fields))}")
    expected_ids = {row[blind["columns"]["rowId"]] for row in blind_rows}
    seen: set[str] = set()
    frozen: list[dict[str, Any]] = []
    for row in predictions:
        row_id = row[args.row_id_column]
        if row_id in seen:
            raise ValueError(f"duplicate prediction row ID: {row_id}")
        if row_id not in expected_ids:
            raise ValueError(f"unknown prediction row ID: {row_id}")
        seen.add(row_id)
        value = float(row[args.prediction_column])
        if not math.isfinite(value):
            raise ValueError(f"non-finite prediction for row ID: {row_id}")
        frozen.append({blind["columns"]["rowId"]: row_id, "prediction": format(value, ".17g")})
    missing = expected_ids - seen
    if missing and not args.allow_partial:
        raise ValueError(f"missing predictions for {len(missing)} row IDs")
    output_dir = Path(args.output_dir).resolve()
    frozen_path = output_dir / "frozen_predictions.csv"
    receipt_path = output_dir / "freeze_receipt.json"
    write_csv(frozen_path, frozen, [blind["columns"]["rowId"], "prediction"])
    receipt = {
        "schema": f"{SCHEMA_PREFIX}.freeze_receipt.v1",
        "state": "frozen",
        "createdAt": utc_now(),
        "blindReceipt": {"path": str(blind_receipt_path), "sha256": sha256_file(blind_receipt_path)},
        "blindFeatures": blind["blindFeatures"],
        "sourcePredictions": {"path": str(predictions_path), "sha256": sha256_file(predictions_path)},
        "frozenPredictions": {"path": str(frozen_path), "sha256": sha256_file(frozen_path)},
        "columns": {"rowId": blind["columns"]["rowId"], "prediction": "prediction"},
        "direction": args.direction,
        "counts": {"expected": len(expected_ids), "predicted": len(frozen), "missing": len(missing), "duplicate": 0, "nonFinite": 0},
        "allowPartial": bool(args.allow_partial),
    }
    write_json(receipt_path, receipt)


def command_reveal(args: argparse.Namespace) -> None:
    blind_receipt_path = Path(args.blind_receipt).resolve()
    freeze_receipt_path = Path(args.freeze_receipt).resolve()
    blind = load_receipt(blind_receipt_path, f"{SCHEMA_PREFIX}.blind_receipt.v1", "blinded")
    freeze = load_receipt(freeze_receipt_path, f"{SCHEMA_PREFIX}.freeze_receipt.v1", "frozen")
    if sha256_file(blind_receipt_path) != freeze["blindReceipt"]["sha256"]:
        raise ValueError("freeze receipt does not reference the current blind receipt")
    verify_path_hash(blind["blindFeatures"], "blind feature file")
    truth_path = Path(args.truth).resolve()
    predictions_path = Path(args.predictions).resolve()
    if not truth_path.is_file() or sha256_file(truth_path) != blind["sealedTruth"]["sha256"]:
        raise ValueError("sealed truth is missing or its SHA-256 does not match blind receipt")
    if predictions_path != Path(freeze["frozenPredictions"]["path"]) or sha256_file(predictions_path) != freeze["frozenPredictions"]["sha256"]:
        raise ValueError("frozen prediction path or SHA-256 does not match freeze receipt")
    truth, _ = read_csv(truth_path)
    predictions, _ = read_csv(predictions_path)
    row_id = blind["columns"]["rowId"]
    prediction_by_id = {row[row_id]: row["prediction"] for row in predictions}
    revealed = [{row_id: row[row_id], "target": row["target"], "prediction": prediction_by_id.get(row[row_id], "")} for row in truth]
    write_csv(Path(args.output), revealed, [row_id, "target", "prediction"])


def rank_values(values: list[float]) -> list[float]:
    order = sorted(range(len(values)), key=values.__getitem__)
    ranks = [0.0] * len(values)
    index = 0
    while index < len(order):
        end = index + 1
        while end < len(order) and values[order[end]] == values[order[index]]:
            end += 1
        rank = (index + 1 + end) / 2.0
        for position in order[index:end]:
            ranks[position] = rank
        index = end
    return ranks


def pearson(left: list[float], right: list[float]) -> float | None:
    if len(left) < 2:
        return None
    mean_left, mean_right = statistics.fmean(left), statistics.fmean(right)
    numerator = sum((x - mean_left) * (y - mean_right) for x, y in zip(left, right))
    denominator = math.sqrt(sum((x - mean_left) ** 2 for x in left) * sum((y - mean_right) ** 2 for y in right))
    return numerator / denominator if denominator else None


def command_metrics(args: argparse.Namespace) -> None:
    rows, fields = read_csv(Path(args.input))
    required = {args.target_column, args.prediction_column}
    if not required.issubset(fields):
        raise ValueError(f"result file missing columns: {sorted(required - set(fields))}")
    targets: list[float] = []
    predictions: list[float] = []
    missing = non_finite = 0
    for row in rows:
        if not row[args.prediction_column].strip():
            missing += 1
            continue
        target, prediction = float(row[args.target_column]), float(row[args.prediction_column])
        if not math.isfinite(target) or not math.isfinite(prediction):
            non_finite += 1
            continue
        targets.append(target); predictions.append(prediction)
    if not targets:
        raise ValueError("no finite target/prediction pairs available")
    errors = [prediction - target for target, prediction in zip(targets, predictions)]
    pcc = pearson(targets, predictions)
    spearman = pearson(rank_values(targets), rank_values(predictions))
    threshold = args.threshold
    sign_accuracy = sum((target >= threshold) == (prediction >= threshold) for target, prediction in zip(targets, predictions)) / len(targets)
    warnings = []
    if pcc is None:
        warnings.append("Pearson correlation is undefined for fewer than two points or constant values.")
    if spearman is None:
        warnings.append("Spearman correlation is undefined for fewer than two points or constant ranks.")
    payload = {
        "schema": f"{SCHEMA_PREFIX}.metrics.v1",
        "createdAt": utc_now(),
        "counts": {"total": len(rows), "evaluated": len(targets), "missing": missing, "nonFinite": non_finite},
        "metrics": {
            "mae": statistics.fmean(abs(error) for error in errors),
            "rmse": math.sqrt(statistics.fmean(error * error for error in errors)),
            "pearson": pcc,
            "spearman": spearman,
            "signAccuracy": sign_accuracy,
            "threshold": threshold,
        },
        "direction": args.direction,
        "units": args.units,
        "warnings": warnings,
    }
    write_json(Path(args.output), payload)


def path_records(values: list[str]) -> list[dict[str, Any]]:
    records = []
    for value in values:
        path = Path(value).resolve()
        if not path.is_file():
            raise ValueError(f"manifest path is not a file: {path}")
        records.append({"path": str(path), "size": path.stat().st_size, "sha256": sha256_file(path)})
    return records


def command_manifest(args: argparse.Namespace) -> None:
    payload = {
        "schema": f"{SCHEMA_PREFIX}.manifest.v1",
        "caseId": args.case_id,
        "workflowKind": args.workflow_kind,
        "createdAt": utc_now(),
        "inputs": path_records(args.inputs),
        "outputs": path_records(args.outputs),
        "environmentRef": args.environment_ref,
        "model": args.model,
        "checkpoint": args.checkpoint,
        "seed": args.seed,
        "parameters": json.loads(args.parameters),
        "assumptions": args.assumptions,
        "exclusions": args.exclusions,
        "warnings": args.warnings,
    }
    write_json(Path(args.output), payload)


def command_self_test(_args: argparse.Namespace) -> None:
    root = Path(tempfile.mkdtemp(prefix="variant-benchmark-test-"))
    try:
        source = root / "source.csv"
        write_csv(source, [
            {"id": "r1", "mutation": "A1G", "feature": "2", "ddg": "1.0"},
            {"id": "r2", "mutation": "A:C2AW", "feature": "3", "ddg": "-1.0"},
            {"id": "bad", "mutation": "A1G,B2C", "feature": "4", "ddg": "0.0"},
        ], ["id", "mutation", "feature", "ddg"])
        blind_dir = root / "blind"
        command_blind(argparse.Namespace(input=str(source), row_id_column="id", mutation_column="mutation", target_column="ddg", output_dir=str(blind_dir), truth_output=None))
        blind_text = (blind_dir / "blind_features.csv").read_text(encoding="utf-8")
        assert "ddg" not in blind_text.splitlines()[0] and "1.0" not in blind_text
        predictions = root / "predictions.csv"
        write_csv(predictions, [{"id": "r1", "score": "0.8"}, {"id": "r2", "score": "-0.7"}], ["id", "score"])
        frozen_dir = root / "predictions"
        command_freeze(argparse.Namespace(
            predictions=str(predictions), blind_receipt=str(blind_dir / "blind_receipt.json"),
            row_id_column="id", prediction_column="score", output_dir=str(frozen_dir),
            direction="higher_is_more_destabilizing", allow_partial=False,
        ))
        revealed = root / "revealed.csv"
        command_reveal(argparse.Namespace(
            blind_receipt=str(blind_dir / "blind_receipt.json"),
            freeze_receipt=str(frozen_dir / "freeze_receipt.json"),
            truth=str(blind_dir / "sealed_truth.csv"),
            predictions=str(frozen_dir / "frozen_predictions.csv"), output=str(revealed),
        ))
        metrics = root / "metrics.json"
        command_metrics(argparse.Namespace(
            input=str(revealed), target_column="target", prediction_column="prediction",
            output=str(metrics), threshold=0.0, direction="higher_is_more_destabilizing", units="kcal/mol",
        ))
        payload = json.loads(metrics.read_text(encoding="utf-8"))
        assert payload["counts"]["evaluated"] == 2 and payload["metrics"]["spearman"] == 1.0
        fasta = root / "reference.fasta"
        fasta.write_text(">toy\nAC\n", encoding="utf-8")
        pdb = root / "toy.pdb"
        pdb.write_text(
            "ATOM      1  CA  ALA A   1      11.000  12.000  13.000  1.00 20.00           C  \n"
            "ATOM      2  CA  CYS A   2A     14.000  15.000  16.000  1.00 20.00           C  \n"
            "END\n",
            encoding="utf-8",
        )
        residue_map = root / "residue_map.csv"
        command_build_map(argparse.Namespace(fasta=str(fasta), pdb=str(pdb), chain="A", output=str(residue_map)))
        map_rows, _ = read_csv(residue_map)
        assert map_rows[0]["auth_seq_id"] == "1" and map_rows[0]["mapping_status"] == "mapped"
        assert map_rows[1]["auth_seq_id"] == "2" and map_rows[1]["insertion_code"] == "A"
        tampered = blind_dir / "sealed_truth.csv"
        tampered.write_text(tampered.read_text(encoding="utf-8") + "tamper\n", encoding="utf-8")
        try:
            command_reveal(argparse.Namespace(
                blind_receipt=str(blind_dir / "blind_receipt.json"),
                freeze_receipt=str(frozen_dir / "freeze_receipt.json"), truth=str(tampered),
                predictions=str(frozen_dir / "frozen_predictions.csv"), output=str(root / "must-not-exist.csv"),
            ))
        except ValueError as exc:
            assert "sealed truth" in str(exc)
        else:
            raise AssertionError("tampered truth was not rejected")
        assert parse_mutation("H:Y101AW")["canonical_mutation"] == "H:Y101AW"
        assert parse_mutation("KA23G")["canonical_mutation"] == "A:K23G"
        assert parse_mutation("K_A_23_G")["canonical_mutation"] == "A:K23G"
        for invalid in ("A1A", "A0G", "A1*", "A1G,B2C"):
            try:
                parse_mutation(invalid)
            except ValueError:
                pass
            else:
                raise AssertionError(f"invalid mutation accepted: {invalid}")
        print("self-test: PASS")
    finally:
        shutil.rmtree(root, ignore_errors=True)


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(description=__doc__)
    subparsers = parser.add_subparsers(dest="command", required=True)

    normalize = subparsers.add_parser("normalize", help="normalize single substitutions")
    normalize.add_argument("--input", required=True); normalize.add_argument("--mutation-column", required=True); normalize.add_argument("--output", required=True)
    normalize.set_defaults(func=command_normalize)

    build_map = subparsers.add_parser("build-map", help="align a FASTA sequence to one PDB chain")
    build_map.add_argument("--fasta", required=True); build_map.add_argument("--pdb", required=True); build_map.add_argument("--chain", required=True); build_map.add_argument("--output", required=True)
    build_map.set_defaults(func=command_build_map)

    map_residues = subparsers.add_parser("map-residues", help="join variants to a residue map")
    map_residues.add_argument("--variants", required=True); map_residues.add_argument("--mapping", required=True); map_residues.add_argument("--output", required=True)
    map_residues.set_defaults(func=command_map_residues)

    blind = subparsers.add_parser("blind", help="separate benchmark features and truth")
    blind.add_argument("--input", required=True); blind.add_argument("--row-id-column", required=True); blind.add_argument("--mutation-column", required=True); blind.add_argument("--target-column", required=True); blind.add_argument("--output-dir", required=True); blind.add_argument("--truth-output")
    blind.set_defaults(func=command_blind)

    freeze = subparsers.add_parser("freeze", help="freeze predictions before reveal")
    freeze.add_argument("--predictions", required=True); freeze.add_argument("--blind-receipt", required=True); freeze.add_argument("--row-id-column", required=True); freeze.add_argument("--prediction-column", required=True); freeze.add_argument("--output-dir", required=True)
    freeze.add_argument("--direction", default="unspecified"); freeze.add_argument("--allow-partial", action="store_true")
    freeze.set_defaults(func=command_freeze)

    reveal = subparsers.add_parser("reveal", help="verify receipts and join predictions to truth")
    reveal.add_argument("--blind-receipt", required=True); reveal.add_argument("--freeze-receipt", required=True); reveal.add_argument("--truth", required=True); reveal.add_argument("--predictions", required=True); reveal.add_argument("--output", required=True)
    reveal.set_defaults(func=command_reveal)

    metrics = subparsers.add_parser("metrics", help="compute benchmark metrics")
    metrics.add_argument("--input", required=True); metrics.add_argument("--target-column", default="target"); metrics.add_argument("--prediction-column", default="prediction"); metrics.add_argument("--output", required=True)
    metrics.add_argument("--threshold", type=float, default=0.0); metrics.add_argument("--direction", default="unspecified"); metrics.add_argument("--units", default="unspecified")
    metrics.set_defaults(func=command_metrics)

    manifest = subparsers.add_parser("manifest", help="write a hashed benchmark manifest")
    manifest.add_argument("--case-id", required=True); manifest.add_argument("--workflow-kind", choices=["structure_mapping", "blind_interface_ddg"], required=True)
    manifest.add_argument("--inputs", nargs="+", required=True); manifest.add_argument("--outputs", nargs="+", required=True); manifest.add_argument("--output", required=True)
    manifest.add_argument("--environment-ref", default=""); manifest.add_argument("--model", default=""); manifest.add_argument("--checkpoint", default=""); manifest.add_argument("--seed", type=int)
    manifest.add_argument("--parameters", default="{}"); manifest.add_argument("--assumptions", action="append", default=[]); manifest.add_argument("--exclusions", action="append", default=[]); manifest.add_argument("--warnings", action="append", default=[])
    manifest.set_defaults(func=command_manifest)

    self_test = subparsers.add_parser("self-test", help="run isolated success and failure tests")
    self_test.set_defaults(func=command_self_test)
    return parser


def main() -> int:
    parser = build_parser()
    args = parser.parse_args()
    try:
        args.func(args)
    except (OSError, ValueError, KeyError, json.JSONDecodeError) as exc:
        parser.error(str(exc))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
