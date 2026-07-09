#!/usr/bin/env bash

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "${SCRIPT_DIR}/../.." && pwd)"
MANIFEST_PATH="${REPO_ROOT}/environments/official/bootstrap/env-manifest.json"

DEFAULT_RUNTIME_ROOT="/srv/openbioscience"
RUNTIME_ROOT="${OPENBIOSCIENCE_RUNTIME_ROOT:-${DEFAULT_RUNTIME_ROOT}}"
OFFICIAL_ROOT="${OPENBIOSCIENCE_OFFICIAL_ENV_ROOT:-${RUNTIME_ROOT}/envs}"
LOCK_PLATFORM="${OPENBIOSCIENCE_LOCK_PLATFORM:-linux-64}"
LOCK_ROOT="${OPENBIOSCIENCE_LOCK_ROOT:-${REPO_ROOT}/environments/official/locks/${LOCK_PLATFORM}}"
HARNESS_VERSION=""

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
DRY_RUN=0
ALLOW_FAILED_PROBE=0
REQUESTED_ENVS=()

usage() {
  cat <<'EOF'
Usage:
  sync-tested-runtime.sh [options]
  sync-tested-runtime.sh [options] <env-name> [<env-name> ...]

Options:
  --p0                    Export P0 environments from the manifest. Default.
  --all                   Export all manifest environments.
  --env <env-name>        Export one environment. Can be repeated.
  --lock-platform <name>  Lock platform directory. Default: linux-64.
  --lock-root <dir>       Override lock output root.
  --allow-failed-probe    Write locks even when a probe reports failure.
  --dry-run, --plan       Print what would be exported.
  -h, --help              Show this help.

This command snapshots an already installed and tested runtime back into
small, committable lock/report files. It never copies conda prefixes,
package caches, downloaded datasets, or analysis outputs into the repository.
EOF
}

ensure_python() {
  if ! command -v "${PYTHON_BIN}" >/dev/null 2>&1; then
    echo "Python executable not found: ${PYTHON_BIN}" >&2
    exit 2
  fi
}

manifest_value() {
  local key="$1"
  ensure_python
  "${PYTHON_BIN}" - "${MANIFEST_PATH}" "${key}" <<'PY'
import json
import sys

manifest_path, key = sys.argv[1:3]
with open(manifest_path, "r", encoding="utf-8") as handle:
    manifest = json.load(handle)
value = manifest.get(key, "")
if value is None:
    value = ""
print(value)
PY
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
        item.get("probe") or "",
        item.get("postinstall") or "",
    ]
    print("\t".join(fields))
PY
}

json_probe_status() {
  local probe_file="$1"
  ensure_python
  "${PYTHON_BIN}" - "${probe_file}" <<'PY'
import json
import sys

with open(sys.argv[1], "r", encoding="utf-8") as handle:
    payload = json.load(handle)

failed = [
    item.get("environmentRef", "<unknown>")
    for item in payload.get("results", [])
    if item.get("status") != "passed"
]
if failed:
    print("failed:" + ",".join(failed))
    raise SystemExit(1)
print("passed")
PY
}

sanitize_json_paths() {
  local json_file="$1"
  ensure_python
  "${PYTHON_BIN}" - "${json_file}" "${RUNTIME_ROOT}" <<'PY'
import json
import sys

json_path, runtime_root = sys.argv[1:3]
placeholder = "${OPENBIOSCIENCE_RUNTIME_ROOT}"

def scrub(value):
    if isinstance(value, str):
        return value.replace(runtime_root, placeholder)
    if isinstance(value, list):
        return [scrub(item) for item in value]
    if isinstance(value, dict):
        return {key: scrub(item) for key, item in value.items()}
    return value

with open(json_path, "r", encoding="utf-8") as handle:
    payload = json.load(handle)

with open(json_path, "w", encoding="utf-8") as handle:
    json.dump(scrub(payload), handle, separators=(",", ":"))
    handle.write("\n")
PY
}

json_escape() {
  printf "%s" "$1" | sed -e 's/\\/\\\\/g' -e 's/"/\\"/g'
}

export_sc_cci_postinstall_lock() {
  local prefix="$1"
  local target="$2"
  local tmp="${target}.tmp"

  if [[ "${DRY_RUN}" -eq 1 ]]; then
    echo "  postinstall lock: ${target}"
    return
  fi

  "${MAMBA_EXE}" run -p "${prefix}" Rscript - >"${tmp}" <<'RSCRIPT'
required <- c("jsonlite")
missing <- required[!vapply(required, requireNamespace, logical(1), quietly = TRUE)]
if (length(missing) > 0) {
  stop("Missing lock writer packages: ", paste(missing, collapse = ", "))
}

field_or_null <- function(description, field) {
  value <- description[[field]]
  if (is.null(value) || is.na(value) || !nzchar(as.character(value))) {
    return(NULL)
  }
  as.character(value)
}

github_cache_root <- function() {
  configured <- Sys.getenv("OPENBIOSCIENCE_R_GITHUB_CACHE", "")
  if (nzchar(configured)) {
    return(configured)
  }
  runtime_root <- Sys.getenv("OPENBIOSCIENCE_RUNTIME_ROOT", "")
  if (nzchar(runtime_root)) {
    return(file.path(runtime_root, "cache", "r-github"))
  }
  ""
}

tarball_info <- function(repo) {
  cache_root <- github_cache_root()
  if (!nzchar(cache_root)) {
    return(NULL)
  }
  path <- file.path(cache_root, paste0(gsub("/", "_", repo, fixed = TRUE), ".tar.gz"))
  if (!file.exists(path)) {
    return(NULL)
  }
  entries <- tryCatch(utils::untar(path, list = TRUE), error = function(condition) character())
  first_entry <- if (length(entries) > 0) entries[[1]] else ""
  archive_ref <- ""
  if (grepl("-[0-9a-f]{7,40}/?$", first_entry)) {
    archive_ref <- sub("^.*-([0-9a-f]{7,40})/?$", "\\1", first_entry)
  }
  list(
    fileName = basename(path),
    sha256 = as.character(tools::sha256sum(path)),
    bytes = file.info(path)$size,
    archiveRoot = if (nzchar(first_entry)) first_entry else NULL,
    archiveRef = if (nzchar(archive_ref)) archive_ref else NULL
  )
}

package_info <- function(package, source, repo = NULL) {
  if (!requireNamespace(package, quietly = TRUE)) {
    return(list(package = package, source = source, repo = repo, status = "missing"))
  }
  description <- utils::packageDescription(package)
  list(
    package = package,
    source = source,
    repo = repo,
    status = "available",
    version = as.character(utils::packageVersion(package)),
    remoteType = field_or_null(description, "RemoteType"),
    remoteHost = field_or_null(description, "RemoteHost"),
    remoteUsername = field_or_null(description, "RemoteUsername"),
    remoteRepo = field_or_null(description, "RemoteRepo"),
    remoteRef = field_or_null(description, "RemoteRef"),
    remoteSha = field_or_null(description, "RemoteSha"),
    githubSHA1 = field_or_null(description, "GithubSHA1"),
    sourceTarball = if (!is.null(repo)) tarball_info(repo) else NULL
  )
}

payload <- list(
  schema = "openbioscience.postinstall_lock.v1",
  environmentRef = "sc-cci-r",
  generatedAt = format(Sys.time(), "%Y-%m-%dT%H:%M:%SZ", tz = "UTC"),
  packages = list(
    package_info("NMF", "cran"),
    package_info("CellChat", "github", "jinworks/CellChat"),
    package_info("nichenetr", "github", "saeyslab/nichenetr")
  )
)

cat(jsonlite::toJSON(payload, auto_unbox = TRUE, null = "null", pretty = TRUE))
RSCRIPT
  mv "${tmp}" "${target}"
}

export_pip_lock() {
  local env_name="$1"
  local prefix="$2"
  local target="$3"
  local tmp_json="${target}.list.json.tmp"
  local tmp_lock="${target}.tmp"

  if [[ "${DRY_RUN}" -eq 1 ]]; then
    echo "  pip lock: ${target}"
    return
  fi

  "${MAMBA_EXE}" list -p "${prefix}" --json >"${tmp_json}"
  "${PYTHON_BIN}" - "${tmp_json}" >"${tmp_lock}" <<'PY'
import json
import sys

with open(sys.argv[1], "r", encoding="utf-8") as handle:
    records = json.load(handle)

packages = []
for item in records:
    if item.get("channel") != "pypi":
        continue
    name = item.get("name")
    version = item.get("version")
    if not name or not version:
        continue
    packages.append((name, version))

for name, version in sorted(packages, key=lambda pair: pair[0].lower()):
    print(f"{name}=={version}")
PY

  if [[ -s "${tmp_lock}" ]]; then
    mv "${tmp_lock}" "${target}"
  else
    rm -f "${target}" "${tmp_lock}"
  fi
  rm -f "${tmp_json}"
}

write_report() {
  local target="$1"
  shift
  local env_names=("$@")
  local placeholder='${OPENBIOSCIENCE_RUNTIME_ROOT}'
  local display_official_root="${OFFICIAL_ROOT/${RUNTIME_ROOT}/${placeholder}}"
  local display_mamba="${MAMBA_EXE/${RUNTIME_ROOT}/${placeholder}}"

  if [[ "${DRY_RUN}" -eq 1 ]]; then
    echo "  build report: ${target}"
    return
  fi

  {
    echo "# OpenBioScience Official Environment Lock Report"
    echo
    echo "- harness version: ${HARNESS_VERSION}"
    echo "- schema: openbioscience.official_environment_lock_report.v1"
    echo "- generated at: $(date -u +"%Y-%m-%dT%H:%M:%SZ")"
    echo "- lock platform: ${LOCK_PLATFORM}"
    echo "- runtime root: ${placeholder}"
    echo "- official env root: ${display_official_root}"
    echo "- manifest: environments/official/bootstrap/env-manifest.json"
    echo "- mamba executable: ${display_mamba}"
    echo
    echo "## Exported Environments"
    echo
    echo "| environment | explicit lock | conda records | pip lock | postinstall lock |"
    echo "| --- | --- | ---: | --- | --- |"
    for env_name in "${env_names[@]}"; do
      local lock_file="${LOCK_ROOT}/${env_name}.explicit.txt"
      local record_count="missing"
      if [[ -f "${lock_file}" ]]; then
        record_count="$(grep -Ev '^(#|@|$)' "${lock_file}" | wc -l | tr -d ' ')"
      fi
      local pip_lock="-"
      if [[ -f "${LOCK_ROOT}/${env_name}.pip-lock.txt" ]]; then
        pip_lock="yes"
      fi
      local postinstall_lock="-"
      if [[ -f "${LOCK_ROOT}/${env_name}.postinstall-lock.json" ]]; then
        postinstall_lock="yes"
      fi
      echo "| \`${env_name}\` | \`${env_name}.explicit.txt\` | ${record_count} | ${pip_lock} | ${postinstall_lock} |"
    done
    echo
    echo "## Verification"
    echo
    if [[ -f "${LOCK_ROOT}/probe-results.json" ]]; then
      echo "- probe results: \`probe-results.json\`"
    else
      echo "- probe results: not generated"
    fi
    echo
    echo "This report is intentionally small and commit-safe. Conda prefixes, caches,"
    echo "downloaded data, database caches, and analysis outputs remain outside Git."
  } >"${target}"
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
    --allow-failed-probe)
      ALLOW_FAILED_PROBE=1
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

HARNESS_VERSION="$(manifest_value harness_version)"
if [[ -z "${HARNESS_VERSION}" ]]; then
  HARNESS_VERSION="unversioned"
fi

mapfile -t ENV_ROWS < <(manifest_rows "${MODE}" "${REQUESTED_ENVS[@]}")

if [[ "${#ENV_ROWS[@]}" -eq 0 ]]; then
  echo "No environments selected." >&2
  exit 1
fi

echo "[OpenBioScience] sync tested runtime"
echo "  harness version: ${HARNESS_VERSION}"
echo "  repo root:       ${REPO_ROOT}"
echo "  runtime root:    ${RUNTIME_ROOT}"
echo "  env root:        ${OFFICIAL_ROOT}"
echo "  lock root:       ${LOCK_ROOT}"
echo "  platform:        ${LOCK_PLATFORM}"
echo "  mamba exe:       ${MAMBA_EXE}"
echo

if [[ "${DRY_RUN}" -eq 0 ]]; then
  mkdir -p "${LOCK_ROOT}"
fi

SELECTED_NAMES=()
PROBE_NAMES=()

for row in "${ENV_ROWS[@]}"; do
  IFS=$'\t' read -r env_name tier probe_path postinstall_path <<<"${row}"
  prefix="${OFFICIAL_ROOT}/${env_name}"
  explicit_target="${LOCK_ROOT}/${env_name}.explicit.txt"
  SELECTED_NAMES+=("${env_name}")

  echo "[OpenBioScience] export: ${env_name}"
  echo "  tier:    ${tier}"
  echo "  prefix:  ${prefix}"
  echo "  lock:    ${explicit_target}"

  if [[ ! -d "${prefix}/conda-meta" ]]; then
    echo "Environment prefix is missing or is not a conda prefix: ${prefix}" >&2
    exit 1
  fi

  if [[ "${DRY_RUN}" -eq 0 ]]; then
    tmp_lock="${explicit_target}.tmp"
    "${MAMBA_EXE}" list -p "${prefix}" --explicit |
      sed -e '/^List of packages in environment:/d' -e '/^$/d' >"${tmp_lock}"
    mv "${tmp_lock}" "${explicit_target}"
  fi

  if [[ -n "${probe_path}" ]]; then
    PROBE_NAMES+=("${env_name}")
  fi

  if [[ "${env_name}" == "sc-cci-r" ]]; then
    export_sc_cci_postinstall_lock "${prefix}" "${LOCK_ROOT}/sc-cci-r.postinstall-lock.json"
  fi
  export_pip_lock "${env_name}" "${prefix}" "${LOCK_ROOT}/${env_name}.pip-lock.txt"
  echo
done

if [[ "${#PROBE_NAMES[@]}" -gt 0 ]]; then
  echo "[OpenBioScience] probe exported environments"
  echo "  envs: ${PROBE_NAMES[*]}"
  if [[ "${DRY_RUN}" -eq 0 ]]; then
    probe_target="${LOCK_ROOT}/probe-results.json"
    bash "${REPO_ROOT}/environments/official/bootstrap/probe-official-envs.sh" "${PROBE_NAMES[@]}" >"${probe_target}"
    sanitize_json_paths "${probe_target}"
    if ! json_probe_status "${probe_target}" >/dev/null; then
      echo "Probe failure recorded in ${probe_target}" >&2
      if [[ "${ALLOW_FAILED_PROBE}" -ne 1 ]]; then
        exit 1
      fi
    fi
  fi
  echo
fi

write_report "${LOCK_ROOT}/runtime-build-report.md" "${SELECTED_NAMES[@]}"

echo "[OpenBioScience] sync complete"
echo "  report: ${LOCK_ROOT}/runtime-build-report.md"
