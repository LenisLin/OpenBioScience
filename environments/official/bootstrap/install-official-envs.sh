#!/usr/bin/env bash

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "${SCRIPT_DIR}/../../.." && pwd)"

DEFAULT_RUNTIME_ROOT="/srv/openbioscience"
RUNTIME_ROOT="${OPENBIOSCIENCE_RUNTIME_ROOT:-${DEFAULT_RUNTIME_ROOT}}"
OFFICIAL_ROOT="${OPENBIOSCIENCE_OFFICIAL_ENV_ROOT:-${RUNTIME_ROOT}/envs}"
CACHE_CONDA_PKGS="${CONDA_PKGS_DIRS:-${RUNTIME_ROOT}/cache/conda-pkgs}"
CACHE_MAMBA_ROOT="${MAMBA_ROOT_PREFIX:-${RUNTIME_ROOT}/cache/mamba-root}"
DEFAULT_MICROMAMBA_EXE="${RUNTIME_ROOT}/tools/micromamba/bin/micromamba"
if [[ -n "${MAMBA_EXE:-}" ]]; then
  MAMBA_EXE="${MAMBA_EXE}"
elif [[ -x "${DEFAULT_MICROMAMBA_EXE}" ]]; then
  MAMBA_EXE="${DEFAULT_MICROMAMBA_EXE}"
else
  MAMBA_EXE="mamba"
fi

DRY_RUN=0
RUN_PROBE=0
SKIP_POSTINSTALL=0
REQUESTED_ENVS=()

AVAILABLE_ENVS=(
  sc-py-singlecell
  sc-r-singlecell
  sc-r-plot
  sc-r-clinical
  sc-cci-r
  sc-r-trajectory
  sc-r-tumor-cnv
  sc-network-grn-r
)

usage() {
  cat <<'EOF'
Usage:
  install-official-envs.sh [options] <env-name> [<env-name> ...]
  install-official-envs.sh [options] --all

Options:
  --dry-run, --plan      Print the install plan without creating prefixes.
  --probe               Run the matching official probe after install/update.
  --skip-postinstall    Skip environment-specific postinstall scripts.
  -h, --help            Show this help.

Environment variables:
  OPENBIOSCIENCE_RUNTIME_ROOT       Default: /srv/openbioscience
  OPENBIOSCIENCE_OFFICIAL_ENV_ROOT  Default: $OPENBIOSCIENCE_RUNTIME_ROOT/envs
  MAMBA_EXE                         Default: runtime-root micromamba when present, otherwise mamba
EOF
}

yaml_for_env() {
  case "$1" in
    sc-py-singlecell) echo "environments/official/sc-py-singlecell.yml" ;;
    sc-r-singlecell) echo "environments/official/sc-r-singlecell.yml" ;;
    sc-r-plot) echo "environments/official/sc-r-plot.yml" ;;
    sc-r-clinical) echo "environments/official/sc-r-clinical.yml" ;;
    sc-cci-r) echo "environments/official/sc-cci-r.yml" ;;
    sc-r-trajectory) echo "environments/official/sc-r-trajectory.yml" ;;
    sc-r-tumor-cnv) echo "environments/official/sc-r-tumor-cnv.yml" ;;
    sc-network-grn-r) echo "environments/official/sc-network-grn-r.yml" ;;
    *) return 1 ;;
  esac
}

postinstall_for_env() {
  case "$1" in
    sc-cci-r) echo "${SCRIPT_DIR}/postinstall-sc-cci-r.R" ;;
    *) return 1 ;;
  esac
}

print_env_plan() {
  local env_name="$1"
  local yaml_path
  yaml_path="$(yaml_for_env "${env_name}")"
  local prefix="${OFFICIAL_ROOT}/${env_name}"

  echo "[OpenBioScience] environment plan"
  echo "  env:     ${env_name}"
  echo "  yaml:    ${yaml_path}"
  echo "  prefix:  ${prefix}"
  echo "  cache:   ${CACHE_CONDA_PKGS}"
}

prepare_layout() {
  mkdir -p "${OFFICIAL_ROOT}"
  mkdir -p "${RUNTIME_ROOT}/custom-envs"
  mkdir -p "${CACHE_CONDA_PKGS}"
  mkdir -p "${CACHE_MAMBA_ROOT}"
  mkdir -p "${RUNTIME_ROOT}/manifests"
  mkdir -p "${RUNTIME_ROOT}/data"
  mkdir -p "${RUNTIME_ROOT}/results"
}

install_env() {
  local env_name="$1"
  local yaml_path
  yaml_path="$(yaml_for_env "${env_name}")"
  local prefix="${OFFICIAL_ROOT}/${env_name}"

  print_env_plan "${env_name}"

  if [[ "${DRY_RUN}" -eq 1 ]]; then
    return
  fi

  if [[ -d "${prefix}/conda-meta" ]]; then
    "${MAMBA_EXE}" env update -y -p "${prefix}" -f "${REPO_ROOT}/${yaml_path}" --prune
  else
    "${MAMBA_EXE}" env create -y -p "${prefix}" -f "${REPO_ROOT}/${yaml_path}"
  fi

  local postinstall_script=""
  if [[ "${SKIP_POSTINSTALL}" -eq 0 ]] && postinstall_script="$(postinstall_for_env "${env_name}")"; then
    "${MAMBA_EXE}" run -p "${prefix}" Rscript "${postinstall_script}"
  fi

  if [[ "${RUN_PROBE}" -eq 1 ]]; then
    bash "${SCRIPT_DIR}/probe-official-envs.sh" "${env_name}"
  fi
}

for arg in "$@"; do
  case "${arg}" in
    --dry-run | --plan)
      DRY_RUN=1
      ;;
    --probe)
      RUN_PROBE=1
      ;;
    --skip-postinstall)
      SKIP_POSTINSTALL=1
      ;;
    --all)
      REQUESTED_ENVS=("${AVAILABLE_ENVS[@]}")
      ;;
    -h | --help)
      usage
      exit 0
      ;;
    -*)
      echo "Unknown option: ${arg}" >&2
      usage >&2
      exit 2
      ;;
    *)
      REQUESTED_ENVS+=("${arg}")
      ;;
  esac
done

if [[ "${#REQUESTED_ENVS[@]}" -eq 0 ]]; then
  usage
  echo
  echo "Available environments:"
  printf "  %s\n" "${AVAILABLE_ENVS[@]}"
  exit 1
fi

export CONDA_PKGS_DIRS="${CACHE_CONDA_PKGS}"
export MAMBA_ROOT_PREFIX="${CACHE_MAMBA_ROOT}"

if [[ "${DRY_RUN}" -eq 0 ]]; then
  prepare_layout
fi

for env_name in "${REQUESTED_ENVS[@]}"; do
  if ! yaml_for_env "${env_name}" >/dev/null; then
    echo "Unknown environment: ${env_name}" >&2
    exit 2
  fi
  install_env "${env_name}"
done
