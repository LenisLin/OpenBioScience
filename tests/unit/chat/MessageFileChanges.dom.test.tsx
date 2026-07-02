/**
 * @license
 * Copyright 2025 DeepOrganiser (deepscientist.cc)
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ipcBridge } from '@/common';
import { ConversationProvider } from '@/renderer/hooks/context/ConversationContext';
import MessageFileChanges from '@/renderer/pages/conversation/Messages/MessageFileChanges';
import type { FileChangeInfo } from '@/renderer/utils/file/diffUtils';

const messageApi = vi.hoisted(() => ({
  success: vi.fn(),
  warning: vi.fn(),
  error: vi.fn(),
}));
const confirmMock = vi.hoisted(() => vi.fn());

vi.mock('@/common', () => ({
  ipcBridge: {
    fs: {
      readFile: { invoke: vi.fn() },
      writeFile: { invoke: vi.fn() },
      removeEntry: { invoke: vi.fn() },
    },
  },
}));

vi.mock('@/renderer/hooks/file/usePreviewLauncher', () => ({
  usePreviewLauncher: () => ({
    launchPreview: vi.fn(),
  }),
}));

vi.mock('@arco-design/web-react', () => ({
  Button: ({
    children,
    disabled,
    loading,
    onClick,
  }: {
    children?: React.ReactNode;
    disabled?: boolean;
    loading?: boolean;
    onClick?: (event: { stopPropagation: () => void }) => void;
  }) => (
    <button type='button' disabled={disabled || loading} onClick={() => onClick?.({ stopPropagation: vi.fn() })}>
      {children}
    </button>
  ),
  Message: {
    useMessage: () => [messageApi, null],
  },
  Modal: {
    confirm: confirmMock,
  },
}));

vi.mock('@icon-park/react', () => ({
  Back: () => <span data-testid='back-icon' />,
  DifferenceSet: () => <span data-testid='diff-icon' />,
  Down: () => <span data-testid='down-icon' />,
  PreviewOpen: () => <span data-testid='preview-icon' />,
}));

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string, options?: Record<string, unknown>) => {
      if (typeof options?.defaultValue === 'string') return options.defaultValue;
      if (key === 'messages.undo') return 'Undo';
      if (key === 'messages.review') return 'Review';
      return key;
    },
  }),
}));

const diff = ['--- a/src/app.ts', '+++ b/src/app.ts', '@@ -1,2 +1,3 @@', ' a', '+c', ' b', ''].join('\n');

const fileChange: FileChangeInfo = {
  file_name: 'app.ts',
  fullPath: 'src/app.ts',
  insertions: 1,
  deletions: 0,
  diff,
};

describe('MessageFileChanges undo', () => {
  beforeEach(() => {
    vi.mocked(ipcBridge.fs.readFile.invoke).mockReset();
    vi.mocked(ipcBridge.fs.writeFile.invoke).mockReset();
    vi.mocked(ipcBridge.fs.removeEntry.invoke).mockReset();
    messageApi.success.mockReset();
    messageApi.warning.mockReset();
    messageApi.error.mockReset();
    confirmMock.mockReset();
    confirmMock.mockImplementation(({ onOk }: { onOk?: () => Promise<void> | void }) => onOk?.());
  });

  it('confirms before restoring reversible workspace diffs', async () => {
    let currentContent = 'a\nc\nb\n';
    vi.mocked(ipcBridge.fs.readFile.invoke).mockImplementation(() => Promise.resolve(currentContent));
    vi.mocked(ipcBridge.fs.writeFile.invoke).mockImplementation(({ data }) => {
      currentContent = data;
      return Promise.resolve(true);
    });

    render(
      <ConversationProvider value={{ conversation_id: 'c1', workspace: '/repo', type: 'codex' }}>
        <MessageFileChanges diffsChanges={[fileChange]} />
      </ConversationProvider>
    );

    const undoButton = await screen.findByRole('button', { name: /Undo/ });
    fireEvent.click(undoButton);

    expect(confirmMock).toHaveBeenCalledWith(expect.objectContaining({ title: 'Undo file changes?' }));
    await waitFor(() => {
      expect(ipcBridge.fs.writeFile.invoke).toHaveBeenCalledWith({ path: '/repo/src/app.ts', data: 'a\nb\n' });
    });
    expect(ipcBridge.fs.readFile.invoke).toHaveBeenCalledWith({ path: '/repo/src/app.ts', workspace: '/repo' });
    expect(messageApi.success).toHaveBeenCalledWith('Changes undone');
    await waitFor(() => {
      expect(screen.getByRole('button', { name: /Undone/ })).toBeDisabled();
    });
  });

  it('disables undo when the current file no longer matches the diff', async () => {
    vi.mocked(ipcBridge.fs.readFile.invoke).mockResolvedValue('different\ncontent\n');

    render(
      <ConversationProvider value={{ conversation_id: 'c1', workspace: '/repo', type: 'codex' }}>
        <MessageFileChanges diffsChanges={[fileChange]} />
      </ConversationProvider>
    );

    const unavailableButton = await screen.findByRole('button', { name: /Unavailable/ });
    expect(unavailableButton).toBeDisabled();
    fireEvent.click(unavailableButton);
    expect(confirmMock).not.toHaveBeenCalled();
    expect(ipcBridge.fs.writeFile.invoke).not.toHaveBeenCalled();
  });
});
