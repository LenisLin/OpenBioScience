# Hugging Face Environment Distribution

Official OpenBioScience environments are published as public Hugging Face
Dataset releases. The repository stores source YAML specifications; each
release stores one relocatable `conda-pack` archive per environment, a
`release-manifest.json`, and no user data.

## Release Contract

`release-manifest.json` uses
`openbioscience.official_environment_release.v1`. Every artifact records its
environment name, `linux-x64` platform, archive path, output size, SHA-256,
relative installation prefix, and required commands. Consumers must pin
`OPENBIOSCIENCE_ENV_REVISION` to the 40-character commit SHA shown in the Hub
revision history; tags and `main` are not reproducible runtime references.

The release directory may contain only `release-manifest.json` and the archive
paths listed by that manifest. Do not publish `environments/custom`, raw
matrices, metadata, package caches, `.conda` credentials, or local logs.

## Maintainer Release Procedure

1. Build and probe each target prefix under a chosen runtime root.
2. Run `bun run env:package -- --source-root "$OPENBIOSCIENCE_ENV_ROOT" --output ./release/linux-x64 --release 2026.07.0 --platform linux-x64 sc-py-singlecell` for every approved environment.
3. Review archive contents, verify every manifest SHA-256, record package-license and SBOM evidence, and confirm that the release directory contains no private data.
4. Create or select the public Hugging Face Dataset repository, authenticate with the official Hugging Face CLI, and run `scripts/publish-official-environments.sh --repository <owner/repository> --release-dir ./release/linux-x64`.
5. Copy the resulting 40-character commit SHA into `.env` as `OPENBIOSCIENCE_ENV_REVISION`, then bootstrap in a clean Docker volume before announcing the release.

The publish script deliberately does not create repositories or select their
visibility. Repository ownership and public visibility are release-management
decisions that must be made in the Hugging Face UI or approved automation.

## Consumer Contract

The Docker `environment-bootstrap` service fetches the manifest and requested
archive from the configured public Dataset revision, checks size and SHA-256,
rejects unsafe archive paths, runs `conda-unpack`, and probes declared
commands. The application does not download environments during startup.

For an installed environment, the root layout is:

```text
<environment-root>/environments/official/<environment-name>/
```

The location is selected by `OPENBIOSCIENCE_ENV_ROOT`; its value is never
stored in the release manifest or committed Compose configuration.
Runtime consumers also accept `OPENBIOSCIENCE_RUNTIME_ROOT` for compatibility;
both variables refer to the same installed root, not to one environment prefix.
