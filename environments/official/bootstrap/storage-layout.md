# OpenBioScience Environment Storage Layout

The default shared runtime root for heavyweight OpenBioScience assets is:

- `/srv/openbioscience`

Set `OPENBIOSCIENCE_RUNTIME_ROOT` to use a different server path.

## Directory Layout

```text
${OPENBIOSCIENCE_RUNTIME_ROOT:-/srv/openbioscience}/
├── envs/
│   ├── sc-py-singlecell/
│   ├── sc-r-singlecell/
│   ├── sc-r-plot/
│   ├── sc-r-clinical/
│   ├── sc-cci-r/
│   ├── sc-r-trajectory/
│   ├── sc-r-tumor-cnv/
│   └── sc-network-grn-r/
├── custom-envs/
├── cache/
│   ├── conda-pkgs/
│   ├── mamba-root/
│   └── r-github/
├── tools/
│   └── micromamba/
├── data/
├── results/
└── manifests/
```

## Rules

1. Official environments live under `envs/<env-name>`.
2. User-extended or ad hoc environments live under `custom-envs/`.
3. Shared solver, package, and source-tarball caches live under `cache/`.
4. Project-local bootstrap tools such as micromamba live under `tools/`.
5. Downloaded datasets live under `data/`; workflow outputs live under `results/`.
6. Environment names in storage should match the YAML environment role name and should not carry temporary verification suffixes such as `-cu124` or `-r45`.
7. Runtime folders should stay outside the Git worktree whenever possible.

## Migration Policy

1. Do not relocate an existing conda prefix by raw filesystem move when the absolute install path changes.
2. Recreate or clone into the target prefix so package metadata and entrypoint paths are rewritten against the destination root.
3. After the destination prefix is verified, remove the temporary source prefix.
