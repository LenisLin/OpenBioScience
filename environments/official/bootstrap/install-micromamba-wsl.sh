#!/usr/bin/env bash

set -euo pipefail

DEFAULT_RUNTIME_ROOT="/srv/openbioscience"
RUNTIME_ROOT="${OPENBIOSCIENCE_RUNTIME_ROOT:-${DEFAULT_RUNTIME_ROOT}}"
INSTALL_ROOT="${OPENBIOSCIENCE_MICROMAMBA_ROOT:-${RUNTIME_ROOT}/tools/micromamba}"
BIN_DIR="${INSTALL_ROOT}/bin"
MICROMAMBA_EXE="${BIN_DIR}/micromamba"
DRY_RUN=0

usage() {
  cat <<'EOF'
Usage:
  install-micromamba-wsl.sh [--dry-run]

Installs micromamba into:
  $OPENBIOSCIENCE_RUNTIME_ROOT/tools/micromamba/bin/micromamba

This script is intended for WSL/Linux server setup and does not require sudo
when OPENBIOSCIENCE_RUNTIME_ROOT points to a writable directory.
EOF
}

for arg in "$@"; do
  case "${arg}" in
    --dry-run | --plan)
      DRY_RUN=1
      ;;
    -h | --help)
      usage
      exit 0
      ;;
    *)
      echo "Unknown option: ${arg}" >&2
      usage >&2
      exit 2
      ;;
  esac
done

echo "[OpenBioScience] micromamba plan"
echo "  runtime root: ${RUNTIME_ROOT}"
echo "  install root: ${INSTALL_ROOT}"
echo "  executable:   ${MICROMAMBA_EXE}"

if [[ "${DRY_RUN}" -eq 1 ]]; then
  exit 0
fi

mkdir -p "${BIN_DIR}"

if [[ -x "${MICROMAMBA_EXE}" ]]; then
  "${MICROMAMBA_EXE}" --version
  exit 0
fi

TMP_DIR="$(mktemp -d)"
cleanup() {
  rm -rf "${TMP_DIR}"
}
trap cleanup EXIT

case "$(uname -m)" in
  x86_64 | amd64)
    PLATFORM="linux-64"
    ;;
  aarch64 | arm64)
    PLATFORM="linux-aarch64"
    ;;
  *)
    echo "Unsupported architecture: $(uname -m)" >&2
    exit 2
    ;;
esac

ARCHIVE="${TMP_DIR}/micromamba.tar.bz2"
curl -L "https://micro.mamba.pm/api/micromamba/${PLATFORM}/latest" -o "${ARCHIVE}"
tar -xjf "${ARCHIVE}" -C "${TMP_DIR}"
install -m 0755 "${TMP_DIR}/bin/micromamba" "${MICROMAMBA_EXE}"
"${MICROMAMBA_EXE}" --version
