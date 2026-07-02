/**
 * @license
 * Copyright 2025 DeepOrganiser (deepscientist.cc)
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Built-in MCP server for structured user input.
 *
 * Runs as a standalone stdio process spawned by DeepOrganiser Core. It talks
 * to the Electron main-process user-input gateway over localhost, because the
 * Core backend is distributed as a binary and cannot host this desktop-native
 * interaction directly.
 */

import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { z } from 'zod';
import { BUILTIN_USER_INPUT_NAME } from './constants';

const optionSchema = z.object({
  id: z.string().min(1),
  label: z.string().min(1),
  description: z.string().optional(),
  recommended: z.boolean().optional(),
});

const questionSchema = z.object({
  id: z.string().min(1),
  type: z.enum(['single_choice', 'multi_choice', 'text']),
  title: z.string().min(1),
  description: z.string().optional(),
  required: z.boolean().optional(),
  options: z.array(optionSchema).optional(),
  allowOther: z.boolean().optional(),
  otherLabel: z.string().optional(),
  placeholder: z.string().optional(),
});

type UserInputGatewayResult = {
  schema: string;
  requestId: string;
  status: string;
  [key: string]: unknown;
};

async function callGateway(payload: unknown): Promise<UserInputGatewayResult> {
  const url = process.env.DEEPORGANISER_USER_INPUT_URL;
  const token = process.env.DEEPORGANISER_USER_INPUT_TOKEN;
  if (!url || !token) {
    throw new Error('DeepOrganiser user input gateway is unavailable. Ask the user in normal text.');
  }

  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    throw new Error(`DeepOrganiser user input gateway failed (${response.status}). Ask the user in normal text.`);
  }

  return (await response.json()) as UserInputGatewayResult;
}

async function main() {
  const server = new McpServer({
    name: BUILTIN_USER_INPUT_NAME,
    version: '1.0.0',
  });

  server.tool(
    'user_input',
    `Ask the user structured questions and wait for their answers.

Use this when important missing information would change the answer, evidence applicability, safety advice, or next action.
Prefer at most 3 concise questions. Use single_choice, multi_choice, or text. For medical evidence mode, ask for clinically relevant missing context rather than guessing.

If the tool returns status "timeout", "cancelled", "skipped", or "unavailable", continue safely and ask in normal text only if the missing information is still necessary.`,
    {
      title: z.string().optional().describe('Short title shown in the question card.'),
      reason: z.string().optional().describe('Why this information is needed. Keep it concise.'),
      conversationId: z.string().optional().describe('Optional conversation id. Usually omit it; the UI can claim it.'),
      timeoutMs: z.number().min(15_000).max(600_000).optional(),
      questions: z.array(questionSchema).min(1).max(5),
    },
    async ({ title, reason, conversationId, timeoutMs, questions }) => {
      try {
        const result = await callGateway({
          title,
          reason,
          conversationId,
          timeoutMs,
          questions,
        });
        return {
          content: [{ type: 'text' as const, text: JSON.stringify(result) }],
        };
      } catch (error) {
        const now = Date.now();
        const result = {
          schema: 'deeporganiser.user_input.result.v1',
          requestId: `unavailable-${now.toString(36)}`,
          conversationId,
          title,
          reason,
          status: 'unavailable',
          questions,
          createdAt: now,
          resolvedAt: now,
          elapsedMs: 0,
          message: error instanceof Error ? error.message : String(error),
        };
        return {
          content: [{ type: 'text' as const, text: JSON.stringify(result) }],
          isError: false,
        };
      }
    }
  );

  const transport = new StdioServerTransport();
  await server.connect(transport);
}

main().catch((error) => {
  console.error('[builtin-user-input] fatal:', error);
  process.exit(1);
});

