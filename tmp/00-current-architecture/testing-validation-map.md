# Testing And Validation Map

本文档给出 OpenBioScience/Bio 升级相关的验证地图。当前阶段是架构文档，不运行完整测试；后续源码修改时应按影响面选择最小但真实的验证组合。

## 测试入口

| 类型 | 配置/入口 | 覆盖范围 |
| --- | --- | --- |
| Vitest root | `vitest.config.ts` | `tests/unit`, `tests/integration`, `tests/regression` |
| Vitest setup | `tests/vitest.setup.ts`, `tests/vitest.dom.setup.ts` | Node/jsdom 测试环境 |
| Playwright | `playwright.config.ts` | Electron/WebUI E2E，workers 为 1 |
| E2E fixtures | `tests/e2e/fixtures.ts`, `tests/e2e/helpers/index.ts` | Electron app/WebUI helper |
| WebHost tests | `packages/web-host/vitest.config.ts` | WebHost 静态/proxy 行为 |
| Mobile tests | `mobile/jest.config.ts`, `mobile/jest.setup.ts`, `mobile/package.json` | mobile 侧 Jest/TS check |

## 已有关联测试区域

| 功能 | 关键源码 | 已有关联测试/建议定位 |
| --- | --- | --- |
| Science contract | `packages/desktop/src/common/chat/science.ts` | `tests/unit/common/science.test.ts` |
| Medical evidence contract | `packages/desktop/src/common/chat/medicalEvidence.ts` | `tests/unit/common/medicalEvidence.test.ts` |
| Science skill pack | `resources/skills/openscience-skill-pack.manifest.json`, `scripts/materialize-science-skills.mjs` | `tests/unit/common/scienceSkillPack.test.ts` |
| Guid mode capability | `packages/desktop/src/renderer/pages/guid/utils/modeCapabilities.ts` | `tests/unit/renderer/guidModeCapabilities.test.ts` |
| Guid mode E2E | `packages/desktop/src/renderer/pages/guid/hooks/useGuidSend.ts` | `tests/e2e/specs/guid-mode-to-conversation.e2e.ts` |
| Preview file utils | `packages/desktop/src/renderer/pages/conversation/Preview/fileUtils.ts` | `tests/unit/previews/fileUtils.test.ts` |
| Science workspace DOM | `ScienceArtifactWorkspace.tsx` | `tests/unit/previews/ScienceArtifactWorkspace.dom.test.tsx` |
| Artifact git store | `packages/desktop/src/process/services/scienceArtifactGitStore.ts` | `tests/unit/process/scienceArtifactGitStore.test.ts` |
| Bundled core verifier | `packages/shared-scripts/src/verify-bundled-deeporganiser-core-resources.js` | `tests/unit/assets/verifyBundledDeepOrganiserCoreResources.test.ts` |
| Backend startup | `backendStartup.ts`, `binaryResolver.ts` | `tests/unit/bootstrap/backendStartup*.test.ts`, `binaryResolver.test.ts` |
| WebUI | `scripts/webui.ts`, `packages/web-host/src/static-server.ts` | `tests/e2e/specs/webui.e2e.ts`, WebHost unit tests |
| i18n | `scripts/check-i18n.js`, `scripts/generate-i18n-types.js`, `packages/desktop/src/common/config/i18n-config.json` | `node scripts/check-i18n.js` |

如果某个列出的 E2E 文件在当前 checkout 中不存在，以 `rg --files tests/e2e` 的实际结果为准；本表用于定位验证方向。

## Bio P0 最小测试矩阵

当实现 Bio capability mode、prompt/profile、skill router、source defaults 时，建议至少运行：

```bash
bun run test -- \
  tests/unit/common/science.test.ts \
  tests/unit/common/medicalEvidence.test.ts \
  tests/unit/common/scienceSkillPack.test.ts \
  tests/unit/renderer/guidModeCapabilities.test.ts \
  tests/unit/previews/fileUtils.test.ts \
  tests/unit/previews/ScienceArtifactWorkspace.dom.test.tsx
```

如果新增 `common/chat/bio.ts`，应增加对应 `tests/unit/common/bio.test.ts`，覆盖：

- `BIO_MODE_ID`
- Bio prompt builder
- Bio conversation extra/schema guard
- clinical boundary text/metadata
- source profile defaults

还应增加一个 core path gate：创建 Bio conversation 后读取/订阅回传，确认 `bio` mode 或 `science + bio profile` fallback metadata 没有被 core 丢弃。

如果修改 `useGuidSend.ts` 或 conversation create 参数，增加或更新 Guid mode E2E：

```bash
bun run test:e2e -- tests/e2e/specs/guid-mode-to-conversation.e2e.ts
```

## Backend/WebHost/Packaging 验证

Bio 改动如果涉及 backend 启动、MCP build、packaging、WebUI，建议运行：

```bash
bun run test -- \
  tests/unit/bootstrap/backendStartup.test.ts \
  tests/unit/bootstrap/backendStartupFailure.test.ts \
  tests/unit/bootstrap/binaryResolver.test.ts \
  tests/unit/assets/verifyBundledDeepOrganiserCoreResources.test.ts
```

```bash
cd packages/web-host
bun run test
```

如果修改内置 MCP 或 skill materialize：

```bash
bun run skills:science:materialize
bun run test -- tests/unit/common/scienceSkillPack.test.ts
```

如果修改 i18n-visible UI：

```bash
bun run i18n:types
node scripts/check-i18n.js
```

## E2E 建议组合

按改动选择，不建议每次全跑：

```bash
bun run test:e2e -- tests/e2e/specs/guid-mode-to-conversation.e2e.ts
```

```bash
bun run test:e2e -- tests/e2e/specs/webui.e2e.ts
```

```bash
bun run test:e2e -- tests/e2e/specs/installation-integrity.e2e.ts
```

Science artifact/export 改动时，如果存在对应 spec：

```bash
bun run test:e2e -- tests/e2e/features/science/science-export.e2e.ts
```

## 必须关注的风险

1. **Bio independent vs Science submode**：如果产品决策未定，测试也无法稳定命名和断言。P0 建议明确为独立 Guid mode，但复用 Science harness。
2. **临床边界**：当前很多边界可能只是 prompt/SOP 约束；如果涉及 clinical claims，需要 schema/UI/guard 同时验证。
3. **bio_tools 打包可用性**：开发环境可用不等于 packaged app/WebUI 可用。需要验证 `electron-builder.yml`、MCP build、WebUI bootstrap。
4. **WebUI no-login/remote 风险**：Bio 工具如果能访问本地文件、远程服务或敏感数据，WebUI authentication/proxy 行为必须验证。
5. **API key/secret 日志**：`httpBridge.ts` 已有敏感字段脱敏；新增 provider/source 时不能泄露 token。
6. **跨 core 边界访问**：不要新增直接读写 core SQLite 的 Bio 逻辑。

## 验收标准

Bio P0 不是以科学结论“看起来正确”为验收，而应看：

- mode 是否能稳定创建 conversation，并携带正确 metadata/profile。
- prompt/source/tool policy 是否可重复、可测试。
- MCP 不可用时是否有清晰错误和降级行为。
- artifact/panel 输出是否符合 schema，Preview 是否能打开。
- Electron 和 WebUI 行为是否一致，至少 failure path 一致；如果 artifact/archive 在桌面端走 Electron bridge，WebUI 必须有明确替代路径或显式标注不支持。
- 打包产物中所需资源是否存在。
- i18n、类型检查、lint/format 不引入基础质量问题。
