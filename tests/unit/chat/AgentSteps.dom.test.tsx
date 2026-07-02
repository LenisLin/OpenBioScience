import { fireEvent, render, screen } from '@testing-library/react';
import React from 'react';
import { describe, expect, it, vi } from 'vitest';

import { ConversationProvider } from '@/renderer/hooks/context/ConversationContext';
import AgentSteps, {
  AgentRuntimeProgressPill,
  AgentStepsProgressPill,
} from '@/renderer/pages/conversation/Messages/agent-steps/AgentSteps';

vi.mock('@/renderer/hooks/file/usePreviewLauncher', () => ({
  usePreviewLauncher: () => ({
    launchPreview: vi.fn(),
  }),
}));

vi.mock('@/renderer/components/media/LocalImageView', () => ({
  default: (props: { src: string; alt: string; className?: string }) => <img data-testid='local-image' {...props} />,
}));

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string, options?: Record<string, unknown>) => {
      const template = typeof options?.defaultValue === 'string' ? options.defaultValue : key;
      return template.replace(/\{\{(\w+)\}\}/g, (_match, name: string) => String(options?.[name] ?? `{{${name}}}`));
    },
  }),
}));

describe('AgentSteps', () => {
  it('renders 1Code-style grouped exploration, command, and file change steps', () => {
    const { container } = render(
      <AgentSteps
        messages={
          [
            {
              id: 'read',
              type: 'tool_call',
              conversation_id: 'c1',
              content: {
                call_id: 'read-1',
                name: 'Read',
                status: 'completed',
                args: { file_path: 'src/App.tsx' },
              },
            },
            {
              id: 'grep',
              type: 'tool_call',
              conversation_id: 'c1',
              content: {
                call_id: 'grep-1',
                name: 'Grep',
                status: 'completed',
                args: { pattern: 'AgentSteps', path: 'src' },
              },
            },
            {
              id: 'cmd',
              type: 'tool_call',
              conversation_id: 'c1',
              content: {
                call_id: 'cmd-1',
                name: 'Bash',
                status: 'running',
                args: { command: 'bun test tests/unit/chat/AgentSteps.dom.test.tsx' },
                output: 'running...',
              },
            },
            {
              id: 'write',
              type: 'tool_group',
              conversation_id: 'c1',
              content: [
                {
                  call_id: 'write-1',
                  name: 'WriteFile',
                  description: 'created file',
                  render_output_as_markdown: false,
                  status: 'Success',
                  result_display: {
                    file_name: 'src/new.ts',
                    file_diff: '--- a/src/new.ts\n+++ b/src/new.ts\n@@ -0,0 +1 @@\n+export const value = 1;\n',
                  },
                },
              ],
            },
          ] as never
        }
      />
    );

    expect(screen.getByText(/Read 1 file/)).toBeInTheDocument();
    expect(screen.getByText(/Searched code/)).toBeInTheDocument();
    expect(container.querySelector('.agent-steps-header--running')).toBeInTheDocument();
    expect(container.querySelector('.agent-step-running-sweep')).toBeInTheDocument();
    expect(container.querySelector('.agent-status-icon')).toBeInTheDocument();
    expect(container.querySelector('.agent-steps-progress-pill')).not.toBeInTheDocument();
    expect(screen.queryByText(/Processed 0s|已处理 0s/)).not.toBeInTheDocument();
    expect(container.querySelector('.agent-steps-duration-line')).not.toBeInTheDocument();
    expect(container.querySelector('.agent-steps-body-shell.is-expanded')).toBeInTheDocument();
    expect(screen.getByText('Inspected files')).toBeInTheDocument();
    expect(screen.getByText('Running tests:')).toBeInTheDocument();
    expect(screen.getByText('Created new.ts')).toBeInTheDocument();
    expect(screen.getByText('new.ts')).toBeInTheDocument();
  });

  it('renders the running progress pill as a standalone input-adjacent element', () => {
    const { container } = render(
      <AgentStepsProgressPill
        messages={
          [
            {
              id: 'cmd',
              type: 'tool_call',
              conversation_id: 'c1',
              content: {
                call_id: 'cmd-1',
                name: 'Bash',
                status: 'running',
                args: { command: 'bun test' },
              },
            },
          ] as never
        }
      />
    );

    expect(container.querySelector('.agent-steps-progress-pill--floating')).toBeInTheDocument();
    expect(container.querySelector('.agent-steps-progress-icon.agent-status-icon--spin')).toBeInTheDocument();
    expect(screen.getByText('Ran 1 command')).toBeInTheDocument();
  });

  it('uses the runtime start timestamp for the input-adjacent progress timer', () => {
    const runtimeView = {
      conversation_id: 'c1',
      activeTurnId: 'turn-1',
      activeStartedAt: Date.now() - 2500,
      state: 'running',
      isProcessing: true,
      canSendMessage: false,
      pendingConfirmations: 0,
      hasBackendRuntime: true,
      localSubmitting: false,
      hydrated: true,
      localStopping: false,
    } as const;

    const { container } = render(<AgentRuntimeProgressPill runtimeView={runtimeView} />);

    expect(container.querySelector('.agent-steps-progress-pill--running')).toBeInTheDocument();
    expect(screen.getByRole('status')).toHaveTextContent(/Working · 2s/);
  });

  it('keeps Codex execution details collapsed by default', () => {
    const { container } = render(
      <ConversationProvider value={{ conversation_id: 'c1', workspace: '/repo', type: 'codex' }}>
        <AgentSteps
          messages={
            [
              {
                id: 'cmd',
                type: 'tool_call',
                conversation_id: 'c1',
                content: {
                  call_id: 'cmd-1',
                  name: 'Bash',
                  status: 'running',
                  args: { command: 'bun test tests/unit/chat/AgentSteps.dom.test.tsx' },
                  output: 'running...',
                },
              },
            ] as never
          }
        />
      </ConversationProvider>
    );

    expect(container.querySelector('.agent-steps--quiet')).toBeInTheDocument();
    expect(container.querySelector('.agent-steps-body-shell.is-collapsed')).toBeInTheDocument();
    expect(screen.getByText('Ran 1 command')).toBeInTheDocument();
  });

  it('expands Codex execution details from the summary and preserves command contents', () => {
    const { container } = render(
      <ConversationProvider value={{ conversation_id: 'c1', workspace: '/repo', type: 'codex' }}>
        <AgentSteps
          messages={
            [
              {
                id: 'ok',
                type: 'tool_call',
                conversation_id: 'c1',
                content: {
                  call_id: 'cmd-ok',
                  name: 'Bash',
                  status: 'completed',
                  args: { command: 'ssh user@example.com "echo ok"' },
                  output: 'ok',
                },
              },
              {
                id: 'fail',
                type: 'tool_call',
                conversation_id: 'c1',
                content: {
                  call_id: 'cmd-fail',
                  name: 'Bash',
                  status: 'error',
                  args: { command: 'ssh user@example.com "exit 1"' },
                  output: 'failed',
                },
              },
            ] as never
          }
        />
      </ConversationProvider>
    );

    expect(container.querySelector('.agent-steps-body-shell.is-collapsed')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: /Ran 2 commands/ }));

    expect(container.querySelector('.agent-steps-body-shell.is-expanded')).toBeInTheDocument();
    expect(screen.getByText('$ ssh user@example.com "echo ok"')).toBeInTheDocument();
    expect(screen.getByText('$ ssh user@example.com "exit 1"')).toBeInTheDocument();
    expect(screen.getByText('成功')).toBeInTheDocument();
    expect(screen.getByText('失败')).toBeInTheDocument();
  });

  it('shows command result labels in command cards', () => {
    render(
      <AgentSteps
        messages={
          [
            {
              id: 'ok',
              type: 'tool_call',
              conversation_id: 'c1',
              content: {
                call_id: 'cmd-ok',
                name: 'Bash',
                status: 'completed',
                args: { command: 'ssh user@example.com "echo ok"' },
                output: 'ok',
              },
            },
            {
              id: 'fail',
              type: 'tool_call',
              conversation_id: 'c1',
              content: {
                call_id: 'cmd-fail',
                name: 'Bash',
                status: 'error',
                args: { command: 'ssh user@example.com "exit 1"' },
                output: 'failed',
              },
            },
          ] as never
        }
      />
    );

    expect(screen.getByText('成功')).toBeInTheDocument();
    expect(screen.getByText('失败')).toBeInTheDocument();
  });

  it('expands long command output from the more-output control into a scrollable block', () => {
    const output = Array.from({ length: 8 }, (_item, index) => `line ${index + 1}`).join('\n');
    const { container } = render(
      <AgentSteps
        messages={
          [
            {
              id: 'long-output',
              type: 'tool_call',
              conversation_id: 'c1',
              content: {
                call_id: 'cmd-long',
                name: 'Bash',
                status: 'completed',
                args: { command: 'printf long-output' },
                output,
              },
            },
          ] as never
        }
      />
    );

    expect(screen.getByText(/line 1/)).toBeInTheDocument();
    expect(screen.queryByText(/line 8/)).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: /More output available/ }));

    expect(screen.getByText(/line 8/)).toBeInTheDocument();
    expect(container.querySelector('.agent-command-output--full')).toBeInTheDocument();
  });
});
