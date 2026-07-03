#!/usr/bin/env bash
set -euo pipefail

cd "$(dirname "$0")"
mkdir -p data/updates logs

if [[ -f .env ]]; then
  while IFS= read -r line || [[ -n "$line" ]]; do
    [[ -z "$line" || "$line" =~ ^[[:space:]]*# ]] && continue
    [[ "$line" != *=* ]] && continue
    key="${line%%=*}"
    value="${line#*=}"
    key="$(printf '%s' "$key" | tr -d '[:space:]')"
    [[ "$key" =~ ^[A-Za-z_][A-Za-z0-9_]*$ ]] || continue
    value="${value%$'\r'}"
    if [[ ( "$value" == \"*\" && "$value" == *\" ) || ( "$value" == \'*\' && "$value" == *\' ) ]]; then
      value="${value:1:${#value}-2}"
    fi
    export "$key=$value"
  done < .env
fi

export DEEPORGANISER_HOST="${DEEPORGANISER_HOST:-127.0.0.1}"
export DEEPORGANISER_PORT="${DEEPORGANISER_PORT:-34424}"
export DEEPORGANISER_BASE_URL="${DEEPORGANISER_BASE_URL:-https://openscience.cc}"
export DEEPORGANISER_GITHUB_REPO="${DEEPORGANISER_GITHUB_REPO:-ResearAI/OpenScience}"
export DEEPORGANISER_ENABLE_GITHUB_SYNC="${DEEPORGANISER_ENABLE_GITHUB_SYNC:-1}"

exec python3 server.py 2>&1 | tee -a logs/server.log
