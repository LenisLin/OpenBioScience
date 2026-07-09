#!/usr/bin/env bash

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "${SCRIPT_DIR}/../.." && pwd)"
MANIFEST_PATH="${REPO_ROOT}/environments/official/bootstrap/env-manifest.json"

DEFAULT_RUNTIME_ROOT="/srv/openbioscience"
RUNTIME_ROOT="${OPENBIOSCIENCE_RUNTIME_ROOT:-${DEFAULT_RUNTIME_ROOT}}"
OFFICIAL_ROOT="${OPENBIOSCIENCE_OFFICIAL_ENV_ROOT:-${RUNTIME_ROOT}/envs}"
CACHE_CONDA_PKGS="${CONDA_PKGS_DIRS:-${RUNTIME_ROOT}/cache/conda-pkgs}"
CACHE_MAMBA_ROOT="${MAMBA_ROOT_PREFIX:-${RUNTIME_ROOT}/cache/mamba-root}"
LOCK_PLATFORM="${OPENBIOSCIENCE_LOCK_PLATFORM:-linux-64}"
LOCK_ROOT="${OPENBIOSCIENCE_LOCK_ROOT:-${REPO_ROOT}/environments/official/locks/${LOCK_PLATFORM}}"

DEFAULT_MICROMAMBA_EXE="${RUNTIME_ROOT}/tools/micromamba/bin/micromamba"
if [[ -n "${MAMBA_EXE:-}" ]]; then
  MAMBA_EXE="${MAMBA_EXE}"
elif [[ -x "${DEFAULT_MICROMAMBA_EXE}" ]]; then
  MAMBA_EXE="${DEFAULT_MICROMAMBA_EXE}"
else
  MAMBA_EXE="mamba"
fi

PYTHON_BIN="${PYTHON:-python3}"
MODE="p0"
SOURCE_MODE="lock"
RUN_PROBE=1
SKIP_POSTINSTALL=0
RECREATE=0
DRY_RUN=0
REQUESTED_ENVS=()

usage() {
  cat <<'EOF'
Usage:
  reproduce-official-envs.sh [options]
  reproduce-official-envs.sh [options] <env-name> [<env-name> ...]

Options:
  --p0                    Reproduce P0 environments from the manifest. Default.
  --all                   Reproduce all manifest environments.
  --env <env-name>        Reproduce one environment. Can be repeated.
  --from-lock             Create from committed explicit locks. Default.
  --from-yaml             Use environment YAMLs instead of locks.
  --lock-platform <name>  Lock platform directory. Default: linux-64.
  --lock-root <dir>       Override lock input root.
  --no-probe              Skip probes after reproduction.
  --skip-postinstall      Skip environment-specific postinstall scripts.
  --recreate              Remove an existing official prefix before creating it.
  --dry-run, --plan       Print commands without changing prefixes.
  -h, --help              Show this help.

Fresh servers should prefer --from-lock. YAML remains the editable source of
intent; locks are the tested package snapshot for a specific platform.
EOF
}

ensure_python() {
  if ! command -v "${PYTHON_BIN}" >/dev/null 2>&1; then
    echo "Python executable not found: ${PYTHON_BIN}" >&2
    exit 2
  fi
}

manifest_rows() {
  ensure_python
  local selection="$1"
  shift
  "${PYTHON_BIN}" - "${MANIFEST_PATH}" "${selection}" "$@" <<'PY'
import json
import sys

manifest_path = sys.argv[1]
selection = sys.argv[2]
requested = sys.argv[3:]
with open(manifest_path, "r", encoding="utf-8") as handle:
    manifest = json.load(handle)

environments = manifest["environments"]
by_name = {item["name"]: item for item in environments}

if requested:
    missing = [name for name in requested if name not in by_name]
    if missing:
        raise SystemExit("Unknown environment(s): " + ", ".join(missing))
    selected = [by_name[name] for name in requested]
elif selection == "all":
    selected = environments
else:
    selected = [item for item in environments if item.get("tier") == "P0"]

for item in selected:
    fields = [
        item["name"],
        item.get("tier") or "",
        item.get("yaml") or "",
        item.get("probe") or "",
        item.get("postinstall") or "",
    ]
    print("\t".join(fields))
PY
}

postinstall_for_env() {
  case "$1" in
    sc-cci-r) echo "${REPO_ROOT}/environments/official/bootstrap/postinstall-sc-cci-r.R" ;;
    *) return 1 ;;
  esac
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

assert_prefix_under_official_root() {
  local prefix="$1"
  local official_real prefix_parent_real
  official_real="$(realpath -m "${OFFICIAL_ROOT}")"
  prefix_parent_real="$(realpath -m "$(dirname "${prefix}")")"
  if [[ "${prefix_parent_real}" != "${official_real}" ]]; then
    echo "Refusing to recreate prefix outside official env root: ${prefix}" >&2
    exit 2
  fi
}

run_postinstall() {
  local env_name="$1"
  local prefix="$2"
  local script=""
  if [[ "${SKIP_POSTINSTALL}" -eq 1 ]]; then
    return
  fi
  if script="$(postinstall_for_env "${env_name}")"; then
    echo "  postinstall: ${script}"
    if [[ "${DRY_RUN}" -eq 0 ]]; then
      OPENBIOSCIENCE_POSTINSTALL_LOCK="${LOCK_ROOT}/${env_name}.postinstall-lock.json" \
        "${MAMBA_EXE}" run -p "${prefix}" Rscript "${script}"
      echo
    fi
  fi
}

install_pip_lock() {
  local env_name="$1"
  local prefix="$2"
  local pip_lock="${LOCK_ROOT}/${env_name}.pip-lock.txt"

  if [[ ! -f "${pip_lock}" ]]; then
    return
  fi

  echo "  pip lock: ${pip_lock}"
  if [[ "${DRY_RUN}" -eq 0 ]]; then
    "${MAMBA_EXE}" run -p "${prefix}" python -m pip install --no-deps -r "${pip_lock}"
  fi
}

create_from_lock() {
  local env_name="$1"
  local prefix="$2"
  local lock_file="${LOCK_ROOT}/${env_name}.explicit.txt"

  if [[ ! -f "${lock_file}" ]]; then
    if [[ "${DRY_RUN}" -eq 1 ]]; then
      echo "  source: ${lock_file} (missing; generate it with sync-tested-runtime.sh)"
      return
    fi
    echo "Missing lock file for ${env_name}: ${lock_file}" >&2
    exit 1
  fi

  echo "  source: ${lock_file}"
  if [[ -d "${prefix}/conda-meta" ]]; then
    if [[ "${RECREATE}" -ne 1 ]]; then
      echo "  status: prefix exists; keeping it. Use --recreate for exact lock rebuild."
      return
    fi
    echo "  recreate: ${prefix}"
    if [[ "${DRY_RUN}" -eq 0 ]]; then
      assert_prefix_under_official_root "${prefix}"
      rm -rf "${prefix}"
    fi
  fi

  if [[ "${DRY_RUN}" -eq 0 ]]; then
    "${MAMBA_EXE}" create -y -p "${prefix}" --file "${lock_file}"
  fi
  install_pip_lock "${env_name}" "${prefix}"
}

create_from_yaml() {
  local env_name="$1"
  local yaml_path="$2"
  local prefix="$3"

  echo "  source: ${yaml_path}"
  if [[ "${DRY_RUN}" -eq 0 ]]; then
    if [[ -d "${prefix}/conda-meta" ]]; then
      "${MAMBA_EXE}" env update -y -p "${prefix}" -f "${REPO_ROOT}/${yaml_path}" --prune
    else
      "${MAMBA_EXE}" env create -y -p "${prefix}" -f "${REPO_ROOT}/${yaml_path}"
    fi
  fi
}

while [[ "$#" -gt 0 ]]; do
  case "$1" in
    --p0)
      MODE="p0"
      shift
      ;;
    --all)
      MODE="all"
      shift
      ;;
    --env)
      if [[ "$#" -lt 2 ]]; then
        echo "--env requires a value" >&2
        exit 2
      fi
      REQUESTED_ENVS+=("$2")
      shift 2
      ;;
    --from-lock)
      SOURCE_MODE="lock"
      shift
      ;;
    --from-yaml)
      SOURCE_MODE="yaml"
      shift
      ;;
    --lock-platform)
      if [[ "$#" -lt 2 ]]; then
        echo "--lock-platform requires a value" >&2
        exit 2
      fi
      LOCK_PLATFORM="$2"
      LOCK_ROOT="${OPENBIOSCIENCE_LOCK_ROOT:-${REPO_ROOT}/environments/official/locks/${LOCK_PLATFORM}}"
      shift 2
      ;;
    --lock-root)
      if [[ "$#" -lt 2 ]]; then
        echo "--lock-root requires a value" >&2
        exit 2
      fi
      LOCK_ROOT="$2"
      shift 2
      ;;
    --no-probe)
      RUN_PROBE=0
      shift
      ;;
    --skip-postinstall)
      SKIP_POSTINSTALL=1
      shift
      ;;
    --recreate)
      RECREATE=1
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
      REQUESTED_ENVS+=("$1")
      shift
      ;;
  esac
done

if [[ "${#REQUESTED_ENVS[@]}" -gt 0 ]]; then
  MODE="selected"
fi

mapfile -t ENV_ROWS < <(manifest_rows "${MODE}" "${REQUESTED_ENVS[@]}")
if [[ "${#ENV_ROWS[@]}" -eq 0 ]]; then
  echo "No environments selected." >&2
  exit 1
fi

echo "[OpenBioScience] reproduce official environments"
echo "  repo root:    ${REPO_ROOT}"
echo "  runtime root: ${RUNTIME_ROOT}"
echo "  env root:     ${OFFICIAL_ROOT}"
echo "  conda cache:  ${CACHE_CONDA_PKGS}"
echo "  mamba root:   ${CACHE_MAMBA_ROOT}"
echo "  source mode:  ${SOURCE_MODE}"
echo "  lock root:    ${LOCK_ROOT}"
echo "  platform:     ${LOCK_PLATFORM}"
echo "  mamba exe:    ${MAMBA_EXE}"
echo

if [[ "${DRY_RUN}" -eq 0 ]]; then
  prepare_layout
fi

export CONDA_PKGS_DIRS="${CACHE_CONDA_PKGS}"
export MAMBA_ROOT_PREFIX="${CACHE_MAMBA_ROOT}"

PROBE_NAMES=()
for row in "${ENV_ROWS[@]}"; do
  IFS=$'\t' read -r env_name tier yaml_path probe_path postinstall_path <<<"${row}"
  prefix="${OFFICIAL_ROOT}/${env_name}"

  echo "[OpenBioScience] environment: ${env_name}"
  echo "  tier:   ${tier}"
  echo "  prefix: ${prefix}"

  if [[ "${SOURCE_MODE}" == "lock" ]]; then
    create_from_lock "${env_name}" "${prefix}"
  else
    create_from_yaml "${env_name}" "${yaml_path}" "${prefix}"
  fi

  run_postinstall "${env_name}" "${prefix}"

  if [[ -n "${probe_path}" ]]; then
    PROBE_NAMES+=("${env_name}")
  fi
  echo
done

if [[ "${RUN_PROBE}" -eq 1 && "${#PROBE_NAMES[@]}" -gt 0 ]]; then
  echo "[OpenBioScience] probe reproduced environments"
  if [[ "${DRY_RUN}" -eq 0 ]]; then
    bash "${REPO_ROOT}/environments/official/bootstrap/probe-official-envs.sh" "${PROBE_NAMES[@]}"
  else
    bash "${REPO_ROOT}/environments/official/bootstrap/probe-official-envs.sh" --dry-run "${PROBE_NAMES[@]}"
  fi
fi
