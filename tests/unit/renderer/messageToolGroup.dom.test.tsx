/**
 * @license
 * Copyright 2026 DeepOrganiser (deepscientist.cc)
 * SPDX-License-Identifier: Apache-2.0
 */

import type { IMessageToolGroup } from '@/common/chat/chatLib';
import MessageToolGroup from '@/renderer/pages/conversation/Messages/components/MessageToolGroup';
import { render, screen } from '@testing-library/react';
import React from 'react';
import { describe, expect, it, vi } from 'vitest';

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
    conversation: { confirmMessage: { invoke: vi.fn() } },
    fs: { getImageBase64: { invoke: vi.fn() } },
  },
}));

describe('MessageToolGroup command output', () => {
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
});
