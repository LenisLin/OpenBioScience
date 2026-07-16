# OpenBioScience

OpenBioScience is a local-first platform for reproducible bioinformatics
workflows. It separates paper-driven reproduction from analysis of
user-provided omics data and keeps private biological data inside the
authorized execution environment.

## Workflow Scope

- `bio_reproduction` supports paper-driven method and result reproduction.
- `bio_analysis` supports local/private omics analysis with intake, QC,
  baseline, user-approved episodes, and closure checkpoints.
- The first complete analysis adapter is scRNA-seq. Other modalities can use
  the common intake contract but are reported as unsupported until an adapter
  is available.

Analysis artifacts, scripts, configurations, manifests, logs, and reports stay
in the selected project workspace. The application does not publish raw
matrices or full metadata as part of an artifact snapshot.

## Official Environments

The repository tracks Conda specifications under `environments/official/`.
Installed prefixes are external dependencies, not Git content. Public Hugging
Face releases provide one checksum-verified, relocatable archive per official
environment. Every consumer pins an immutable Hub commit SHA.

The standard runtime root is configurable through `OPENBIOSCIENCE_ENV_ROOT`.
Repository files use relative paths; `/data` and `/opt/openbioscience/env` are
stable paths inside the Docker image rather than requirements on the host.

See [the environment distribution guide](docs/environments/huggingface-distribution.md)
for release construction, auditing, and publication requirements.

## Docker Deployment

Prerequisites: Docker Engine with Docker Compose. The official environment is
downloaded only when the operator explicitly invokes the bootstrap service.

```bash
git clone https://github.com/LenisLin/OpenBioScience.git
cd OpenBioScience
cp .env.example .env
```

Set `OPENBIOSCIENCE_ENV_REPOSITORY` and the exact 40-character
`OPENBIOSCIENCE_ENV_REVISION` for a published public Dataset release in `.env`.
Then build the image, install the required environment once, and start the
application:

```bash
docker compose build
docker compose --profile bootstrap run --rm environment-bootstrap
docker compose up -d openbioscience
```

Open `http://localhost:25808`. Verify the container state with:

```bash
docker compose ps
curl --fail http://127.0.0.1:25808/api/auth/status
```

`openbioscience-data` persists application data and
`openbioscience-environments` persists downloaded environments. Re-running
the bootstrap service replaces only the requested environment prefix after its
archive has passed size and SHA-256 validation. The public release flow does
not require `HF_TOKEN`; an optional token may be supplied only for rate-limit
or future gated access and must not be committed.

### Local Environment Override

For migration or development, an existing local runtime root can replace the
named environment volume without placing its path in tracked configuration:

```bash
export OPENBIOSCIENCE_LOCAL_ENV_ROOT=/path/to/runtime-root
docker compose -f compose.yaml -f compose.local-env.yaml up -d openbioscience
```

The runtime root must contain `environments/official/<environment-name>/`.
This override is not part of the standard Docker deployment.

## Maintainer Commands

Build a local official environment beneath a chosen root:

```bash
environments/official/bootstrap/install-official-envs.sh \
  --root ./runtime \
  sc-py-singlecell
```

Package verified installed environments and publish only the resulting release
directory using the procedure in the distribution guide. Never upload a raw
environment tree, user-created environment, project data directory, or any
file containing credentials.

## Development

Use Bun and Node.js 22 or later for repository development:

```bash
bun install --frozen-lockfile
bun run webui
```

Run focused checks before proposing changes:

```bash
bunx vitest run tests/unit/bootstrap/openBioScienceRuntimeEnv.test.ts
bunx vitest run tests/unit/bootstrap/officialEnvironmentRelease.test.ts
bun run lint
bun run format:check
```

## License

OpenBioScience is licensed under [AGPL-3.0-only](LICENSE). Third-party
components retain their own license notices. Environment releases require a
separate package-license and redistribution review before publication.
