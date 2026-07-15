/**
 * @license
 * Copyright 2026 DeepOrganiser (deepscientist.cc)
 * SPDX-License-Identifier: Apache-2.0
 */

import type { IMessageToolGroup } from '@/common/chat/chatLib';
import MessageToolGroup from '@/renderer/pages/conversation/Messages/components/MessageToolGroup';
import { fireEvent, render, screen } from '@testing-library/react';
import React from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  confirmMessageInvoke: vi.fn(),
}));

vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (key: string) => key, i18n: { language: 'en' } }),
}));

vi.mock('@renderer/components/chat/CollapsibleContent', () => ({
  default: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}));

vi.mock('@renderer/components/Markdown', () => ({
  default: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}));

vi.mock('@renderer/components/media/LocalImageView', () => ({
  default: () => null,
}));

vi.mock('@/renderer/components/base/FileChangesPanel', () => ({
  default: () => null,
}));

vi.mock('@/renderer/hooks/file/useDiffPreviewHandlers', () => ({
  useDiffPreviewHandlers: () => ({ handleFileClick: vi.fn(), handleDiffClick: vi.fn() }),
}));

vi.mock('@/common', () => ({
  ipcBridge: {
    conversation: { confirmMessage: { invoke: mocks.confirmMessageInvoke } },
    fs: { getImageBase64: { invoke: vi.fn() } },
  },
}));

describe('MessageToolGroup command output', () => {
  beforeEach(() => {
    mocks.confirmMessageInvoke.mockReset();
    mocks.confirmMessageInvoke.mockResolvedValue(undefined);
  });

  it('renders command-like tool results as an output block instead of raw JSON', () => {
    const message: IMessageToolGroup = {
      id: 'tool-group-1',
      conversation_id: 'conversation-1',
      type: 'tool_group',
      content: [
        {
          call_id: 'call-1',
          description: JSON.stringify({ command: 'bun test tests/unit/chat/AgentSteps.dom.test.tsx' }),
          name: 'Bash',
          render_output_as_markdown: false,
          status: 'Success',
          result_display: {
            stdout: '25 passed',
            stderr: '1 warning',
            exitCode: 0,
          },
        },
      ],
    };

    const { container } = render(<MessageToolGroup message={message} />);

    expect(container.querySelector('.message-tool-command-result')).toBeInTheDocument();
    expect(screen.getByText('$ bun test tests/unit/chat/AgentSteps.dom.test.tsx')).toBeInTheDocument();
    expect(screen.getByText('25 passed')).toBeInTheDocument();
    expect(screen.getByText('1 warning')).toBeInTheDocument();
    expect(screen.getByText('exit 0')).toBeInTheDocument();
    expect(screen.queryByText(/"stdout"/)).not.toBeInTheDocument();
  });

  it('renders structured execution metadata without leaking protocol fields', () => {
    const message = {
      id: 'tool-group-structured',
      conversation_id: 'conversation-1',
      type: 'tool_group',
      content: [
        {
          call_id: 'call-secret',
          description: {
            available_decisions: ['approved', 'abort'],
            call_id: 'call-secret',
            command: ['/usr/bin/bash', '-lc', 'pwd && rg -n CRC .'],
            cwd: '/workspace/human_CRC',
            reason: 'Inspect local reproduction materials.',
            turn_id: 'turn-secret',
          },
          name: 'execute',
          render_output_as_markdown: false,
          status: 'Executing',
        },
      ],
    } as unknown as IMessageToolGroup;

    const { container } = render(<MessageToolGroup message={message} />);

    expect(container).toHaveTextContent('$ /usr/bin/bash -lc pwd && rg -n CRC .');
    expect(container).toHaveTextContent('cwd: /workspace/human_CRC');
    expect(container).toHaveTextContent('Inspect local reproduction materials.');
    expect(screen.queryByText(/available_decisions/)).not.toBeInTheDocument();
    expect(screen.queryByText(/turn-secret/)).not.toBeInTheDocument();
  });

  it('passes always_allow when an MCP tool is allowed permanently', () => {
    const message: IMessageToolGroup = {
      id: 'tool-group-2',
      conversation_id: 'conversation-1',
      type: 'tool_group',
      content: [
        {
          call_id: 'call-mcp-1',
          description: '',
          name: 'science_artifact',
          render_output_as_markdown: false,
          status: 'Confirming',
          confirmationDetails: {
            type: 'mcp',
            title: 'Allow MCP',
            tool_name: 'science_artifact',
            tool_display_name: 'science_artifact',
            server_name: 'openscience',
          },
        },
      ],
    };

    render(<MessageToolGroup message={message} />);
    fireEvent.click(screen.getByLabelText('messages.confirmation.yesAlwaysAllowTool'));
    fireEvent.click(screen.getByText('messages.confirm'));

    expect(mocks.confirmMessageInvoke).toHaveBeenCalledWith(
      expect.objectContaining({
        call_id: 'call-mcp-1',
        confirm_key: 'proceed_always_tool',
        conversation_id: 'conversation-1',
        msg_id: 'tool-group-2',
        always_allow: true,
      })
    );
  });

  it('submits the same confirmation only once while the request is pending', () => {
    mocks.confirmMessageInvoke.mockReturnValue(new Promise(() => undefined));
    const message: IMessageToolGroup = {
      id: 'tool-group-3',
      conversation_id: 'conversation-1',
      type: 'tool_group',
      content: [
        {
          call_id: 'call-mcp-2',
          description: '{"path":"planning/source_audit.json"}',
          name: 'science_artifact',
          render_output_as_markdown: false,
          status: 'Confirming',
          confirmationDetails: {
            type: 'mcp',
            title: 'Allow MCP',
            tool_name: 'publish_report',
            tool_display_name: 'Publish science report',
            server_name: 'openscience-science-artifact',
          },
        },
      ],
    };

    render(<MessageToolGroup message={message} />);
    fireEvent.click(screen.getByLabelText('messages.confirmation.yesAllowOnce'));
    const confirm = screen.getByText('messages.confirm');
    fireEvent.click(confirm);
    fireEvent.click(confirm);

    expect(mocks.confirmMessageInvoke).toHaveBeenCalledTimes(1);
  });
});
