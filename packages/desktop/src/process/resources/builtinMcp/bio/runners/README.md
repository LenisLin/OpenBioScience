# OpenBioScience Bio Runners

These scripts are the allowlisted local runners for the P0 scRNA-seq harness.
They are intentionally small smoke runners, not full paper reproduction engines.

Repository contents:

- `scripts/`: executable Python/R runners and shared helpers.
- `fixtures/`: tiny synthetic inputs used for smoke tests and local validation.
- `defaults.yaml`: example runner configs using the bundled fixtures.
- `smoke-fixtures.sh`: WSL/Linux smoke entry point that runs the allowlisted
  fixture workflows after official environments are installed.

Runtime rules:

1. Keep conda prefixes, downloaded data, package caches, and outputs outside Git.
2. Prefer `OPENBIOSCIENCE_RUNTIME_ROOT=/srv/openbioscience` on WSL/Linux servers.
3. Set `OPENBIOSCIENCE_WORKSPACE_ROOT` to the project or analysis workspace before running through MCP.
4. Every runner writes `run_manifest.json`, logs, and small table/figure artifacts.
5. The MCP control plane must call these scripts by workflow id only; never pass arbitrary shell commands.

Smoke validation:

```bash
export OPENBIOSCIENCE_RUNTIME_ROOT=$HOME/openbioscience-runtime
bash packages/desktop/src/process/resources/builtinMcp/bio/runners/smoke-fixtures.sh --dry-run
bash packages/desktop/src/process/resources/builtinMcp/bio/runners/smoke-fixtures.sh inspect_input run_scanpy_core run_liana
```

Outputs are written to
`$OPENBIOSCIENCE_RUNTIME_ROOT/results/fixture-smoke` by default.
