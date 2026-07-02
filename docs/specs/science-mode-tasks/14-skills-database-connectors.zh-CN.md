# 额外任务书：Science Skills 与数据库连接

## 1. 目标

为 Science Mode 提供可复用的科研 skills 和数据库检索能力，让 Agent 能稳定处理 genomics、single-cell、proteomics、structural biology、cheminformatics、materials、astronomy，以及 social science / econometrics / causal inference / replication 等任务。

## 2. 技术判断

不要在 M1 内置 60+ 数据库的专用 UI，也不要把 DeepScientist、K-Dense、Auto-Empirical、SciAgent 硬合并成一个超大 prompt。更可行的是把它们规范化成 OpenScience 一等 Science skill pack：默认注册、默认可见、默认进入新 Science 会话的 skill ids；但每次任务仍由 skill runtime 按 description 触发相关 `SKILL.md`，不会把所有正文一次性塞进 system prompt。

1. 先接 PaperClip 和现有 user_input；PaperClip 连接方式直接复用医学循证模式，不重新设计数据库后端。
2. DeepScientist Science 作为 root discipline，负责执行边界、claim discipline、Science Evidence Graph。
3. K-Dense/SciAgent 作为自然科学 domain skill packs，负责数据库、包、pipeline、文稿、review 等领域操作细节。
4. Auto-Empirical 作为社科/实证研究 domain skill pack，负责计量、因果推断、复现包、引用核查、survey/codebook、质性分析和 AER 风格论文工作流。
5. OpenScience Adapter 负责把外部 skill 使用、数据库查询、运行结果和输出文件登记到 Science MCP。
6. 每次任务由 skill trigger/router 选择相关 skill，而不是全量展开正文。
7. 所有数据库查询都要把 endpoint、params、date、count、pagination 写入 evidence。

K-Dense 仓库当前可作为候选来源：MIT 许可，README 声称兼容 Codex/Claude Code 等 Agent Skills 标准，GitHub tree 中约 149 个 `SKILL.md`。它的价值是补足具体领域技能，不是替代 OpenScience 的 artifact/provenance 协议。

K-Dense 也必须经过安全分层：其 `SECURITY.md` 对部分脚本型 skill 标记了环境变量读取、网络访问、同名 Python 模块 shadowing、未披露脚本等风险。因此默认启用的是指令、领域 SOP 和路由 metadata；未审计脚本必须标记为 `quarantined_script`，不能被 Agent 默认执行。

## 3. 可引入的 skills

### DeepScientist v1.6.0

适合直接参考：

- `science`
- `paper-plot`
- `nature-figure`
- `review`
- `write`
- package cards / package-check discipline

重点迁移思想：真实执行仍走 runner，science skill 只负责选包、检查环境、登记 Science Evidence Graph。

### K-Dense scientific-agent-skills

定位：curated domain pack。优先参考：

- `database-lookup`
- `citation-management`
- `literature-review`
- `peer-review`
- `scanpy`
- `anndata`
- `bulk-rnaseq`
- `pydeseq2`
- `rdkit`
- `datamol`
- `deepchem`
- `matplotlib`
- `scientific-schematics`
- `nextflow`
- `modal`

适合做成默认内置的 curated skill bundle，但要分执行策略。`clinical-decision-support`、`clinical-reports` 等临床 skill 可以默认可见和可审计，但必须标记 `clinicalBoundary: "medical_evidence_required"`，普通 Science Mode 不能用它们输出患者级建议。

### SciAgent-Skills

优先参考：

- `pdb-database`
- `pubmed-database`
- `openalex-database`
- `cellxgene-census`
- `scanpy-scrna-seq`
- `rdkit-cheminformatics`
- `scientific-literature-search`
- `scientific-manuscript-writing`

### Auto-Empirical Research Skills

定位：社科/实证研究 domain pack。当前 vendored snapshot 扫描到 1,153 个 `SKILL.md`。上游仓库本身声明根 `SKILL.md` 是 router，不建议把 69 个合集、上千个子 skill 全部一次性加载。OpenScience 因此完整 vendor 仓库，但默认 materialize 一个精选、高价值、低冗余子集：

- root router：`aer-auto-empirical-research-skills`
- full empirical pipeline：StatsPAI、Python/Stata/R full empirical
- causal/econometrics：DID、IV、RDD、SCM、DML、panel FE、event study、Bayesian/quasi-experimental
- replication/citation/open science：citation checker、replication-package audit、OpenAlex、systematic review
- social-science objects：survey/codebook、qualitative/thematic analysis、geospatial social outputs、AER/Paper workflow

许可证策略：AERS materialized/adapted skill 内容按 CC BY-SA 4.0 ShareAlike 处理，保留 CoPaper.AI 版权、许可证链接和 OpenScience 改动说明；主应用代码许可证不因此改变。

## 4. Connector Registry

```ts
type ScienceConnectorProfile = {
  id: string;
  label: string;
  domain: string;
  type: 'paperclip' | 'rest_api' | 'skill' | 'mcp' | 'cli';
  enabled: boolean;
  auth: 'none' | 'api_key' | 'oauth' | 'local_env';
  allowedHosts: string[];
  skillIds?: string[];
  sourceRepo?: string;
  sourceVersion?: string;
  license?: string;
  priority?: number;
};
```

## 4A. Skill Pack Registry

```ts
type ScienceSkillPack = {
  id: 'deepscientist' | 'k-dense' | 'auto-empirical' | 'sciagent' | 'local' | string;
  label: string;
  sourceUrl?: string;
  license?: string;
  version?: string;
  enabled: boolean;
  defaultForNewProjects: boolean;
  skills: ScienceSkillDescriptor[];
};

type ScienceSkillDescriptor = {
  id: string;
  name: string;
  sourcePackId: string;
  domainTags: string[];
  description: string;
  allowedTools?: string[];
  requiredEnv?: string[];
  risk: 'low' | 'network' | 'write' | 'credential' | 'external_compute';
  executionPolicy: 'active_default' | 'available_default' | 'restricted_default' | 'quarantined_script';
  clinicalBoundary?: 'none' | 'medical_evidence_required';
  mode: 'root_discipline' | 'domain_workflow' | 'database_connector' | 'writer' | 'reviewer';
};
```

路由优先级：

1. OpenScience core 最高优先级：`openscience-science` 和 `openscience-science-artifact` 总是启用，总是决定 evidence/artifact/claim/report 格式。
2. DeepScientist research discipline 默认启用，优先处理 package check、computed claim、实验/论文/review 纪律。
3. K-Dense/SciAgent domain skill 按任务触发，例如 single-cell 触发 `kdense-scanpy`/`kdense-anndata`，cheminformatics 触发 `kdense-rdkit`/`kdense-datamol`。
4. Auto-Empirical domain skill 按社科/实证任务触发，例如 DID/RDD/IV 触发 AERS causal/econometrics，replication package 触发 AERS replication/citation，survey/codebook/qualitative coding 触发对应 AERS skill。
5. 医学循证模式开启时，clinical 相关 skill 由医学循证 SOP 接管；Science Mode 只能作为技术参考。
6. 同名/近似 skill 冲突时，优先选择本地已安装、版本已知、description 更窄、allowed-tools 更少、风险更低的 skill。
7. 任何外部 skill 输出的结论都不能直接成为 final claim，必须转成 evidence/provenance。

### 4C. Skill Pack Materialization

实现时不要让 Agent 再去 vendor 目录“额外加载”。需要增加一个生成步骤：

1. 扫描 `resources/skills/vendor/deepscientist-1.6.0/src/skills/**/SKILL.md`、`resources/skills/vendor/scientific-agent-skills/skills/**/SKILL.md` 和 `resources/skills/vendor/auto-empirical-research-skills/**/SKILL.md` 的精选默认子集。
2. 复制每个 skill 到顶层一等目录：
   - DeepScientist：`resources/skills/ds-<name>/`
   - K-Dense：`resources/skills/kdense-<name>/`
   - Auto-Empirical：`resources/skills/aer-<name>/`
   - SciAgent 后续：`resources/skills/sciagent-<name>/`
3. 修改 frontmatter `name` 为规范化唯一 id；正文开头插入 OpenScience Adapter SOP，保留原始说明、references、assets。
4. `scripts/` 原样保留用于审计，但 manifest 默认标记 `quarantined_script`，除非通过 allowlist。
5. 生成 `resources/skills/openscience-skill-pack.manifest.json`，包含 id、sourceUrl、sourcePath、license、version/commit、domainTags、risk、executionPolicy、clinicalBoundary、priority、conflicts。
6. `DEFAULT_SCIENCE_SKILL_IDS` 从 manifest 读取 active/available/restricted skill ids，Science 设置页按 pack 分组显示。
7. 测试验证：无重复 name、无坏路径、每项有 source/license/risk/policy、clinical skill 有 boundary、脚本 skill 默认不 active execute。

这会满足“默认都加载”的产品体验：新 Science 会话可以看到并路由全部 Science pack；同时保留 skill-creator 的 progressive disclosure 和上下文控制，避免把大量外部正文直接注入 system prompt。

## 4B. OpenScience Adapter Contract

每次使用外部 skill，Agent 需要做这几步：

1. 调用或在内部记录 skill routing decision。
2. 如果 skill 建议安装包或访问 API，先做 smoke check 或 retrieval contract。
3. 调用 `science_artifact(action='append')` 登记 `skill_use`，记录 skill id、来源、版本、用途、选择理由。
4. 检索数据库时先调用共享 `research_evidence(action='search'|'read')`，再调用 `science_artifact(action='create'|'append')` 登记 `evidence`，`sourceType` 用 `database_record`。
5. 运行脚本或 pipeline 后调用 `science_artifact(action='create'|'version'|'append')` 登记 `artifact`、`provenance`、输入、代码、日志和环境。
6. 形成科学结论时调用 `science_artifact(action='create'|'append')` 登记 `claim`，或在 `science_artifact(action='publish')` 的 report 中引用 `evidenceIds`/`artifactIds`。

这层 adapter 是整合关键。没有 adapter，K-Dense 只能提供“会做事的说明书”；有 adapter，它才会变成 OpenScience 中可追溯、可复现、可 review 的研究流程。

M1 数据库连接边界：只做 PaperClip-equivalent gateway 和低风险 REST fixture。UniProt/PDB/ChEMBL 等专用连接器可以先通过 K-Dense/SciAgent skill 作为操作指南，不要求内置 UI 或专门后端。

## 5. Evidence 规则

数据库证据必须记录：

- database name
- 发起查询的 skill id / source pack / version
- endpoint
- params
- access date
- returned count
- retrieved count
- pagination or filters
- identifier conversion
- warnings

不能只写“查了 UniProt/PDB”，也不能只写“用了 K-Dense database-lookup”。必须能复现查询条件和结果数量。

## 6. 前端

Science panel 的 Evidence Ledger 对 `database_record` 做专门展示：

- database badge
- endpoint/identifier
- retrieved date
- record id
- open URL
- raw JSON preview

Science panel 还需要一个默认折叠的 Skill Trail：

- root discipline：DeepScientist Science
- domain skills：例如 K-Dense `scanpy`、`rdkit`、`database-lookup`
- empirical skills：例如 AERS `StatsPAI`、full empirical、DID/RDD/IV、replication/citation、codebook/qualitative coding
- connector/source：PaperClip、REST API、local CLI、Modal
- status：used / blocked / unavailable
- related evidence/artifact links

## 7. 验收标准

- 项目默认启用 curated Science skill bundle。
- DeepScientist Science 默认作为 root discipline，K-Dense/Auto-Empirical/SciAgent 只能作为 domain pack。
- K-Dense/DeepScientist/Auto-Empirical skills 已 materialize 为 `ds-*` / `kdense-*` / `aer-*` 一等目录，而不是只能通过 vendor catalog 查找。
- `DEFAULT_SCIENCE_SKILL_IDS` 包含 manifest 中的默认 Science pack ids。
- Science 设置页以分组摘要展示默认 skill pack、来源、脚本隔离、受限执行和医学边界，不默认展示一长串 raw ids。
- 使用 K-Dense skill 后会生成 `science_register_skill_use` event。
- PaperClip search 结果能登记为 evidence。
- 至少一个 REST 数据库查询 fixture 能生成 `database_record` evidence。
- Evidence Ledger 展示 endpoint/params/access date。
- Skill Trail 能展示 skill 来源、版本、用途和相关 evidence。
- 未配置 API key 的 connector 清晰报错，不让 Agent 编造结果。

## 8. 风险

- 默认启用外部 skills 可能引入不可信指令：需要来源显示、版本锁定、冲突表、risk/executionPolicy、脚本 quarantine 和用户授权。
- 数据库 API schema 会变：connector 必须记录版本/日期。
- 多数据库 fan-out 会制造噪声：prompt 要求先定义 retrieval contract。
- 多套 skill 的 trigger 规则会冲突：必须用 root discipline 和 priority resolver 收束，不允许多个 skill 同时争夺最终回答结构。
