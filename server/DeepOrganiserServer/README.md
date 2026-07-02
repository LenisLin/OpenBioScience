# DeepOrganiserServer

Static update feed and download page for DeepOrganiser desktop builds.

## Run

```bash
./start.sh
```

The service listens on `127.0.0.1:34424` by default. The public update and
download entry is expected to be reverse-proxied at
`https://deepscientist.cc/DeepOrganiser`.

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
data/updates/0.0.2/DeepOrganiser-0.0.2-mac-arm64.zip
data/updates/latest-arm64-mac.yml
```
