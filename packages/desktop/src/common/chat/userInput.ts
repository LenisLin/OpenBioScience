/**
 * @license
 * Copyright 2025 DeepOrganiser (deepscientist.cc)
 * SPDX-License-Identifier: Apache-2.0
 */

import type { IMessageAcpToolCall, IMessageToolCall, IMessageToolGroup } from './chatLib';

export const USER_INPUT_RESULT_SCHEMA = 'deeporganiser.user_input.result.v1' as const;

export type UserInputQuestionType = 'single_choice' | 'multi_choice' | 'text';
export type UserInputRequestStatus = 'shown' | 'answered' | 'skipped' | 'timeout' | 'cancelled' | 'unavailable';

export type UserInputOption = {
  id: string;
  label: string;
  description?: string;
  recommended?: boolean;
};

export type UserInputQuestion = {
  id: string;
  type: UserInputQuestionType;
  title: string;
  description?: string;
  required?: boolean;
  options?: UserInputOption[];
  allowOther?: boolean;
  otherLabel?: string;
  placeholder?: string;
};

export type UserInputAnswer = {
  questionId: string;
  selectedOptionIds?: string[];
  text?: string;
  otherText?: string;
};

export type UserInputRequest = {
  requestId: string;
  conversationId?: string;
  title?: string;
  reason?: string;
  questions: UserInputQuestion[];
  timeoutMs: number;
  createdAt: number;
  expiresAt: number;
  status: 'shown';
};

export type UserInputRequestInput = {
  requestId?: string;
  conversationId?: string;
  title?: string;
  reason?: string;
  questions: UserInputQuestion[];
  timeoutMs?: number;
  submitLabel?: string;
  cancelLabel?: string;
};

export type UserInputResult = {
  schema: typeof USER_INPUT_RESULT_SCHEMA;
  requestId: string;
  conversationId?: string;
  title?: string;
  reason?: string;
  status: UserInputRequestStatus;
  questions: UserInputQuestion[];
  answers?: UserInputAnswer[];
  createdAt: number;
  resolvedAt: number;
  elapsedMs: number;
  message?: string;
};

export type UserInputAnswerPayload = {
  requestId: string;
  answers: UserInputAnswer[];
};

export type UserInputCancelPayload = {
  requestId: string;
  reason?: 'skipped' | 'cancelled';
};

export type UserInputClaimPayload = {
  requestId: string;
  conversationId: string;
};

export type UserInputBridgeResult = {
  ok: boolean;
  result?: UserInputResult;
  error?: string;
};

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

const normalizeString = (value: unknown): string | undefined =>
  typeof value === 'string' && value.trim() ? value.trim() : undefined;

const normalizeOption = (value: unknown): UserInputOption | undefined => {
  if (!isRecord(value)) return undefined;
  const id = normalizeString(value.id);
  const label = normalizeString(value.label);
  if (!id || !label) return undefined;
  return {
    id,
    label,
    description: normalizeString(value.description),
    recommended: value.recommended === true,
  };
};

export const normalizeUserInputQuestions = (questions: unknown): UserInputQuestion[] => {
  if (!Array.isArray(questions)) return [];
  return questions
    .map((item): UserInputQuestion | undefined => {
      if (!isRecord(item)) return undefined;
      const id = normalizeString(item.id);
      const title = normalizeString(item.title);
      const rawType = normalizeString(item.type);
      const type: UserInputQuestionType | undefined =
        rawType === 'single_choice' || rawType === 'multi_choice' || rawType === 'text' ? rawType : undefined;
      if (!id || !title || !type) return undefined;
      const options = Array.isArray(item.options) ? item.options.map(normalizeOption).filter(Boolean) : undefined;
      return {
        id,
        type,
        title,
        description: normalizeString(item.description),
        required: item.required === true,
        options,
        allowOther: item.allowOther === true || item.allow_other === true,
        otherLabel: normalizeString(item.otherLabel) || normalizeString(item.other_label),
        placeholder: normalizeString(item.placeholder),
      };
    })
    .filter((item): item is UserInputQuestion => Boolean(item));
};

export const normalizeUserInputAnswers = (answers: unknown): UserInputAnswer[] => {
  if (!Array.isArray(answers)) return [];
  return answers
    .map((item): UserInputAnswer | undefined => {
      if (!isRecord(item)) return undefined;
      const questionId = normalizeString(item.questionId) || normalizeString(item.question_id);
      if (!questionId) return undefined;
      const selectedOptionIds = Array.isArray(item.selectedOptionIds)
        ? item.selectedOptionIds.filter((value): value is string => typeof value === 'string')
        : Array.isArray(item.selected_option_ids)
          ? item.selected_option_ids.filter((value): value is string => typeof value === 'string')
          : undefined;
      return {
        questionId,
        selectedOptionIds,
        text: normalizeString(item.text),
        otherText: normalizeString(item.otherText) || normalizeString(item.other_text),
      };
    })
    .filter((item): item is UserInputAnswer => Boolean(item));
};

export const parseUserInputResultCandidate = (candidate: string): UserInputResult | undefined => {
  const text = candidate.trim();
  if (!text || !text.includes(USER_INPUT_RESULT_SCHEMA)) return undefined;
  try {
    const parsed = JSON.parse(text) as unknown;
    if (!isRecord(parsed) || parsed.schema !== USER_INPUT_RESULT_SCHEMA) return undefined;
    const requestId = normalizeString(parsed.requestId) || normalizeString(parsed.request_id);
    const questions = normalizeUserInputQuestions(parsed.questions);
    const status = normalizeString(parsed.status) as UserInputRequestStatus | undefined;
    if (!requestId || !questions.length || !status) return undefined;
    return {
      schema: USER_INPUT_RESULT_SCHEMA,
      requestId,
      conversationId: normalizeString(parsed.conversationId) || normalizeString(parsed.conversation_id),
      title: normalizeString(parsed.title),
      reason: normalizeString(parsed.reason),
      status,
      questions,
      answers: normalizeUserInputAnswers(parsed.answers),
      createdAt: typeof parsed.createdAt === 'number' ? parsed.createdAt : Date.now(),
      resolvedAt: typeof parsed.resolvedAt === 'number' ? parsed.resolvedAt : Date.now(),
      elapsedMs: typeof parsed.elapsedMs === 'number' ? parsed.elapsedMs : 0,
      message: normalizeString(parsed.message),
    };
  } catch {
    return undefined;
  }
};

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

export const extractUserInputResultsFromTools = (
  messages: Array<IMessageToolGroup | IMessageAcpToolCall | IMessageToolCall>
): UserInputResult[] =>
  messages.flatMap((message) => {
    const outputs =
      message.type === 'tool_group'
        ? getToolGroupOutput(message)
        : message.type === 'acp_tool_call'
          ? getAcpToolOutput(message)
          : getToolCallOutput(message);
    return outputs
      .map(parseUserInputResultCandidate)
      .filter((payload): payload is UserInputResult => Boolean(payload));
  });

