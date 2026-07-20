# Errors

Command failures and integration errors.

---

## [ERR-20260719-001] msigdb_static_download

**Logged**: 2026-07-19T11:07:00+08:00
**Priority**: medium
**Status**: pending
**Area**: data

### Summary
Parallel MSigDB GMT downloads from the official Broad static host can fail with HTTP/2 stream cancellation, leaving partial files.

### Error
```
curl: (92) HTTP/2 stream 1 was not closed cleanly: CANCEL (err 8)
```

### Context
- Downloading MSigDB `v2026.1.Hs/Mm` GMT collection files into `resources/bio/gene_sets/msigdb`.
- Small collections completed, while larger collection downloads were interrupted.

### Suggested Fix
Use official `data.broadinstitute.org` URLs with `curl --http1.1 -C - --retry 3`, then verify size/hash and record the files in local manifest JSON.

### Metadata
- Reproducible: unknown
- Related Files: resources/bio/gene_sets/msigdb

---

## [ERR-20260717-001] bun_run_webui

**Logged**: 2026-07-17T19:52:00+08:00
**Priority**: medium
**Status**: resolved
**Area**: infra

### Summary
Starting WebUI through `bun run webui` can fail inside the Codex sandbox because `tsx` cannot create its local IPC pipe.

### Error
```
Error: listen EPERM: operation not permitted /tmp/tsx-1000/3.pipe
```

### Context
- The WebUI command was correct and the build had succeeded.
- Relaunching the same command with approved non-sandbox execution started the service normally.

### Suggested Fix
When this exact `tsx` IPC pipe error appears during WebUI launch, rerun the same `bun run webui` command with escalation instead of changing application code.

### Metadata
- Reproducible: yes
- Related Files: scripts/webui.ts

---

## [ERR-20260715-001] web__run

**Logged**: 2026-07-15T00:00:00+08:00
**Priority**: low
**Status**: resolved
**Area**: docs

### Summary
The web browsing integration returned HTTP 404 while checking Hugging Face CLI documentation.

### Error
```
Fatal error: http 404 Not Found: Some("404 page not found")
```

### Context
- The documentation check was limited to confirming public Hugging Face Dataset upload commands.
- No credentials, repository data, or user files were sent.

### Suggested Fix
Avoid adding unverified CLI syntax to user documentation; use direct official documentation links or validate commands in a configured release environment.

### Metadata
- Reproducible: unknown
- Related Files: docs/environments/huggingface-distribution.md

---

## [ERR-20260715-001] repository file relocation

**Logged**: 2026-07-15T10:16:00+08:00
**Priority**: low
**Status**: resolved
**Area**: config

### Summary
`git mv` cannot relocate newly created untracked source files.

### Error
```
fatal: not under version control
```

### Context
- Reorganizing new Bio reproduction modules into the required `bio/reproduction/` directory.
- The modules were present in the working tree but had not been added to Git.

### Suggested Fix
Use a workspace-local move for untracked files, then update imports and validate all references.

### Metadata
- Reproducible: yes
- Related Files: packages/desktop/src/process/resources/builtinMcp/bio/reproduction

### Resolution
- **Resolved**: 2026-07-15T10:16:00+08:00
- **Notes**: Relocated files with a workspace-local move and updated imports.

---

## [ERR-20260712-002] R package source compilation

**Logged**: 2026-07-12T13:30:00+08:00
**Priority**: medium
**Status**: resolved
**Area**: config

### Summary
Invoking an environment's absolute `Rscript` without activating the Conda environment selected an older external GCC from `PATH`.

### Error
```
x86_64-conda-linux-gnu-cc: error: unrecognized command-line option '-std=gnu23'
```

### Context
- R 4.5.3 requires a compiler supporting C23 for packages with C sources.
- The unactivated invocation resolved GCC 12.1, while the target environment contains GCC 15.2.

### Suggested Fix
Run source builds through `conda run -p <environment> Rscript ...` so the target environment's compiler and build tools are first on `PATH`.

### Metadata
- Reproducible: yes
- Related Files: none

### Resolution
- **Resolved**: 2026-07-12T13:30:00+08:00
- **Notes**: Subsequent source builds will use `conda run -p` and the environment compiler.

---

## [ERR-20260712-001] web__run

**Logged**: 2026-07-12T00:00:00+08:00
**Priority**: low
**Status**: resolved
**Area**: infra

### Summary
The web browsing integration returned HTTP 404 for the CellChat GitHub page and search query.

### Error
```
Fatal error: http 404 Not Found: Some("404 page not found")
```

### Context
- Attempted to open and search for the official `jinworks/CellChat` GitHub repository.
- Direct retrieval of the official raw GitHub README with `curl` succeeded.

### Suggested Fix
Use the official raw GitHub content endpoint when the browsing integration cannot retrieve a GitHub repository.

### Metadata
- Reproducible: yes
- Related Files: none

### Resolution
- **Resolved**: 2026-07-12T00:00:00+08:00
- **Notes**: Retrieved the authoritative README from raw.githubusercontent.com.

---
