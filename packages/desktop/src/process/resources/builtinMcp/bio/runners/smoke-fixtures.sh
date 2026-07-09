#!/usr/bin/env bash

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "${SCRIPT_DIR}/../../../../../../../.." && pwd)"

DEFAULT_RUNTIME_ROOT="/srv/openbioscience"
RUNTIME_ROOT="${OPENBIOSCIENCE_RUNTIME_ROOT:-${DEFAULT_RUNTIME_ROOT}}"
OFFICIAL_ROOT="${OPENBIOSCIENCE_OFFICIAL_ENV_ROOT:-${RUNTIME_ROOT}/envs}"
OUTPUT_ROOT="${OPENBIOSCIENCE_SMOKE_OUTPUT_ROOT:-${RUNTIME_ROOT}/results/fixture-smoke}"
DEFAULT_MICROMAMBA_EXE="${RUNTIME_ROOT}/tools/micromamba/bin/micromamba"
if [[ -n "${MAMBA_EXE:-}" ]]; then
  MAMBA_EXE="${MAMBA_EXE}"
elif [[ -x "${DEFAULT_MICROMAMBA_EXE}" ]]; then
  MAMBA_EXE="${DEFAULT_MICROMAMBA_EXE}"
else
  MAMBA_EXE="mamba"
fi

DRY_RUN=0
REQUESTED_WORKFLOWS=()
FAILED=0

AVAILABLE_WORKFLOWS=(
  inspect_input
  run_scanpy_core
  run_liana
  run_seurat_core
  run_pseudobulk_de
  run_signature_scoring
)

usage() {
  cat <<'EOF'
Usage:
  smoke-fixtures.sh [options] [workflow-id ...]
  smoke-fixtures.sh [options] --all

Options:
  --dry-run, --plan       Print commands without executing runners.
  --output-root <dir>     Override output root. Default:
                          $OPENBIOSCIENCE_RUNTIME_ROOT/results/fixture-smoke
  -h, --help              Show this help.

Runs allowlisted P0 fixture workflows against the tiny synthetic data bundled
in this repository. Outputs are written under the runtime root and must not be
committed.
EOF
}

runner_for_workflow() {
  case "$1" in
    inspect_input) echo "sc-py-singlecell:python:scripts/inspect_input.py" ;;
    run_scanpy_core) echo "sc-py-singlecell:python:scripts/run_scanpy_core.py" ;;
    run_liana) echo "sc-py-singlecell:python:scripts/run_liana.py" ;;
    run_seurat_core) echo "sc-r-singlecell:Rscript:scripts/run_seurat_core.R" ;;
    run_pseudobulk_de) echo "sc-r-singlecell:Rscript:scripts/run_pseudobulk_de.R" ;;
    run_signature_scoring) echo "sc-r-singlecell:Rscript:scripts/run_signature_scoring.R" ;;
    *) return 1 ;;
  esac
}

json_escape() {
  printf "%s" "$1" | sed -e 's/\\/\\\\/g' -e 's/"/\\"/g'
}

while [[ "$#" -gt 0 ]]; do
  case "$1" in
    --dry-run | --plan)
      DRY_RUN=1
      shift
      ;;
    --all)
      REQUESTED_WORKFLOWS=("${AVAILABLE_WORKFLOWS[@]}")
      shift
      ;;
    --output-root)
      if [[ "$#" -lt 2 ]]; then
        echo "--output-root requires a value" >&2
        exit 2
      fi
      OUTPUT_ROOT="$2"
      shift 2
      ;;
    --output-root=*)
      OUTPUT_ROOT="${1#--output-root=}"
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
      REQUESTED_WORKFLOWS+=("$1")
      shift
      ;;
  esac
done

if [[ "${#REQUESTED_WORKFLOWS[@]}" -eq 0 ]]; then
  REQUESTED_WORKFLOWS=("${AVAILABLE_WORKFLOWS[@]}")
fi

echo "[OpenBioScience] fixture smoke plan"
echo "  repo root:    ${REPO_ROOT}"
echo "  runner root:  ${SCRIPT_DIR}"
echo "  runtime root: ${RUNTIME_ROOT}"
echo "  env root:     ${OFFICIAL_ROOT}"
echo "  output root:  ${OUTPUT_ROOT}"
echo "  mamba exe:    ${MAMBA_EXE}"
echo

RESULTS=()
mkdir -p "${OUTPUT_ROOT}"

for workflow_id in "${REQUESTED_WORKFLOWS[@]}"; do
  if ! runner_spec="$(runner_for_workflow "${workflow_id}")"; then
    echo "Unknown workflow id: ${workflow_id}" >&2
    exit 2
  fi

  environment_ref="${runner_spec%%:*}"
  rest="${runner_spec#*:}"
  runner_command="${rest%%:*}"
  script_rel="${rest#*:}"
  prefix="${OFFICIAL_ROOT}/${environment_ref}"
  output_dir="${OUTPUT_ROOT}/${workflow_id}"
  script_path="${SCRIPT_DIR}/${script_rel}"
  config_path="${SCRIPT_DIR}/defaults.yaml"

  echo "[OpenBioScience] workflow: ${workflow_id}"
  echo "  env:     ${environment_ref}"
  echo "  script:  ${script_path}"
  echo "  output:  ${output_dir}"
  echo "  command: ${MAMBA_EXE} run -p ${prefix} ${runner_command} ${script_path} --config ${config_path} --output-dir ${output_dir}"

  status="planned"
  warning=""
  if [[ "${DRY_RUN}" -eq 0 ]]; then
    if [[ ! -d "${prefix}/conda-meta" ]]; then
      status="failed"
      warning="Environment prefix is missing or is not a conda prefix: ${prefix}"
      FAILED=1
      echo "  status:  ${status}"
      echo "  warning: ${warning}" >&2
    elif "${MAMBA_EXE}" run -p "${prefix}" "${runner_command}" "${script_path}" \
      --config "${config_path}" \
      --output-dir "${output_dir}"; then
      status="completed"
      echo "  status:  ${status}"
    else
      status="failed"
      warning="Runner execution failed."
      FAILED=1
      echo "  status:  ${status}" >&2
    fi
  fi

  RESULTS+=("{\"workflowId\":\"$(json_escape "${workflow_id}")\",\"environmentRef\":\"$(json_escape "${environment_ref}")\",\"outputDir\":\"$(json_escape "${output_dir}")\",\"status\":\"$(json_escape "${status}")\",\"warning\":\"$(json_escape "${warning}")\"}")
  echo
done

{
  printf '{"schema":"openbioscience.fixture_smoke.manifest.v1","status":"%s","results":[' "$([[ "${FAILED}" -eq 0 ]] && echo completed || echo failed)"
  for index in "${!RESULTS[@]}"; do
    if [[ "${index}" -gt 0 ]]; then
      printf ','
    fi
    printf '%s' "${RESULTS[${index}]}"
  done
  printf ']}\n'
} >"${OUTPUT_ROOT}/smoke_manifest.json"

if [[ "${FAILED}" -ne 0 ]]; then
  exit 1
fi
