# OpenBioScience Official Environment Lock Report

- harness version: 0.1.0-p0
- schema: openbioscience.official_environment_lock_report.v1
- generated at: 2026-07-09T14:06:02Z
- lock platform: linux-64
- runtime root: ${OPENBIOSCIENCE_RUNTIME_ROOT}
- official env root: ${OPENBIOSCIENCE_RUNTIME_ROOT}/envs
- manifest: environments/official/bootstrap/env-manifest.json
- mamba executable: ${OPENBIOSCIENCE_RUNTIME_ROOT}/tools/micromamba/bin/micromamba

## Exported Environments

| environment | explicit lock | conda records | pip lock | postinstall lock |
| --- | --- | ---: | --- | --- |
| `sc-py-singlecell` | `sc-py-singlecell.explicit.txt` | 303 | yes | - |
| `sc-r-singlecell` | `sc-r-singlecell.explicit.txt` | 538 | - | - |
| `sc-r-plot` | `sc-r-plot.explicit.txt` | 301 | - | - |
| `sc-r-clinical` | `sc-r-clinical.explicit.txt` | 354 | - | - |
| `sc-cci-r` | `sc-cci-r.explicit.txt` | 473 | - | yes |

## Verification

- probe results: `probe-results.json`

This report is intentionally small and commit-safe. Conda prefixes, caches,
downloaded data, database caches, and analysis outputs remain outside Git.
