/**
 * @license
 * Copyright 2026 DeepOrganiser (deepscientist.cc)
 * SPDX-License-Identifier: Apache-2.0
 */

import type { ScienceArtifact } from '@/common/chat/science';
import { usePreviewContext } from '../../context/PreviewContext';
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import './KetcherViewer.css';

const CHEMICAL_EXTENSIONS = new Set(['smi', 'smiles', 'mol', 'sdf', 'rxn', 'ket']);

const fileExtension = (value?: string): string => {
  if (!value) return '';
  const clean = value.split(/[?#]/u)[0] || value;
  const name = clean.replace(/\\/gu, '/').split('/').pop() || clean;
  const index = name.lastIndexOf('.');
  return index >= 0 ? name.slice(index + 1).toLowerCase() : '';
};

const fileLabel = (value?: string): string => {
  if (!value) return 'untitled molecule';
  return value.replace(/\\/gu, '/').split('/').pop() || value;
};

const detectFormat = (fileName?: string, artifact?: ScienceArtifact): string => {
  const explicit = artifact?.viewer?.format;
  if (explicit) return explicit.toLowerCase();
  const ext = fileExtension(fileName);
  if (ext === 'smi') return 'smiles';
  return ext || 'chemical';
};

export const isKetcherPreviewCandidate = (artifact?: ScienceArtifact, fileName?: string, filePath?: string): boolean => {
  if (artifact?.viewer?.kind === 'ketcher') return true;
  if (artifact?.type === 'molecule') return true;
  const ext = fileExtension(fileName || filePath);
  return CHEMICAL_EXTENSIONS.has(ext);
};

const summarizeChemicalSource = (content: string, format: string) => {
  const trimmed = content.trim();
  const lines = trimmed ? trimmed.split(/\r?\n/u).filter(Boolean) : [];
  if (format === 'smiles') {
    return {
      records: lines.length || 0,
      label: lines.length === 1 ? 'single SMILES' : `${lines.length} SMILES records`,
    };
  }
  if (format === 'sdf') {
    const records = trimmed ? Math.max(1, trimmed.split(/\$\$\$\$/u).filter((item) => item.trim()).length) : 0;
    return { records, label: `${records} SDF record${records === 1 ? '' : 's'}` };
  }
  return { records: lines.length, label: `${lines.length} source lines` };
};

export interface KetcherViewerProps {
  content: string;
  file_path?: string;
  file_name?: string;
  workspace?: string;
  artifact?: ScienceArtifact;
}

const KetcherViewer: React.FC<KetcherViewerProps> = ({ content, file_path, file_name, workspace, artifact }) => {
  const { addToSendBox } = usePreviewContext();
  const [draft, setDraft] = useState(content);

  useEffect(() => {
    setDraft(content);
  }, [content]);

  const displayName = fileLabel(file_name || file_path || artifact?.primaryPath || artifact?.title);
  const format = detectFormat(file_name || file_path || artifact?.primaryPath, artifact);
  const stats = useMemo(() => summarizeChemicalSource(draft, format), [draft, format]);
  const evidenceHint = artifact?.evidenceIds?.length ? artifact.evidenceIds.join(', ') : 'no evidence ids recorded';
  const sourcePath = file_path || artifact?.primaryPath || artifact?.previewPath || '';

  const handleSendEditRequest = useCallback(() => {
    const preview = draft.trim().slice(0, 1200);
    const lines = [
      '请基于当前化学结构 artifact 继续修改或分析。',
      artifact ? `artifactId=${artifact.id}` : 'artifactId=not_recorded',
      artifact ? `version=${artifact.version}` : 'version=not_recorded',
      sourcePath ? `file=${sourcePath}` : 'file=not_recorded',
      workspace ? `workspace=${workspace}` : 'workspace=not_recorded',
      `format=${format}`,
      `evidenceIds=${evidenceHint}`,
      '请先追踪该分子/反应的来源证据，再修改对应源文件或生成新版本 artifact。',
      preview ? `\nCurrent chemical source preview:\n${preview}` : '',
    ].filter(Boolean);
    addToSendBox(lines.join('\n'));
  }, [addToSendBox, artifact, draft, evidenceHint, format, sourcePath, workspace]);

  return (
    <section className='ketcher-viewer' data-testid='ketcher-viewer'>
      <header className='ketcher-viewer__bar'>
        <div className='ketcher-viewer__title'>
          <span>{displayName}</span>
          <b>{format} · {stats.label}</b>
        </div>
        <button type='button' onClick={handleSendEditRequest}>
          Send edit request
        </button>
      </header>

      <div className='ketcher-viewer__body'>
        <div className='ketcher-viewer__canvas' aria-label='Chemical structure preview'>
          <div className='ketcher-viewer__molecule'>
            <span className='ketcher-viewer__node ketcher-viewer__node--a'>C</span>
            <span className='ketcher-viewer__bond ketcher-viewer__bond--ab' />
            <span className='ketcher-viewer__node ketcher-viewer__node--b'>N</span>
            <span className='ketcher-viewer__bond ketcher-viewer__bond--bc' />
            <span className='ketcher-viewer__node ketcher-viewer__node--c'>O</span>
          </div>
          <div className='ketcher-viewer__canvasText'>
            <strong>Ketcher-ready chemical artifact</strong>
            <span>Native source inspection is available now. Full Ketcher widget hosting can replace this canvas when the Preview frame exposes an MCP UI bridge.</span>
          </div>
        </div>

        <aside className='ketcher-viewer__side'>
          <div>
            <span>Artifact</span>
            <b>{artifact ? `${artifact.id} · v${artifact.version}` : 'not recorded'}</b>
          </div>
          <div>
            <span>Evidence</span>
            <b>{evidenceHint}</b>
          </div>
          <div>
            <span>Source</span>
            <b>{sourcePath || 'not recorded'}</b>
          </div>
          <div>
            <span>Save policy</span>
            <b>{artifact?.viewer?.savePolicy || 'new_version_required'}</b>
          </div>
        </aside>
      </div>

      <label className='ketcher-viewer__source'>
        <span>Structure source</span>
        <textarea value={draft} spellCheck={false} onChange={(event) => setDraft(event.currentTarget.value)} />
      </label>
    </section>
  );
};

export default KetcherViewer;
