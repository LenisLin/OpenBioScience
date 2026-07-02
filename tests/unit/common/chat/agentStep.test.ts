import { describe, expect, it } from 'vitest';
import { normalizeAgentSteps, summarizeAgentActivity } from '@/common/chat/agentStep';

describe('normalizeAgentSteps', () => {
  it('groups consecutive exploration tools', () => {
    const result = normalizeAgentSteps([
      {
        id: 'm1',
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
        id: 'm2',
        type: 'tool_call',
        conversation_id: 'c1',
        content: {
          call_id: 'grep-1',
          name: 'Grep',
          status: 'running',
          args: { pattern: 'MessageList', path: 'src' },
        },
      },
    ] as never);

    expect(result).toHaveLength(1);
    expect(result[0]).toMatchObject({
      kind: 'explore',
      status: 'running',
      fileCount: 2,
    });
  });

  it('normalizes command tools from tool_group confirmation details', () => {
    const result = normalizeAgentSteps([
      {
        id: 'm1',
        type: 'tool_group',
        conversation_id: 'c1',
        content: [
          {
            call_id: 'cmd-1',
            name: 'Bash',
            description: 'run tests',
            render_output_as_markdown: false,
            status: 'Success',
            result_display: 'ok',
            confirmationDetails: {
              type: 'exec',
              title: 'Run command',
              rootCommand: 'bun',
              command: 'bun test packages/desktop/src/common/chat/agentStep.test.ts',
            },
          },
        ],
      },
    ] as never);

    expect(result).toHaveLength(1);
    expect(result[0]).toMatchObject({
      kind: 'command',
      status: 'completed',
      command: 'bun test packages/desktop/src/common/chat/agentStep.test.ts',
    });
  });

  it('strips markdown fences from command payloads', () => {
    const result = normalizeAgentSteps([
      {
        id: 'm1',
        type: 'tool_call',
        conversation_id: 'c1',
        content: {
          call_id: 'cmd-1',
          name: 'Bash',
          status: 'completed',
          args: {
            command: '```sh\nssh user@example.com "echo ok"\n```',
          },
          output: 'ok',
        },
      },
      {
        id: 'm2',
        type: 'tool_group',
        conversation_id: 'c1',
        content: [
          {
            call_id: 'cmd-2',
            name: 'Bash',
            description: 'run remote command',
            render_output_as_markdown: false,
            status: 'Success',
            result_display: 'ok',
            confirmationDetails: {
              type: 'exec',
              title: 'Run command',
              rootCommand: 'ssh',
              command: '```bash\nssh user@example.com "uptime"\n```',
            },
          },
        ],
      },
    ] as never);

    expect(result).toHaveLength(2);
    expect(result[0]).toMatchObject({
      kind: 'command',
      command: 'ssh user@example.com "echo ok"',
    });
    expect(result[1]).toMatchObject({
      kind: 'command',
      command: 'ssh user@example.com "uptime"',
    });
  });

  it('normalizes WriteFile diffs as file changes', () => {
    const result = normalizeAgentSteps([
      {
        id: 'm1',
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
    ] as never);

    expect(result).toHaveLength(1);
    expect(result[0]).toMatchObject({
      kind: 'file_change',
      filePath: 'src/new.ts',
    });
  });

  it('normalizes ACP execute updates as command steps', () => {
    const result = normalizeAgentSteps([
      {
        id: 'm1',
        type: 'acp_tool_call',
        conversation_id: 'c1',
        content: {
          session_id: 's1',
          update: {
            sessionUpdate: 'tool_call',
            tool_call_id: 'acp-cmd-1',
            status: 'in_progress',
            title: 'Run npm test',
            kind: 'execute',
            rawInput: { command: 'npm test' },
          },
        },
      },
    ] as never);

    expect(result).toHaveLength(1);
    expect(result[0]).toMatchObject({
      kind: 'command',
      status: 'running',
      command: 'npm test',
    });
  });

  it('normalizes single web search tools without requiring an exploration group', () => {
    const result = normalizeAgentSteps([
      {
        id: 'web',
        type: 'tool_call',
        conversation_id: 'c1',
        content: {
          call_id: 'web-1',
          name: 'WebSearch',
          status: 'running',
          args: { query: 'DeepOrganiser Agent UI' },
        },
      },
    ] as never);

    expect(result).toHaveLength(1);
    expect(result[0]).toMatchObject({
      kind: 'web',
      status: 'running',
      query: 'DeepOrganiser Agent UI',
    });
  });

  it('keeps mixed command batches completed while counting failed commands', () => {
    const steps = normalizeAgentSteps([
      {
        id: 'm1',
        type: 'tool_call',
        conversation_id: 'c1',
        content: {
          call_id: 'cmd-1',
          name: 'Bash',
          status: 'completed',
          args: { command: 'bun test' },
          output: 'ok',
        },
      },
      {
        id: 'm2',
        type: 'tool_call',
        conversation_id: 'c1',
        content: {
          call_id: 'cmd-2',
          name: 'Bash',
          status: 'error',
          args: { command: 'bun lint' },
          output: 'lint failed',
        },
      },
    ] as never);

    expect(summarizeAgentActivity(steps)).toMatchObject({
      primaryKind: 'command',
      status: 'completed',
      counts: {
        commands: 2,
        failedCommands: 1,
      },
    });
  });
});
