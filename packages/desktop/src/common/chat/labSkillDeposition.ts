/**
 * @license
 * Copyright 2026 DeepOrganiser (deepscientist.cc)
 * SPDX-License-Identifier: Apache-2.0
 */

import type { IMessageAcpToolCall, IMessageToolCall, IMessageToolGroup } from './chatLib';
import { getPromptLanguageInstruction, getPromptLanguageName } from './language';

export const LAB_SKILL_DEPOSITION_MODE_ID = 'lab_skill_deposition';
export const LAB_SKILL_DEPOSITION_EVENT_SCHEMA = 'deeporganiser.lab_skill_deposition.event.v1';
export const LAB_SKILL_DEPOSITION_PANEL_SCHEMA = 'deeporganiser.lab_skill_deposition.panel.v1';

export type LabSkillDepositionAction =
  | 'open_session'
  | 'status'
  | 'select_sources'
  | 'ingest'
  | 'extract_claims'
  | 'detect_protocol_gaps'
  | 'draft_protocol'
  | 'patch_protocol'
  | 'validate_protocol'
  | 'review_claim'
  | 'compile_draft'
  | 'submit_report'
  | 'patch_draft'
  | 'publish_skill'
  | 'install_skill'
  | 'refresh_skill'
  | 'build_graph'
  | 'apply_packet';

export type LabSkillDepositionStatus =
  | 'opened'
  | 'collecting'
  | 'draft'
  | 'needs_revision'
  | 'ready'
  | 'enabled'
  | 'blocked';

export type LabSkillEvidenceSourceType =
  | 'conversation'
  | 'artifact'
  | 'file'
  | 'protocol'
  | 'paper'
  | 'code'
  | 'review'
  | 'user_instruction'
  | 'manual_note';

export interface LabSkillEvidenceItem {
  id: string;
  title: string;
  sourceType: LabSkillEvidenceSourceType;
  status?: 'selected' | 'ingested' | 'drafted' | 'used' | 'ignored' | 'blocked';
  summary?: string;
  path?: string;
  url?: string;
  messageId?: string;
  artifactId?: string;
  protocolId?: string;
  lineStart?: number;
  lineEnd?: number;
  excerpt?: string;
  hash?: string;
  createdAt?: number;
}

export interface LabSkillClaim {
  id: string;
  text: string;
  status: 'accepted' | 'candidate' | 'conflict' | 'blocked';
  evidenceIds: string[];
  target?: 'instruction' | 'sop' | 'protocol' | 'prompt' | 'validation';
  note?: string;
}

export interface LabSkillProtocolDraft {
  id: string;
  title: string;
  status: 'candidate' | 'accepted' | 'needs_review' | 'rejected';
  path?: string;
  summary?: string;
  evidenceIds?: string[];
  missingInputs?: string[];
}

export interface LabSkillValidationFinding {
  id: string;
  severity: 'info' | 'warning' | 'error' | 'blocking';
  title: string;
  detail?: string;
  evidenceIds?: string[];
  target?: string;
}

export interface LabSkillDepositionPanelData {
  schema: typeof LAB_SKILL_DEPOSITION_PANEL_SCHEMA;
  sessionId: string;
  projectRoot?: string;
  title: string;
  generatedAt: number;
  status: LabSkillDepositionStatus;
  userInstruction?: string;
  summaryMarkdown?: string;
  stats: {
    sources: number;
    claims: number;
    protocols: number;
    draftFiles: number;
    blockers: number;
  };
  skill: {
    name: string;
    displayName?: string;
    draftDir?: string;
    publishedDir?: string;
    installedDir?: string;
    version?: string;
    canEnable: boolean;
    enabled?: boolean;
  };
  report: {
    title: string;
    sections: Array<{
      id: string;
      heading: string;
      markdown: string;
      evidenceIds?: string[];
    }>;
  };
  sources: LabSkillEvidenceItem[];
  claims?: LabSkillClaim[];
  protocols?: LabSkillProtocolDraft[];
  files?: Array<{
    path: string;
    role: 'skill' | 'protocol' | 'reference' | 'ledger' | 'report' | 'other';
    label?: string;
  }>;
  validation?: {
    canEnable: boolean;
    findings: LabSkillValidationFinding[];
  };
  graph?: {
    nodes: Array<{ id: string; label: string; kind: string }>;
    edges: Array<{ id: string; from: string; to: string; type: string }>;
  };
  nextActions?: string[];
}

export interface LabSkillDepositionEvent {
  schema: typeof LAB_SKILL_DEPOSITION_EVENT_SCHEMA;
  eventId: string;
  sessionId: string;
  action: LabSkillDepositionAction;
  timestamp: number;
  target?: {
    kind?: 'session' | 'source' | 'claim' | 'protocol' | 'draft' | 'skill' | 'report' | 'graph';
    id?: string;
  };
  panel?: LabSkillDepositionPanelData;
  object?: unknown;
  sourceIds?: string[];
  claimIds?: string[];
  protocolIds?: string[];
  filePaths?: string[];
  displayIntent?: 'background' | 'open' | 'focus';
}

export type LabSkillDepositionPayload = LabSkillDepositionEvent | LabSkillDepositionPanelData;

export interface LabSkillDepositionConversationExtra {
  enabled: true;
  mode: typeof LAB_SKILL_DEPOSITION_MODE_ID;
  projectRoot?: string;
  sopVersion: 1;
  tool: {
    name: 'lab_skill';
    singleSurface: true;
  };
  report: {
    enabled: true;
    render: 'inline_structured';
    requiresUserEnable: true;
  };
  storage: {
    root: '.openscience/skill-deposition';
    draftRoot: '.openscience/skill-deposition/sessions';
    skillRoot: '.openscience/lab-skills';
  };
}

export const buildLabSkillDepositionConversationExtra = (
  projectRoot?: string
): LabSkillDepositionConversationExtra => ({
  enabled: true,
  mode: LAB_SKILL_DEPOSITION_MODE_ID,
  projectRoot,
  sopVersion: 1,
  tool: {
    name: 'lab_skill',
    singleSurface: true,
  },
  report: {
    enabled: true,
    render: 'inline_structured',
    requiresUserEnable: true,
  },
  storage: {
    root: '.openscience/skill-deposition',
    draftRoot: '.openscience/skill-deposition/sessions',
    skillRoot: '.openscience/lab-skills',
  },
});

export const buildDefaultLabSkillDepositionUserMessage = (options?: {
  workspaceDir?: string;
  preferredLocale?: string;
}): string => {
  const languageName = getPromptLanguageName(options?.preferredLocale);
  const templates: Record<string, { start: string; scope: string; requirement: string; workspace: string }> = {
    'Simplified Chinese': {
      start: '请开始沉淀一个可复用的实验室 Skill。',
      scope: '范围：优先根据当前会话、已打开/已生成的 artifact、项目内相关文档与我补充的说明，整理成可复用 SOP。',
      requirement: '要求：先给出沉淀报告，不要直接启用；等我确认“启用”后再发布或安装。',
      workspace: '项目目录',
    },
    'Traditional Chinese': {
      start: '請開始沉澱一個可重用的實驗室 Skill。',
      scope: '範圍：優先根據目前會話、已開啟或已生成的 artifact、專案內相關文件與我補充的說明，整理成可重用 SOP。',
      requirement: '要求：先給出沉澱報告，不要直接啟用；等我確認「啟用」後再發布或安裝。',
      workspace: '專案目錄',
    },
    Japanese: {
      start: '再利用できるラボ Skill の蓄積を開始してください。',
      scope:
        '範囲：現在の会話、開いているまたは生成済みの artifact、プロジェクト内の関連文書、私が追加するメモを優先して、再利用可能な SOP に整理してください。',
      requirement:
        '要件：まず蓄積レポートを提出してください。私が明示的に有効化を確認するまで、Skill を有効化、公開、インストールしないでください。',
      workspace: 'プロジェクトディレクトリ',
    },
    Spanish: {
      start: 'Empieza a depositar una Skill de laboratorio reutilizable.',
      scope:
        'Alcance: prioriza la conversación actual, los artifacts abiertos o generados, los documentos relevantes del proyecto y las notas adicionales que proporcione. Conviértelos en un SOP reutilizable.',
      requirement:
        'Requisito: envía primero el informe de deposición. No habilites, publiques ni instales la Skill hasta que confirme explícitamente la habilitación.',
      workspace: 'Directorio del proyecto',
    },
    Korean: {
      start: '재사용 가능한 실험실 Skill 축적을 시작해 주세요.',
      scope:
        '범위: 현재 대화, 열려 있거나 생성된 artifact, 프로젝트 내 관련 문서, 제가 추가로 제공하는 메모를 우선해 재사용 가능한 SOP로 정리해 주세요.',
      requirement:
        '요구 사항: 먼저 축적 보고서를 제출해 주세요. 제가 명시적으로 활성화를 확인하기 전에는 Skill을 활성화, 게시 또는 설치하지 마세요.',
      workspace: '프로젝트 디렉터리',
    },
    Turkish: {
      start: 'Yeniden kullanılabilir bir laboratuvar Skill biriktirmeye başla.',
      scope:
        'Kapsam: mevcut konuşmayı, açılmış veya üretilmiş artifactleri, ilgili proje belgelerini ve ek notlarımı önceliklendir. Bunları yeniden kullanılabilir bir SOP haline getir.',
      requirement:
        'Gereklilik: önce bir biriktirme raporu sun. Açıkça onay verene kadar Skill’i etkinleştirme, yayımlama veya kurma.',
      workspace: 'Proje dizini',
    },
    Russian: {
      start: 'Начни формировать переиспользуемый лабораторный Skill.',
      scope:
        'Область: в первую очередь используй текущий диалог, открытые или созданные artifacts, релевантные документы проекта и мои дополнительные заметки. Оформи это как переиспользуемый SOP.',
      requirement:
        'Требование: сначала отправь отчет о накоплении. Не включай, не публикуй и не устанавливай Skill, пока я явно не подтвержу включение.',
      workspace: 'Каталог проекта',
    },
    Ukrainian: {
      start: 'Почни формувати багаторазовий лабораторний Skill.',
      scope:
        'Обсяг: насамперед використовуй поточну розмову, відкриті або створені artifacts, релевантні документи проекту та мої додаткові нотатки. Перетвори це на багаторазовий SOP.',
      requirement:
        'Вимога: спочатку надішли звіт про накопичення. Не вмикай, не публікуй і не встановлюй Skill, доки я явно не підтверджу ввімкнення.',
      workspace: 'Каталог проекту',
    },
    'Brazilian Portuguese': {
      start: 'Comece a depositar uma Skill de laboratório reutilizável.',
      scope:
        'Escopo: priorize a conversa atual, artifacts abertos ou gerados, documentos relevantes do projeto e notas extras que eu fornecer. Transforme tudo em um SOP reutilizável.',
      requirement:
        'Requisito: envie primeiro o relatório de deposição. Não habilite, publique nem instale a Skill até eu confirmar explicitamente a habilitação.',
      workspace: 'Diretório do projeto',
    },
    German: {
      start: 'Beginne mit der Ablage eines wiederverwendbaren Labor-Skills.',
      scope:
        'Umfang: priorisiere die aktuelle Unterhaltung, geöffnete oder erzeugte Artifacts, relevante Projektdokumente und zusätzliche Hinweise von mir. Fasse sie zu einem wiederverwendbaren SOP zusammen.',
      requirement:
        'Anforderung: reiche zuerst den Ablagebericht ein. Aktiviere, veröffentliche oder installiere den Skill erst, wenn ich die Aktivierung ausdrücklich bestätige.',
      workspace: 'Projektverzeichnis',
    },
  };
  const template =
    templates[languageName] ?? {
      start: 'Start depositing a reusable lab Skill.',
      scope:
        'Scope: prioritize the current conversation, opened or generated artifacts, relevant project documents, and any extra notes I provide. Turn them into a reusable SOP.',
      requirement:
        'Requirement: submit the deposition report first. Do not enable, publish, or install the Skill until I explicitly confirm enablement.',
      workspace: 'Project directory',
    };
  return [
    template.start,
    '',
    template.scope,
    template.requirement,
    options?.workspaceDir ? `${template.workspace}: ${options.workspaceDir}` : undefined,
  ]
    .filter((line): line is string => line !== undefined)
    .join('\n');
};

export const buildLabSkillDepositionModePrompt = (projectRoot?: string, preferredLocale?: string): string =>
  [
    '# OpenScience Lab Skill Deposition Mode',
    '',
    'You are running inside OpenScience Lab Skill Deposition Mode. Your job is to turn user-approved conversations, artifacts, protocols, corrections, and lab notes into a reusable local Skill with a clear SOP and evidence ledger.',
    getPromptLanguageInstruction(preferredLocale),
    '',
    '## Boundary',
    '- This is not default Science analysis mode. Do not run unrelated scientific analyses unless they are needed to verify the Skill draft.',
    '- Treat the user message as an instruction that constrains source scope, target skill name, privacy limits, install target, and required edits.',
    projectRoot
      ? `- Authorized project root: ${projectRoot}`
      : '- No explicit project root was provided; ask before reading unrelated folders.',
    '- Never publish or install the Skill until the user explicitly confirms enablement.',
    '',
    '## Required Tool Surface',
    '- Use lab_skill as the single control surface. Do not invent separate start, panel, protocol, review, or install tools.',
    '- Start with lab_skill(action="open_session", userInstruction=<the user request>, projectRoot=<root if known>).',
    '- Use lab_skill(action="select_sources"|"ingest"|"extract_claims"|"draft_protocol"|"compile_draft") to build the evidence chain and draft files.',
    '- Use lab_skill(action="submit_report") whenever the user should inspect the report panel.',
    '- Use openscience-user-input only when a missing decision blocks the draft; ask at most 3 concise questions.',
    '',
    '## Evidence Discipline',
    '- Every SOP rule, protocol step, prompt instruction, and validation claim should point to source ids when possible.',
    '- Keep conversation excerpts short and privacy-aware. If a source is sensitive, summarize it and mark the source accordingly.',
    '- If sources conflict, keep both, mark the conflict, and block enablement until the conflict is resolved.',
    '- If the user asks for “还需要修改：...”, read the existing draft state first, patch only the relevant section, then submit a new report.',
    '',
    '## Draft Shape',
    '- Draft a Skill folder with SKILL.md, references/sop.md, references/Protocol/, claims.jsonl, evidence-ledger.jsonl, source-map.json, privacy.md, and conflicts.md when applicable.',
    '- SKILL.md should be executable as an agent instruction: trigger conditions, workflow, quality gates, source rules, final response rules, and maintenance rules.',
    '- Protocol markdown should be stable, auditable, and easy for a lab member to edit.',
    '',
    '## Report UI Contract',
    '- The report is the main visible result. It should say what was沉淀, which sources support it, what files were created, what is risky, and whether it can be enabled.',
    '- If canEnable is false, explain blockers and next actions plainly.',
    '- Final prose should be short; rely on lab_skill(action="submit_report") for structured display.',
  ].join('\n');

export const isLabSkillDepositionConversationExtra = (
  extra: unknown
): extra is { lab_skill_deposition: LabSkillDepositionConversationExtra } => {
  if (!extra || typeof extra !== 'object' || Array.isArray(extra)) return false;
  const value = (extra as Record<string, unknown>).lab_skill_deposition;
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const record = value as Partial<LabSkillDepositionConversationExtra> & Record<string, unknown>;
  return record.enabled === true && record.mode === LAB_SKILL_DEPOSITION_MODE_ID;
};

const toRecord = (value: unknown): Record<string, unknown> | undefined =>
  value && typeof value === 'object' && !Array.isArray(value) ? (value as Record<string, unknown>) : undefined;

const stripFence = (value: string): string => {
  const trimmed = value.trim();
  const opening = trimmed.match(/^```(?:json)?\s*/u);
  if (!opening) return trimmed;
  return trimmed
    .slice(opening[0].length)
    .replace(/\s*```\s*$/u, '')
    .trim();
};

function parsePayloadString(text: string, depth = 0): LabSkillDepositionPayload | undefined {
  if (depth > 6 || !text.includes('deeporganiser.lab_skill_deposition.')) return undefined;
  const candidates = [stripFence(text)];
  const schemaIndex = text.indexOf('deeporganiser.lab_skill_deposition.');
  if (schemaIndex >= 0) {
    const start = text.lastIndexOf('{', schemaIndex);
    const end = text.lastIndexOf('}');
    if (start >= 0 && end > start) {
      candidates.push(text.slice(start, end + 1));
    }
  }
  for (const candidate of candidates) {
    try {
      const parsed = JSON.parse(candidate);
      const payload = findPayloadCandidate(parsed, depth + 1);
      if (payload) return payload;
    } catch {
      // Try the next candidate.
    }
  }
  return undefined;
}

function findPayloadCandidate(value: unknown, depth = 0): LabSkillDepositionPayload | undefined {
  if (depth > 6) return undefined;
  if (typeof value === 'string') return parsePayloadString(value, depth + 1);
  if (Array.isArray(value)) {
    for (const item of value) {
      const payload = findPayloadCandidate(item, depth + 1);
      if (payload) return payload;
    }
    return undefined;
  }
  const record = toRecord(value);
  if (!record) return undefined;
  if (record.schema === LAB_SKILL_DEPOSITION_PANEL_SCHEMA) return value as LabSkillDepositionPanelData;
  if (record.schema === LAB_SKILL_DEPOSITION_EVENT_SCHEMA) return value as LabSkillDepositionEvent;
  for (const nested of Object.values(record)) {
    const payload = findPayloadCandidate(nested, depth + 1);
    if (payload) return payload;
  }
  return undefined;
}

const parsePayloadCandidate = (text: string): LabSkillDepositionPayload | undefined => parsePayloadString(text);

const getToolGroupOutput = (message: IMessageToolGroup): string[] =>
  Array.isArray(message.content)
    ? message.content
        .flatMap((tool) => {
          const result = tool.result_display;
          if (!result) return [];
          if (typeof result === 'string') return [result];
          if ('output' in result && typeof result.output === 'string') return [result.output];
          if ('result' in result && typeof result.result === 'string') return [result.result];
          if ('text' in result && typeof result.text === 'string') return [result.text];
          return [];
        })
        .filter(Boolean)
    : [];

const getAcpToolOutput = (message: IMessageAcpToolCall): string[] => {
  const update = message.content?.update;
  const textParts =
    update?.content
      ?.map((item) => (item.type === 'content' ? item.content?.text : undefined))
      .filter((item): item is string => Boolean(item)) ?? [];
  const rawOutput = update?.rawOutput || update?.raw_output;
  return [...textParts, ...(rawOutput ? [JSON.stringify(rawOutput)] : [])];
};

const getToolCallOutput = (message: IMessageToolCall): string[] =>
  [message.content.output, message.content.error].filter((item): item is string => Boolean(item));

export const extractLabSkillDepositionPayloadsFromTools = (
  messages: Array<IMessageToolGroup | IMessageAcpToolCall | IMessageToolCall>
): LabSkillDepositionPayload[] =>
  messages.flatMap((message) => {
    const outputs =
      message.type === 'tool_group'
        ? getToolGroupOutput(message)
        : message.type === 'acp_tool_call'
          ? getAcpToolOutput(message)
          : getToolCallOutput(message);
    return outputs
      .map(parsePayloadCandidate)
      .filter((payload): payload is LabSkillDepositionPayload => Boolean(payload));
  });

export const latestLabSkillDepositionPanel = (
  messages: Array<IMessageToolGroup | IMessageAcpToolCall | IMessageToolCall>
): LabSkillDepositionPanelData | undefined => {
  const panels = extractLabSkillDepositionPayloadsFromTools(messages)
    .map((payload) => {
      if ((payload as LabSkillDepositionPanelData).schema === LAB_SKILL_DEPOSITION_PANEL_SCHEMA) {
        return payload as LabSkillDepositionPanelData;
      }
      const event = payload as LabSkillDepositionEvent;
      if (event.schema === LAB_SKILL_DEPOSITION_EVENT_SCHEMA && event.action === 'submit_report') {
        return event.panel;
      }
      return undefined;
    })
    .filter((panel): panel is LabSkillDepositionPanelData => Boolean(panel));
  return panels.at(-1);
};
