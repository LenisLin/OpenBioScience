/**
 * @license
 * Copyright 2025 DeepOrganiser (deepscientist.cc)
 * SPDX-License-Identifier: Apache-2.0
 */

import { randomUUID } from 'node:crypto';
import http from 'node:http';
import { ipcBridge } from '@/common';
import {
  USER_INPUT_RESULT_SCHEMA,
  normalizeUserInputAnswers,
  normalizeUserInputQuestions,
  type UserInputAnswer,
  type UserInputBridgeResult,
  type UserInputRequest,
  type UserInputRequestInput,
  type UserInputResult,
} from '@/common/chat/userInput';

const DEFAULT_TIMEOUT_MS = 180_000;
const MIN_TIMEOUT_MS = 15_000;
const MAX_TIMEOUT_MS = 10 * 60_000;

type PendingUserInput = {
  request: UserInputRequest;
  resolve: (result: UserInputResult) => void;
  timer: NodeJS.Timeout;
};

type UserInputGatewayState = {
  port?: number;
  token?: string;
};

const pending = new Map<string, PendingUserInput>();
const gateway: UserInputGatewayState = {};
let gatewayServer: http.Server | null = null;

const clampTimeout = (value: unknown): number => {
  const numberValue = typeof value === 'number' && Number.isFinite(value) ? value : DEFAULT_TIMEOUT_MS;
  return Math.min(MAX_TIMEOUT_MS, Math.max(MIN_TIMEOUT_MS, numberValue));
};

const createResult = (
  request: UserInputRequest,
  status: UserInputResult['status'],
  options: { answers?: UserInputAnswer[]; message?: string } = {}
): UserInputResult => {
  const resolvedAt = Date.now();
  return {
    schema: USER_INPUT_RESULT_SCHEMA,
    requestId: request.requestId,
    conversationId: request.conversationId,
    title: request.title,
    reason: request.reason,
    status,
    questions: request.questions,
    answers: options.answers,
    createdAt: request.createdAt,
    resolvedAt,
    elapsedMs: resolvedAt - request.createdAt,
    message: options.message,
  };
};

const resolvePending = (
  requestId: string,
  status: UserInputResult['status'],
  options: { answers?: UserInputAnswer[]; message?: string } = {}
): UserInputBridgeResult => {
  const item = pending.get(requestId);
  if (!item) {
    return { ok: false, error: 'request_not_found' };
  }
  pending.delete(requestId);
  clearTimeout(item.timer);
  const result = createResult(item.request, status, options);
  item.resolve(result);
  ipcBridge.conversation.userInput.resolved.emit(result);
  return { ok: true, result };
};

const createRequest = (input: UserInputRequestInput): Promise<UserInputResult> => {
  const questions = normalizeUserInputQuestions(input.questions);
  if (!questions.length) {
    const now = Date.now();
    return Promise.resolve({
      schema: USER_INPUT_RESULT_SCHEMA,
      requestId: input.requestId || randomUUID(),
      conversationId: input.conversationId,
      title: input.title,
      reason: input.reason,
      status: 'unavailable',
      questions: [],
      createdAt: now,
      resolvedAt: now,
      elapsedMs: 0,
      message: 'No valid questions were provided.',
    });
  }

  const timeoutMs = clampTimeout(input.timeoutMs);
  const createdAt = Date.now();
  const request: UserInputRequest = {
    requestId: input.requestId || randomUUID(),
    conversationId: input.conversationId,
    title: input.title,
    reason: input.reason,
    questions,
    timeoutMs,
    createdAt,
    expiresAt: createdAt + timeoutMs,
    status: 'shown',
  };

  return new Promise<UserInputResult>((resolve) => {
    const timer = setTimeout(() => {
      resolvePending(request.requestId, 'timeout', {
        message: 'No user input received before timeout. Ask in normal text if still needed.',
      });
    }, timeoutMs);
    pending.set(request.requestId, { request, resolve, timer });
    ipcBridge.conversation.userInput.requested.emit(request);
  });
};

function readJsonBody(req: http.IncomingMessage): Promise<unknown> {
  return new Promise((resolve, reject) => {
    let raw = '';
    req.setEncoding('utf8');
    req.on('data', (chunk) => {
      raw += chunk;
      if (raw.length > 1_000_000) {
        req.destroy();
        reject(new Error('body_too_large'));
      }
    });
    req.on('end', () => {
      if (!raw.trim()) {
        resolve(undefined);
        return;
      }
      try {
        resolve(JSON.parse(raw));
      } catch (error) {
        reject(error);
      }
    });
    req.on('error', reject);
  });
}

function sendJson(res: http.ServerResponse, status: number, body: unknown): void {
  res.statusCode = status;
  res.setHeader('Content-Type', 'application/json');
  res.end(JSON.stringify(body));
}

const isAuthorized = (req: http.IncomingMessage): boolean => {
  const header = req.headers.authorization;
  return typeof header === 'string' && header === `Bearer ${gateway.token}`;
};

async function handleGatewayRequest(req: http.IncomingMessage, res: http.ServerResponse): Promise<void> {
  if (req.method !== 'POST' || req.url !== '/user-input/request') {
    sendJson(res, 404, { error: 'not_found' });
    return;
  }
  if (!isAuthorized(req)) {
    sendJson(res, 401, { error: 'unauthorized' });
    return;
  }
  try {
    const body = (await readJsonBody(req)) as UserInputRequestInput | undefined;
    if (!body || typeof body !== 'object') {
      sendJson(res, 400, { error: 'invalid_body' });
      return;
    }
    const result = await createRequest(body);
    sendJson(res, 200, result);
  } catch (error) {
    sendJson(res, 500, { error: error instanceof Error ? error.message : String(error) });
  }
}

export async function startUserInputGateway(): Promise<UserInputGatewayState> {
  if (gatewayServer && gateway.port && gateway.token) {
    return gateway;
  }

  gateway.token = randomUUID();
  gatewayServer = http.createServer((req, res) => {
    void handleGatewayRequest(req, res);
  });

  await new Promise<void>((resolve, reject) => {
    gatewayServer?.once('error', reject);
    gatewayServer?.listen(0, '127.0.0.1', () => {
      const address = gatewayServer?.address();
      if (address && typeof address === 'object') {
        gateway.port = address.port;
      }
      resolve();
    });
  });

  return gateway;
}

export function getUserInputGatewayEnv(): Record<string, string> {
  if (!gateway.port || !gateway.token) return {};
  return {
    DEEPORGANISER_USER_INPUT_URL: `http://127.0.0.1:${gateway.port}/user-input/request`,
    DEEPORGANISER_USER_INPUT_TOKEN: gateway.token,
  };
}

export function initUserInputBridge(): void {
  ipcBridge.conversation.userInput.request.provider(createRequest);
  ipcBridge.conversation.userInput.listPending.provider(async (params) => {
    const conversationId = params && 'conversation_id' in params ? params.conversation_id : undefined;
    return [...pending.values()]
      .map((item) => item.request)
      .filter((request) => !conversationId || !request.conversationId || request.conversationId === conversationId);
  });
  ipcBridge.conversation.userInput.claim.provider(async ({ requestId, conversationId }) => {
    const item = pending.get(requestId);
    if (!item) return { ok: false, error: 'request_not_found' };
    if (!item.request.conversationId) {
      item.request.conversationId = conversationId;
      ipcBridge.conversation.userInput.requested.emit(item.request);
    }
    return { ok: true };
  });
  ipcBridge.conversation.userInput.answer.provider(async ({ requestId, answers }) =>
    resolvePending(requestId, 'answered', { answers: normalizeUserInputAnswers(answers) })
  );
  ipcBridge.conversation.userInput.cancel.provider(async ({ requestId, reason }) =>
    resolvePending(requestId, reason === 'skipped' ? 'skipped' : 'cancelled', { message: 'User skipped this question.' })
  );

  void startUserInputGateway().catch((error) => {
    console.error('[UserInputBridge] Failed to start gateway:', error);
  });
}

