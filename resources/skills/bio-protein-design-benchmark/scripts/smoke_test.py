#!/usr/bin/env python3
"""Run dependency-free positive and failure-path smoke tests for benchmark scripts."""

from __future__ import annotations

import json
import math
import subprocess
import sys
import tempfile
from pathlib import Path


SKILL_DIR = Path(__file__).resolve().parent.parent
SCRIPTS_DIR = SKILL_DIR / "scripts"
FIXTURE_DIR = SKILL_DIR / "fixtures" / "smoke"


def run(script: str, *arguments: str, expected_code: int = 0) -> subprocess.CompletedProcess[str]:
    result = subprocess.run(
        [sys.executable, str(SCRIPTS_DIR / script), *arguments],
        cwd=SKILL_DIR,
        capture_output=True,
        text=True,
        check=False,
    )
    if result.returncode != expected_code:
        raise AssertionError(
            f"{script} returned {result.returncode}, expected {expected_code}\nstdout:\n{result.stdout}\nstderr:\n{result.stderr}"
        )
    return result


def assert_close(actual: float, expected: float) -> None:
    if not math.isclose(actual, expected, rel_tol=1e-9, abs_tol=1e-9):
        raise AssertionError(f"expected {expected}, got {actual}")


def main() -> int:
    manifest = FIXTURE_DIR / "run_manifest.json"
    validation = run("validate_manifest.py", str(manifest), "--check-files")
    if not json.loads(validation.stdout)["valid"]:
        raise AssertionError("fixture manifest should be valid")

    with tempfile.TemporaryDirectory(prefix="protein-design-benchmark-") as temp_name:
        temp_dir = Path(temp_name)
        sequence_json = temp_dir / "sequence_summary.json"
        run(
            "compute_sequence_metrics.py",
            "--manifest",
            str(manifest),
            "--output-json",
            str(sequence_json),
            "--output-csv",
            str(temp_dir / "sequence_metrics.csv"),
        )
        sequence_summary = json.loads(sequence_json.read_text(encoding="utf-8"))
        if sequence_summary["candidate_count"] != 3:
            raise AssertionError("expected three sequence candidates")
        assert_close(sequence_summary["aggregate"]["mean_native_recovery_all"], 0.75)
        assert_close(sequence_summary["aggregate"]["mean_native_recovery_designed"], 7 / 12)
        assert_close(sequence_summary["aggregate"]["mean_pairwise_sequence_distance"], 1 / 3)

        structure_json = temp_dir / "structure_summary.json"
        run(
            "summarize_structure_metrics.py",
            "--input-csv",
            str(FIXTURE_DIR / "structure_metrics.csv"),
            "--mode",
            "monomer",
            "--output-json",
            str(structure_json),
            "--output-csv",
            str(temp_dir / "selected_models.csv"),
        )
        structure_summary = json.loads(structure_json.read_text(encoding="utf-8"))
        if structure_summary["selected_candidate_count"] != 2 or structure_summary["failed_model_count"] != 1:
            raise AssertionError("structure failure accounting or candidate selection is incorrect")
        selected = {row["candidate_id"]: row["model_id"] for row in structure_summary["selected_models"]}
        if selected != {"design_exact": "seed_1", "design_two_changes": "seed_1"}:
            raise AssertionError(f"unexpected selected models: {selected}")

        run(
            "summarize_structure_metrics.py",
            "--input-csv",
            str(FIXTURE_DIR / "structure_metrics.csv"),
            "--mode",
            "complex",
            "--selection-metric",
            "mean_plddt",
            "--output-json",
            str(temp_dir / "invalid.json"),
            "--output-csv",
            str(temp_dir / "invalid.csv"),
            expected_code=1,
        )

    run("validate_manifest.py", str(FIXTURE_DIR / "missing.json"), expected_code=1)
    print("All protein design benchmark smoke tests passed.")
    return 0


if __name__ == "__main__":
    sys.exit(main())

