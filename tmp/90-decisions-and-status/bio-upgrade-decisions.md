# Bio Upgrade Decisions

本文档记录从 OpenScience 升级到 OpenBioScience 的建议决策、阶段划分、风险和未决问题。它是后续写 PRD、技术设计或实施计划的基础。

## 核心决策

| 编号 | 决策 | 状态 | 理由 |
| --- | --- | --- | --- |
| D1 | Bio 作为独立 Guid capability mode，但复用 Science harness | 推荐 | 一等入口清晰，改动面小，避免新 runtime |
| D2 | 不在 P0 新建 Bio agent runtime/ACP adapter | 推荐 | 当前没有独立 Bio CLI/runtime 事实基础 |
| D3 | 不在 WebHost 增加 Bio 业务路由 | 推荐 | WebHost 是 static/proxy，不承载业务 |
| D4 | Bio 证据与 artifact 先复用 `research_evidence` 和 `science_artifact` MCP | 推荐 | 已有 provider、artifact schema、panel/workspace |
| D5 | Medical Evidence 保持独立，不被 Bio 泛化 | 推荐 | 临床证据和通用生命科学任务边界不同 |
| D6 | 新增 Bio router skill，而不是把 Bio 长期塞入 Science skill | 推荐 | 领域 SOP、source policy、临床边界需要明确 |
| D7 | P1 优先补已有 viewer contract，而不是设计新 preview 架构 | 推荐 | `igv/vitessce/msa/molstar` 等 contract 已存在 |
| D8 | P2 再考虑 remote agent/HPC/team workflow | 推荐 | 需要更明确的运行和权限模型 |
| D9 | `bio` mode 落地前先验证 core 是否接受并持久化新 mode metadata | 必须验证 | 若 core 丢弃新 mode，P0 fallback 为 `science` mode + `bio` profile metadata |
| D10 | 在 demo case 执行前新增 omics 文献复现规划层 | 推荐 | 复现需要先完成 paper/data/code/method/environment/task planning，避免直接进入脚本或运行 |

## P0 范围

P0 目标：让用户在 Guid 中明确选择 Bio 模式，并获得可追踪、带 Bio 领域约束的 evidence/artifact workflow。

建议任务：

1. 验证 conversation create/readback/realtime path 是否接受 `bio` mode metadata；若不接受，使用 `science` mode + `bio` profile metadata。
2. 新增 `BIO_MODE_ID` 与 Bio common contract。
3. 在 `modeCapabilities.ts` 增加 Bio capability mode。
4. 在 `useGuidSend.ts` 为 Bio 注入 prompt/profile/source/tool policy。
5. 新增 `resources/skills/bio/SKILL.md` 作为 Bio router，并更新 skill manifest/materialization/test。
6. 在 Science settings 或新 Bio settings 中明确 Bio source profile。
7. 复用 `ScienceReportPanel`、`ScienceArtifactWorkspace` 和 `science_artifact` MCP。
8. 增加 Bio unit tests 和 Guid mode E2E。
9. i18n 覆盖所有用户可见文案。

P0 Bio prompt/metadata 应覆盖：

- organism/taxon
- reference genome/assembly 或 protein/database identifier
- assay/platform
- sample/cohort/context
- database version/access date
- evidence provenance
- uncertainty and unresolved issues
- clinical/PHI boundary

## P1 范围

P1 目标：把 Bio 从“模式和 prompt”推进到专业可视化与数据源体验。

建议任务：

1. IGV viewer：支持 genome track、BED/GFF/GTF/BAM/VCF 等常见输入。
2. Vitessce viewer：支持 single-cell/spatial artifact。
3. MSA viewer：支持 alignment artifact。
4. Mol*/RCSB/AlphaFold 结构 viewer 补强。
5. Ketcher 从占位变为可编辑，并能保存为新 artifact version。
6. Bio source aliases 扩展：UniProt、PDB/EMDB、Ensembl、Reactome、ClinVar、gnomAD、GWAS、ArrayExpress、ChEBI、BindingDB 等。
7. Bio skill pack/tag 在 Skills settings 中可见。
8. Electron packaged 和 WebUI 双路径验证 bio_tools/provider 可用性。

## P0.5 Omics Reproduction Planning

目标：在运行具体 demo case、撰写脚本或进入 runner 前，先补齐 omics 文献复现规划控制面。

已确认方向：

- 新增 `bio-omics-reproduction-planning` skill，作为 omics 文章复现规划强入口。
- 新增 `openscience-bio-reproduction` / `bio_reproduction` MCP，作为 planning coordinator。
- 规划层平衡三类能力：科学性解读支撑、实现规划、基础审计。
- 默认采用轻量本地化，单文件 50MB 上限；更大资源需要批准或进入 plan-only。
- 采用非中断式状态语义：缺口默认降级、标记或阻断具体 execution unit，而不是停止整个规划。

对应设计文档：

- `10-development-directions/skills-mcp/omics-reproduction-planning-skill-mcp-plan.md`

## P2 范围

P2 目标：面向真实团队和计算资源。

建议任务：

1. Remote Bio agent 或 HPC queue integration。
2. Team workflow：任务分派、审阅、权限、artifact provenance。
3. Extension bundle：分发生物领域 assistant、skills、settings tab、MCP preset。
4. LIMS/ELN 或实验记录系统集成。
5. 如果需要独立长期实体，再设计 `deeporganiser-core` Bio API。

## 风险清单

| 风险 | 影响 | 缓解 |
| --- | --- | --- |
| Bio 与 Science 边界模糊 | UI/测试/文档命名不稳定 | P0 明确：Bio 是 mode，harness 复用 Science |
| 临床内容被泛 Bio 覆盖 | 安全和合规风险 | Medical Evidence 独立；Bio prompt/schema 标注 clinical boundary |
| bio_tools 只在开发环境可用 | packaged/WebUI 失败 | packaging/WebUI MCP bootstrap 验证 |
| 复制 Science panel | 长期双维护 | 用 metadata/profile 区分，优先复用 panel/workspace |
| 新增 WebHost 业务逻辑 | 架构边界破坏 | 所有业务 API 走 core 或 Electron bridge/MCP |
| 直接读写 core SQLite | 数据一致性和升级风险 | 通过 core API 或已有 bridge，不仿照 direct DB access |
| 第三方数据库 license/API 限制 | 功能不可稳定交付 | source 列为 profile/adapter，逐项验证 |
| i18n/Settings 漏项 | UI 质量和测试失败 | 所有可见文案走 i18n，运行 check |

## 开放问题

1. Bio 是独立 Settings 页，还是 Science Settings 下的 Bio profile 分组？
2. `bio_tools` provider 当前实际支持哪些数据库、认证方式和离线能力？
3. P0 是否要求 packaged app 内置 Bio tools，还是允许用户配置外部 server root？
4. Bio artifact 是否需要新的 domain metadata schema，还是先使用 Science artifact 的 `metadata` 扩展字段？
5. 是否存在必须接入的真实 Bio CLI/runtime？如果没有，不应设计 ACP adapter。
6. WebUI 部署是否面向远程访问？如果是，Bio 工具的 auth、文件访问和 secret 管理要提前设计。
7. 是否要把 Bio 与 Medical Evidence 的边界写成 UI guard，而不仅是 prompt 规则？

## 推荐下一步

1. 先把 P0 写成小 PRD：用户入口、模式行为、source/tool policy、artifact 输出、不可做事项。
2. 再写技术设计：文件级改动、schema、i18n、测试矩阵。
3. 最后实施最小闭环：Bio mode -> conversation -> research evidence/science artifact -> preview panel。
4. 完成 P0 后再决定是否拆 Bio Settings 页和 viewer P1 优先级。
