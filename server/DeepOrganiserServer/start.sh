#!/usr/bin/env bash
set -euo pipefail

cd "$(dirname "$0")"
mkdir -p data/updates logs

export DEEPORGANISER_HOST="${DEEPORGANISER_HOST:-127.0.0.1}"
export DEEPORGANISER_PORT="${DEEPORGANISER_PORT:-34424}"
export DEEPORGANISER_BASE_URL="${DEEPORGANISER_BASE_URL:-https://deepscientist.cc/DeepOrganiser}"

exec python3 server.py 2>&1 | tee -a logs/server.log
