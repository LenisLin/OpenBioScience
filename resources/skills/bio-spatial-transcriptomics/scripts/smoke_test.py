#!/usr/bin/env python3
"""Exercise valid and invalid spatial manifest fixtures without third-party packages."""

from __future__ import annotations

import json
import sys
from pathlib import Path

from validate_contract import load_json, validate_input, validate_output


def main() -> int:
    """Verify successful fixtures and ensure a broken fixture is rejected."""
    root = Path(__file__).resolve().parents[1]
    fixtures = root / "fixtures"
    checks = [
        ("input", fixtures / "input_manifest.json", validate_input, False),
        ("output", fixtures / "output_manifest.json", validate_output, False),
        ("invalid-output", fixtures / "invalid_output_manifest.json", validate_output, True),
    ]
    failures: list[str] = []
    for label, path, validator, should_fail in checks:
        errors = validator(load_json(path))
        if should_fail and not errors:
            failures.append(f"{label} unexpectedly passed")
        if not should_fail and errors:
            failures.append(f"{label} failed: {json.dumps(errors)}")
    if failures:
        print("\n".join(failures), file=sys.stderr)
        return 1
    print("OK: spatial contract smoke test passed (2 valid, 1 expected failure)")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
