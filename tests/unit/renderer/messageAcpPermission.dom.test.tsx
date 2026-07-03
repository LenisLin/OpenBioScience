/**
 * @license
 * Copyright 2026 OpenScience contributors
 * SPDX-License-Identifier: Apache-2.0
 */

import type { IMessageAcpPermission } from '@/common/chat/chatLib';
import MessageAcpPermission from '@/renderer/pages/conversation/Messages/acp/MessageAcpPermission';
import { fireEvent, render, screen } from '@testing-library/react';
import React from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  confirmMessageInvoke: vi.fn(),
}));

vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}));

vi.mock('@/common/adapter/ipcBridge', () => ({
  conversation: {
    confirmMessage: {
      invoke: mocks.confirmMessageInvoke,
    },
  },
}));

describe('MessageAcpPermission', () => {
  beforeEach(() => {
    mocks.confirmMessageInvoke.mockReset();
    mocks.confirmMessageInvoke.mockResolvedValue(undefined);
  });

  it('passes always_allow for ACP allow_always options', () => {
    const message: IMessageAcpPermission = {
      id: 'permission-msg-1',
      conversation_id: 'conversation-1',
      type: 'acp_permission',
      content: {
        session_id: 'session-1',
        options: [
          {
            option_id: 'allow-once-option',
            name: 'Allow once',
            kind: 'allow_once',
          },
          {
            option_id: 'allow-always-option',
            name: 'Always allow',
            kind: 'allow_always',
          },
        ],
        tool_call: {
          tool_call_id: 'call-science-artifact-1',
          title: 'science_artifact',
          kind: 'execute',
          raw_input: {
            description: 'Publish Science artifact',
          },
        },
      },
    };

    render(<MessageAcpPermission message={message} />);

    fireEvent.click(screen.getByLabelText('Always allow'));
    fireEvent.click(screen.getByTestId('message-acp-permission-confirm'));

    expect(mocks.confirmMessageInvoke).toHaveBeenCalledWith(
      expect.objectContaining({
        confirm_key: 'allow-always-option',
        msg_id: 'permission-msg-1',
        conversation_id: 'conversation-1',
        call_id: 'call-science-artifact-1',
        always_allow: true,
      })
    );
  });
});
