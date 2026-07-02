/**
 * @license
 * Copyright 2026 DeepOrganiser (deepscientist.cc)
 * SPDX-License-Identifier: Apache-2.0
 */

import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { z } from 'zod';
import {
  LAB_SKILL_DEPOSITION_EVENT_SCHEMA,
  LAB_SKILL_DEPOSITION_PANEL_SCHEMA,
  type LabSkillClaim,
  type LabSkillDepositionAction,
  type LabSkillDepositionEvent,
  type LabSkillDepositionPanelData,
  type LabSkillDepositionStatus,
  type LabSkillEvidenceItem,
  type LabSkillProtocolDraft,
  type LabSkillValidationFinding,
} from '@/common/chat/labSkillDeposition';
import { BUILTIN_LAB_SKILL_NAME } from './constants';

type JsonRecord = Record<string, unknown>;

type LabSkillSessionState = {
  sessionId: string;
  projectRoot: string;
  userInstruction?: string;
  targetSkillName: string;
  displayName?: string;
  status: LabSkillDepositionStatus;
  createdAt: number;
  updatedAt: number;
  sources: LabSkillEvidenceItem[];
  claims: LabSkillClaim[];
  protocols: LabSkillProtocolDraft[];
  findings: LabSkillValidationFinding[];
  draftDir?: string;
  publishedDir?: string;
  installedDir?: string;
  summaryMarkdown?: string;
  nextActions?: string[];
};

const sessions = new Map<string, LabSkillSessionState>();

const jsonText = (value: unknown) => ({
  content: [{ type: 'text' as const, text: JSON.stringify(value, null, 2) }],
});

const now = (): number => Date.now();
const randomId = (prefix: string): string =>
  `${prefix}_${Date.now().toString(36)}_${crypto.randomBytes(3).toString('hex')}`;

const isRecord = (value: unknown): value is JsonRecord =>
  Boolean(value) && typeof value === 'object' && !Array.isArray(value);

const asString = (value: unknown, fallback = ''): string =>
  typeof value === 'string' && value.trim() ? value.trim() : fallback;

const asArray = (value: unknown): unknown[] => (Array.isArray(value) ? value : []);

const asBoolean = (value: unknown, fallback = false): boolean => (typeof value === 'boolean' ? value : fallback);

const clone = <T>(value: T): T => JSON.parse(JSON.stringify(value)) as T;

const slug = (value: string): string => {
  const normalized = value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9\u4e00-\u9fa5]+/giu, '-')
    .replace(/^-+|-+$/gu, '');
  return normalized || 'lab-skill-draft';
};

const ensureDir = (dir: string): void => {
  fs.mkdirSync(dir, { recursive: true });
};

const writeJson = (filePath: string, value: unknown): void => {
  ensureDir(path.dirname(filePath));
  fs.writeFileSync(filePath, `${JSON.stringify(value, null, 2)}\n`, 'utf8');
};

const appendJsonl = (filePath: string, value: unknown): void => {
  ensureDir(path.dirname(filePath));
  fs.appendFileSync(filePath, `${JSON.stringify(value)}\n`, 'utf8');
};

const writeText = (filePath: string, value: string): void => {
  ensureDir(path.dirname(filePath));
  fs.writeFileSync(filePath, value.endsWith('\n') ? value : `${value}\n`, 'utf8');
};

const readJson = <T>(filePath: string): T | undefined => {
  if (!fs.existsSync(filePath)) return undefined;
  try {
    return JSON.parse(fs.readFileSync(filePath, 'utf8')) as T;
  } catch {
    return undefined;
  }
};

const resolveProjectRoot = (projectRoot?: string): string => path.resolve(projectRoot || process.cwd());

const depositionRoot = (projectRoot: string): string => path.join(projectRoot, '.openscience', 'skill-deposition');
const sessionDir = (state: Pick<LabSkillSessionState, 'projectRoot' | 'sessionId'>): string =>
  path.join(depositionRoot(state.projectRoot), 'sessions', state.sessionId);
const sessionFile = (state: Pick<LabSkillSessionState, 'projectRoot' | 'sessionId'>): string =>
  path.join(sessionDir(state), 'session.json');

const persistSession = (state: LabSkillSessionState): void => {
  state.updatedAt = now();
  writeJson(sessionFile(state), state);
};

const loadSession = (sessionId: string, projectRoot?: string): LabSkillSessionState | undefined => {
  const existing = sessions.get(sessionId);
  if (existing) return existing;
  const root = resolveProjectRoot(projectRoot);
  const loaded = readJson<LabSkillSessionState>(path.join(depositionRoot(root), 'sessions', sessionId, 'session.json'));
  if (loaded) sessions.set(sessionId, loaded);
  return loaded;
};

const openSession = (payload: JsonRecord, projectRoot?: string, sessionId?: string): LabSkillSessionState => {
  const root = resolveProjectRoot(projectRoot || asString(payload.projectRoot));
  const id = sessionId || asString(payload.sessionId, randomId('lab_skill_session'));
  const existing = loadSession(id, root);
  if (existing) return existing;
  const userInstruction = asString(payload.userInstruction || payload.user_instruction);
  const targetSkillName = slug(asString(payload.targetSkillName || payload.target_skill_name, 'lab-skill-draft'));
  const created: LabSkillSessionState = {
    sessionId: id,
    projectRoot: root,
    userInstruction,
    targetSkillName,
    displayName: asString(payload.displayName || payload.display_name, targetSkillName),
    status: 'opened',
    createdAt: now(),
    updatedAt: now(),
    sources: userInstruction
      ? [
          {
            id: 'U1',
            title: '用户沉淀指示',
            sourceType: 'user_instruction',
            status: 'selected',
            summary: userInstruction,
            createdAt: now(),
          },
        ]
      : [],
    claims: [],
    protocols: [],
    findings: [],
    nextActions: ['选择来源', '抽取 SOP 规则', '编译 Skill 草稿', '提交沉淀报告'],
  };
  sessions.set(id, created);
  persistSession(created);
  appendJsonl(path.join(sessionDir(created), 'events.jsonl'), eventFor(created, 'open_session'));
  return created;
};

const ensureSession = (sessionId?: string, projectRoot?: string, payload: JsonRecord = {}): LabSkillSessionState =>
  (sessionId ? loadSession(sessionId, projectRoot) : undefined) || openSession(payload, projectRoot, sessionId);

const eventFor = (
  state: LabSkillSessionState,
  action: LabSkillDepositionAction,
  extra?: Partial<LabSkillDepositionEvent>
): LabSkillDepositionEvent => ({
  schema: LAB_SKILL_DEPOSITION_EVENT_SCHEMA,
  eventId: randomId('lab_skill_evt'),
  sessionId: state.sessionId,
  action,
  timestamp: now(),
  ...extra,
});

const normalizeSource = (value: JsonRecord, index: number): LabSkillEvidenceItem => ({
  id: asString(value.id, `S${index + 1}`),
  title: asString(value.title, asString(value.path || value.url || value.messageId, `Source ${index + 1}`)),
  sourceType:
    (asString(value.sourceType || value.source_type, 'manual_note') as LabSkillEvidenceItem['sourceType']) ||
    'manual_note',
  status: (asString(value.status, 'selected') as LabSkillEvidenceItem['status']) || 'selected',
  summary: asString(value.summary || value.excerpt, undefined as unknown as string),
  path: asString(value.path, undefined as unknown as string),
  url: asString(value.url, undefined as unknown as string),
  messageId: asString(value.messageId || value.message_id, undefined as unknown as string),
  artifactId: asString(value.artifactId || value.artifact_id, undefined as unknown as string),
  protocolId: asString(value.protocolId || value.protocol_id, undefined as unknown as string),
  lineStart: typeof value.lineStart === 'number' ? value.lineStart : undefined,
  lineEnd: typeof value.lineEnd === 'number' ? value.lineEnd : undefined,
  excerpt: asString(value.excerpt, undefined as unknown as string),
  hash: asString(value.hash, undefined as unknown as string),
  createdAt: now(),
});

const normalizeClaim = (value: JsonRecord, index: number): LabSkillClaim => ({
  id: asString(value.id, `C${index + 1}`),
  text: asString(value.text || value.claim, '未命名规则'),
  status: (asString(value.status, 'candidate') as LabSkillClaim['status']) || 'candidate',
  evidenceIds: asArray(value.evidenceIds || value.evidence_ids).filter(
    (item): item is string => typeof item === 'string'
  ),
  target: asString(value.target, undefined as unknown as string) as LabSkillClaim['target'],
  note: asString(value.note, undefined as unknown as string),
});

const normalizeProtocol = (value: JsonRecord, index: number, state: LabSkillSessionState): LabSkillProtocolDraft => {
  const id = asString(value.id, `P${index + 1}`);
  const title = asString(value.title, id);
  const markdown = asString(value.markdown || value.content);
  const filePath =
    asString(value.path, undefined as unknown as string) ||
    (markdown ? path.join(sessionDir(state), 'candidate-protocols', `${slug(id)}.md`) : undefined);
  if (markdown && filePath) writeText(filePath, markdown);
  return {
    id,
    title,
    status: (asString(value.status, 'candidate') as LabSkillProtocolDraft['status']) || 'candidate',
    path: filePath,
    summary: asString(value.summary, undefined as unknown as string),
    evidenceIds: asArray(value.evidenceIds || value.evidence_ids).filter(
      (item): item is string => typeof item === 'string'
    ),
    missingInputs: asArray(value.missingInputs || value.missing_inputs).filter(
      (item): item is string => typeof item === 'string'
    ),
  };
};

const normalizeFinding = (value: JsonRecord, index: number): LabSkillValidationFinding => ({
  id: asString(value.id, `F${index + 1}`),
  severity: (asString(value.severity, 'info') as LabSkillValidationFinding['severity']) || 'info',
  title: asString(value.title, asString(value.message, `Finding ${index + 1}`)),
  detail: asString(value.detail || value.message, undefined as unknown as string),
  evidenceIds: asArray(value.evidenceIds || value.evidence_ids).filter(
    (item): item is string => typeof item === 'string'
  ),
  target: asString(value.target, undefined as unknown as string),
});

const mergeById = <T extends { id: string }>(current: T[], incoming: T[]): T[] => {
  const byId = new Map(current.map((item) => [item.id, item]));
  for (const item of incoming) byId.set(item.id, { ...byId.get(item.id), ...item });
  return [...byId.values()];
};

const defaultSkillMarkdown = (state: LabSkillSessionState): string => {
  const sourceLines = state.sources.map((source) => `- ${source.id}: ${source.title}`).join('\n') || '- 暂无来源。';
  const ruleLines =
    state.claims
      .map((claim) => `- ${claim.text}${claim.evidenceIds.length ? ` [${claim.evidenceIds.join(', ')}]` : ''}`)
      .join('\n') || '- 先阅读 references/sop.md，再根据用户指令执行。';
  return [
    `# ${state.displayName || state.targetSkillName}`,
    '',
    'Use this skill when the user asks to repeat, maintain, or extend the deposited lab workflow.',
    '',
    '## Workflow',
    ruleLines,
    '',
    '## Evidence Rules',
    '- Prefer explicit source ids from `evidence-ledger.jsonl` over memory.',
    '- If the current task conflicts with the deposited SOP, surface the conflict before acting.',
    '- Update references/Protocol when the lab provides a new approved protocol.',
    '',
    '## Sources',
    sourceLines,
  ].join('\n');
};

const defaultSopMarkdown = (state: LabSkillSessionState): string => {
  const protocols = state.protocols.length
    ? state.protocols.map((protocol) => `- ${protocol.id}: ${protocol.title}`).join('\n')
    : '- 暂无独立 Protocol，先遵循 SKILL.md 中的 Workflow。';
  return [
    `# ${state.displayName || state.targetSkillName} SOP`,
    '',
    state.summaryMarkdown || '这是一份由 OpenScience 沉淀模式生成的候选 SOP，需要用户确认后启用。',
    '',
    '## Protocol Index',
    protocols,
    '',
    '## Maintenance',
    '- 新增 Protocol 时，追加到 references/Protocol/ 并更新 protocol-index.json。',
    '- 修改 SOP 前先阅读 source-map.json 和 evidence-ledger.jsonl。',
  ].join('\n');
};

const compileDraft = (state: LabSkillSessionState, payload: JsonRecord): void => {
  const skillName = slug(asString(payload.targetSkillName || payload.target_skill_name, state.targetSkillName));
  state.targetSkillName = skillName;
  state.displayName = asString(payload.displayName || payload.display_name, state.displayName || skillName);
  state.summaryMarkdown = asString(
    payload.summaryMarkdown || payload.summary_markdown,
    state.summaryMarkdown as string
  );
  const draftDir = path.join(sessionDir(state), 'draft', skillName);
  const referencesDir = path.join(draftDir, 'references');
  const protocolDir = path.join(referencesDir, 'Protocol');
  ensureDir(protocolDir);

  writeText(
    path.join(draftDir, 'SKILL.md'),
    asString(payload.skillMarkdown || payload.skill_markdown, defaultSkillMarkdown(state))
  );
  writeText(
    path.join(referencesDir, 'sop.md'),
    asString(payload.sopMarkdown || payload.sop_markdown, defaultSopMarkdown(state))
  );
  writeText(
    path.join(draftDir, 'privacy.md'),
    asString(
      payload.privacyMarkdown || payload.privacy_markdown,
      '# Privacy\n\nNo additional privacy notes recorded yet.'
    )
  );
  writeText(
    path.join(draftDir, 'conflicts.md'),
    asString(
      payload.conflictsMarkdown || payload.conflicts_markdown,
      '# Conflicts\n\nNo unresolved conflicts recorded yet.'
    )
  );
  writeJson(path.join(protocolDir, 'protocol-index.json'), {
    protocols: state.protocols.map((protocol) => ({
      id: protocol.id,
      title: protocol.title,
      path: protocol.path,
      status: protocol.status,
      evidenceIds: protocol.evidenceIds || [],
    })),
  });
  writeText(
    path.join(draftDir, 'agents', 'openai.yaml'),
    ['name: lab-skill-deposition-draft', `skill: ${skillName}`, 'requires_user_enable: true'].join('\n')
  );
  writeText(path.join(draftDir, 'claims.jsonl'), state.claims.map((claim) => JSON.stringify(claim)).join('\n'));
  writeText(
    path.join(draftDir, 'evidence-ledger.jsonl'),
    state.sources.map((source) => JSON.stringify(source)).join('\n')
  );
  writeJson(path.join(draftDir, 'source-map.json'), {
    sessionId: state.sessionId,
    userInstruction: state.userInstruction,
    sources: state.sources,
    claims: state.claims,
    protocols: state.protocols,
  });

  state.draftDir = draftDir;
  state.status = state.findings.some((finding) => finding.severity === 'blocking') ? 'blocked' : 'draft';
  persistSession(state);
};

const buildGraph = (state: LabSkillSessionState): LabSkillDepositionPanelData['graph'] => {
  const nodes = [
    { id: state.sessionId, label: '沉淀会话', kind: 'session' },
    ...state.sources.map((source) => ({ id: source.id, label: source.title, kind: source.sourceType })),
    ...state.claims.map((claim) => ({ id: claim.id, label: claim.text.slice(0, 48), kind: 'claim' })),
    ...state.protocols.map((protocol) => ({ id: protocol.id, label: protocol.title, kind: 'protocol' })),
  ];
  const edges = [
    ...state.claims.flatMap((claim) =>
      claim.evidenceIds.map((sourceId) => ({
        id: `edge_${sourceId}_${claim.id}`,
        from: sourceId,
        to: claim.id,
        type: 'supports',
      }))
    ),
    ...state.protocols.flatMap((protocol) =>
      (protocol.evidenceIds || []).map((sourceId) => ({
        id: `edge_${sourceId}_${protocol.id}`,
        from: sourceId,
        to: protocol.id,
        type: 'documents',
      }))
    ),
  ];
  return { nodes, edges };
};

const buildPanel = (state: LabSkillSessionState, patch?: JsonRecord): LabSkillDepositionPanelData => {
  const blockingFindings = state.findings.filter((finding) => finding.severity === 'blocking');
  const canEnable = blockingFindings.length === 0 && Boolean(state.draftDir);
  const files: LabSkillDepositionPanelData['files'] = [
    ...(state.draftDir
      ? [
          { path: path.join(state.draftDir, 'SKILL.md'), role: 'skill' as const, label: 'SKILL.md' },
          { path: path.join(state.draftDir, 'references', 'sop.md'), role: 'protocol' as const, label: 'SOP' },
          { path: path.join(state.draftDir, 'evidence-ledger.jsonl'), role: 'ledger' as const, label: '证据账本' },
          { path: path.join(state.draftDir, 'source-map.json'), role: 'ledger' as const, label: '来源映射' },
        ]
      : []),
    ...state.protocols
      .filter((protocol) => protocol.path)
      .map((protocol) => ({ path: protocol.path!, role: 'protocol' as const, label: protocol.title })),
  ];
  const panel: LabSkillDepositionPanelData = {
    schema: LAB_SKILL_DEPOSITION_PANEL_SCHEMA,
    sessionId: state.sessionId,
    projectRoot: state.projectRoot,
    title: state.displayName || state.targetSkillName,
    generatedAt: now(),
    status: state.status,
    userInstruction: state.userInstruction,
    summaryMarkdown:
      state.summaryMarkdown ||
      `已为 **${state.displayName || state.targetSkillName}** 建立沉淀会话，当前状态为 \`${state.status}\`。`,
    stats: {
      sources: state.sources.length,
      claims: state.claims.length,
      protocols: state.protocols.length,
      draftFiles: files.length,
      blockers: blockingFindings.length,
    },
    skill: {
      name: state.targetSkillName,
      displayName: state.displayName,
      draftDir: state.draftDir,
      publishedDir: state.publishedDir,
      installedDir: state.installedDir,
      version: '0.1.0',
      canEnable,
      enabled: state.status === 'enabled',
    },
    report: {
      title: asString(patch?.title, `沉淀报告：${state.displayName || state.targetSkillName}`),
      sections: [
        {
          id: 'summary',
          heading: '沉淀结果',
          markdown:
            state.summaryMarkdown ||
            `当前已经整理出 ${state.sources.length} 个来源、${state.claims.length} 条候选规则、${state.protocols.length} 份 Protocol。`,
          evidenceIds: state.sources.slice(0, 6).map((source) => source.id),
        },
        {
          id: 'skill',
          heading: 'Skill 草稿',
          markdown: state.draftDir
            ? `草稿目录：\`${state.draftDir}\`\n\n启用前会检查 blocking finding，并保留证据账本。`
            : '尚未编译 Skill 草稿。下一步需要调用 `compile_draft`。',
        },
        {
          id: 'validation',
          heading: '启用判断',
          markdown: canEnable
            ? '当前没有 blocking finding，可以在用户确认后启用。'
            : blockingFindings.length
              ? blockingFindings.map((finding) => `- **${finding.title}**：${finding.detail || '需要处理'}`).join('\n')
              : '需要先生成 Skill 草稿，然后再判断是否能够启用。',
        },
      ],
    },
    sources: state.sources,
    claims: state.claims,
    protocols: state.protocols,
    files,
    validation: {
      canEnable,
      findings: state.findings,
    },
    graph: buildGraph(state),
    nextActions:
      state.nextActions ||
      (canEnable ? ['等待用户点击或明确回复“启用”'] : ['补充来源', '修复 blocking finding', '重新提交沉淀报告']),
  };
  return isRecord(patch)
    ? ({ ...panel, ...clone(patch), schema: LAB_SKILL_DEPOSITION_PANEL_SCHEMA } as LabSkillDepositionPanelData)
    : panel;
};

const publishSkill = (state: LabSkillSessionState): void => {
  if (!state.draftDir || !fs.existsSync(state.draftDir)) {
    throw new Error('No compiled draft exists. Call compile_draft first.');
  }
  const targetDir = path.join(state.projectRoot, '.openscience', 'lab-skills', state.targetSkillName);
  fs.rmSync(targetDir, { recursive: true, force: true });
  fs.cpSync(state.draftDir, targetDir, { recursive: true });
  state.publishedDir = targetDir;
  state.status = 'ready';
  persistSession(state);
};

const installSkill = (state: LabSkillSessionState, payload: JsonRecord): void => {
  const sourceDir = state.publishedDir || state.draftDir;
  if (!sourceDir || !fs.existsSync(sourceDir)) {
    throw new Error('No draft or published skill exists. Call compile_draft and publish_skill first.');
  }
  const targetDir = asString(
    payload.targetDir || payload.target_dir,
    path.join(state.projectRoot, '.codex', 'skills', state.targetSkillName)
  );
  fs.rmSync(targetDir, { recursive: true, force: true });
  fs.cpSync(sourceDir, targetDir, { recursive: true });
  state.installedDir = targetDir;
  state.status = 'enabled';
  persistSession(state);
};

async function main() {
  const server = new McpServer({
    name: BUILTIN_LAB_SKILL_NAME,
    version: '1.0.0',
  });

  server.tool(
    'lab_skill',
    [
      'Single OpenScience Lab Skill deposition control surface.',
      'Use actions to open a session, select/ingest sources, extract SOP claims, draft protocols, compile a Skill, submit the report, then publish/install only after user confirmation.',
    ].join(' '),
    {
      action: z.enum([
        'open_session',
        'status',
        'select_sources',
        'ingest',
        'extract_claims',
        'detect_protocol_gaps',
        'draft_protocol',
        'patch_protocol',
        'validate_protocol',
        'review_claim',
        'compile_draft',
        'submit_report',
        'patch_draft',
        'publish_skill',
        'install_skill',
        'refresh_skill',
        'build_graph',
        'apply_packet',
      ]),
      sessionId: z.string().optional(),
      projectRoot: z.string().optional(),
      userInstruction: z.string().optional(),
      targetSkillName: z.string().optional(),
      targetScope: z.string().optional(),
      itemKind: z.string().optional(),
      itemId: z.string().optional(),
      content: z.record(z.unknown()).optional(),
      payload: z.record(z.unknown()).optional(),
      patch: z.record(z.unknown()).optional(),
      options: z.record(z.unknown()).optional(),
      displayIntent: z.enum(['background', 'open', 'focus']).optional(),
    },
    async ({
      action,
      sessionId,
      projectRoot,
      userInstruction,
      targetSkillName,
      itemKind,
      itemId,
      content,
      payload,
      patch,
      options,
      displayIntent,
    }) => {
      const body: JsonRecord = {
        ...(payload || {}),
        ...(content || {}),
        ...(userInstruction ? { userInstruction } : {}),
        ...(targetSkillName ? { targetSkillName } : {}),
      };
      const state = ensureSession(sessionId, projectRoot, body);
      const eventTarget =
        itemKind || itemId ? { kind: itemKind as LabSkillDepositionEvent['target']['kind'], id: itemId } : undefined;

      if (action === 'open_session') {
        return jsonText({
          ...eventFor(state, action, { target: { kind: 'session', id: state.sessionId } }),
          object: state,
        });
      }

      if (action === 'status') {
        return jsonText({
          ...eventFor(state, action, { target: { kind: 'session', id: state.sessionId } }),
          object: state,
          panel: buildPanel(state),
        });
      }

      if (action === 'select_sources' || action === 'ingest') {
        const incoming = asArray(
          body.sources || body.items || body.source ? body.sources || body.items || [body.source] : [body]
        )
          .filter(isRecord)
          .map((item, index) => normalizeSource(item, state.sources.length + index));
        state.sources = mergeById(state.sources, incoming);
        state.status = 'collecting';
        persistSession(state);
        appendJsonl(path.join(sessionDir(state), 'sources.jsonl'), { action, sources: incoming, timestamp: now() });
        return jsonText({
          ...eventFor(state, action, { target: eventTarget, sourceIds: incoming.map((item) => item.id) }),
          object: incoming,
        });
      }

      if (action === 'extract_claims' || action === 'review_claim') {
        const incoming = asArray(
          body.claims || body.items || body.claim ? body.claims || body.items || [body.claim] : [body]
        )
          .filter(isRecord)
          .map((item, index) => normalizeClaim(item, state.claims.length + index));
        state.claims = mergeById(state.claims, incoming);
        persistSession(state);
        appendJsonl(path.join(sessionDir(state), 'claims.jsonl'), { action, claims: incoming, timestamp: now() });
        return jsonText({
          ...eventFor(state, action, { target: eventTarget, claimIds: incoming.map((item) => item.id) }),
          object: incoming,
        });
      }

      if (action === 'draft_protocol' || action === 'patch_protocol' || action === 'detect_protocol_gaps') {
        const incoming = asArray(
          body.protocols || body.items || body.protocol ? body.protocols || body.items || [body.protocol] : [body]
        )
          .filter(isRecord)
          .map((item, index) => normalizeProtocol(item, state.protocols.length + index, state));
        state.protocols = mergeById(state.protocols, incoming);
        persistSession(state);
        return jsonText({
          ...eventFor(state, action, { target: eventTarget, protocolIds: incoming.map((item) => item.id) }),
          object: incoming,
        });
      }

      if (action === 'validate_protocol') {
        const incoming = asArray(
          body.findings || body.items || body.finding ? body.findings || body.items || [body.finding] : []
        )
          .filter(isRecord)
          .map((item, index) => normalizeFinding(item, state.findings.length + index));
        state.findings = mergeById(state.findings, incoming);
        state.status = state.findings.some((finding) => finding.severity === 'blocking') ? 'blocked' : state.status;
        persistSession(state);
        return jsonText({
          ...eventFor(state, action, { target: eventTarget }),
          object: incoming,
          panel: buildPanel(state),
        });
      }

      if (action === 'compile_draft') {
        compileDraft(state, body);
        return jsonText({
          ...eventFor(state, action, {
            target: { kind: 'draft', id: state.targetSkillName },
            filePaths: [state.draftDir || ''],
          }),
          object: { draftDir: state.draftDir },
          panel: buildPanel(state),
        });
      }

      if (action === 'patch_draft' || action === 'apply_packet' || action === 'refresh_skill') {
        if (patch && isRecord(patch.session)) {
          Object.assign(state, patch.session);
        }
        if (asString(body.summaryMarkdown || body.summary_markdown)) {
          state.summaryMarkdown = asString(body.summaryMarkdown || body.summary_markdown);
        }
        if (asString(body.status)) {
          state.status = asString(body.status, state.status) as LabSkillDepositionStatus;
        }
        persistSession(state);
        appendJsonl(path.join(sessionDir(state), 'patches.jsonl'), { action, patch: patch || body, timestamp: now() });
        return jsonText({
          ...eventFor(state, action, { target: eventTarget }),
          object: state,
          panel: buildPanel(state),
        });
      }

      if (action === 'build_graph') {
        const graph = buildGraph(state);
        writeJson(path.join(sessionDir(state), 'graph.json'), graph);
        return jsonText({
          ...eventFor(state, action, { target: { kind: 'graph', id: state.sessionId } }),
          object: graph,
        });
      }

      if (action === 'submit_report') {
        const panel = buildPanel(state, patch || (body.panel as JsonRecord | undefined));
        writeJson(path.join(sessionDir(state), 'latest-panel.json'), panel);
        return jsonText({
          ...eventFor(state, action, {
            target: { kind: 'report', id: state.sessionId },
            panel,
            displayIntent: displayIntent || 'open',
          }),
          panel,
        });
      }

      if (action === 'publish_skill') {
        publishSkill(state);
        return jsonText({
          ...eventFor(state, action, { target: { kind: 'skill', id: state.targetSkillName } }),
          object: { publishedDir: state.publishedDir },
          panel: buildPanel(state),
        });
      }

      if (action === 'install_skill') {
        if (!asBoolean(options?.approved || body.approved, false)) {
          throw new Error(
            'install_skill requires options.approved=true or payload.approved=true after explicit user confirmation.'
          );
        }
        installSkill(state, body);
        return jsonText({
          ...eventFor(state, action, { target: { kind: 'skill', id: state.targetSkillName } }),
          object: { installedDir: state.installedDir },
          panel: buildPanel(state),
        });
      }

      throw new Error(`Unsupported lab_skill action: ${action}`);
    }
  );

  const transport = new StdioServerTransport();
  await server.connect(transport);
}

main().catch((error) => {
  console.error('[LabSkillMCP] Fatal error:', error);
  process.exit(1);
});
