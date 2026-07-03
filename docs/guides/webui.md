# OpenScience WebUI Mode - Startup Guide

OpenScience includes WebUI mode, allowing you to access the workspace through a web browser. In current desktop builds, local WebUI is started by default and can be inspected from **Settings -> Remote Connection -> WebUI**. This guide covers explicit WebUI startup for development, servers, and remote access.

## Table of Contents

- [What is WebUI Mode?](#what-is-webui-mode)
- [Windows](#windows)
- [macOS](#macos)
- [Linux](#linux)
- [Android (Termux)](#android-termux)
- [Remote Access](#remote-access)
- [Troubleshooting](#troubleshooting)

---

## What is WebUI Mode?

WebUI mode starts OpenScience with an embedded web server, allowing you to:

- Access the application through any modern web browser
- Use OpenScience from remote devices on the same network (with the `--remote` flag)
- Run the application headless on servers

Default access URL:

- Packaged app: `http://localhost:25808`
- Source/development run: `http://localhost:25809`

If the port is occupied, OpenScience may use the next available port. Check the WebUI settings page or terminal output.

---

## Windows

### Method 1: Command Line (Recommended)

Open **Command Prompt** or **PowerShell** and run:

```cmd
# Using full path
"C:\Program Files\OpenScience\OpenScience.exe" --webui

# Or if OpenScience is in your PATH
OpenScience.exe --webui
```

### Method 2: Create a Desktop Shortcut

1. Right-click on desktop → **New** → **Shortcut**
2. Enter target location:
   ```
   "C:\Program Files\OpenScience\OpenScience.exe" --webui
   ```
3. Name it **OpenScience WebUI**
4. Click **Finish**
5. Double-click the shortcut to launch

### Method 3: Create a Batch File

Create `start-openscience-webui.bat`:

```batch
@echo off
"C:\Program Files\OpenScience\OpenScience.exe" --webui
pause
```

Double-click the batch file to start WebUI mode.

---

## macOS

### Method 1: Terminal Command (Recommended)

Open **Terminal** and run:

```bash
# Using full path
/Applications/OpenScience.app/Contents/MacOS/OpenScience --webui

# Or using open command
open -a OpenScience --args --webui
```

### Method 2: Create Shell Script

Create `start-openscience-webui.sh`:

```bash
#!/bin/bash
/Applications/OpenScience.app/Contents/MacOS/OpenScience --webui
```

Make it executable and run:

```bash
chmod +x start-openscience-webui.sh
./start-openscience-webui.sh
```

### Method 3: Create Automator Application

1. Open **Automator**
2. Choose **Application**
3. Add **Run Shell Script** action
4. Enter:
   ```bash
   /Applications/OpenScience.app/Contents/MacOS/OpenScience --webui
   ```
5. Save as **OpenScience WebUI.app**
6. Double-click to launch

### Method 4: Add to Dock

1. Create an Automator app (Method 3)
2. Drag **OpenScience WebUI.app** to your Dock
3. Click the Dock icon to start WebUI mode anytime

---

## Linux

### Method 1: Command Line (Recommended)

#### For .deb Installation

```bash
# Using system path
OpenScience --webui

# Or using full path
/opt/OpenScience/OpenScience --webui
```

For remote LAN/server access:

```bash
OpenScience --webui --remote --port 25808
```

### Method 2: Create Desktop Entry

Create `~/.local/share/applications/openscience-webui.desktop`:

```ini
[Desktop Entry]
Name=OpenScience WebUI
Comment=Start OpenScience in WebUI mode
Exec=/opt/OpenScience/OpenScience --webui
Icon=openscience
Terminal=false
Type=Application
Categories=Utility;Office;
```

Make it executable:

```bash
chmod +x ~/.local/share/applications/openscience-webui.desktop
```

The launcher will appear in your application menu.

### Method 3: Create Shell Script

Create `~/bin/start-openscience-webui.sh`:

```bash
#!/bin/bash
/opt/OpenScience/OpenScience --webui
```

Make it executable:

```bash
chmod +x ~/bin/start-openscience-webui.sh
```

Run it:

```bash
start-openscience-webui.sh
```

### Method 4: Systemd Service (Background)

Create `/etc/systemd/system/openscience-webui.service`:

```ini
[Unit]
Description=OpenScience WebUI Service
After=network.target

[Service]
Type=simple
User=YOUR_USERNAME
ExecStart=/opt/OpenScience/OpenScience --webui --remote
Restart=on-failure
RestartSec=10

[Install]
WantedBy=multi-user.target
```

Enable and start the service:

```bash
sudo systemctl daemon-reload
sudo systemctl enable openscience-webui.service
sudo systemctl start openscience-webui.service

# Check status
sudo systemctl status openscience-webui.service
```

---

## Android (Termux)

**Important Note**: Electron desktop mode is **not supported** on Android. However, you can run OpenScience in WebUI mode using Termux with a prooted Linux environment.

> **Community Contribution**: This guide is contributed by [@Manamama](https://github.com/Manamama). Special thanks for making OpenScience accessible on Android devices! 🙏
>
> **Original Tutorial**: [Running OpenScience WebUI on Android via Termux + Proot Ubuntu](https://gist.github.com/Manamama/b4f903c279b5e73bdad4c2c0a58d5ddd)
>
> **Related Issues**: [#217 - Android Support Discussion](https://github.com/ResearAI/OpenScience/issues/217)

### Prerequisites

- **Termux** from [F-Droid](https://f-droid.org/en/packages/com.termux/) (Google Play version is outdated and not recommended)
- **~5 GB free storage**
- **Internet connection**
- **Android 7.0+** (tested on Android 14)

### Installation Steps

#### 1. Install Termux and Update Packages

```bash
# Update package list
pkg update -y

# Install proot-distro
pkg install proot-distro -y
```

#### 2. Install Ubuntu via Proot

```bash
# Install Ubuntu rootfs
proot-distro install ubuntu

# Login to Ubuntu environment
proot-distro login ubuntu
```

#### 3. Install System Dependencies

```bash
# Update Ubuntu package list
apt update

# Install required dependencies
apt install -y \
    wget \
    libgtk-3-0 \
    libnss3 \
    libasound2 \
    libgbm1 \
    libxshmfence1 \
    ca-certificates

# Optional: Install additional libraries if needed
apt install -y \
    libx11-xcb1 \
    libxcomposite1 \
    libxdamage1 \
    libxrandr2 \
    libatk1.0-0 \
    libcups2
```

#### 4. Download and Install OpenScience

```bash
# Download the ARM64 .deb package (replace VERSION with the actual version)
# Check latest version at: https://github.com/ResearAI/OpenScience/releases
wget https://github.com/ResearAI/OpenScience/releases/download/vVERSION/OpenScience_VERSION_arm64.deb

# Example (replace VERSION with the release tag, e.g. v1.5.2):
wget https://github.com/ResearAI/OpenScience/releases/download/vVERSION/OpenScience_VERSION_arm64.deb

# Install the package
apt install -y ./OpenScience_*.deb

# Verify installation
which OpenScience
```

#### 5. Launch OpenScience WebUI

```bash
# Start OpenScience in WebUI mode with no-sandbox flag
OpenScience --no-sandbox --webui
```

**Important**: The `--no-sandbox` flag is required in Termux/proot environments.

#### 6. Access the WebUI

Once started, open your browser and navigate to:

```
http://localhost:25808
```

**Note**: The default port is 25808. Check the terminal output if a different port is used.

### Expected Warnings (Non-Fatal)

You may see the following warnings in the terminal - these are normal and can be ignored:

```
[WARNING] Could not connect to session bus: Using X11 for dbus-daemon autolaunch was disabled at compile time
[ERROR] Failed to connect to the bus: Failed to connect to socket: No such file or directory
[WARNING] Multiple instances of the app detected, but not running on display server
```

These errors are related to D-Bus and X server, which are not needed for WebUI mode.

### Remote Access on LAN

To access OpenScience from other devices on your local network:

```bash
# Start with --remote flag
OpenScience --no-sandbox --webui --remote

# Find your Android device's IP address
# In Termux (outside proot):
# ifconfig or ip addr show
```

Access from other devices: `http://YOUR_ANDROID_IP:25808`

### Troubleshooting

#### Port Already in Use

If port 25808 is occupied:

```bash
# Specify a different port
OpenScience --no-sandbox --webui --port 8080
```

#### Permission Denied Errors

```bash
# Ensure the binary has execute permissions
chmod +x /opt/OpenScience/OpenScience
```

#### Out of Memory

OpenScience requires sufficient RAM. Close other apps if you encounter memory issues.

#### Cannot Access from Browser

1. Check if OpenScience is running: look for "Server started" message
2. Try using Termux's built-in browser or Chrome
3. Clear browser cache

### Performance Tips

1. **Use a lightweight browser** - Chrome or Firefox Focus recommended
2. **Close background apps** - Free up RAM for better performance
3. **Use WiFi** - More stable than mobile data for remote access
4. **Keep device charged** - Running OpenScience consumes battery

### Tested Environment

- **Device**: Android 14
- **Termux Version**: 0.118.0
- **OpenScience Version**: Latest release (e.g. 1.5.2)
- **Proot-distro**: Ubuntu (latest)

### Creating a Startup Script

For convenience, create a script to launch OpenScience quickly:

```bash
# Create script in Ubuntu (proot)
cat > ~/start-openscience.sh << 'EOF'
#!/bin/bash
echo "Starting OpenScience WebUI..."
OpenScience --no-sandbox --webui --remote
EOF

# Make executable
chmod +x ~/start-openscience.sh

# Run anytime
./start-openscience.sh
```

### Quick Start Command (One-liner)

From Termux main shell:

```bash
proot-distro login ubuntu -- bash -c "OpenScience --no-sandbox --webui --remote"
```

### Feedback and Improvements

If you encounter issues or have suggestions for improving Android support:

1. Check the [original community guide](https://gist.github.com/Manamama/b4f903c279b5e73bdad4c2c0a58d5ddd)
2. Report issues at [GitHub Issues #217](https://github.com/ResearAI/OpenScience/issues/217)
3. Share your experience to help other Android users!

---

## Remote Access

To allow access from other devices on your network, use the `--remote` flag:

### Windows

```cmd
OpenScience.exe --webui --remote
```

### macOS

```bash
/Applications/OpenScience.app/Contents/MacOS/OpenScience --webui --remote
```

### Linux

```bash
OpenScience --webui --remote
```

**Security Note**: Remote mode allows network access. Use only on trusted networks. Consider setting up authentication and firewall rules for production use.

### Finding Your Local IP Address

**Windows:**

```cmd
ipconfig
```

Look for "IPv4 Address" under your active network adapter.

**macOS/Linux:**

```bash
ifconfig
# or
ip addr show
```

Look for `inet` address (e.g., `192.168.1.100`).

Access from other devices: `http://YOUR_IP_ADDRESS:25808`

---

## Troubleshooting

### Port Already in Use

If port 25808 is already in use, the application will automatically try the next available port. Check the console output for the actual port number.

### Cannot Access from Browser

1. **Check if the application started successfully**
   - Look for "Server started on port XXXX" message in the console

2. **Try a different browser**
   - Chrome, Firefox, Safari, or Edge

3. **Clear browser cache**
   - Press `Ctrl+Shift+Delete` (Windows/Linux) or `Cmd+Shift+Delete` (macOS)

### Firewall Blocking Access

**Windows:**

```cmd
# Allow through Windows Firewall
netsh advfirewall firewall add rule name="OpenScience WebUI" dir=in action=allow protocol=TCP localport=25808
```

**Linux (UFW):**

```bash
sudo ufw allow 25808/tcp
```

**macOS:**
Go to **System Preferences** → **Security & Privacy** → **Firewall** → **Firewall Options** → Add OpenScience

### Application Not Found

**Find application location:**

**Windows:**

```cmd
where OpenScience.exe
```

**macOS:**

```bash
mdfind -name "OpenScience.app"
```

**Linux:**

```bash
which OpenScience
# or
find /opt -name "OpenScience" 2>/dev/null
```

### View Logs

**Windows (PowerShell):**

```powershell
& "C:\Program Files\OpenScience\OpenScience.exe" --webui 2>&1 | Tee-Object -FilePath openscience.log
```

**macOS/Linux:**

```bash
/path/to/OpenScience --webui 2>&1 | tee openscience.log
```

---

## Environment Variables

You can customize WebUI behavior with environment variables:

```bash
# Override the listening port
export DEEPORGANISER_PORT=8080

# Allow remote access without passing --remote
export DEEPORGANISER_ALLOW_REMOTE=true

# Optional host hint (0.0.0.0 behaves the same as DEEPORGANISER_ALLOW_REMOTE=true)
export DEEPORGANISER_HOST=0.0.0.0

# Then start the application
OpenScience --webui

# You can also pass the port directly via CLI
OpenScience --webui --port 8080
```

---

## User Configuration File

From v1.5.0+, you can store persistent WebUI preferences in `webui.config.json` located in your Electron user-data folder:

| Platform | Location                                                            |
| -------- | ------------------------------------------------------------------- |
| Windows  | `%APPDATA%/OpenScience/webui.config.json`                     |
| macOS    | `~/Library/Application Support/OpenScience/webui.config.json` |
| Linux    | `~/.config/OpenScience/webui.config.json`                     |

Example file:

```json
{
  "port": 8080,
  "allowRemote": true
}
```

Settings from CLI flags take priority, followed by environment variables, then the user config file.

---

## Command Line Options Summary

| Option             | Description                 |
| ------------------ | --------------------------- |
| `--webui`          | Start in WebUI mode         |
| `--remote`         | Allow remote network access |
| `--webui --remote` | Combine both flags          |

---

## Reset Admin Password

If you forgot your admin password in WebUI mode, you can reset it using the `--resetpass` command.

### Using --resetpass Command

**IMPORTANT:** The --resetpass command resets the password and generates a new random one. All existing JWT tokens will be invalidated.

**Windows:**

```cmd
# Using full path
"C:\Program Files\OpenScience\OpenScience.exe" --resetpass

# Or for a specific user
"C:\Program Files\OpenScience\OpenScience.exe" --resetpass username
```

**macOS:**

```bash
# Using full path
/Applications/OpenScience.app/Contents/MacOS/OpenScience --resetpass

# Or for a specific user
/Applications/OpenScience.app/Contents/MacOS/OpenScience --resetpass username
```

**Linux:**

```bash
# Using system path
OpenScience --resetpass

# Or for a specific user
OpenScience --resetpass username

# Or using full path
/opt/OpenScience/OpenScience --resetpass
```

### What happens when you run --resetpass:

1. The command connects to the database
2. Finds the specified user (default: `admin`)
3. Generates a new random 12-character password
4. Updates the password hash in the database
5. Rotates the JWT secret (invalidating all previous tokens)
6. Displays the new password in the terminal

### After running --resetpass:

1. The command will display your new password - **copy it immediately**
2. Refresh your browser (Cmd+R or Ctrl+R)
3. You will be redirected to the login page
4. Login with the new password shown in the terminal

### Development Environment Only

If you're in a development environment with Node.js, you can also use:

```bash
# In the project directory
npm run resetpass

# Or for a specific user
npm run resetpass -- username
```

---

## Additional Resources

- [Main README](../readme.md)
- [中文说明](./readme/readme_ch.md)
- [日本語ドキュメント](./readme/readme_jp.md)
- [GitHub Issues](https://github.com/ResearAI/OpenScience/issues)

---

## Support

If you encounter any issues:

1. Check the [Troubleshooting](#troubleshooting) section
2. Search [existing issues](https://github.com/ResearAI/OpenScience/issues)
3. Create a [new issue](https://github.com/ResearAI/OpenScience/issues/new) with:
   - Your OS and version
   - OpenScience version
   - Steps to reproduce
   - Error messages or logs

---

**Happy using OpenScience in WebUI mode!** 🚀
