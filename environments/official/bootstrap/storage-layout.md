# OpenBioScience Environment Storage Layout

An OpenBioScience runtime root is selected by `OPENBIOSCIENCE_ENV_ROOT` or by
the `--root` option of the installer. Repository configuration never records a
host-specific runtime path.

```text
<runtime-root>/
├── environments/
│   ├── official/<environment-name>/
│   └── custom/
├── cache/
│   ├── conda-pkgs/
│   └── mamba-root/
└── manifests/
```

Official environments use the catalog names in `env-manifest.json`. Custom
environments remain separate from the official subtree. Do not relocate a
Conda prefix with a raw filesystem move: rebuild it at the target location or
install a relocatable archive produced with `conda-pack`.
