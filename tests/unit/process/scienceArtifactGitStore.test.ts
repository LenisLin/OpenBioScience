import {
  commitScienceArtifactSnapshot,
  exportScienceArtifactSnapshot,
  listScienceArtifactHistory,
  resolveScienceArtifactFileProvenance,
} from '@/process/services/scienceArtifactGitStore';
import { SCIENCE_PANEL_SCHEMA, type SciencePanelData } from '@/common/chat/science';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

const gitAvailable = () => spawnSync('git', ['--version'], { encoding: 'utf8' }).status === 0;

const makePanel = (projectRoot: string, runId = 'sci_run_test'): SciencePanelData => ({
  schema: SCIENCE_PANEL_SCHEMA,
  runId,
  projectRoot,
  question: 'Generate a tracked figure',
  generatedAt: Date.now(),
  status: 'completed',
  stats: {
    searches: 0,
    artifacts: 1,
    evidence: 1,
    commands: 1,
    validations: 0,
    warnings: 0,
  },
  report: {
    title: 'Tracked figure report',
    sections: [
      {
        id: 'summary',
        heading: 'Summary',
        blocks: [{ type: 'paragraph', text: 'The figure was generated from a tracked script. [E1]' }],
      },
    ],
  },
  evidence: [
    {
      id: 'E1',
      title: 'Input CSV',
      sourceType: 'dataset',
      confidence: 'high',
      path: 'data/input.csv',
      createdAt: Date.now(),
    },
  ],
  artifacts: [
    {
      id: 'fig_umap',
      runId,
      type: 'figure',
      title: 'UMAP figure',
      version: 1,
      primaryPath: 'results/umap.png',
      inputPaths: ['data/input.csv'],
      code: { path: 'scripts/make_umap.py', language: 'python' },
      execution: { command: 'python scripts/make_umap.py', logPath: 'logs/umap.log', exitCode: 0 },
      evidenceIds: ['E1'],
      createdAt: Date.now(),
    },
  ],
  claims: [],
  provenance: [],
  edges: [],
  graphWarnings: [],
});

const gitShowJson = <T>(repoPath: string, commit: string, objectPath: string): T => {
  const result = spawnSync('git', ['show', `${commit}:${objectPath}`], {
    cwd: repoPath,
    encoding: 'utf8',
  });
  expect(result.status).toBe(0);
  return JSON.parse(result.stdout) as T;
};

describe.runIf(gitAvailable())('scienceArtifactGitStore', () => {
  let root: string;
  let previousMaxCopyBytes: string | undefined;

  beforeEach(() => {
    root = fs.mkdtempSync(path.join(os.tmpdir(), 'openscience-artifact-git-'));
    previousMaxCopyBytes = process.env.OPENSCIENCE_ARTIFACT_GIT_MAX_COPY_BYTES;
    process.env.OPENSCIENCE_ARTIFACT_GIT_MAX_COPY_BYTES = '16';
    fs.mkdirSync(path.join(root, 'results', 'supplementary'), { recursive: true });
    fs.mkdirSync(path.join(root, 'scripts'), { recursive: true });
    fs.mkdirSync(path.join(root, 'logs'), { recursive: true });
    fs.mkdirSync(path.join(root, 'data'), { recursive: true });
    fs.writeFileSync(path.join(root, 'results', 'umap.png'), 'small-figure', 'utf8');
    fs.writeFileSync(path.join(root, 'results', 'supplementary', 'table.csv'), 'a,b\n1,2\n', 'utf8');
    fs.writeFileSync(path.join(root, 'scripts', 'make_umap.py'), 'print("plot")\n', 'utf8');
    fs.writeFileSync(path.join(root, 'logs', 'umap.log'), 'ok\n', 'utf8');
    fs.writeFileSync(path.join(root, 'data', 'input.csv'), 'x,y\n1,2\n', 'utf8');
    fs.writeFileSync(path.join(root, 'data', 'large.bin'), 'this file is intentionally larger than threshold', 'utf8');
    fs.writeFileSync(path.join(root, '.env'), 'TOKEN=secret\n', 'utf8');
  });

  afterEach(() => {
    if (previousMaxCopyBytes == null) delete process.env.OPENSCIENCE_ARTIFACT_GIT_MAX_COPY_BYTES;
    else process.env.OPENSCIENCE_ARTIFACT_GIT_MAX_COPY_BYTES = previousMaxCopyBytes;
    fs.rmSync(root, { recursive: true, force: true });
  });

  it('creates one project-level repo and snapshots copied, pointer, and ignored files', () => {
    const panel = makePanel(root);
    const first = commitScienceArtifactSnapshot({
      projectRoot: root,
      panel,
      state: { runId: panel.runId },
      events: [],
      includePaths: [
        { path: 'results/supplementary', role: 'output', artifactId: 'fig_umap', recursive: true },
        { path: 'data/large.bin', role: 'input', artifactId: 'fig_umap' },
        { path: '.env', role: 'input', artifactId: 'fig_umap' },
      ],
    });

    expect(first.ok).toBe(true);
    expect(first.commit).toBeTruthy();
    expect(first.repoPath).toBe(path.join(root, '.openscience', 'artifact-repo'));
    expect(fs.existsSync(path.join(first.repoPath!, '.git'))).toBe(true);
    expect(first.files.some((file) => file.mode === 'copied' && file.relativePath === 'results/supplementary/table.csv')).toBe(true);
    expect(first.files.some((file) => file.mode === 'pointer' && file.relativePath === 'data/large.bin')).toBe(true);
    expect(first.files.some((file) => file.mode === 'ignored' && file.relativePath === '.env')).toBe(true);

    fs.writeFileSync(path.join(root, 'logs', 'umap.log'), 'ok\nrerun\n', 'utf8');
    const second = commitScienceArtifactSnapshot({
      projectRoot: root,
      panel,
      state: { runId: panel.runId },
      events: [],
    });
    expect(second.ok).toBe(true);
    expect(second.repoPath).toBe(first.repoPath);
    expect(second.commit).not.toBe(first.commit);

    const history = listScienceArtifactHistory({ projectRoot: root, runId: panel.runId, artifactId: 'fig_umap' });
    expect(history.ok).toBe(true);
    expect(history.items.length).toBeGreaterThanOrEqual(2);

    const fileProvenance = resolveScienceArtifactFileProvenance({
      projectRoot: root,
      filePath: path.join(root, 'results', 'umap.png'),
    });
    expect(fileProvenance.ok).toBe(true);
    expect(fileProvenance.status).toBe('tracked');
    expect(fileProvenance.record).toEqual(
      expect.objectContaining({
        artifactId: 'fig_umap',
        artifactTitle: 'UMAP figure',
        role: 'primary',
      })
    );
    expect(fileProvenance.record?.evidenceIds).toEqual(expect.arrayContaining(['E1']));
    expect(fileProvenance.history?.length).toBeGreaterThanOrEqual(1);

    fs.renameSync(path.join(root, 'results', 'umap.png'), path.join(root, 'results', 'umap-renamed.png'));
    const renamedProvenance = resolveScienceArtifactFileProvenance({
      projectRoot: root,
      filePath: path.join(root, 'results', 'umap-renamed.png'),
    });
    expect(renamedProvenance.ok).toBe(true);
    expect(renamedProvenance.status).toBe('tracked');
    expect(renamedProvenance.relativePath).toBe('results/umap-renamed.png');
    expect(renamedProvenance.record).toEqual(
      expect.objectContaining({
        artifactId: 'fig_umap',
        artifactTitle: 'UMAP figure',
        role: 'primary',
      })
    );

    const secretProvenance = resolveScienceArtifactFileProvenance({ projectRoot: root, filePath: path.join(root, '.env') });
    expect(secretProvenance.ok).toBe(true);
    expect(secretProvenance.status).toBe('ignored');
  });

  it('exports every deliverable from a frozen commit and includes the run snapshot bundle', () => {
    const panel = makePanel(root, 'sci_run_export');
    const snapshot = commitScienceArtifactSnapshot({
      projectRoot: root,
      panel,
      state: { runId: panel.runId },
      events: [],
    });

    const exported = exportScienceArtifactSnapshot({
      projectRoot: root,
      runId: panel.runId,
      commit: snapshot.commit,
      exportTypes: ['manifest', 'panel', 'markdown', 'html', 'notebook', 'latex', 'run_bundle', 'git_bundle'],
    });

    expect(exported.ok).toBe(true);
    expect(exported.sourceCommit).toBe(snapshot.commit);
    expect(exported.files.map((file) => path.basename(file.path))).toEqual(
      expect.arrayContaining([
        'export-manifest.json',
        'panel.json',
        'report.md',
        'report.html',
        'analysis.ipynb',
        'manuscript.tex',
        'run-bundle.zip',
        'artifact-history.bundle',
      ])
    );
    expect(fs.readFileSync(path.join(exported.exportDir!, 'report.md'), 'utf8')).toContain('Tracked figure report');
    const html = fs.readFileSync(path.join(exported.exportDir!, 'report.html'), 'utf8');
    expect(html).toContain('<!doctype html>');
    expect(html).toContain('<code>fig_umap</code>');
    expect(html).toContain('<table>');
    expect(html).toContain('evidence-card');
    expect(fs.readFileSync(path.join(exported.exportDir!, 'manuscript.tex'), 'utf8')).toContain('\\documentclass');

    const notebook = JSON.parse(fs.readFileSync(path.join(exported.exportDir!, 'analysis.ipynb'), 'utf8')) as {
      nbformat: number;
      cells: Array<{ cell_type: string; source: string[] }>;
    };
    expect(notebook.nbformat).toBe(4);
    expect(notebook.cells.some((cell) => cell.cell_type === 'code')).toBe(true);
    expect(notebook.cells[1]?.cell_type).toBe('markdown');
    expect(notebook.cells[1]?.source.join('')).toMatch(/^## Summary/u);
    expect(notebook.cells.filter((cell) => cell.cell_type === 'markdown' && cell.source.join('').startsWith('# '))).toHaveLength(1);

    const manifest = JSON.parse(fs.readFileSync(path.join(exported.exportDir!, 'export-manifest.json'), 'utf8')) as {
      schema: string;
      sourceCommit: string;
      completeness: string;
      exports: Array<{ type: string; path: string; contentHash?: string }>;
    };
    expect(manifest.schema).toBe('openscience.science-export.v1');
    expect(manifest.sourceCommit).toBe(snapshot.commit);
    expect(manifest.completeness).toBe('complete_with_pointers');
    expect(manifest.exports.map((item) => item.type)).toEqual(
      expect.arrayContaining(['panel', 'markdown', 'html', 'notebook', 'latex', 'run_bundle', 'git_bundle'])
    );
    expect(manifest.exports.every((item) => Boolean(item.path))).toBe(true);

    const runBundlePath = path.join(exported.exportDir!, 'run-bundle.zip');
    const listed = spawnSync('unzip', ['-l', runBundlePath], { encoding: 'utf8' });
    expect(listed.status).toBe(0);
    expect(listed.stdout).toContain('runs/sci_run_export/panel.json');
    expect(listed.stdout).toContain('runs/sci_run_export/artifacts/fig_umap/v1/artifact.json');
    expect(listed.stdout).toContain('runs/sci_run_export/artifacts/fig_umap/v1/files/primary/umap.png');
  });

  it('reuses the same project repo across runs and preserves provenance graph edges', () => {
    const figurePanel = makePanel(root, 'sci_run_figure');
    const figureSnapshot = commitScienceArtifactSnapshot({
      projectRoot: root,
      panel: figurePanel,
      state: { runId: figurePanel.runId },
      events: [],
      message: 'science_artifact publish run=sci_run_figure target=artifact:fig_umap',
    });

    fs.mkdirSync(path.join(root, 'manuscript'), { recursive: true });
    fs.writeFileSync(path.join(root, 'manuscript', 'review.tex'), 'x\n', 'utf8');
    fs.writeFileSync(path.join(root, 'manuscript', 'review.pdf'), 'pdf\n', 'utf8');

    const manuscriptPanel: SciencePanelData = {
      ...makePanel(root, 'sci_run_manuscript'),
      question: 'Write a manuscript from the tracked figure',
      summary: 'The manuscript is derived from the UMAP figure snapshot.',
      report: {
        title: 'Manuscript from tracked figure',
        sections: [
          {
            id: 'summary',
            heading: 'Summary',
            blocks: [{ type: 'paragraph', text: 'The manuscript cites the generated figure and its dataset. [E2]' }],
          },
        ],
      },
      evidence: [
        ...figurePanel.evidence,
        {
          id: 'E2',
          title: 'UMAP figure artifact',
          sourceType: 'figure',
          confidence: 'high',
          path: 'results/umap.png',
          artifactId: 'fig_umap',
          version: 1,
          createdAt: Date.now(),
        },
      ],
      artifacts: [
        {
          id: 'manuscript_review',
          runId: 'sci_run_manuscript',
          type: 'manuscript',
          title: 'Review manuscript',
          version: 1,
          primaryPath: 'manuscript/review.tex',
          previewPath: 'manuscript/review.pdf',
          inputPaths: ['results/umap.png'],
          code: { path: 'manuscript/review.tex', language: 'latex' },
          execution: { command: 'latexmk -pdf manuscript/review.tex', logPath: 'logs/umap.log', exitCode: 0 },
          evidenceIds: ['E1', 'E2'],
          createdAt: Date.now(),
        },
      ],
      provenance: [
        {
          id: 'node_write_manuscript',
          type: 'activity',
          label: 'Write manuscript from tracked figure',
          artifactId: 'manuscript_review',
          evidenceIds: ['E2'],
          createdAt: Date.now(),
        },
      ],
      edges: [
        {
          id: 'edge_fig_to_manuscript',
          runId: 'sci_run_manuscript',
          from: { kind: 'artifact', id: 'fig_umap', version: 1 },
          to: { kind: 'artifact', id: 'manuscript_review', version: 1 },
          type: 'derived_from',
          confidence: 'declared',
          createdAt: Date.now(),
        },
      ],
    };

    const manuscriptSnapshot = commitScienceArtifactSnapshot({
      projectRoot: root,
      panel: manuscriptPanel,
      state: { runId: manuscriptPanel.runId },
      events: [],
      includePaths: [{ path: 'manuscript', role: 'output', artifactId: 'manuscript_review', recursive: true }],
      message: 'science_artifact publish run=sci_run_manuscript target=artifact:manuscript_review',
    });

    expect(manuscriptSnapshot.ok).toBe(true);
    expect(manuscriptSnapshot.repoPath).toBe(figureSnapshot.repoPath);
    expect(manuscriptSnapshot.commit).not.toBe(figureSnapshot.commit);
    expect(manuscriptSnapshot.files.some((file) => file.relativePath === 'manuscript/review.tex' && file.mode === 'copied')).toBe(
      true
    );

    const edgeItems = gitShowJson<SciencePanelData['edges']>(
      manuscriptSnapshot.repoPath!,
      manuscriptSnapshot.commit!,
      'runs/sci_run_manuscript/provenance/edges.json'
    );
    expect(edgeItems).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: 'edge_fig_to_manuscript',
          type: 'derived_from',
          from: { kind: 'artifact', id: 'fig_umap', version: 1 },
          to: { kind: 'artifact', id: 'manuscript_review', version: 1 },
        }),
      ])
    );

    const projectIndex = JSON.parse(
      fs.readFileSync(path.join(root, '.openscience', 'science-artifacts', 'project-index.json'), 'utf8')
    ) as { runs: Array<{ runId: string }>; artifacts: Array<{ runId: string; artifactId: string }> };
    expect(projectIndex.runs.map((run) => run.runId)).toEqual(
      expect.arrayContaining(['sci_run_figure', 'sci_run_manuscript'])
    );
    expect(projectIndex.artifacts).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ runId: 'sci_run_figure', artifactId: 'fig_umap' }),
        expect.objectContaining({ runId: 'sci_run_manuscript', artifactId: 'manuscript_review' }),
      ])
    );

    const projectHistory = listScienceArtifactHistory({ projectRoot: root, limit: 10 });
    expect(projectHistory.items.map((item) => item.subject)).toEqual(
      expect.arrayContaining([
        'science_artifact publish run=sci_run_figure target=artifact:fig_umap',
        'science_artifact publish run=sci_run_manuscript target=artifact:manuscript_review',
      ])
    );
  });
});
