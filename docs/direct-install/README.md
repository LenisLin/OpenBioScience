# OpenScience Direct Installation Guide

[中文版本](README.zh-CN.md)

This guide is for users who install the desktop app directly instead of building from source. Download the latest release from GitHub Releases:

[https://github.com/ResearAI/OpenScience/releases](https://github.com/ResearAI/OpenScience/releases)

## macOS

1. Open the Releases page and download the package for your Mac.
   - Apple Silicon Macs usually use `arm64`.
   - Intel Macs usually use `x64`.
2. Open the downloaded package and drag OpenScience into `Applications`.
3. On first launch, macOS may say it cannot verify the developer, or that OpenScience was not opened.

![macOS warning that OpenScience was not opened](assets/macos-gatekeeper-unverified-warning.png)

4. Do not choose to move the app to Trash. Click `Done`, then open:

   `System Settings` -> `Privacy & Security` -> `Security`

5. Near the message saying OpenScience was blocked to protect your Mac, click `Open Anyway`.

![Open Anyway in macOS Privacy & Security](assets/macos-privacy-security-open-anyway.png)

6. macOS may ask for Touch ID, your password, or one more `Open` confirmation. After that, OpenScience should launch normally.

If `Open Anyway` does not appear, double-click OpenScience once more to trigger the security prompt, then return to `Privacy & Security`.

## Windows

1. Download the Windows installer from Releases.
2. Double-click the installer.
3. If Microsoft Defender SmartScreen appears, choose `More info`, then `Run anyway`.
4. If your browser says the downloaded file is uncommon, confirm it came from the `ResearAI/OpenScience` Releases page, then keep it.

## Linux

1. Download the `.deb` package for your Linux architecture from Releases.
2. On Debian / Ubuntu, install it with:

   ```bash
   sudo apt install ./OpenScience-*.deb
   ```

3. Launch OpenScience from your application menu, or from a terminal:

   ```bash
   OpenScience
   ```

4. The desktop app starts the local WebUI by default. Open **Settings -> Remote Connection -> WebUI** to copy the browser URL.
5. For a browser-only or headless Linux run, start WebUI explicitly:

   ```bash
   OpenScience --webui --port 25808
   OpenScience --webui --remote --port 25808
   ```

   Use the first command for local browser access. Use `--remote` only when another device, reverse proxy, or SSH tunnel needs to reach the WebUI.
6. If your desktop environment blocks the app, allow it from file properties, the software center, or your system security settings.

## Security Notes

- Prefer GitHub Releases. Avoid installers from unknown sources.
- macOS, Windows, and some Linux desktop environments may block unsigned, newly released, or uncommon apps. In those cases, the user must explicitly allow the app in system security settings.
- WebUI listens locally by default. Enable remote access only on trusted networks or behind a tunnel/reverse proxy you control.
- If the app still cannot launch, download the latest release again, then check system security settings, antivirus quarantine, and executable permissions.
