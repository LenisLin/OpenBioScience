#!/usr/bin/env bash

# Build selected official environments beneath an explicit, portable runtime root.
# Inputs: --root (or OPENBIOSCIENCE_ENV_ROOT) and one or more catalog names.
# Output: <root>/environments/official/<name>; package caches remain under <root>/cache.
# Assumptions: mamba is available and each YAML is resolved for the current platform.

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "${SCRIPT_DIR}/../../.." && pwd)"
DEFAULT_ROOT="${REPO_ROOT}/.openbioscience/runtime"
RUNTIME_ROOT="${OPENBIOSCIENCE_ENV_ROOT:-${DEFAULT_ROOT}}"

usage() {
  cat <<'EOF'
Usage: install-official-envs.sh [--root <runtime-root>] <env-name> [<env-name> ...]

The default runtime root is .openbioscience/runtime under this repository.
EOF
}

if ! command -v mamba >/dev/null 2>&1; then
  echo "mamba is required to build official environments." >&2
  exit 127
fi

while [[ $# -gt 0 ]]; do
  case "$1" in
    --root)
      [[ $# -ge 2 ]] || { echo "--root requires a path." >&2; exit 2; }
      RUNTIME_ROOT="$2"
      shift 2
      ;;
    --help|-h)
      usage
      exit 0
      ;;
    --*)
      echo "Unknown option: $1" >&2
      usage >&2
      exit 2
      ;;
    *)
      break
      ;;
  esac
done

if [[ $# -eq 0 ]]; then
  usage >&2
  exit 2
fi

mkdir -p "${RUNTIME_ROOT}"
RUNTIME_ROOT="$(cd "${RUNTIME_ROOT}" && pwd)"
OFFICIAL_ROOT="${RUNTIME_ROOT}/environments/official"
CACHE_CONDA_PKGS="${RUNTIME_ROOT}/cache/conda-pkgs"
CACHE_MAMBA_ROOT="${RUNTIME_ROOT}/cache/mamba-root"

mkdir -p "${OFFICIAL_ROOT}" "${RUNTIME_ROOT}/environments/custom" "${CACHE_CONDA_PKGS}" "${CACHE_MAMBA_ROOT}"
export CONDA_PKGS_DIRS="${CACHE_CONDA_PKGS}"
export MAMBA_ROOT_PREFIX="${CACHE_MAMBA_ROOT}"

install_env() {
  local env_name="$1"
  local yaml_path="$2"
  local prefix="${OFFICIAL_ROOT}/${env_name}"

  echo "[OpenBioScience] installing ${env_name}"
  echo "  yaml:   ${yaml_path}"
  echo "  prefix: ${prefix}"
  mamba env create -y -p "${prefix}" -f "${REPO_ROOT}/${yaml_path}"
}

for env_name in "$@"; do
  case "${env_name}" in
    sc-py-singlecell|sc-r-singlecell|sc-r-plot|sc-r-clinical|sc-cci-r|sc-r-trajectory|sc-r-tumor-cnv|sc-network-grn-r)
      install_env "${env_name}" "environments/official/${env_name}.yml"
      ;;
    *)
      echo "Unknown environment: ${env_name}" >&2
      exit 2
      ;;
  esac
done
