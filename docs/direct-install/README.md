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

1. Download the package for your distribution, such as a `.deb` package or a Linux executable.
2. On Debian / Ubuntu, you can install a `.deb` package with:

   ```bash
   sudo apt install ./OpenScience-*.deb
   ```

3. If you downloaded an executable file, grant execute permission first:

   ```bash
   chmod +x OpenScience-*
   ```

4. If your desktop environment blocks the app, allow it from file properties, the software center, or your system security settings.

## Security Notes

- Prefer GitHub Releases. Avoid installers from unknown sources.
- macOS, Windows, and some Linux desktop environments may block unsigned, newly released, or uncommon apps. In those cases, the user must explicitly allow the app in system security settings.
- If the app still cannot launch, download the latest release again, then check system security settings, antivirus quarantine, and executable permissions.
