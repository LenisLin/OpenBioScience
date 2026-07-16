#!/usr/bin/env bash

# Publish a previously verified environment release directory to a public
# Hugging Face Dataset repository. Inputs are explicit to avoid accidental
# publication of a local runtime root or custom environment tree.

set -euo pipefail

usage() {
  echo "Usage: publish-official-environments.sh --repository <owner/repository> --release-dir <directory>"
}

repository=""
release_dir=""
while [[ $# -gt 0 ]]; do
  case "$1" in
    --repository) repository="$2"; shift 2 ;;
    --release-dir) release_dir="$2"; shift 2 ;;
    --help|-h) usage; exit 0 ;;
    *) echo "Unknown option: $1" >&2; usage >&2; exit 2 ;;
  esac
done

[[ "${repository}" =~ ^[A-Za-z0-9_.-]+/[A-Za-z0-9_.-]+$ ]] || {
  echo "--repository must be owner/repository." >&2
  exit 2
}
[[ -f "${release_dir}/release-manifest.json" ]] || {
  echo "release-manifest.json is required in --release-dir." >&2
  exit 2
}
command -v hf >/dev/null 2>&1 || {
  echo "Install the Hugging Face CLI and authenticate with hf auth login before publishing." >&2
  exit 127
}

hf upload "${repository}" "${release_dir}" . --repo-type dataset
