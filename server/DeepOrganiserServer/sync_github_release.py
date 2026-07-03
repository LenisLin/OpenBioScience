#!/usr/bin/env python3
"""One-shot GitHub Release sync for the OpenScience update server."""

from __future__ import annotations

import argparse
import json

from server import ensure_layout, sync_github_release_once


def main() -> None:
    parser = argparse.ArgumentParser(description="Sync the newest GitHub Release into data/updates.")
    parser.add_argument("--dry-run", action="store_true", help="Check GitHub Releases without downloading assets.")
    args = parser.parse_args()

    ensure_layout()
    result = sync_github_release_once(dry_run=args.dry_run)
    print(json.dumps(result, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
