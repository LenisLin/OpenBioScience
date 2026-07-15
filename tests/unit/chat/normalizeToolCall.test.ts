/**
 * @license
 * Copyright 2025 DeepOrganiser (deepscientist.cc)
 * SPDX-License-Identifier: Apache-2.0
 */

import type { IMessageAcpToolCall } from '@/common/chat/chatLib';
import {
  hasRunningToolMessages,
  normalizeAcpToolCall,
  normalizeAcpToolStatus,
  normalizeToolCall,
} from '@/common/chat/normalizeToolCall';
import { describe, expect, it } from 'vitest';

describe('normalizeAcpToolCall', () => {
  it('preserves generated image paths for grouped tool summaries', () => {
    const message: IMessageAcpToolCall = {
      id: 'ig_test_image',
      conversation_id: 'conv-1',
      type: 'acp_tool_call',
      content: {
        sessionId: 'sess-1',
        update: {
          sessionUpdate: 'tool_call_update',
          tool_call_id: 'ig_test_image',
          status: 'completed',
          title: 'Image generation',
          kind: 'execute',
          raw_output: {
            image: {
              path: '/Users/test/.codex/generated_images/session/ig_test_image.png',
            },
          },
          content: [
            {
              type: 'content',
              content: {
                type: 'text',
                text: 'Revised prompt: 一张小猫照片',
              },
            },
          ],
        },
      },
    };

    const normalized = normalizeAcpToolCall(message);

    expect((normalized as { imagePath?: string } | undefined)?.imagePath).toBe(
      '/Users/test/.codex/generated_images/session/ig_test_image.png'
    );
  });

  it.each(['canceled', 'cancelled'])('normalizes ACP %s updates as canceled', (status) => {
    const message = {
      id: 'tool-canceled',
      conversation_id: 'conv-1',
      type: 'acp_tool_call',
      content: {
        update: {
          sessionUpdate: 'tool_call_update',
          tool_call_id: 'tool-canceled',
          status,
          title: 'Run command',
          kind: 'execute',
        },
      },
    } as never;

    expect(normalizeAcpToolCall(message)?.status).toBe('canceled');
    expect(normalizeAcpToolStatus(status)).toBe('canceled');
  });

  it.each([
    ['failed', 'error'],
    ['canceled', 'canceled'],
    ['cancelled', 'canceled'],
  ] as const)('normalizes generic tool %s updates as %s terminal state', (status, expected) => {
    const message = {
      id: 'generic-terminal',
      conversation_id: 'conv-1',
      type: 'tool_call',
      content: {
        call_id: 'generic-terminal',
        name: 'execute',
        args: {},
        status,
      },
    } as const;

    expect(normalizeToolCall(message)?.status).toBe(expected);
    expect(hasRunningToolMessages([message])).toBe(false);
  });
});
