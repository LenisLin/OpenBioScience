#!/usr/bin/env bash

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "${SCRIPT_DIR}/../../.." && pwd)"
DEFAULT_RUNTIME_ROOT="/srv/openbioscience"
RUNTIME_ROOT="${OPENBIOSCIENCE_RUNTIME_ROOT:-${DEFAULT_RUNTIME_ROOT}}"
CACHE_ROOT="${OPENBIOSCIENCE_R_GITHUB_CACHE:-${RUNTIME_ROOT}/cache/r-github}"
LOCK_PLATFORM="${OPENBIOSCIENCE_LOCK_PLATFORM:-linux-64}"
DEFAULT_LOCK_PATH="${REPO_ROOT}/environments/official/locks/${LOCK_PLATFORM}/sc-cci-r.postinstall-lock.json"
PYTHON_BIN="${PYTHON:-python3}"
DRY_RUN=0
LOCK_PATH=""

DEFAULT_REPOS=(
  jinworks/CellChat
  saeyslab/nichenetr
)

usage() {
  cat <<'EOF'
Usage:
  cache-r-github-tarballs.sh [options] <owner/repo> [<owner/repo> ...]
  cache-r-github-tarballs.sh [options] --all

Options:
  --all                 Cache the official sc-cci-r GitHub source packages.
  --from-lock           Cache GitHub packages from the default postinstall lock.
  --lock <file>         Cache GitHub packages from a postinstall lock JSON file.
  --dry-run, --plan     Print the download plan without fetching files.
  -h, --help            Show this help.

Environment variables:
  OPENBIOSCIENCE_RUNTIME_ROOT   Default: /srv/openbioscience
  OPENBIOSCIENCE_R_GITHUB_CACHE Default: $OPENBIOSCIENCE_RUNTIME_ROOT/cache/r-github
EOF
}

ensure_python() {
  if ! command -v "${PYTHON_BIN}" >/dev/null 2>&1; then
    echo "Python executable not found: ${PYTHON_BIN}" >&2
    exit 2
  fi
}

tarball_name_for_repo() {
  local repo="$1"
  local ref="${2:-}"
  local base="${repo//\//_}"
  if [[ -n "${ref}" ]]; then
    echo "${base}_${ref:0:12}.tar.gz"
  else
    echo "${base}.tar.gz"
  fi
}

lock_rows() {
  local lock_path="$1"
  ensure_python
  "${PYTHON_BIN}" - "${lock_path}" <<'PY'
import json
import sys

with open(sys.argv[1], "r", encoding="utf-8") as handle:
    payload = json.load(handle)

for item in payload.get("packages", []):
    if item.get("source") != "github":
        continue
    repo = item.get("repo")
    if not repo:
        continue
    tarball = item.get("sourceTarball") or {}
    ref = item.get("remoteSha") or item.get("githubSHA1") or tarball.get("archiveRef") or item.get("remoteRef") or "HEAD"
    sha256 = tarball.get("sha256") or ""
    print("\t".join([repo, ref, sha256]))
PY
}

download_repo_tarball() {
  local repo="$1"
  local ref="${2:-HEAD}"
  local expected_sha256="${3:-}"
  local tarball_name
  tarball_name="$(tarball_name_for_repo "${repo}" "$([[ "${ref}" == "HEAD" ]] && echo "" || echo "${ref}")")"
  local target="${CACHE_ROOT}/${tarball_name}"
  local url="https://api.github.com/repos/${repo}/tarball/${ref}"

  echo "[OpenBioScience] R GitHub cache plan"
  echo "  repo:   ${repo}"
  echo "  ref:    ${ref}"
  echo "  url:    ${url}"
  echo "  target: ${target}"
  if [[ -n "${expected_sha256}" ]]; then
    echo "  sha256: ${expected_sha256}"
  fi

  if [[ "${DRY_RUN}" -eq 1 ]]; then
    return
  fi

  mkdir -p "${CACHE_ROOT}"
  local tmp="${target}.tmp"
  rm -f "${tmp}"
  curl -L --fail --retry 3 --retry-all-errors --connect-timeout 30 --max-time 300 \
    -o "${tmp}" "${url}"
  if [[ -n "${expected_sha256}" ]]; then
    actual_sha256="$(sha256sum "${tmp}" | awk '{print $1}')"
    if [[ "${actual_sha256}" != "${expected_sha256}" ]]; then
      rm -f "${tmp}"
      echo "Checksum mismatch for ${repo}@${ref}: expected ${expected_sha256}, got ${actual_sha256}" >&2
      exit 1
    fi
  fi
  mv "${tmp}" "${target}"
}

REQUESTED_REPOS=()
while [[ "$#" -gt 0 ]]; do
  case "$1" in
    --all)
      REQUESTED_REPOS=("${DEFAULT_REPOS[@]}")
      shift
      ;;
    --from-lock)
      LOCK_PATH="${DEFAULT_LOCK_PATH}"
      shift
      ;;
    --lock)
      if [[ "$#" -lt 2 ]]; then
        echo "--lock requires a file path" >&2
        exit 2
      fi
      LOCK_PATH="$2"
      shift 2
      ;;
    --lock=*)
      LOCK_PATH="${1#--lock=}"
      shift
      ;;
    --dry-run | --plan)
      DRY_RUN=1
      shift
      ;;
    -h | --help)
      usage
      exit 0
      ;;
    -*)
      echo "Unknown option: $1" >&2
      usage >&2
      exit 2
      ;;
    *)
      REQUESTED_REPOS+=("$1")
      shift
      ;;
  esac
done

if [[ -n "${LOCK_PATH}" ]]; then
  if [[ ! -f "${LOCK_PATH}" ]]; then
    echo "Postinstall lock not found: ${LOCK_PATH}" >&2
    exit 1
  fi
  while IFS=$'\t' read -r repo ref sha256; do
    if [[ ! "${repo}" =~ ^[A-Za-z0-9_.-]+/[A-Za-z0-9_.-]+$ ]]; then
      echo "Invalid GitHub repo reference in lock: ${repo}" >&2
      exit 2
    fi
    download_repo_tarball "${repo}" "${ref}" "${sha256}"
  done < <(lock_rows "${LOCK_PATH}")
  exit 0
fi

if [[ "${#REQUESTED_REPOS[@]}" -eq 0 ]]; then
  usage >&2
  exit 1
fi

for repo in "${REQUESTED_REPOS[@]}"; do
  if [[ ! "${repo}" =~ ^[A-Za-z0-9_.-]+/[A-Za-z0-9_.-]+$ ]]; then
    echo "Invalid GitHub repo reference: ${repo}" >&2
    exit 2
  fi
  download_repo_tarball "${repo}" "HEAD"
done
