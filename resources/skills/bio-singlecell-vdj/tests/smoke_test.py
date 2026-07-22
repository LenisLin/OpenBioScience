#!/usr/bin/env python3
"""Smoke test the VDJ audit against a small deterministic fixture."""

from __future__ import annotations

import csv
import json
import subprocess
import sys
import tempfile
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
SCRIPT = ROOT / "scripts" / "audit_vdj_inputs.py"
FIXTURES = Path(__file__).resolve().parent / "fixtures"


def main() -> int:
    with tempfile.TemporaryDirectory(prefix="openbioscience-vdj-") as temp_dir:
        output = Path(temp_dir) / "audit"
        command = [
            sys.executable,
            str(SCRIPT),
            "--gex-barcodes",
            str(FIXTURES / "gex_barcodes.tsv"),
            "--contigs",
            str(FIXTURES / "filtered_contig_annotations.csv"),
            "--sample-id",
            "fixture-donor",
            "--output-dir",
            str(output),
        ]
        completed = subprocess.run(command, capture_output=True, text=True, check=False)
        if completed.returncode != 0:
            raise AssertionError(completed.stderr or completed.stdout)
        report = json.loads((output / "reports" / "vdj_input_audit.json").read_text())
        assert report["counts"]["acceptedPairs"] == 1
        assert report["counts"]["pairedAirrRows"] == 2
        assert report["counts"]["vdjCellsMissingFromGex"] == 1
        assert report["pairingStatusCounts"]["multichain_heavy"] == 1
        assert report["shmStatus"] == "blocked_missing_igblast_germline_provenance"

        with (output / "tables" / "paired_airr_rearrangements.tsv").open(
            encoding="utf-8", newline=""
        ) as handle:
            rows = list(csv.DictReader(handle, delimiter="\t"))
        assert {row["locus"] for row in rows} == {"IGH", "IGK"}
        assert len({row["pair_id"] for row in rows}) == 1
        assert len({row["clone_id"] for row in rows}) == 1

        collision_barcodes = Path(temp_dir) / "collision_barcodes.tsv"
        collision_barcodes.write_text("AAAC-1\nAAAC-2\n", encoding="utf-8")
        collision_command = command.copy()
        collision_command[collision_command.index(str(FIXTURES / "gex_barcodes.tsv"))] = str(
            collision_barcodes
        )
        collision_command.extend(["--barcode-policy", "strip-10x-suffix"])
        rejected = subprocess.run(
            collision_command, capture_output=True, text=True, check=False
        )
        assert rejected.returncode == 2
        assert "collision" in rejected.stderr.lower()
    print("bio-singlecell-vdj smoke test: PASS")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
