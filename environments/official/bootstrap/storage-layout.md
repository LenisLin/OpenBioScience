# OpenBioScience Environment Storage Layout

The current shared storage root for heavyweight environments is:

- `/mnt/NAS_21T/ProjectData/OpenBioScience`

## Directory Layout

```text
/mnt/NAS_21T/ProjectData/OpenBioScience/
├── environments/
│   ├── official/
│   │   ├── sc-py-singlecell/
│   │   ├── sc-r-singlecell/
│   │   ├── sc-r-plot/
│   │   ├── sc-r-clinical/
│   │   ├── sc-cci-r/
│   │   ├── sc-r-trajectory/
│   │   ├── sc-r-tumor-cnv/
│   │   └── sc-network-grn-r/
│   └── custom/
├── cache/
│   ├── conda-pkgs/
│   └── mamba-root/
└── manifests/
```

## Rules

1. Official environments live under `environments/official/<env-name>`.
2. User-extended or ad hoc environments live under `environments/custom/`.
3. Shared solver and package caches live under `cache/`.
4. Environment names in storage should match the YAML environment role name and
   should not carry temporary verification suffixes such as `-cu124` or `-r45`.

## Migration Policy

1. Do not relocate an existing conda prefix by raw filesystem move when the
   absolute install path changes.
2. Recreate or clone into the target prefix so package metadata and entrypoint
   paths are rewritten against the destination root.
3. After the destination prefix is verified, remove the temporary source
   prefix.
