#!/usr/bin/env bash

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
DEFAULT_RUNTIME_ROOT="/srv/openbioscience"
RUNTIME_ROOT="${OPENBIOSCIENCE_RUNTIME_ROOT:-${DEFAULT_RUNTIME_ROOT}}"
OFFICIAL_ROOT="${OPENBIOSCIENCE_OFFICIAL_ENV_ROOT:-${RUNTIME_ROOT}/envs}"
DEFAULT_MICROMAMBA_EXE="${RUNTIME_ROOT}/tools/micromamba/bin/micromamba"
if [[ -n "${MAMBA_EXE:-}" ]]; then
  MAMBA_EXE="${MAMBA_EXE}"
elif [[ -x "${DEFAULT_MICROMAMBA_EXE}" ]]; then
  MAMBA_EXE="${DEFAULT_MICROMAMBA_EXE}"
else
  MAMBA_EXE="mamba"
fi

AVAILABLE_ENVS=(
  sc-py-singlecell
  sc-r-singlecell
  sc-r-plot
  sc-r-clinical
  sc-cci-r
)

DRY_RUN=0

usage() {
  cat <<'EOF'
Usage:
  probe-official-envs.sh [options] <env-name> [<env-name> ...]
  probe-official-envs.sh [options] --all

Options:
  --dry-run, --plan      Print the probe plan without invoking R/Python.
  -h, --help            Show this help.

Probes official OpenBioScience environments without downloading data or
mutating the conda prefixes. Output is JSON.
EOF
}

probe_for_env() {
  case "$1" in
    sc-py-singlecell) echo "python:${SCRIPT_DIR}/probes/probe_sc_py_singlecell.py" ;;
    sc-r-singlecell) echo "Rscript:${SCRIPT_DIR}/probes/probe_sc_r_singlecell.R" ;;
    sc-r-plot) echo "Rscript:${SCRIPT_DIR}/probes/probe_sc_r_plot.R" ;;
    sc-r-clinical) echo "Rscript:${SCRIPT_DIR}/probes/probe_sc_r_clinical.R" ;;
    sc-cci-r) echo "Rscript:${SCRIPT_DIR}/probes/probe_sc_cci_r.R" ;;
    *) return 1 ;;
  esac
}

json_escape() {
  sed -e 's/\\/\\\\/g' -e 's/"/\\"/g' -e ':a;N;$!ba;s/\r\{0,1\}\n/\\n/g'
}

failure_json() {
  local env_name="$1"
  local prefix="$2"
  local message="$3"
  local escaped
  escaped="$(printf "%s" "${message}" | json_escape)"
  printf '{"schema":"openbioscience.env_probe.result.v1","environmentRef":"%s","prefix":"%s","status":"failed","error":"%s"}' \
    "${env_name}" "${prefix}" "${escaped}"
}

print_probe_plan() {
  local env_name="$1"
  local probe_spec
  probe_spec="$(probe_for_env "${env_name}")"
  local runner="${probe_spec%%:*}"
  local probe_path="${probe_spec#*:}"
  local prefix="${OFFICIAL_ROOT}/${env_name}"

  echo "[OpenBioScience] environment probe plan"
  echo "  env:     ${env_name}"
  echo "  prefix:  ${prefix}"
  echo "  runner:  ${runner}"
  echo "  probe:   ${probe_path}"
  echo "  mamba:   ${MAMBA_EXE}"
}

run_probe() {
  local env_name="$1"
  local probe_spec
  if ! probe_spec="$(probe_for_env "${env_name}")"; then
    failure_json "${env_name}" "${OFFICIAL_ROOT}/${env_name}" "No probe is registered for ${env_name}."
    return
  fi

  local runner="${probe_spec%%:*}"
  local probe_path="${probe_spec#*:}"
  local prefix="${OFFICIAL_ROOT}/${env_name}"

  if [[ ! -d "${prefix}/conda-meta" ]]; then
    failure_json "${env_name}" "${prefix}" "Environment prefix is missing or is not a conda prefix."
    return
  fi

  local stdout_file stderr_file
  stdout_file="$(mktemp)"
  stderr_file="$(mktemp)"
  if "${MAMBA_EXE}" run -p "${prefix}" "${runner}" "${probe_path}" \
    --environment-ref "${env_name}" \
    --prefix "${prefix}" >"${stdout_file}" 2>"${stderr_file}"; then
    tr -d '\n' <"${stdout_file}"
  else
    if [[ -s "${stdout_file}" ]]; then
      tr -d '\n' <"${stdout_file}"
    else
      failure_json "${env_name}" "${prefix}" "$(cat "${stderr_file}")"
    fi
  fi
  rm -f "${stdout_file}" "${stderr_file}"
}

REQUESTED_ENVS=()
for arg in "$@"; do
  case "${arg}" in
    --dry-run | --plan)
      DRY_RUN=1
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
  usage >&2
  exit 1
fi

if [[ "${DRY_RUN}" -eq 1 ]]; then
  for env_name in "${REQUESTED_ENVS[@]}"; do
    if ! probe_for_env "${env_name}" >/dev/null; then
      echo "Unknown environment: ${env_name}" >&2
      exit 2
    fi
    print_probe_plan "${env_name}"
  done
  exit 0
fi

printf '{"schema":"openbioscience.env_probe.aggregate.v1","runtimeRoot":"%s","results":[' "${RUNTIME_ROOT}"
for index in "${!REQUESTED_ENVS[@]}"; do
  if [[ "${index}" -gt 0 ]]; then
    printf ','
  fi
  run_probe "${REQUESTED_ENVS[${index}]}"
done
printf ']}\n'
