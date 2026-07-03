# OpenScience Update Server

Static download page and auto-update feed for OpenScience desktop builds.

## Run

```bash
./start.sh
```

The service listens on `127.0.0.1:34424` by default. The public update and
download entry is expected to be reverse-proxied at
`https://openscience.cc`.

Useful environment variables:

```bash
DEEPORGANISER_BASE_URL=https://openscience.cc
DEEPORGANISER_GITHUB_REPO=ResearAI/OpenScience
DEEPORGANISER_GITHUB_TOKEN=ghp_xxx              # optional, useful for private repos or higher rate limits
DEEPORGANISER_ENABLE_GITHUB_SYNC=1
DEEPORGANISER_GITHUB_SYNC_INTERVAL_SECONDS=600
DEEPORGANISER_SYNC_TOKEN=change-me              # protects /api/github-sync
DEEPORGANISER_TELEMETRY_ADMIN_TOKEN=change-me   # protects /api/admin/telemetry/summary
DEEPORGANISER_TELEMETRY_WRITE_TOKEN=change-me    # optional, protects /api/telemetry/events
DEEPORGANISER_ADMIN_USERNAME=admin              # protects /admin
DEEPORGANISER_ADMIN_PASSWORD_HASH=pbkdf2_sha256$...
```

## GitHub Release Sync

The server can mirror the newest GitHub Release into `data/updates` and refresh
the local update metadata automatically.

On startup and when `/api/status` is requested, the server checks GitHub no more
often than `DEEPORGANISER_GITHUB_SYNC_INTERVAL_SECONDS`. It downloads:

- `latest*.yml` channel files to `data/updates/`
- installer packages and `.blockmap` files to `data/updates/<version>/`
- release metadata to `data/updates/manifest.json`
- sync status to `data/updates/github-sync.json`

Run a one-shot sync manually:

```bash
python3 sync_github_release.py
python3 sync_github_release.py --dry-run
```

Force a running server to sync immediately:

```bash
curl "http://127.0.0.1:34424/api/github-sync?token=$DEEPORGANISER_SYNC_TOKEN"
```

For the desktop auto-updater, GitHub Release assets should include the
electron-builder channel metadata that matches each platform, for example
`latest-mac.yml`, `latest-arm64-mac.yml`, `latest.yml`, and/or
`latest-linux.yml`. The channel files stay at the update root, while the
packages referenced by those files are served under the release version folder.

## Publish A Release

Build the desktop app with electron-builder, then copy the generated artifacts
and metadata:

```bash
python3 publish_release.py --version 0.0.2 --from /path/to/DeepScientist_lark/out --notes "Release notes"
```

The server expects electron-builder metadata files at the update root:

- `latest.yml`
- `latest-mac.yml`
- `latest-arm64-mac.yml`
- `latest-linux.yml`
- `latest-linux-arm64.yml`
- `latest-win-arm64.yml`

Installer files live under the version directory:

```text
data/updates/0.0.2/OpenScience-0.0.2-mac-arm64.zip
data/updates/latest-arm64-mac.yml
```

## Update And Diagnostic Telemetry

The desktop app can send a small, anonymous event batch to:

```text
POST /api/telemetry/events
```

The endpoint stores data in `data/openscience.sqlite3` using only Python's
standard-library SQLite module. The default client behavior is intentionally
minimal:

- update status telemetry is enabled by default
- anonymous feature usage is opt-in
- diagnostic details are opt-in
- prompts, document contents, file paths, account names, tokens, and raw logs are
  not accepted by the generic telemetry path

Useful admin endpoint:

```bash
curl -H "Authorization: Bearer $DEEPORGANISER_TELEMETRY_ADMIN_TOKEN" \
  "http://127.0.0.1:34424/api/admin/telemetry/summary"
```

If `DEEPORGANISER_TELEMETRY_WRITE_TOKEN` is set, desktop clients must send it as
`X-OpenScience-Telemetry-Token` or a bearer token.

## Admin Console

The browser console is available at:

```text
/admin
```

It uses a server-side session and an HttpOnly cookie. The UI can view summary
metrics, anonymous installation records, recent events, and download CSV/JSON
exports. The backend intentionally does not show raw IPs, usernames, emails,
file paths, prompts, document bodies, tokens, or secrets.

Configure a username and password in `.env`. Prefer a PBKDF2 hash:

```bash
python3 - <<'PY'
from server import pbkdf2_password_hash
print(pbkdf2_password_hash("replace-with-a-long-random-password"))
PY
```

Then set:

```bash
DEEPORGANISER_ADMIN_USERNAME=admin
DEEPORGANISER_ADMIN_PASSWORD_HASH='pbkdf2_sha256$240000$...'
```

For local-only testing, `DEEPORGANISER_ADMIN_PASSWORD=...` is also supported,
but a hash is recommended on the server.
