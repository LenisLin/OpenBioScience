import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  authorizeScienceArtifactExternalFile,
  resolveScienceArtifactWorkspace,
} from '@/process/services/scienceArtifactAuthorization';

describe('scienceArtifactAuthorization', () => {
  let workspaceRoot: string;
  let outsideRoot: string;

  beforeEach(() => {
    workspaceRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'openscience-workspace-'));
    outsideRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'openscience-external-'));
  });

  afterEach(() => {
    fs.rmSync(workspaceRoot, { recursive: true, force: true });
    fs.rmSync(outsideRoot, { recursive: true, force: true });
  });

  it('binds projectRoot to the configured workspace realpath', () => {
    expect(resolveScienceArtifactWorkspace(workspaceRoot, workspaceRoot)).toEqual({
      ok: true,
      workspaceRoot: fs.realpathSync(workspaceRoot),
    });
    expect(resolveScienceArtifactWorkspace(workspaceRoot, outsideRoot)).toEqual({
      ok: false,
      code: 'workspace_mismatch',
      message: 'projectRoot must match the authorized workspace.',
    });
  });

  it('authorizes one exact external file after a real user-input answer', async () => {
    const externalPath = path.join(outsideRoot, 'input.csv');
    fs.writeFileSync(externalPath, 'x,y\n1,2\n', 'utf8');
    const requestAuthorization = vi.fn().mockResolvedValue({
      requestId: 'request-1',
      status: 'answered',
      answers: [{ questionId: 'authorize_external_file', selectedOptionIds: ['allow'] }],
    });

    const result = await authorizeScienceArtifactExternalFile({
      workspaceRoot,
      candidate: externalPath,
      conversationId: 'conversation-1',
      sessionId: 'session-1',
      requestAuthorization,
      now: () => 123,
    });

    expect(result).toEqual({
      status: 'authorized',
      requestId: 'request-1',
      conversationId: 'conversation-1',
      normalizedPath: fs.realpathSync(externalPath),
      scope: 'session_exact_file',
      sessionId: 'session-1',
      authorizedAt: 123,
      expiresOnSessionEnd: true,
    });
    expect(requestAuthorization).toHaveBeenCalledTimes(1);
  });

  it('does not request authorization for workspace files', async () => {
    const workspacePath = path.join(workspaceRoot, 'input.csv');
    fs.writeFileSync(workspacePath, 'x,y\n1,2\n', 'utf8');
    const requestAuthorization = vi.fn();

    await expect(
      authorizeScienceArtifactExternalFile({
        workspaceRoot,
        candidate: workspacePath,
        sessionId: 'session-1',
        requestAuthorization,
      })
    ).resolves.toEqual({
      status: 'not_required',
      normalizedPath: fs.realpathSync(workspacePath),
      scope: 'workspace_file',
    });
    expect(requestAuthorization).not.toHaveBeenCalled();
  });

  it('blocks directories and sensitive files before asking the user', async () => {
    const secretPath = path.join(outsideRoot, '.env');
    fs.writeFileSync(secretPath, 'TOKEN=secret\n', 'utf8');
    const requestAuthorization = vi.fn();

    await expect(
      authorizeScienceArtifactExternalFile({
        workspaceRoot,
        candidate: outsideRoot,
        sessionId: 'session-1',
        requestAuthorization,
      })
    ).resolves.toEqual(expect.objectContaining({ status: 'blocked', code: 'external_file_required' }));
    await expect(
      authorizeScienceArtifactExternalFile({
        workspaceRoot,
        candidate: secretPath,
        sessionId: 'session-1',
        requestAuthorization,
      })
    ).resolves.toEqual(expect.objectContaining({ status: 'blocked', code: 'sensitive_file_denied' }));
    expect(requestAuthorization).not.toHaveBeenCalled();
  });

  it('preserves denied and cancelled authorization outcomes', async () => {
    const externalPath = path.join(outsideRoot, 'input.csv');
    fs.writeFileSync(externalPath, 'x,y\n1,2\n', 'utf8');

    await expect(
      authorizeScienceArtifactExternalFile({
        workspaceRoot,
        candidate: externalPath,
        sessionId: 'session-1',
        requestAuthorization: vi.fn().mockResolvedValue({
          requestId: 'request-denied',
          status: 'answered',
          answers: [{ questionId: 'authorize_external_file', selectedOptionIds: ['deny'] }],
        }),
      })
    ).resolves.toEqual(expect.objectContaining({ status: 'denied', requestId: 'request-denied' }));

    await expect(
      authorizeScienceArtifactExternalFile({
        workspaceRoot,
        candidate: externalPath,
        sessionId: 'session-1',
        requestAuthorization: vi.fn().mockResolvedValue({ requestId: 'request-cancelled', status: 'cancelled' }),
      })
    ).resolves.toEqual(expect.objectContaining({ status: 'cancelled', requestId: 'request-cancelled' }));
  });
});
