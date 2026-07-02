/**
 * @license
 * Copyright 2026 DeepOrganiser (deepscientist.cc)
 * SPDX-License-Identifier: Apache-2.0
 */

import { ipcBridge } from '@/common';
import type {
  MedicalEvidenceSettingsTestConnectionRequest,
  MedicalEvidenceSettingsTestConnectionResult,
} from '@/common/adapter/ipcBridge';

const DEFAULT_PAPERCLIP_BASE_URL = 'https://paperclip.gxl.ai';
const DEFAULT_TIMEOUT_MS = 30000;

type PaperclipToolsListResponse = {
  result?: {
    tools?: Array<{ name?: string }>;
  };
  error?: {
    message?: string;
  };
};

function normalizePaperclipBaseUrl(value?: string): string {
  const raw = (value || DEFAULT_PAPERCLIP_BASE_URL).trim() || DEFAULT_PAPERCLIP_BASE_URL;
  const url = new URL(raw);
  if (url.protocol !== 'https:' && url.protocol !== 'http:') {
    throw new Error('PaperClip Base URL 需要使用 http 或 https');
  }

  const pathname = url.pathname.replace(/\/+$/u, '');
  if (pathname.endsWith('/mcp')) {
    url.pathname = pathname.slice(0, -4) || '/';
  } else {
    url.pathname = pathname || '';
  }
  url.search = '';
  url.hash = '';
  return url.toString().replace(/\/+$/u, '');
}

async function testPaperclipConnection({
  paperclipApiKey,
  paperclipBaseUrl,
  timeoutMs,
}: MedicalEvidenceSettingsTestConnectionRequest): Promise<MedicalEvidenceSettingsTestConnectionResult> {
  const apiKey = paperclipApiKey?.trim();
  if (!apiKey) {
    return {
      ok: false,
      message: '请先填写 PaperClip API Key',
    };
  }

  let normalizedBaseUrl: string;
  try {
    normalizedBaseUrl = normalizePaperclipBaseUrl(paperclipBaseUrl);
  } catch (error) {
    return {
      ok: false,
      message: error instanceof Error ? error.message : 'PaperClip Base URL 无效',
    };
  }

  const controller = new AbortController();
  const timeout = Number.isFinite(timeoutMs) && timeoutMs ? timeoutMs : DEFAULT_TIMEOUT_MS;
  const timer = setTimeout(() => controller.abort(), timeout);

  try {
    const response = await fetch(`${normalizedBaseUrl}/mcp`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-API-Key': apiKey,
      },
      body: JSON.stringify({
        jsonrpc: '2.0',
        id: `openscience-medical-evidence-settings-test-${Date.now()}`,
        method: 'tools/list',
        params: {},
      }),
      signal: controller.signal,
    });

    const text = await response.text();
    if (!response.ok) {
      const suffix = text.trim() ? `：${text.trim().slice(0, 180)}` : '';
      return {
        ok: false,
        status: response.status,
        normalizedBaseUrl,
        message: `PaperClip 返回 ${response.status}${suffix}`,
      };
    }

    let payload: PaperclipToolsListResponse;
    try {
      payload = JSON.parse(text) as PaperclipToolsListResponse;
    } catch {
      return {
        ok: false,
        status: response.status,
        normalizedBaseUrl,
        message: 'PaperClip 返回内容不是有效 JSON',
      };
    }

    if (payload.error?.message) {
      return {
        ok: false,
        status: response.status,
        normalizedBaseUrl,
        message: payload.error.message,
      };
    }

    const tools = Array.isArray(payload.result?.tools) ? payload.result.tools : [];
    const hasPaperclipTool = tools.some((tool) => tool.name === 'paperclip');
    if (!hasPaperclipTool) {
      return {
        ok: false,
        status: response.status,
        toolCount: tools.length,
        normalizedBaseUrl,
        message: 'MCP connected, but the PaperClip tool was not found.',
      };
    }

    return {
      ok: true,
      status: response.status,
      toolCount: tools.length,
      normalizedBaseUrl,
      message: 'PaperClip MCP connected',
    };
  } catch (error) {
    const isAbort = error instanceof Error && error.name === 'AbortError';
    return {
      ok: false,
      normalizedBaseUrl,
      message: isAbort ? 'PaperClip connection timed out' : error instanceof Error ? error.message : 'PaperClip connection failed',
    };
  } finally {
    clearTimeout(timer);
  }
}

export function initMedicalEvidenceSettingsBridge(): void {
  ipcBridge.medicalEvidenceSettings.testPaperclipConnection.provider(testPaperclipConnection);
}
