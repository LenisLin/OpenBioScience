#!/usr/bin/env bash

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "${SCRIPT_DIR}/../../.." && pwd)"

STORAGE_ROOT="/mnt/NAS_21T/ProjectData/OpenBioScience"
OFFICIAL_ROOT="${STORAGE_ROOT}/environments/official"
CACHE_CONDA_PKGS="${STORAGE_ROOT}/cache/conda-pkgs"
CACHE_MAMBA_ROOT="${STORAGE_ROOT}/cache/mamba-root"

mkdir -p "${OFFICIAL_ROOT}"
mkdir -p "${STORAGE_ROOT}/environments/custom"
mkdir -p "${CACHE_CONDA_PKGS}"
mkdir -p "${CACHE_MAMBA_ROOT}"
mkdir -p "${STORAGE_ROOT}/manifests"

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

if [[ $# -eq 0 ]]; then
  echo "Usage:"
  echo "  $(basename "$0") <env-name> [<env-name> ...]"
  echo
  echo "Available environments:"
  echo "  sc-py-singlecell"
  echo "  sc-r-singlecell"
  echo "  sc-r-plot"
  echo "  sc-r-clinical"
  echo "  sc-cci-r"
  echo "  sc-r-trajectory"
  echo "  sc-r-tumor-cnv"
  echo "  sc-network-grn-r"
  exit 1
fi

for env_name in "$@"; do
  case "${env_name}" in
    sc-py-singlecell)
      install_env "${env_name}" "environments/official/sc-py-singlecell.yml"
      ;;
    sc-r-singlecell)
      install_env "${env_name}" "environments/official/sc-r-singlecell.yml"
      ;;
    sc-r-plot)
      install_env "${env_name}" "environments/official/sc-r-plot.yml"
      ;;
    sc-r-clinical)
      install_env "${env_name}" "environments/official/sc-r-clinical.yml"
      ;;
    sc-cci-r)
      install_env "${env_name}" "environments/official/sc-cci-r.yml"
      ;;
    sc-r-trajectory)
      install_env "${env_name}" "environments/official/sc-r-trajectory.yml"
      ;;
    sc-r-tumor-cnv)
      install_env "${env_name}" "environments/official/sc-r-tumor-cnv.yml"
      ;;
    sc-network-grn-r)
      install_env "${env_name}" "environments/official/sc-network-grn-r.yml"
      ;;
    *)
      echo "Unknown environment: ${env_name}" >&2
      exit 2
      ;;
  esac
done
