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

usage() {
  cat <<'EOF'
Usage:
  repair-bioconductor-data-packages.sh --env <env-name> <package-key> [<package-key> ...]

Example:
  repair-bioconductor-data-packages.sh --env sc-r-singlecell go.db-3.22.0 org.hs.eg.db-3.22.0

Use this only after a conda/micromamba environment exists. It repairs
Bioconductor data packages whose post-link download failed on flaky networks.
Package keys must match entries in:
  <prefix>/share/bioconductor-data-packages/dataURLs.json
EOF
}

ENV_NAME=""
PACKAGE_KEYS=()

while [[ "$#" -gt 0 ]]; do
  case "$1" in
    --env)
      if [[ "$#" -lt 2 ]]; then
        echo "--env requires a value" >&2
        exit 2
      fi
      ENV_NAME="$2"
      shift 2
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
      PACKAGE_KEYS+=("$1")
      shift
      ;;
  esac
done

if [[ -z "${ENV_NAME}" || "${#PACKAGE_KEYS[@]}" -eq 0 ]]; then
  usage >&2
  exit 2
fi

PREFIX="${OFFICIAL_ROOT}/${ENV_NAME}"
if [[ ! -d "${PREFIX}/conda-meta" ]]; then
  echo "Environment prefix is missing or is not a conda prefix: ${PREFIX}" >&2
  exit 1
fi

for package_key in "${PACKAGE_KEYS[@]}"; do
  echo "[OpenBioScience] repairing Bioconductor data package"
  echo "  env:     ${ENV_NAME}"
  echo "  prefix:  ${PREFIX}"
  echo "  package: ${package_key}"

  "${MAMBA_EXE}" run -p "${PREFIX}" bash -lc '
set -euo pipefail

PACKAGE_KEY="$1"
PREFIX="$2"
JSON="${PREFIX}/share/bioconductor-data-packages/dataURLs.json"

if [[ ! -f "${JSON}" ]]; then
  echo "Missing Bioconductor data package index: ${JSON}" >&2
  exit 1
fi

FN="$(yq ".\"${PACKAGE_KEY}\".fn" "${JSON}" | tr -d "\"")"
MD5="$(yq ".\"${PACKAGE_KEY}\".md5" "${JSON}" | tr -d "\"")"
mapfile -t URLS < <(yq ".\"${PACKAGE_KEY}\".urls[]" "${JSON}" | tr -d "\"")

if [[ -z "${FN}" || "${FN}" == "null" || -z "${MD5}" || "${MD5}" == "null" || "${#URLS[@]}" -eq 0 ]]; then
  echo "Unknown Bioconductor data package key: ${PACKAGE_KEY}" >&2
  exit 2
fi

STAGING="${PREFIX}/share/${PACKAGE_KEY}"
TARBALL="${STAGING}/${FN}"
mkdir -p "${STAGING}"

for URL in "${URLS[@]}"; do
  for attempt in 1 2 3; do
    echo "[OpenBioScience] download attempt ${attempt}: ${URL}"
    if curl -L --fail --retry 3 --retry-all-errors --connect-timeout 30 --continue-at - --output "${TARBALL}" "${URL}"; then
      if printf "%s  %s\n" "${MD5}" "${TARBALL}" | md5sum -c -; then
        R CMD INSTALL --library="${PREFIX}/lib/R/library" "${TARBALL}"
        rm -f "${TARBALL}"
        rmdir "${STAGING}" 2>/dev/null || true
        exit 0
      fi
      echo "Checksum mismatch for ${TARBALL}; restarting download." >&2
      rm -f "${TARBALL}"
    fi
  done
done

echo "Failed to repair ${PACKAGE_KEY}" >&2
exit 1
' _ "${package_key}" "${PREFIX}"
done
