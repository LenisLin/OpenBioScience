/**
 * @license
 * Copyright 2026 OpenScience contributors
 * SPDX-License-Identifier: Apache-2.0
 */

import fs from 'node:fs';
import path from 'node:path';

export type ScienceArtifactAuthorizationGatewayResult = {
  requestId: string;
  status: string;
  answers?: Array<{ questionId?: string; selectedOptionIds?: string[] }>;
};

export type ScienceArtifactExternalFileAuthorizationResult =
  | { status: 'not_required'; normalizedPath: string; scope: 'workspace_file' }
  | {
      status: 'authorized';
      requestId: string;
      conversationId?: string;
      normalizedPath: string;
      scope: 'session_exact_file';
      sessionId: string;
      authorizedAt: number;
      expiresOnSessionEnd: true;
    }
  | {
      status: string;
      requestId?: string;
      normalizedPath?: string;
      code?: string;
      message?: string;
    };

export const isSensitiveScienceArtifactPath = (filePath: string): boolean =>
  path
    .resolve(filePath)
    .split(path.sep)
    .some(
      (name) =>
        name === '.git' ||
        name === 'node_modules' ||
        name === '.venv' ||
        name === 'venv' ||
        name === '__pycache__' ||
        name === '.DS_Store' ||
        /^\.env(?:\.|$)/iu.test(name) ||
        /(?:^|[._-])(?:secret|token|credential|passwd|password)(?:[._-]|$)/iu.test(name) ||
        /(?:id_rsa|id_dsa|id_ed25519|\.pem$|\.key$|\.p12$|\.pfx$)/iu.test(name)
    );

const isInside = (root: string, candidate: string): boolean => {
  const relative = path.relative(root, candidate);
  return relative === '' || (!relative.startsWith('..') && !path.isAbsolute(relative));
};

export function resolveScienceArtifactWorkspace(
  configuredWorkspaceRoot?: string,
  requestedProjectRoot?: string
): { ok: true; workspaceRoot: string } | { ok: false; code: string; message: string } {
  if (
    !configuredWorkspaceRoot ||
    !path.isAbsolute(configuredWorkspaceRoot) ||
    !fs.existsSync(configuredWorkspaceRoot)
  ) {
    return {
      ok: false,
      code: 'workspace_required',
      message: 'Select an OpenScience workspace before using Science artifacts.',
    };
  }
  const workspaceRoot = fs.realpathSync(configuredWorkspaceRoot);
  if (!requestedProjectRoot) return { ok: true, workspaceRoot };
  if (!path.isAbsolute(requestedProjectRoot) || !fs.existsSync(requestedProjectRoot)) {
    return { ok: false, code: 'workspace_mismatch', message: 'projectRoot must match the authorized workspace.' };
  }
  const projectRoot = fs.realpathSync(requestedProjectRoot);
  return projectRoot === workspaceRoot
    ? { ok: true, workspaceRoot }
    : { ok: false, code: 'workspace_mismatch', message: 'projectRoot must match the authorized workspace.' };
}

export async function authorizeScienceArtifactExternalFile(options: {
  workspaceRoot: string;
  candidate: string;
  conversationId?: string;
  sessionId: string;
  requestAuthorization: (payload: unknown) => Promise<ScienceArtifactAuthorizationGatewayResult>;
  now?: () => number;
}): Promise<ScienceArtifactExternalFileAuthorizationResult> {
  if (!path.isAbsolute(options.candidate) || !fs.existsSync(options.candidate)) {
    return {
      status: 'blocked',
      code: 'external_file_required',
      message: 'externalPath must be an existing absolute file path.',
    };
  }
  const stat = fs.statSync(options.candidate);
  if (!stat.isFile()) {
    return { status: 'blocked', code: 'external_file_required', message: 'externalPath must reference one file.' };
  }
  const workspaceRoot = fs.realpathSync(options.workspaceRoot);
  const normalizedPath = fs.realpathSync(options.candidate);
  if (isSensitiveScienceArtifactPath(normalizedPath)) {
    return {
      status: 'blocked',
      code: 'sensitive_file_denied',
      normalizedPath,
      message: 'Sensitive files cannot be copied.',
    };
  }
  if (isInside(workspaceRoot, normalizedPath)) {
    return { status: 'not_required', normalizedPath, scope: 'workspace_file' };
  }
  const result = await options.requestAuthorization({
    conversationId: options.conversationId,
    title: 'Authorize external research file',
    reason:
      'Science Artifact needs permission to copy one file outside the selected workspace into provenance storage.',
    timeoutMs: 300_000,
    questions: [
      {
        id: 'authorize_external_file',
        type: 'single_choice',
        title: `Allow this session to copy ${path.basename(normalizedPath)}?`,
        description: normalizedPath,
        required: true,
        options: [
          { id: 'allow', label: 'Allow for this session', recommended: true },
          { id: 'deny', label: 'Do not allow' },
        ],
      },
    ],
  });
  const allowed =
    result.status === 'answered' &&
    result.answers?.some(
      (answer) => answer.questionId === 'authorize_external_file' && answer.selectedOptionIds?.includes('allow')
    );
  if (!allowed) {
    return {
      status: result.status === 'answered' ? 'denied' : result.status,
      requestId: result.requestId,
      normalizedPath,
    };
  }
  return {
    status: 'authorized',
    requestId: result.requestId,
    conversationId: options.conversationId,
    normalizedPath,
    scope: 'session_exact_file',
    sessionId: options.sessionId,
    authorizedAt: options.now?.() ?? Date.now(),
    expiresOnSessionEnd: true,
  };
}
