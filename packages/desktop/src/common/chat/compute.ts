/**
 * @license
 * Copyright 2026 DeepOrganiser (deepscientist.cc)
 * SPDX-License-Identifier: Apache-2.0
 */

import type { ComputeConversationExtra, ComputeSshHostContextHost } from '@/common/types/compute';

const formatStatus = (host: ComputeSshHostContextHost): string => {
  const status = host.lastTest?.status;
  if (status === 'connected') return 'last tested: connected';
  if (status === 'failed') return `last tested: failed (${host.lastTest?.message || 'unknown error'})`;
  return 'last tested: not tested';
};

const formatCredential = (host: ComputeSshHostContextHost): string => {
  if (host.password) return `password: ${host.password}`;
  if (host.privateKeyPath) {
    return host.privateKeyPassphrase
      ? `private key path: ${host.privateKeyPath}; passphrase: ${host.privateKeyPassphrase}`
      : `private key path: ${host.privateKeyPath}`;
  }
  return host.credentialHint;
};

export function buildComputePrompt(hosts: ComputeSshHostContextHost[]): string | undefined {
  if (!hosts.length) return undefined;
  const body = hosts
    .map((host, index) => {
      const tags = host.tags?.length ? `\n  - tags: ${host.tags.join(', ')}` : '';
      const notes = host.notes?.trim() ? `\n  - notes: ${host.notes.trim()}` : '';
      const workdir = host.remoteWorkdir?.trim() || '~';
      return [
        `${index + 1}. ${host.name} (${host.id})`,
        `  - ssh: ${host.username}@${host.host} -p ${host.port}`,
        `  - auth: ${host.authType}; ${formatCredential(host)}`,
        `  - remote workdir: ${workdir}`,
        `  - ${formatStatus(host)}`,
        tags,
        notes,
      ]
        .filter(Boolean)
        .join('\n');
    })
    .join('\n\n');

  return [
    '## OpenScience Compute / SSH Hosts',
    'The user selected the following SSH host(s) for this conversation. Use them when remote compute, environment checks, deployment, GPU inspection, or server-side debugging is relevant.',
    '',
    body,
    '',
    'Operational rules:',
    '- Treat credentials as sensitive. Do not print passwords/passphrases in normal answers, logs, files, commits, screenshots, or reports.',
    '- Before running destructive commands on a remote host, summarize the command and ask for confirmation unless the user explicitly requested it.',
    '- Prefer creating or using the configured remote workdir. Run `pwd`, `whoami`, and a minimal environment check before changing files.',
    '- If a credential is redacted or unavailable to the current agent runtime, ask the user for a safe connection method instead of inventing one.',
  ].join('\n');
}

export function buildComputeConversationExtra(hosts: ComputeSshHostContextHost[]): ComputeConversationExtra {
  return {
    selected_ssh_host_ids: hosts.map((host) => host.id),
    ssh_hosts: hosts.map((host) => ({
      id: host.id,
      name: host.name,
      host: host.host,
      port: host.port,
      username: host.username,
      authType: host.authType,
      remoteWorkdir: host.remoteWorkdir,
      tags: host.tags,
      lastTest: host.lastTest,
      credentialHint: host.credentialHint,
    })),
  };
}
