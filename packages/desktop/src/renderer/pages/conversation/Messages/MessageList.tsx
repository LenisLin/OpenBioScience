/**
 * @license
 * Copyright 2025 DeepOrganiser (deepscientist.cc)
 * SPDX-License-Identifier: Apache-2.0
 */

import type { IConversationArtifact } from '@/common/adapter/ipcBridge';
import { ipcBridge } from '@/common';
import type { CodexMemoryDetail, CodexMemoryRecord } from '@/deepscientist_lark/codex_memory/types';
import type { MedicalEvidenceReportRecord } from '@/deepscientist_lark/medical_evidence_reports/types';
import {
  latestMedicalEvidencePanel,
  summarizeMedicalEvidenceRuntime,
  type MedicalEvidencePanelData,
  type MedicalEvidenceRuntimeSummary,
} from '@/common/chat/medicalEvidence';
import { latestLabSkillDepositionPanel, type LabSkillDepositionPanelData } from '@/common/chat/labSkillDeposition';
import {
  extractSciencePayloadsFromTools,
  latestSciencePanel,
  resolveScienceDisplayTarget,
  type ScienceDisplayTarget,
  type SciencePanelData,
} from '@/common/chat/science';
import { extractUserInputResultsFromTools } from '@/common/chat/userInput';
import type {
  IMessageAcpToolCall,
  IMessageText,
  IMessageToolCall,
  IMessageToolGroup,
  TMessage,
} from '@/common/chat/chatLib';
import { useConversationContextSafe } from '@/renderer/hooks/context/ConversationContext';
import { useConversationRuntimeView } from '@/renderer/pages/conversation/runtime/useConversationRuntimeView';
import { iconColors } from '@/renderer/styles/colors';
import { CHAT_MESSAGE_JUMP_EVENT, type ChatMessageJumpDetail } from '@/renderer/utils/chat/chatMinimapEvents';
import { Image } from '@arco-design/web-react';
import { Down } from '@icon-park/react';
import type { TFunction } from 'i18next';
import MessageAcpPermission from '@renderer/pages/conversation/Messages/acp/MessageAcpPermission';
import MessagePermission from './components/MessagePermission';
import MessageAcpToolCall from '@renderer/pages/conversation/Messages/acp/MessageAcpToolCall';
import classNames from 'classnames';
import React, { createContext, useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useLocation } from 'react-router-dom';
import { uuid } from '@renderer/utils/common';
import { createTwoFilesPatch } from 'diff';
import './messages.css';
import HOC from '@renderer/utils/ui/HOC';
import type { FileChangeInfo } from './MessageFileChanges';
import MessageFileChanges, { parseDiff } from './MessageFileChanges';
import { hasRunningAgentSteps, normalizeAgentSteps, type AgentFileChangeStep } from '@/common/chat/agentStep';
import { useConversationArtifacts } from './artifacts';
import { useMessageList, useMessageListLoading } from './hooks';
import MessageAgentStatus from './components/MessageAgentStatus';
import MessagePlan from './components/MessagePlan';
import MessageTips from './components/MessageTips';
import MessageToolCall from './components/MessageToolCall';
import MessageToolGroup from './components/MessageToolGroup';
import AgentSteps from './agent-steps/AgentSteps';
import MessageCronTrigger from './components/MessageCronTrigger';
import MessageSkillSuggest from './components/MessageSkillSuggest';
import MessageText from './components/MessageText';
import { MedicalEvidenceAccumulator, MedicalEvidencePanel } from './components/MedicalEvidencePanel';
import LabSkillDepositionPanel from './components/LabSkillDepositionPanel';
import ScienceReportPanel from './components/ScienceReportPanel';
import UserInputSummary from '../user-input/UserInputSummary';
import MessageThinking from './components/MessageThinking';
import CodexMemoryModal from './components/CodexMemoryModal';
import { useAutoScroll } from './useAutoScroll';
import { useAutoPreviewOfficeFiles } from '@/renderer/hooks/file/useAutoPreviewOfficeFiles';
import { useLocalFilePreview } from '@/renderer/pages/conversation/Preview/hooks/useLocalFilePreview';
import { usePreviewContext } from '@/renderer/pages/conversation/Preview';
import SelectionReplyButton from './components/SelectionReplyButton';
import { isCodexConversationRuntime } from '@/renderer/pages/conversation/utils/agentBackend';

const AGENT_MESSAGE_BACKGROUND_COLOR = 'rgb(254, 254, 254)';

type IToolSummaryVO = {
  type: 'tool_summary';
  id: string;
  messages: Array<IMessageToolGroup | IMessageAcpToolCall | IMessageToolCall>;
  sourceMessageIds: string[];
  created_at: number;
  hasRunningSteps: boolean;
};
type IFileSummaryVO = {
  type: 'file_summary';
  id: string;
  diffs: FileChangeInfo[];
  sourceMessageIds: string[];
  created_at: number;
};
type IMessageVO = TMessage | IFileSummaryVO | IToolSummaryVO;
type IArtifactVO = { type: 'artifact'; id: string; artifact: IConversationArtifact; created_at: number };
type IProcessedItem = IMessageVO | IArtifactVO;
type ICodexProcessGroupVO = {
  type: 'codex_process_group';
  id: string;
  items: IProcessedItem[];
  sourceMessageIds: string[];
  created_at: number;
  hasRunningSteps: boolean;
  liveRunning: boolean;
};
type ICodexMemoryMarkerVO = {
  type: 'codex_memory_marker';
  id: string;
  memory: CodexMemoryRecord;
  created_at: number;
};
type IRenderableItem = IProcessedItem | ICodexProcessGroupVO | ICodexMemoryMarkerVO;

type ConversationLocationState = {
  targetMessageId?: string;
  fromConversationSearch?: boolean;
};

const getProcessedItemSourceMessageIds = (item: IRenderableItem): string[] => {
  if ('type' in item && item.type === 'codex_process_group') {
    return item.sourceMessageIds;
  }
  if ('type' in item && item.type === 'codex_memory_marker') {
    return [];
  }
  if ('type' in item && item.type === 'artifact') {
    return [item.id];
  }
  if ('type' in item && item.type === 'tool_summary') {
    return item.sourceMessageIds;
  }
  if ('type' in item && item.type === 'file_summary') {
    return item.sourceMessageIds;
  }
  return 'id' in item ? [item.id] : [];
};

const matchesTargetMessage = (item: IRenderableItem, targetMessageId?: string): boolean => {
  if (!targetMessageId) {
    return false;
  }
  return getProcessedItemSourceMessageIds(item).includes(targetMessageId);
};

const getProcessedItemAnchorId = (item: IRenderableItem): string => {
  const sourceIds = getProcessedItemSourceMessageIds(item);
  return sourceIds[0] || ('id' in item ? item.id : uuid());
};

const getProcessedItemElementAnchorId = (item: IRenderableItem): string =>
  'type' in item && (item.type === 'codex_process_group' || item.type === 'codex_memory_marker')
    ? item.id
    : getProcessedItemAnchorId(item);

const getProcessedItemCreatedAt = (item: IProcessedItem): number => {
  if ('type' in item && ['file_summary', 'tool_summary', 'artifact'].includes(item.type)) {
    return item.created_at;
  }
  return item.created_at ?? 0;
};

const getRenderableItemCreatedAt = (item: IRenderableItem): number => {
  if ('type' in item && item.type === 'codex_process_group') {
    return item.created_at;
  }
  if ('type' in item && item.type === 'codex_memory_marker') {
    return item.created_at;
  }
  return getProcessedItemCreatedAt(item);
};

const highlightStyle: React.CSSProperties = {
  backgroundColor: 'var(--color-aou-1)',
  boxShadow: '0 0 0 1px var(--color-aou-6-brand) inset',
  borderRadius: '12px',
};

const getUnhandledMessageType = (_message: never): string => 'unknown';

const isToolMessage = (message: TMessage): message is IMessageToolGroup | IMessageAcpToolCall | IMessageToolCall =>
  message.type === 'tool_group' || message.type === 'acp_tool_call' || message.type === 'tool_call';

const getRenderableItemStableId = (item: IRenderableItem): string =>
  'id' in item ? item.id : getProcessedItemAnchorId(item);

const getRenderableItemToolMessages = (
  item: IRenderableItem
): Array<IMessageToolGroup | IMessageAcpToolCall | IMessageToolCall> => {
  if ('type' in item && item.type === 'tool_summary') return item.messages;
  if ('type' in item && item.type === 'codex_process_group') {
    return item.items.flatMap((child) => (child.type === 'tool_summary' ? child.messages : []));
  }
  return [];
};

const getMedicalEvidencePanelKey = (panel: MedicalEvidencePanelData): string =>
  `${panel.schema}:${panel.runId}:${panel.generatedAt ?? ''}:${panel.evidence.length}:${panel.report?.sections?.length ?? 0}`;

const getSciencePanelKey = (panel: SciencePanelData): string =>
  `${panel.schema}:${panel.runId}:${panel.generatedAt ?? ''}:${panel.artifacts.length}:${panel.evidence.length}:${panel.report.sections.length}`;

const getLabSkillDepositionPanelKey = (panel: LabSkillDepositionPanelData): string =>
  `${panel.schema}:${panel.sessionId}:${panel.generatedAt ?? ''}:${panel.sources.length}:${panel.claims?.length ?? 0}:${panel.report.sections.length}`;

const getStoredMedicalEvidencePanelKey = (
  panel: MedicalEvidencePanelData,
  textMessageId?: string,
  sourceMessageId?: string
): string => `${textMessageId ?? ''}:${sourceMessageId ?? ''}:${getMedicalEvidencePanelKey(panel)}`;

const isEmptyAssistantText = (message: TMessage): boolean =>
  message.type === 'text' && message.position === 'left' && !message.content.content.trim();

const isMessageItem = (item: IProcessedItem): item is TMessage =>
  !('type' in item && ['artifact', 'file_summary', 'tool_summary'].includes(item.type));

const isAssistantTextItem = (item: IProcessedItem): item is IMessageText =>
  isMessageItem(item) && item.type === 'text' && item.position === 'left';

const inferCodexFinalTextIds = (items: IProcessedItem[], isProcessing: boolean): Set<string> => {
  const finalTextIds = new Set<string>();
  let pendingTextId: string | undefined;

  const flush = (forceFinal = true) => {
    if (pendingTextId && forceFinal) {
      finalTextIds.add(pendingTextId);
    }
    pendingTextId = undefined;
  };

  for (const item of items) {
    if (!isMessageItem(item)) continue;
    if (item.position === 'right') {
      flush();
      continue;
    }
    if (item.type !== 'text' || item.position !== 'left' || isEmptyAssistantText(item)) {
      continue;
    }
    if (item.content.finality === 'final') {
      flush(false);
      finalTextIds.add(item.id);
      continue;
    }
    pendingTextId = item.id;
  }

  flush(!isProcessing);
  return finalTextIds;
};

const isAssistantFinalTextItem = (item: IProcessedItem, finalTextIds: Set<string>): item is IMessageText =>
  isAssistantTextItem(item) && item.type === 'text' && item.position === 'left' && finalTextIds.has(item.id);

const isCodexProcessItem = (item: IProcessedItem, finalTextIds: Set<string>): boolean => {
  if ('type' in item && item.type === 'tool_summary') return item.messages.length > 0;
  if ('type' in item && item.type === 'file_summary') return item.diffs.length > 0;
  if ('type' in item && item.type === 'artifact') return false;
  if (item.position !== 'left') return false;
  if (item.type === 'text') return !finalTextIds.has(item.id) && !isEmptyAssistantText(item);
  return item.type === 'thinking' || item.type === 'plan';
};

const useLiveNow = (active: boolean): number => {
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    if (!active) return undefined;
    setNow(Date.now());
    const timer = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, [active]);

  return now;
};

const padDurationUnit = (value: number): string => String(value).padStart(2, '0');

const formatCodexProcessDuration = (durationMs: number, t: TFunction): string | undefined => {
  const totalSeconds = Math.max(0, Math.floor(durationMs / 1000));
  if (totalSeconds === 0) return undefined;
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  const separator = t('messages.agentSteps.duration.separator', { defaultValue: ' ' });
  const unit = (key: string, value: string | number, suffix: string) =>
    t(key, { value, defaultValue: `${value}${suffix}` });
  if (hours > 0) {
    return [
      unit('messages.agentSteps.duration.hour', hours, 'h'),
      unit('messages.agentSteps.duration.minute', padDurationUnit(minutes), 'm'),
      unit('messages.agentSteps.duration.second', padDurationUnit(seconds), 's'),
    ].join(separator);
  }
  if (minutes > 0) {
    return [
      unit('messages.agentSteps.duration.minute', minutes, 'm'),
      unit('messages.agentSteps.duration.second', padDurationUnit(seconds), 's'),
    ].join(separator);
  }
  return unit('messages.agentSteps.duration.second', seconds, 's');
};

const getCodexProcessGroupDurationLabel = (
  items: IProcessedItem[],
  liveRunning: boolean,
  now: number,
  t: TFunction,
  liveStartedAt?: number | null
): string | undefined => {
  const times = items
    .flatMap((item) => {
      if ('type' in item && item.type === 'tool_summary') {
        return normalizeAgentSteps(item.messages).map((step) => step.createdAt);
      }
      return [item.created_at];
    })
    .filter((value): value is number => typeof value === 'number');

  if (!times.length) return undefined;
  const startTime =
    liveRunning && liveStartedAt !== null && liveStartedAt !== undefined ? liveStartedAt : Math.min(...times);
  const endTime = liveRunning ? now : Math.max(...times);
  return formatCodexProcessDuration(endTime - startTime, t);
};

const groupCodexProcessItems = (items: IProcessedItem[], isProcessing: boolean): IRenderableItem[] => {
  const result: IRenderableItem[] = [];
  let pending: IProcessedItem[] = [];
  const finalTextIds = inferCodexFinalTextIds(items, isProcessing);

  const flush = () => {
    if (!pending.length) return;
    const sourceIds = pending.flatMap(getProcessedItemSourceMessageIds);
    result.push({
      type: 'codex_process_group',
      id: `codex-process-${sourceIds[0] || pending[0].id}`,
      items: pending,
      sourceMessageIds: sourceIds,
      created_at: pending[0].created_at ?? 0,
      hasRunningSteps: pending.some((item) => item.type === 'tool_summary' && item.hasRunningSteps),
      liveRunning: false,
    });
    pending = [];
  };

  for (const item of items) {
    if (isMessageItem(item)) {
      const message = item as TMessage;
      if (message.position === 'right') {
        flush();
        result.push(item);
        continue;
      }
    }

    if (isCodexProcessItem(item, finalTextIds)) {
      pending.push(item);
      continue;
    }

    if (isAssistantFinalTextItem(item, finalTextIds)) {
      flush();
      result.push(item);
      continue;
    }

    flush();
    result.push(item);
  }

  flush();
  if (isProcessing) {
    const latestRightMessageIndex = result.findLastIndex(
      (item) =>
        !('type' in item && (item.type === 'codex_process_group' || item.type === 'codex_memory_marker')) &&
        isMessageItem(item) &&
        item.position === 'right'
    );
    const latestProcessGroupIndex = result.findLastIndex(
      (item) => 'type' in item && item.type === 'codex_process_group'
    );
    if (latestProcessGroupIndex > latestRightMessageIndex) {
      const latestProcessGroup = result[latestProcessGroupIndex] as ICodexProcessGroupVO;
      latestProcessGroup.liveRunning = true;
      latestProcessGroup.hasRunningSteps = true;
    }
  }
  return result;
};

const getCodexMemoryCreatedAt = (memory: CodexMemoryRecord): number => {
  const parsed = Date.parse(memory.timestamp);
  return Number.isFinite(parsed) ? parsed : (memory.generatedAt ?? 0);
};

const mergeCodexMemoryMarkers = (items: IRenderableItem[], memories: CodexMemoryRecord[]): IRenderableItem[] => {
  if (!memories.length) return items;
  const markers: ICodexMemoryMarkerVO[] = memories.map((memory) => ({
    type: 'codex_memory_marker',
    id: `codex-memory-${memory.id}`,
    memory,
    created_at: getCodexMemoryCreatedAt(memory),
  }));
  return [...items, ...markers].toSorted((a, b) => getRenderableItemCreatedAt(a) - getRenderableItemCreatedAt(b));
};

const visibleConversationArtifacts = (artifacts: IConversationArtifact[]): IArtifactVO[] =>
  artifacts
    .filter((artifact) => {
      if (artifact.kind === 'cron_trigger') return artifact.status === 'active';
      if (artifact.kind === 'skill_suggest') return artifact.status === 'pending';
      return false;
    })
    .map<IArtifactVO>((artifact) => ({
      type: 'artifact',
      id: artifact.id,
      artifact,
      created_at: artifact.created_at,
    }));

const getFileNameFromPath = (path?: string): string => {
  if (!path) return 'file';
  for (const part of path.split(/[\\/]/).toReversed()) {
    if (part) return part;
  }
  return path;
};

const extractFileChangesFromTools = (
  messages: Array<IMessageToolGroup | IMessageAcpToolCall | IMessageToolCall>
): FileChangeInfo[] => {
  const changes = normalizeAgentSteps(messages).flatMap((step) => {
    if (step.kind !== 'file_change') return [];
    const fileStep = step as AgentFileChangeStep;
    const filePath = fileStep.filePath || fileStep.fileName || 'file';
    const fileName = fileStep.fileName || getFileNameFromPath(filePath);
    const diff =
      fileStep.diff ||
      (fileStep.oldText !== undefined || fileStep.newText !== undefined
        ? createTwoFilesPatch(fileName, fileName, fileStep.oldText || '', fileStep.newText || '', '', '', {
            context: 3,
          })
        : '');

    if (!diff.trim()) return [];
    return [parseDiff(diff, filePath)];
  });

  return Array.from(new Map(changes.map((change) => [change.fullPath, change])).values());
};

// Image preview context
export const ImagePreviewContext = createContext<{ inPreviewGroup: boolean }>({ inPreviewGroup: false });

const MessageListSkeleton: React.FC = () => {
  const rows = [
    { align: 'left', bubbleWidth: '100%', lines: [72, 58, 64] },
    { align: 'right', bubbleWidth: '82%', lines: [54, 48] },
    { align: 'left', bubbleWidth: '100%', lines: [68, 76, 44] },
    { align: 'left', bubbleWidth: '100%', lines: [46, 52] },
    { align: 'right', bubbleWidth: '78%', lines: [60, 42, 36] },
    { align: 'left', bubbleWidth: '100%', lines: [74, 62] },
    { align: 'right', bubbleWidth: '84%', lines: [52, 66] },
    { align: 'left', bubbleWidth: '100%', lines: [64, 56, 40] },
    { align: 'right', bubbleWidth: '80%', lines: [58, 46] },
  ] as const;

  return (
    <div
      className='flex-1 h-full overflow-y-auto pb-10px box-border'
      data-testid='message-list-skeleton'
      style={{ minHeight: '100%' }}
    >
      <div className='min-h-full flex flex-col justify-between py-10px box-border'>
        {rows.map((row, index) => (
          <div
            key={index}
            className={classNames(
              'w-full min-w-0 flex items-start message-item px-8px m-t-10px max-w-full md:max-w-780px mx-auto',
              {
                'justify-start': row.align === 'left',
                'justify-end': row.align === 'right',
              }
            )}
          >
            <div
              className='flex-none min-w-0 rd-16px p-14px'
              style={{
                width: row.bubbleWidth,
                maxWidth: '100%',
                background: 'var(--color-fill-1)',
                border: '1px solid var(--color-border-2)',
              }}
            >
              <div className='flex flex-col gap-10px'>
                {row.lines.map((width, lineIndex) => (
                  <div
                    key={lineIndex}
                    className='h-12px rd-999px'
                    style={{
                      width: `${width}%`,
                      background:
                        'linear-gradient(90deg, var(--color-fill-2) 0%, var(--color-fill-3) 50%, var(--color-fill-2) 100%)',
                      backgroundSize: '200% 100%',
                      animation: 'message-list-skeleton-shimmer 1.4s ease-in-out infinite',
                    }}
                  />
                ))}
              </div>
            </div>
          </div>
        ))}
      </div>
      <style>{`
        @keyframes message-list-skeleton-shimmer {
          0% { background-position: 200% 0; }
          100% { background-position: -200% 0; }
        }
      `}</style>
    </div>
  );
};

const MessageItem: React.FC<{
  message: TMessage;
  highlighted?: boolean;
  showCopyRow?: boolean;
  resultFileChanges?: FileChangeInfo[];
  resultMedicalEvidencePanel?: MedicalEvidencePanelData;
  hideMedicalEvidenceText?: boolean;
}> = React.memo(
  HOC((props) => {
    const { message, highlighted } = props as { message: TMessage; highlighted?: boolean };
    return (
      <div
        id={`message-${message.id}`}
        data-testid={`message-${message.type}-${message.position}`}
        data-message-type={message.type}
        data-message-position={message.position}
        className={classNames(
          'min-w-0 flex items-start message-item [&>div]:max-w-full px-8px m-t-10px max-w-full md:max-w-780px mx-auto',
          message.type,
          {
            'justify-center': message.position === 'center',
            'justify-end': message.position === 'right',
            'justify-start': message.position === 'left',
          }
        )}
        style={highlighted ? highlightStyle : undefined}
      >
        {props.children}
      </div>
    );
  })(
    ({
      message,
      showCopyRow,
      resultFileChanges,
      resultMedicalEvidencePanel,
      hideMedicalEvidenceText,
    }: {
      message: TMessage;
      highlighted?: boolean;
      showCopyRow?: boolean;
      resultFileChanges?: FileChangeInfo[];
      resultMedicalEvidencePanel?: MedicalEvidencePanelData;
      hideMedicalEvidenceText?: boolean;
    }) => {
      const { t } = useTranslation();
      switch (message.type) {
        case 'text':
          return (
            <MessageText
              message={message}
              showCopyRow={showCopyRow}
              resultFileChanges={resultFileChanges}
              resultMedicalEvidencePanel={resultMedicalEvidencePanel}
              hideMedicalEvidenceText={hideMedicalEvidenceText}
            ></MessageText>
          );
        case 'tips':
          return <MessageTips message={message}></MessageTips>;
        case 'tool_call':
          return <MessageToolCall message={message}></MessageToolCall>;
        case 'tool_group':
          return <MessageToolGroup message={message}></MessageToolGroup>;
        case 'agent_status':
          return <MessageAgentStatus message={message}></MessageAgentStatus>;
        case 'permission':
          return <MessagePermission message={message}></MessagePermission>;
        case 'acp_permission':
          return <MessageAcpPermission message={message}></MessageAcpPermission>;
        case 'acp_tool_call':
          return <MessageAcpToolCall message={message}></MessageAcpToolCall>;
        case 'plan':
          return <MessagePlan message={message}></MessagePlan>;
        case 'thinking':
          return <MessageThinking message={message}></MessageThinking>;
        case 'available_commands':
          return null;
        default:
          return <div>{t('messages.unknownMessageType', { type: getUnhandledMessageType(message) })}</div>;
      }
    }
  ),
  (prev, next) =>
    prev.message.id === next.message.id &&
    prev.message.content === next.message.content &&
    prev.message.position === next.message.position &&
    prev.message.type === next.message.type &&
    prev.highlighted === next.highlighted &&
    prev.showCopyRow === next.showCopyRow &&
    prev.resultFileChanges === next.resultFileChanges &&
    prev.resultMedicalEvidencePanel === next.resultMedicalEvidencePanel &&
    prev.hideMedicalEvidenceText === next.hideMedicalEvidenceText
);

const CodexProcessGroup: React.FC<{
  group: ICodexProcessGroupVO;
  renderChild: (index: number, item: IProcessedItem) => React.ReactNode;
  activeStartedAt: number | null;
}> = ({ group, renderChild, activeStartedAt }) => {
  const { t } = useTranslation();
  const userInputResults = useMemo(() => {
    const toolMessages = group.items.flatMap((item) => (item.type === 'tool_summary' ? item.messages : []));
    return extractUserInputResultsFromTools(toolMessages);
  }, [group.items]);
  const liveNow = useLiveNow(group.liveRunning);
  const [expanded, setExpanded] = useState(group.liveRunning);
  const wasLiveRunningRef = useRef(group.liveRunning);
  useEffect(() => {
    if (group.liveRunning) {
      setExpanded(true);
    } else if (wasLiveRunningRef.current) {
      setExpanded(false);
    }
    wasLiveRunningRef.current = group.liveRunning;
  }, [group.liveRunning]);
  const durationLabel = getCodexProcessGroupDurationLabel(group.items, group.liveRunning, liveNow, t, activeStartedAt);
  const processedLabel = durationLabel
    ? [
        group.liveRunning ? t('messages.agentSteps.summary.working', { defaultValue: '正在处理' }) : undefined,
        t('messages.agentSteps.processedDuration', {
          duration: durationLabel,
          defaultValue: `已处理 ${durationLabel}`,
        }),
      ]
        .filter((value): value is string => Boolean(value))
        .join(' · ')
    : group.liveRunning
      ? t('messages.agentSteps.summary.working', { defaultValue: '正在处理' })
      : t('messages.agentSteps.processedDuration', { duration: '', defaultValue: '已处理' }).trim();
  const evidenceSummary = useMemo<MedicalEvidenceRuntimeSummary | undefined>(() => {
    const toolMessages = group.items.flatMap((item) => (item.type === 'tool_summary' ? item.messages : []));
    return summarizeMedicalEvidenceRuntime(toolMessages);
  }, [group.items]);
  const showEvidenceAccumulator = Boolean(
    group.liveRunning && evidenceSummary && evidenceSummary.processEventCount > 0
  );

  return (
    <div
      id={`message-${group.id}`}
      className='codex-process-group max-w-full md:max-w-780px mx-auto'
      data-testid='codex-process-group'
      data-codex-process-count={group.items.length}
    >
      <button
        type='button'
        className={classNames(
          'codex-process-group__toggle',
          group.liveRunning && 'codex-process-group__toggle--running'
        )}
        aria-expanded={expanded}
        onClick={() => setExpanded((value) => !value)}
      >
        <span className='codex-process-group__label'>{processedLabel}</span>
        {showEvidenceAccumulator ? (
          <MedicalEvidenceAccumulator summary={evidenceSummary} running={group.liveRunning} />
        ) : null}
        <span className='codex-process-group__chevron'>{expanded ? '⌄' : '›'}</span>
        <span className='codex-process-group__rule' />
      </button>
      {expanded && (
        <div className='codex-process-group__body'>
          {userInputResults.length > 0 ? <UserInputSummary results={userInputResults} /> : null}
          {group.items.map((item, index) => (
            <React.Fragment key={getProcessedItemAnchorId(item) || `${group.id}-${index}`}>
              {renderChild(index, item)}
            </React.Fragment>
          ))}
        </div>
      )}
    </div>
  );
};

const CodexMemoryDivider: React.FC<{
  marker: ICodexMemoryMarkerVO;
  onOpen: (memory: CodexMemoryRecord) => void;
}> = ({ marker, onOpen }) => {
  const { t } = useTranslation();
  const label =
    marker.memory.windowNumber > 0
      ? t('messages.codexMemory.markerWithNumber', { number: marker.memory.windowNumber })
      : t('messages.codexMemory.marker');
  return (
    <div
      id={`message-${marker.id}`}
      className='context-compacted-divider max-w-full md:max-w-780px mx-auto'
      data-testid='codex-memory-divider'
    >
      <span className='context-compacted-divider__line' />
      <button
        type='button'
        className='context-compacted-divider__label context-compacted-divider__button'
        onClick={() => onOpen(marker.memory)}
        title={marker.memory.title}
      >
        <span className='context-compacted-divider__dot' />
        <span>{label}</span>
        <span className='context-compacted-divider__title'>{marker.memory.title}</span>
      </button>
      <span className='context-compacted-divider__line' />
    </div>
  );
};

const MessageList: React.FC<{ className?: string; emptySlot?: React.ReactNode }> = ({ emptySlot }) => {
  const list = useMessageList();
  const isMessageListLoading = useMessageListLoading();
  const artifacts = useConversationArtifacts();
  const conversationContext = useConversationContextSafe();
  const openLocalFilePreview = useLocalFilePreview(conversationContext?.workspace);
  const { openPreview } = usePreviewContext();
  useAutoPreviewOfficeFiles(conversationContext);
  // While the agent is still streaming, the in-progress turn's last text keeps
  // moving down, so we defer its copy/timestamp row until the turn finishes to
  // avoid the row flashing in and the layout reflowing mid-stream.
  const runtimeView = useConversationRuntimeView(conversationContext?.conversation_id ?? '');
  const { isProcessing } = runtimeView;
  const { t } = useTranslation();
  const location = useLocation();
  const locationState = (location.state || {}) as ConversationLocationState;
  const targetMessageId = locationState.targetMessageId;
  const [highlightedMessageId, setHighlightedMessageId] = useState<string | undefined>();
  const handledTargetKeyRef = useRef<string>('');
  const isCodexRuntime = isCodexConversationRuntime(conversationContext);
  const [codexMemories, setCodexMemories] = useState<CodexMemoryRecord[]>([]);
  const [selectedMemory, setSelectedMemory] = useState<CodexMemoryRecord | undefined>();
  const [selectedMemoryDetail, setSelectedMemoryDetail] = useState<CodexMemoryDetail | undefined>();
  const [memoryDetailLoading, setMemoryDetailLoading] = useState(false);
  const [medicalEvidenceReports, setMedicalEvidenceReports] = useState<MedicalEvidenceReportRecord[]>([]);
  const handledScienceDisplayKeysRef = useRef<Set<string> | null>(null);

  const loadCodexMemories = React.useCallback(async (): Promise<void> => {
    if (!isCodexRuntime || !conversationContext?.conversation_id) {
      setCodexMemories([]);
      return;
    }
    const result = await ipcBridge.codexMemory.list.invoke({ conversationId: conversationContext.conversation_id });
    if (result.ok) setCodexMemories(result.memories);
  }, [conversationContext?.conversation_id, isCodexRuntime]);

  useEffect(() => {
    let cancelled = false;
    if (!isCodexRuntime || !conversationContext?.conversation_id) {
      setCodexMemories([]);
      return;
    }
    loadCodexMemories().catch(() => {});
    const disposeChanged = ipcBridge.codexMemory.changed.on((event) => {
      if (event.conversationId !== conversationContext.conversation_id || cancelled) return;
      loadCodexMemories().catch(() => {});
    });
    return () => {
      cancelled = true;
      disposeChanged();
    };
  }, [conversationContext?.conversation_id, isCodexRuntime, loadCodexMemories]);

  const loadMedicalEvidenceReports = React.useCallback(async (): Promise<void> => {
    if (!conversationContext?.conversation_id) {
      setMedicalEvidenceReports([]);
      return;
    }
    const result = await ipcBridge.medicalEvidenceReports.list.invoke({
      conversationId: conversationContext.conversation_id,
    });
    if (result.ok) setMedicalEvidenceReports(result.reports);
  }, [conversationContext?.conversation_id]);

  useEffect(() => {
    let cancelled = false;
    const conversationId = conversationContext?.conversation_id;
    if (!conversationId) {
      setMedicalEvidenceReports([]);
      return;
    }
    ipcBridge.medicalEvidenceReports.list
      .invoke({ conversationId })
      .then((result) => {
        if (!cancelled && result.ok) setMedicalEvidenceReports(result.reports);
      })
      .catch(() => {});
    const disposeChanged = ipcBridge.medicalEvidenceReports.changed.on((event) => {
      if (event.conversationId !== conversationId || cancelled) return;
      loadMedicalEvidenceReports().catch(() => {});
    });
    return () => {
      cancelled = true;
      disposeChanged();
    };
  }, [conversationContext?.conversation_id, loadMedicalEvidenceReports]);

  const openCodexMemory = React.useCallback(
    async (memory: CodexMemoryRecord) => {
      if (!conversationContext?.conversation_id) return;
      setSelectedMemory(memory);
      setSelectedMemoryDetail(undefined);
      setMemoryDetailLoading(true);
      try {
        const detail = await ipcBridge.codexMemory.get.invoke({
          conversationId: conversationContext.conversation_id,
          memoryId: memory.id,
        });
        setSelectedMemoryDetail(detail);
      } finally {
        setMemoryDetailLoading(false);
      }
    },
    [conversationContext?.conversation_id]
  );

  // Pre-process message list to group tool outputs into summary cards
  const processedList = useMemo(() => {
    const result: Array<IMessageVO> = [];
    let toolList: Array<IMessageToolGroup | IMessageAcpToolCall | IMessageToolCall> = [];
    let toolSourceMessageIds: string[] = [];

    const pushToolList = (message: IMessageToolGroup | IMessageAcpToolCall | IMessageToolCall) => {
      if (!toolList.length) {
        toolSourceMessageIds = [];
        result.push({
          type: 'tool_summary',
          id: `tool-summary-${message.id}`,
          messages: toolList,
          sourceMessageIds: toolSourceMessageIds,
          created_at: message.created_at ?? 0,
          hasRunningSteps: false,
        });
      }
      toolList.push(message);
      toolSourceMessageIds.push(message.id);
    };

    for (let i = 0, len = list.length; i < len; i++) {
      const message = list[i];
      // Skip hidden and available_commands messages
      if (message.hidden) continue;
      if (message.type === 'available_commands') continue;
      if (message.type === 'tool_group') {
        pushToolList(message);
        continue;
      }
      if (message.type === 'acp_tool_call') {
        pushToolList(message);
        continue;
      }
      if (message.type === 'tool_call') {
        pushToolList(message);
        continue;
      }
      toolList = [];
      toolSourceMessageIds = [];
      result.push(message);
    }
    const visibleArtifacts = visibleConversationArtifacts(artifacts);

    for (const item of result) {
      if (item.type === 'tool_summary') {
        item.hasRunningSteps = hasRunningAgentSteps(normalizeAgentSteps(item.messages));
      }
    }

    return [...result, ...visibleArtifacts].toSorted(
      (a, b) => getProcessedItemCreatedAt(a) - getProcessedItemCreatedAt(b)
    );
  }, [artifacts, list]);

  const latestRunningToolSummaryId = useMemo(() => {
    return processedList.findLast((item) => item.type === 'tool_summary' && item.hasRunningSteps)?.id ?? null;
  }, [processedList]);

  const renderableList = useMemo(
    () =>
      isCodexRuntime
        ? mergeCodexMemoryMarkers(groupCodexProcessItems(processedList, isProcessing), codexMemories)
        : processedList,
    [codexMemories, isCodexRuntime, isProcessing, processedList]
  );

  const resultFileChangesByTextId = useMemo(() => {
    const changesByTextId = new Map<string, FileChangeInfo[]>();
    let currentToolMessages: Array<IMessageToolGroup | IMessageAcpToolCall | IMessageToolCall> = [];
    let lastAssistantTextId: string | undefined;

    const flush = () => {
      if (!lastAssistantTextId || currentToolMessages.length === 0) {
        currentToolMessages = [];
        return;
      }
      const changes = extractFileChangesFromTools(currentToolMessages);
      if (changes.length > 0) {
        changesByTextId.set(lastAssistantTextId, changes);
      }
      currentToolMessages = [];
    };

    for (const message of list) {
      if (message.hidden || message.type === 'available_commands') continue;
      if (message.position === 'right') {
        flush();
        lastAssistantTextId = undefined;
        continue;
      }
      if (message.type === 'text') {
        lastAssistantTextId = message.id;
        continue;
      }
      if (isToolMessage(message)) {
        currentToolMessages.push(message);
      }
    }
    flush();

    return changesByTextId;
  }, [list]);

  const resultMedicalEvidencePanelByTextId = useMemo(() => {
    const panelsByTextId = new Map<string, MedicalEvidencePanelData>();
    let turnToolMessages: Array<IMessageToolGroup | IMessageAcpToolCall | IMessageToolCall> = [];
    let turnAssistantTextIds: string[] = [];

    const flush = () => {
      const targetTextId = turnAssistantTextIds.at(-1);
      if (!targetTextId || turnToolMessages.length === 0) {
        turnToolMessages = [];
        turnAssistantTextIds = [];
        return;
      }
      const panel = latestMedicalEvidencePanel(turnToolMessages);
      if (panel) {
        panelsByTextId.set(targetTextId, panel);
      }
      turnToolMessages = [];
      turnAssistantTextIds = [];
    };

    for (const message of list) {
      if (message.hidden || message.type === 'available_commands') continue;
      if (message.position === 'right') {
        flush();
        continue;
      }
      if (isToolMessage(message)) {
        turnToolMessages.push(message);
        continue;
      }
      if (message.type === 'text' && message.position === 'left' && message.content.content.trim()) {
        turnAssistantTextIds.push(message.id);
      }
    }
    flush();

    for (const report of medicalEvidenceReports) {
      if (!report.textMessageId) continue;
      if (!panelsByTextId.has(report.textMessageId)) {
        panelsByTextId.set(report.textMessageId, report.panel);
      }
    }

    return panelsByTextId;
  }, [list, medicalEvidenceReports]);

  const medicalEvidencePanelByRenderableItemId = useMemo(() => {
    const panelsByItemId = new Map<string, MedicalEvidencePanelData>();
    const renderedPanelKeys = new Set(
      Array.from(resultMedicalEvidencePanelByTextId.values()).map(getMedicalEvidencePanelKey)
    );
    for (const item of renderableList) {
      const toolMessages = getRenderableItemToolMessages(item);
      if (!toolMessages.length) continue;
      const panel = latestMedicalEvidencePanel(toolMessages);
      if (panel && !renderedPanelKeys.has(getMedicalEvidencePanelKey(panel))) {
        panelsByItemId.set(getRenderableItemStableId(item), panel);
        renderedPanelKeys.add(getMedicalEvidencePanelKey(panel));
      }
    }
    for (const report of medicalEvidenceReports) {
      if (!report.sourceMessageId) continue;
      const panelKey = getMedicalEvidencePanelKey(report.panel);
      if (renderedPanelKeys.has(panelKey)) continue;
      panelsByItemId.set(report.sourceMessageId, report.panel);
      renderedPanelKeys.add(panelKey);
    }
    return panelsByItemId;
  }, [medicalEvidenceReports, renderableList, resultMedicalEvidencePanelByTextId]);

  const resultLabSkillDepositionPanelByTextId = useMemo(() => {
    const panelsByTextId = new Map<string, LabSkillDepositionPanelData>();
    let turnToolMessages: Array<IMessageToolGroup | IMessageAcpToolCall | IMessageToolCall> = [];
    let turnAssistantTextIds: string[] = [];

    const flush = () => {
      const targetTextId = turnAssistantTextIds.at(-1);
      if (!targetTextId || turnToolMessages.length === 0) {
        turnToolMessages = [];
        turnAssistantTextIds = [];
        return;
      }
      const panel = latestLabSkillDepositionPanel(turnToolMessages);
      if (panel) {
        panelsByTextId.set(targetTextId, panel);
      }
      turnToolMessages = [];
      turnAssistantTextIds = [];
    };

    for (const message of list) {
      if (message.hidden || message.type === 'available_commands') continue;
      if (message.position === 'right') {
        flush();
        continue;
      }
      if (isToolMessage(message)) {
        turnToolMessages.push(message);
        continue;
      }
      if (message.type === 'text' && message.position === 'left' && message.content.content.trim()) {
        turnAssistantTextIds.push(message.id);
      }
    }
    flush();

    return panelsByTextId;
  }, [list]);

  const labSkillDepositionPanelByRenderableItemId = useMemo(() => {
    const panelsByItemId = new Map<string, LabSkillDepositionPanelData>();
    const renderedPanelKeys = new Set(
      Array.from(resultLabSkillDepositionPanelByTextId.values()).map(getLabSkillDepositionPanelKey)
    );
    for (const item of renderableList) {
      const toolMessages = getRenderableItemToolMessages(item);
      if (!toolMessages.length) continue;
      const panel = latestLabSkillDepositionPanel(toolMessages);
      if (panel && !renderedPanelKeys.has(getLabSkillDepositionPanelKey(panel))) {
        panelsByItemId.set(getRenderableItemStableId(item), panel);
        renderedPanelKeys.add(getLabSkillDepositionPanelKey(panel));
      }
    }
    return panelsByItemId;
  }, [renderableList, resultLabSkillDepositionPanelByTextId]);

  const resultSciencePanelByTextId = useMemo(() => {
    const panelsByTextId = new Map<string, SciencePanelData>();
    let turnToolMessages: Array<IMessageToolGroup | IMessageAcpToolCall | IMessageToolCall> = [];
    let turnAssistantTextIds: string[] = [];

    const flush = () => {
      const targetTextId = turnAssistantTextIds.at(-1);
      if (!targetTextId || turnToolMessages.length === 0) {
        turnToolMessages = [];
        turnAssistantTextIds = [];
        return;
      }
      const panel = latestSciencePanel(turnToolMessages);
      if (panel) {
        panelsByTextId.set(targetTextId, panel);
      }
      turnToolMessages = [];
      turnAssistantTextIds = [];
    };

    for (const message of list) {
      if (message.hidden || message.type === 'available_commands') continue;
      if (message.position === 'right') {
        flush();
        continue;
      }
      if (isToolMessage(message)) {
        turnToolMessages.push(message);
        continue;
      }
      if (message.type === 'text' && message.position === 'left' && message.content.content.trim()) {
        turnAssistantTextIds.push(message.id);
      }
    }
    flush();

    return panelsByTextId;
  }, [list]);

  const sciencePanelByRenderableItemId = useMemo(() => {
    const panelsByItemId = new Map<string, SciencePanelData>();
    const renderedPanelKeys = new Set(Array.from(resultSciencePanelByTextId.values()).map(getSciencePanelKey));
    for (const item of renderableList) {
      const toolMessages = getRenderableItemToolMessages(item);
      if (!toolMessages.length) continue;
      const panel = latestSciencePanel(toolMessages);
      if (panel && !renderedPanelKeys.has(getSciencePanelKey(panel))) {
        panelsByItemId.set(getRenderableItemStableId(item), panel);
        renderedPanelKeys.add(getSciencePanelKey(panel));
      }
    }
    return panelsByItemId;
  }, [renderableList, resultSciencePanelByTextId]);

  useEffect(() => {
    const toolMessages = list.filter((message): message is IMessageToolGroup | IMessageAcpToolCall | IMessageToolCall => {
      if (message.hidden || message.type === 'available_commands' || message.position === 'right') return false;
      return isToolMessage(message);
    });
    const targets = extractSciencePayloadsFromTools(toolMessages)
      .map(resolveScienceDisplayTarget)
      .filter((target): target is ScienceDisplayTarget => Boolean(target));
    const eventKeys = targets.map((target) => {
      const artifactPart = target.kind === 'artifact' ? `${target.artifact.id}@${target.artifact.version}` : 'report';
      return `${target.panel.runId}:${target.eventId}:${target.pageId || 'no-page'}:${artifactPart}:${target.intent}`;
    });

    if (handledScienceDisplayKeysRef.current == null) {
      handledScienceDisplayKeysRef.current = new Set(eventKeys);
      return;
    }

    targets.forEach((target, index) => {
      const key = eventKeys[index];
      const handled = handledScienceDisplayKeysRef.current;
      if (!handled || handled.has(key)) return;
      handled.add(key);

      if (target.kind === 'artifact') {
        void openLocalFilePreview(
          target.path,
          undefined,
          {
            title: target.artifact.title,
            workspace: target.panel.projectRoot || conversationContext?.workspace,
            science: {
              panel: target.panel,
              artifactId: target.artifact.id,
              artifactVersion: target.artifact.version,
              workspaceView: true,
            },
          },
          { replace: true }
        );
        return;
      }

      openPreview(
        '',
        'science_report',
        {
          title: target.panel.report.title || target.panel.question || 'Science report',
          workspace: target.panel.projectRoot || conversationContext?.workspace,
          science: {
            panel: target.panel,
            artifactId: 'report',
          },
        },
        { replace: true }
      );
    });
  }, [conversationContext?.workspace, list, openLocalFilePreview, openPreview]);

  useEffect(() => {
    const conversationId = conversationContext?.conversation_id;
    if (!conversationId) return;
    const existingKeys = new Set(
      medicalEvidenceReports.map((report) =>
        getStoredMedicalEvidencePanelKey(report.panel, report.textMessageId, report.sourceMessageId)
      )
    );
    const saves: Array<{ textMessageId?: string; sourceMessageId?: string; panel: MedicalEvidencePanelData }> = [];
    for (const [textMessageId, panel] of resultMedicalEvidencePanelByTextId) {
      const key = getStoredMedicalEvidencePanelKey(panel, textMessageId);
      if (!existingKeys.has(key)) {
        existingKeys.add(key);
        saves.push({ textMessageId, panel });
      }
    }
    for (const [sourceMessageId, panel] of medicalEvidencePanelByRenderableItemId) {
      const key = getStoredMedicalEvidencePanelKey(panel, undefined, sourceMessageId);
      if (!existingKeys.has(key)) {
        existingKeys.add(key);
        saves.push({ sourceMessageId, panel });
      }
    }
    if (!saves.length) return;
    void Promise.all(
      saves.map((item) =>
        ipcBridge.medicalEvidenceReports.save.invoke({
          conversationId,
          textMessageId: item.textMessageId,
          sourceMessageId: item.sourceMessageId,
          panel: item.panel,
        })
      )
    ).catch((error) => {
      console.warn('[MessageList] Failed to persist medical evidence report:', error);
    });
  }, [
    conversationContext?.conversation_id,
    medicalEvidencePanelByRenderableItemId,
    medicalEvidenceReports,
    resultMedicalEvidencePanelByTextId,
  ]);

  // An AI reply can be split into several messages (thinking / multiple text /
  // tool blocks). The hover copy + timestamp row should appear once per turn,
  // after the turn's last text — not under every intermediate text block.
  // Collect the id of the last AI text in each turn; a turn runs until the next
  // user (right) message. Tool/file/artifact items don't end a turn and, per the
  // fallback strategy, the row stays on the turn's last text even when followed
  // by tool blocks. While the conversation is still streaming, the final turn's
  // row is withheld (it would otherwise appear then shift down as more text
  // streams in); earlier, already-finished turns always keep their row.
  const aiCopyRowTextIds = useMemo(() => {
    const ids = new Set<string>();
    let pendingTextId: string | undefined;
    let lastTurnTextId: string | undefined;
    const flush = () => {
      if (pendingTextId) ids.add(pendingTextId);
      pendingTextId = undefined;
    };
    for (const item of processedList) {
      if (
        'type' in item &&
        (item.type === 'file_summary' || item.type === 'tool_summary' || item.type === 'artifact')
      ) {
        continue;
      }
      const message = item as TMessage;
      if (message.position === 'right') {
        flush();
        continue;
      }
      if (message.type === 'text') {
        pendingTextId = message.id;
      }
    }
    lastTurnTextId = pendingTextId;
    flush();
    // The final turn is the one that may still be streaming; hide its row until done.
    if (isProcessing && lastTurnTextId) ids.delete(lastTurnTextId);
    return ids;
  }, [processedList, isProcessing]);

  // Use auto-scroll hook
  const {
    handleScrollerRef,
    handleContentRef,
    handleScroll,
    handleWheel,
    handlePointerDown,
    showScrollButton,
    scrollToBottom,
    scrollElementIntoView,
    hideScrollButton,
  } = useAutoScroll({
    messages: list,
    itemCount: renderableList.length,
  });

  useEffect(() => {
    if (!targetMessageId || renderableList.length === 0) {
      return;
    }

    const targetKey = `${location.key}:${targetMessageId}`;
    if (handledTargetKeyRef.current === targetKey) {
      return;
    }

    const targetIndex = renderableList.findIndex((item) => matchesTargetMessage(item, targetMessageId));
    if (targetIndex === -1) {
      return;
    }

    handledTargetKeyRef.current = targetKey;
    setHighlightedMessageId(targetMessageId);
    hideScrollButton();

    requestAnimationFrame(() => {
      const targetElement = document.getElementById(
        `message-${getProcessedItemElementAnchorId(renderableList[targetIndex])}`
      );
      scrollElementIntoView(targetElement, {
        behavior: 'smooth',
        block: 'center',
      });
    });

    const timer = window.setTimeout(() => {
      setHighlightedMessageId((current) => (current === targetMessageId ? undefined : current));
    }, 2400);

    return () => window.clearTimeout(timer);
  }, [hideScrollButton, location.key, renderableList, scrollElementIntoView, targetMessageId]);

  useEffect(() => {
    const handleMessageJump = (event: Event) => {
      const detail = (event as CustomEvent<ChatMessageJumpDetail>).detail;
      if (!detail || !detail.conversation_id) return;
      if (!conversationContext?.conversation_id || detail.conversation_id !== conversationContext.conversation_id)
        return;

      const targetIndex = renderableList.findIndex((item) => {
        if (matchesTargetMessage(item, detail.messageId)) return true;
        if (
          (item as { type?: string }).type === 'file_summary' ||
          (item as { type?: string }).type === 'tool_summary' ||
          (item as { type?: string }).type === 'artifact' ||
          (item as { type?: string }).type === 'codex_memory_marker' ||
          (item as { type?: string }).type === 'codex_process_group'
        ) {
          return false;
        }
        const message = item as TMessage;
        if (detail.messageId && message.id === detail.messageId) return true;
        if (detail.msgId && message.msg_id === detail.msgId) return true;
        return false;
      });
      if (targetIndex < 0) return;

      hideScrollButton();
      requestAnimationFrame(() => {
        const targetElement = document.getElementById(
          `message-${getProcessedItemElementAnchorId(renderableList[targetIndex])}`
        );
        scrollElementIntoView(targetElement, {
          block: detail.align || 'start',
          behavior: detail.behavior || 'smooth',
        });
      });
    };

    window.addEventListener(CHAT_MESSAGE_JUMP_EVENT, handleMessageJump);
    return () => {
      window.removeEventListener(CHAT_MESSAGE_JUMP_EVENT, handleMessageJump);
    };
  }, [conversationContext?.conversation_id, hideScrollButton, renderableList, scrollElementIntoView]);

  // Click scroll button
  const handleScrollButtonClick = () => {
    hideScrollButton();
    scrollToBottom('smooth');
  };

  const renderItem = (_index: number, item: IRenderableItem) => {
    if ('type' in item && item.type === 'codex_process_group') {
      const fallbackPanel = medicalEvidencePanelByRenderableItemId.get(getRenderableItemStableId(item));
      const fallbackLabSkillPanel = !fallbackPanel
        ? labSkillDepositionPanelByRenderableItemId.get(getRenderableItemStableId(item))
        : undefined;
      const fallbackSciencePanel =
        !fallbackPanel && !fallbackLabSkillPanel
          ? sciencePanelByRenderableItemId.get(getRenderableItemStableId(item))
          : undefined;
      return (
        <React.Fragment key={item.id}>
          <CodexProcessGroup group={item} renderChild={renderItem} activeStartedAt={runtimeView.view.activeStartedAt} />
          {fallbackPanel ? (
            <div className='min-w-0 message-item px-8px m-t-10px max-w-full md:max-w-780px mx-auto'>
              <MedicalEvidencePanel panel={fallbackPanel} />
            </div>
          ) : null}
          {fallbackLabSkillPanel ? (
            <div className='min-w-0 message-item px-8px m-t-10px max-w-full mx-auto'>
              <LabSkillDepositionPanel panel={fallbackLabSkillPanel} />
            </div>
          ) : null}
          {fallbackSciencePanel ? (
            <div className='min-w-0 message-item px-8px m-t-10px max-w-full mx-auto'>
              <ScienceReportPanel panel={fallbackSciencePanel} />
            </div>
          ) : null}
        </React.Fragment>
      );
    }
    if ('type' in item && item.type === 'codex_memory_marker') {
      return <CodexMemoryDivider marker={item} onOpen={openCodexMemory} />;
    }
    const highlighted = matchesTargetMessage(item, highlightedMessageId);
    if ('type' in item && item.type === 'artifact') {
      return (
        <div
          key={item.id}
          id={`message-${getProcessedItemAnchorId(item)}`}
          data-conversation-artifact-kind={item.artifact.kind}
          data-testid={`conversation-artifact-${item.artifact.kind}`}
          className='min-w-0 message-item px-8px m-t-10px max-w-full md:max-w-780px mx-auto'
          style={highlighted ? highlightStyle : undefined}
        >
          {item.artifact.kind === 'cron_trigger' ? (
            <MessageCronTrigger artifact={item.artifact} />
          ) : (
            <MessageSkillSuggest artifact={item.artifact} />
          )}
        </div>
      );
    }
    if ('type' in item && ['file_summary', 'tool_summary'].includes(item.type)) {
      const fallbackPanel = medicalEvidencePanelByRenderableItemId.get(getRenderableItemStableId(item));
      const fallbackLabSkillPanel = !fallbackPanel
        ? labSkillDepositionPanelByRenderableItemId.get(getRenderableItemStableId(item))
        : undefined;
      const fallbackSciencePanel =
        !fallbackPanel && !fallbackLabSkillPanel
          ? sciencePanelByRenderableItemId.get(getRenderableItemStableId(item))
          : undefined;
      return (
        <React.Fragment key={item.id}>
          <div
            id={`message-${getProcessedItemAnchorId(item)}`}
            className={'min-w-0 message-item px-8px m-t-10px max-w-full md:max-w-780px mx-auto ' + item.type}
            style={highlighted ? highlightStyle : undefined}
          >
            {item.type === 'file_summary' && <MessageFileChanges diffsChanges={item.diffs} />}
            {item.type === 'tool_summary' && (
              <AgentSteps
                messages={item.messages}
                runtimeView={runtimeView.view}
                allowLiveWithoutTurnId={item.id === latestRunningToolSummaryId}
              />
            )}
          </div>
          {fallbackPanel ? (
            <div className='min-w-0 message-item px-8px m-t-10px max-w-full md:max-w-780px mx-auto'>
              <MedicalEvidencePanel panel={fallbackPanel} />
            </div>
          ) : null}
          {fallbackLabSkillPanel ? (
            <div className='min-w-0 message-item px-8px m-t-10px max-w-full mx-auto'>
              <LabSkillDepositionPanel panel={fallbackLabSkillPanel} />
            </div>
          ) : null}
          {fallbackSciencePanel ? (
            <div className='min-w-0 message-item px-8px m-t-10px max-w-full mx-auto'>
              <ScienceReportPanel panel={fallbackSciencePanel} />
            </div>
          ) : null}
        </React.Fragment>
      );
    }
    const message = item as TMessage;
    // User messages keep their own copy row; AI text only shows it at the turn end.
    const showCopyRow = message.position !== 'left' || message.type !== 'text' || aiCopyRowTextIds.has(message.id);
    const resultFileChanges =
      message.type === 'text' && aiCopyRowTextIds.has(message.id)
        ? resultFileChangesByTextId.get(message.id)
        : undefined;
    const resultMedicalEvidencePanel =
      message.type === 'text' ? resultMedicalEvidencePanelByTextId.get(message.id) : undefined;
    const resultLabSkillDepositionPanel =
      message.type === 'text' && !resultMedicalEvidencePanel
        ? resultLabSkillDepositionPanelByTextId.get(message.id)
        : undefined;
    const resultSciencePanel =
      message.type === 'text' && !resultMedicalEvidencePanel && !resultLabSkillDepositionPanel
        ? resultSciencePanelByTextId.get(message.id)
        : undefined;
    return (
      <React.Fragment key={message.id}>
        <MessageItem
          message={message}
          highlighted={highlighted}
          showCopyRow={showCopyRow}
          resultFileChanges={resultFileChanges}
          resultMedicalEvidencePanel={resultMedicalEvidencePanel}
          hideMedicalEvidenceText={Boolean(resultMedicalEvidencePanel)}
        ></MessageItem>
        {resultMedicalEvidencePanel ? (
          <div className='min-w-0 message-item px-8px m-t-10px max-w-full md:max-w-780px mx-auto'>
            <MedicalEvidencePanel panel={resultMedicalEvidencePanel} />
          </div>
        ) : null}
        {resultLabSkillDepositionPanel ? (
          <div className='min-w-0 message-item px-8px m-t-10px max-w-full mx-auto'>
            <LabSkillDepositionPanel panel={resultLabSkillDepositionPanel} />
          </div>
        ) : null}
        {resultSciencePanel ? (
          <div className='min-w-0 message-item px-8px m-t-10px max-w-full mx-auto'>
            <ScienceReportPanel panel={resultSciencePanel} />
          </div>
        ) : null}
      </React.Fragment>
    );
  };

  if (renderableList.length === 0 && isMessageListLoading) {
    return <MessageListSkeleton />;
  }

  if (renderableList.length === 0 && emptySlot) {
    return <div className='relative flex-1 h-full flex items-center justify-center'>{emptySlot}</div>;
  }

  return (
    <div
      className='relative flex-1 h-full agent-message-surface'
      style={{ backgroundColor: AGENT_MESSAGE_BACKGROUND_COLOR }}
    >
      {/* Use PreviewGroup to wrap all messages for cross-message image preview */}
      <Image.PreviewGroup actionsLayout={['zoomIn', 'zoomOut', 'originalSize', 'rotateLeft', 'rotateRight']}>
        <ImagePreviewContext.Provider value={{ inPreviewGroup: true }}>
          <div
            ref={handleScrollerRef}
            data-testid='message-list-scroller'
            // Break out of the parent's 20px horizontal padding so the scrollbar hugs the
            // window edge, while re-applying that padding inside to keep message content inset.
            className='flex-1 h-full overflow-y-auto pb-10px box-border -mx-20px px-20px agent-message-scroller'
            style={{ overflowAnchor: 'none', backgroundColor: AGENT_MESSAGE_BACKGROUND_COLOR }}
            onPointerDown={handlePointerDown}
            onScroll={handleScroll}
            onWheel={handleWheel}
          >
            <div ref={handleContentRef} data-testid='message-list-content' style={{ overflowAnchor: 'none' }}>
              <div className='h-10px' />
              {renderableList.map((item, index) => (
                <React.Fragment key={getProcessedItemElementAnchorId(item) || index}>
                  {renderItem(index, item)}
                </React.Fragment>
              ))}
              <div className='h-20px' />
            </div>
          </div>
        </ImagePreviewContext.Provider>
      </Image.PreviewGroup>

      {showScrollButton && (
        <>
          {/* Gradient mask */}
          <div className='absolute bottom-0 left-0 right-0 h-100px pointer-events-none' />
          {/* Scroll button */}
          <div className='absolute bottom-20px left-50% transform -translate-x-50% z-100'>
            <div
              className='flex items-center justify-center w-40px h-40px rd-full bg-base shadow-lg cursor-pointer hover:bg-1 transition-all hover:scale-110 border-1 border-solid border-3'
              onClick={handleScrollButtonClick}
              title={t('messages.scrollToBottom')}
              style={{ lineHeight: 0 }}
            >
              <Down theme='filled' size='20' fill={iconColors.secondary} style={{ display: 'block' }} />
            </div>
          </div>
        </>
      )}

      <SelectionReplyButton messages={list} />
      <CodexMemoryModal
        visible={Boolean(selectedMemory)}
        memory={selectedMemory}
        detail={selectedMemoryDetail}
        loading={memoryDetailLoading}
        onClose={() => {
          setSelectedMemory(undefined);
          setSelectedMemoryDetail(undefined);
        }}
        onRefresh={() => {
          void loadCodexMemories().then(() => {
            if (selectedMemory) void openCodexMemory(selectedMemory);
          });
        }}
      />
    </div>
  );
};

export default MessageList;
