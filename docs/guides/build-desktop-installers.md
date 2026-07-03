# OpenScience 桌面安装包构建说明

本文档说明如何从 OpenScience 源码构建 macOS、Windows 和 Linux 桌面安装包，以及发布构建时需要注意的依赖、签名、OpenScience Core runtime 和自动更新产物。

## 构建链路

OpenScience 桌面端当前使用以下链路：

```text
bun run build-*
  -> scripts/build-with-builder.js
  -> electron-vite build
  -> 构建内置 MCP server bundle
  -> 准备 OpenScience Core runtime
  -> 准备离线 Hub 资源
  -> electron-builder 生成安装包
```

其中：

- `electron-vite` 负责编译 Electron 主进程、preload 和 renderer。
- `scripts/build-with-builder.js` 是统一构建入口。
- `electron-builder` 根据 `packages/desktop/electron-builder.yml` 生成 `.dmg`、`.exe`、`.deb` 和更新元数据。
- 打包前会准备 `resources/bundled-deeporganiser-core/<platform>-<arch>/`，安装包必须包含匹配平台和架构的 OpenScience Core runtime。

## 基础环境

所有平台都需要：

- Git
- Node.js 22 或更高版本，但低于 25
- Bun
- 能访问 GitHub Releases 或 GitHub Actions artifact 的网络环境

安装依赖：

```bash
cd /path/to/OpenScience
bun install --frozen-lockfile
```

如果 GitHub 下载 OpenScience Core runtime 受限，建议设置：

```bash
export GH_TOKEN=你的 GitHub token
```

或：

```bash
export GITHUB_TOKEN=你的 GitHub token
```

## 常用构建命令

在仓库根目录执行：

| 目标 | 命令 | 主要输出 |
|---|---|---|
| macOS Apple Silicon | `bun run build-mac:arm64` | `out/OpenScience-*-mac-arm64.dmg`、`.zip`、`latest-arm64-mac.yml` |
| macOS Intel | `bun run build-mac:x64` | `out/OpenScience-*-mac-x64.dmg`、`.zip`、`latest-mac.yml` |
| macOS 双架构 | `bun run build-mac` | arm64 + x64 macOS 安装包 |
| Windows x64 | `bun run build-win:x64` | `out/OpenScience-*-win-x64.exe`、`.zip`、`latest.yml` |
| Windows ARM64 | `bun run build-win:arm64` | `out/OpenScience-*-win-arm64.exe`、`.zip`、`latest-win-arm64.yml` |
| Linux 当前架构 | `bun run build-deb` | `out/OpenScience-*-linux-*.deb`、`latest-linux*.yml` |

也可以使用较粗粒度的命令：

```bash
bun run dist:mac
bun run dist:win
bun run dist:linux
```

## 推荐构建环境

发布级安装包建议使用原生平台构建，不建议在 macOS 上强行交叉构建 Windows 或 Linux。

| 平台 | 推荐环境 | 原因 |
|---|---|---|
| macOS | macOS runner 或 Mac 本机 | 需要生成 `.dmg`，正式发布还需要签名和 notarization |
| Windows | Windows runner | 需要 Visual Studio 2022 Build Tools、Windows SDK、NSIS/rcedit 相关能力 |
| Linux | Ubuntu/Debian runner | 需要 Debian 打包工具、GTK/Electron 运行依赖、Linux 原生 native module |

## OpenScience Core runtime

桌面安装包依赖 OpenScience Core runtime。构建脚本会读取根目录 `package.json` 中的：

```json
{
  "deepOrganiserCoreVersion": "v0.1.34"
}
```

然后下载对应平台和架构的 upstream runtime，并写入：

```text
resources/bundled-deeporganiser-core/<platform>-<arch>/
  deeporganiser-core
  manifest.json
  managed-resources/
```

如果需要临时覆盖 Core 版本：

```bash
DEEPORGANISER_CORE_VERSION=v0.1.34 bun run build-mac:arm64
```

如果需要从某次 upstream GitHub Actions 手动构建 artifact 中取 Core：

```bash
DEEPORGANISER_CORE_RUN_ID=123456789 bun run build-mac:arm64
```

## macOS 构建

本地测试可以不配置签名：

```bash
bun run build-mac:arm64
```

正式发布建议配置 Apple 签名和 notarization 所需环境变量，CI 中主要使用：

- `BUILD_CERTIFICATE_BASE64`
- `P12_PASSWORD`
- `KEYCHAIN_PASSWORD`
- `APPLE_ID`
- `APPLE_ID_PASSWORD`
- `TEAM_ID`
- `IDENTITY`

如果没有 notarization，用户首次打开时可能看到 Gatekeeper 提示。测试时可以右键应用并选择打开。

## Windows 构建

推荐在 Windows runner 上构建：

```powershell
bun run build-win:x64
```

需要：

- Visual Studio 2022 Build Tools
- MSVC
- Windows SDK 10.0.19041.0 或更高
- Node-gyp 可用

CI 里会额外处理 `better-sqlite3` native module，并为不同架构加入安装器检查脚本：

- `resources/windows-installer-x64.nsh`
- `resources/windows-installer-arm64.nsh`

## Linux 构建

推荐在 Ubuntu/Debian 环境构建：

```bash
bun run build-deb
```

当前 `electron-builder.yml` 只配置了 `deb`，没有配置 AppImage。因此发布页和文档应只承诺 `.deb`，除非后续显式添加 AppImage target。

CI 中 Linux 依赖大致包括：

```bash
sudo apt-get update
sudo apt-get install -y \
  build-essential python3 python3-pip pkg-config libsqlite3-dev \
  fakeroot dpkg-dev rpm libnss3-dev libatk-bridge2.0-dev \
  libdrm2 libxkbcommon-dev libxss1 libatspi2.0-dev \
  libgtk-3-dev libxrandr2 libasound2-dev
```

## GitHub Actions 构建

推荐发布构建走 GitHub Actions：

- 手动构建：`.github/workflows/build-manual.yml`
- dev/tag 发布构建：`.github/workflows/build-and-release.yml`
- 复用构建矩阵：`.github/workflows/_build-reusable.yml`

手动构建步骤：

1. 打开 GitHub Actions。
2. 选择 `Manual Build`。
3. 选择 branch。
4. `platform` 可选 `macos-arm64`、`macos-x64`、`windows-x64`、`windows-arm64`、`linux-x64`、`linux-arm64` 或 `all`。
5. 如果要临时使用某次 Core 构建，填写 `deeporganiser_core_run_id`。
6. 运行 workflow，等待 artifacts 生成。

发布 workflow 会把各平台产物汇总到 release assets，并规范化 updater metadata。

## GitHub Actions 自动打包规则

当前仓库可以自动打包，但触发方式分成三类。

### 1. 推送到 dev 分支

当代码 push 到 `dev` 分支时，`.github/workflows/build-and-release.yml` 会自动触发：

```text
push to dev
  -> code-quality
  -> build-pipeline
  -> pack-web-cli
  -> create-tag
  -> create draft GitHub Release
```

其中：

- `code-quality` 会运行 `bun install --frozen-lockfile`、`bun run lint`、`bun run format:check`、`bunx tsc --noEmit`、`bunx vitest run`。
- `build-pipeline` 会构建 6 个桌面包：macOS arm64、macOS x64、Windows x64、Windows arm64、Linux x64、Linux arm64。
- `pack-web-cli` 会同时打包 web-cli。
- 构建成功后会自动创建一个 dev tag，格式类似 `v0.0.1-dev-<commit>`。
- 最后会创建 GitHub Release，但当前配置是 `draft: true`，也就是草稿发布，不会立刻公开。
- dev tag 自己不会再次触发完整构建，因为 workflow 显式排除了包含 `-dev-` 的 tag，避免重复构建。

### 2. 推送正式 tag

当推送正式 tag 时，例如：

```bash
git tag v0.0.1
git push origin v0.0.1
```

只要 tag 名不包含 `-dev-`，就会触发完整构建：

```text
push tag v0.0.1
  -> code-quality
  -> build-pipeline
  -> pack-web-cli
  -> create draft GitHub Release
```

正式 tag 不会再走 `create-tag`。它会直接使用当前 tag 创建 release。当前 release 仍然是 draft，需要人工检查后再发布。

如果 tag 包含 `beta`、`alpha`、`rc`，release 会被标记为 prerelease。否则按正式 release 处理。

### 3. 手动打包

`.github/workflows/build-manual.yml` 支持手动触发：

```text
GitHub Actions -> Manual Build -> Run workflow
```

可以选择：

- `branch`：从哪个分支构建，默认 `main`。
- `platform`：单独构建某个平台，或选择 `all`。
- `skip_code_quality`：是否跳过质量检查。
- `deeporganiser_core_run_id`：是否临时使用某次 OpenScience Core upstream manual build artifact。

手动构建默认只上传 workflow artifacts，不会自动创建 GitHub Release。

## GitHub Actions 所需条件

自动打包要稳定运行，至少需要下面这些条件。

### 代码质量必须通过

推送到 `dev` 或正式 tag 时，必须先通过：

- lint
- format check
- TypeScript type check
- unit tests

其中任一步失败，后续桌面打包和 web-cli 打包都不会继续。

### OpenScience Core runtime 必须可下载

构建桌面安装包前，workflow 会运行：

```bash
node scripts/prepareDeepOrganiserCore.js
```

它会根据 `package.json` 中的 `deepOrganiserCoreVersion` 下载对应平台的 OpenScience Core runtime。如果下载失败，安装包无法完整生成。

建议配置：

- `GH_TOKEN`
- `GITHUB_TOKEN`

如果要临时从 upstream Actions artifact 取 Core，则在手动构建时填写 `deeporganiser_core_run_id`。

### GitHub release / tag 权限

`dev` 分支自动创建 tag 和 draft release 时需要：

- `GH_TOKEN`：需要 `repo` 权限；如果 workflow 文件有变动，还需要 `workflow` 权限。
- `GITHUB_TOKEN`：用于普通 GitHub API 操作和下载 release assets。

### macOS 签名与公证

没有签名配置时可以构建本地测试包，但正式发布建议配置：

- `BUILD_CERTIFICATE_BASE64`
- `P12_PASSWORD`
- `KEYCHAIN_PASSWORD`
- `APPLE_ID`
- `APPLE_ID_PASSWORD`
- `TEAM_ID`
- `IDENTITY`

当前 workflow 对 macOS 的策略是：如果 DMG 已经生成但 notarization 失败，会给 warning，并允许 workflow 继续；如果 DMG 没生成，则构建失败。

### Windows 构建工具链

Windows runner 需要：

- Visual Studio 2022 Build Tools
- MSVC
- Windows SDK 10.0.19041.0
- node-gyp / native module rebuild 环境

当前 workflow 会额外处理 `better-sqlite3`。Windows 构建失败时不会直接阻断整个 workflow，但会标记该平台构建失败并跳过对应 artifact 上传。

### Linux 构建依赖

Linux runner 会自动安装 Debian/Electron 所需依赖，包括：

- `build-essential`
- `fakeroot`
- `dpkg-dev`
- `libgtk-3-dev`
- `libnss3-dev`
- `libxss1`
- `libasound2-dev`
- 以及其他 Electron/GTK 依赖

### Sentry source map 配置

当前 `linux-x64` 构建会校验 Sentry source map 上传配置。如果完整构建包含 `linux-x64`，需要配置：

- `SENTRY_AUTH_TOKEN`
- `SENTRY_ORG`
- `SENTRY_PROJECT`

否则这一项会失败。若后续不希望 Sentry 成为打包硬依赖，需要调整 `.github/workflows/_build-reusable.yml` 中的 Sentry 校验逻辑。

## 打包和真正发布的区别

当前流程里，“打包成功”不等于“用户已经能自动更新到这个版本”。

流程大致是：

```text
自动或手动构建
  -> 生成 artifacts
  -> 生成 draft GitHub Release
  -> 人工检查并 publish release
  -> release-distribute.yml 同步到下载/更新端
  -> 用户侧自动更新可见
```

`.github/workflows/release-distribute.yml` 会在 GitHub Release 被正式 published 后触发。它会下载 release assets，校验 updater metadata，然后上传到分发端。

该分发流程需要：

- `AWS_REGION`
- `AWS_ROLE_ARN`
- `AWS_S3_BUCKET`

并且会拒绝覆盖同一个版本目录，避免缓存和更新 metadata 混乱。

## 自动更新相关产物

自动更新依赖安装包和 metadata 同时存在。

常见 metadata：

| 平台 | metadata |
|---|---|
| Windows x64 | `latest.yml` |
| Windows ARM64 | `latest-win-arm64.yml` |
| macOS x64 | `latest-mac.yml` |
| macOS ARM64 | `latest-arm64-mac.yml` |
| Linux x64 | `latest-linux.yml` |
| Linux ARM64 | `latest-linux-arm64.yml` |

`scripts/prepare-release-assets.sh` 会从各构建 job 中收集这些文件，并写入 release assets。CI 上传规则必须匹配当前产品名 `OpenScience-*`，否则 `.zip` 或 metadata 可能缺失，进而影响自动更新。

应用内默认更新地址由 `packages/desktop/src/process/services/updateFeed.ts` 控制。当前默认值是：

```text
https://openscience.cc
```

也可以通过环境变量覆盖：

```bash
DEEPORGANISER_UPDATE_BASE_URL=https://example.com bun run start
```

## 本地快速检查

构建前可以先确认命令存在：

```bash
node -e "const p=require('./package.json'); for (const s of ['build-mac:arm64','build-mac:x64','build-win:x64','build-win:arm64','build-deb']) console.log(s, '=>', p.scripts[s])"
```

构建后检查输出：

```bash
find out -maxdepth 1 -type f \( -name '*.dmg' -o -name '*.exe' -o -name '*.deb' -o -name '*.zip' -o -name '*.yml' \) -print
```

## 常见问题

### 找不到 OpenScience Core runtime

通常是 GitHub 下载失败、token 缺失、版本不存在，或目标平台/架构没有对应 upstream artifact。

处理方式：

1. 确认 `package.json` 的 `deepOrganiserCoreVersion` 对应 GitHub release 存在。
2. 设置 `GH_TOKEN` 或 `GITHUB_TOKEN`。
3. 如需临时版本，使用 `DEEPORGANISER_CORE_VERSION`。
4. 如需 Actions artifact，使用 `DEEPORGANISER_CORE_RUN_ID`。

### Windows native module 构建失败

通常是 MSVC、Windows SDK 或 node-gyp 环境不完整。

建议直接使用 GitHub Actions Windows runner，或在本机安装 Visual Studio 2022 Build Tools。

### macOS DMG 创建失败

可能是临时磁盘镜像未卸载、hdiutil 抖动或签名问题。`build-with-builder.js` 已带 DMG retry 逻辑；如果仍失败，可以清理挂载镜像后重试。

### Linux 文档里不应写 AppImage

当前配置只生成 `.deb`。如果后续要支持 AppImage，需要在 `packages/desktop/electron-builder.yml` 的 `linux.target` 中显式加入 `AppImage`，并同步更新 release workflow 和文档。
