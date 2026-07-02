import { test, expect } from '../../fixtures';
import { invokeBridge } from '../../helpers/bridge/invoke';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

type ExportResult = {
  ok: boolean;
  exportDir?: string;
  sourceCommit?: string;
  files: Array<{ type: string; path: string; contentHash?: string }>;
  error?: string;
};

const gitAvailable = () => spawnSync('git', ['--version'], { encoding: 'utf8' }).status === 0;

const runGit = (repoPath: string, args: string[]): string => {
  const result = spawnSync('git', args, { cwd: repoPath, encoding: 'utf8' });
  if (result.status !== 0) {
    throw new Error(`git ${args.join(' ')} failed: ${result.stderr || result.stdout}`);
  }
  return String(result.stdout || '').trim();
};

const writeJson = (filePath: string, value: unknown): void => {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, `${JSON.stringify(value, null, 2)}\n`, 'utf8');
};

const prepareFrozenScienceRepo = (projectRoot: string): { runId: string; commit: string } => {
  const runId = 'sci_run_e2e_export';
  const repoPath = path.join(projectRoot, '.openscience', 'artifact-repo');
  const runRoot = path.join(repoPath, 'runs', runId);
  fs.mkdirSync(path.join(runRoot, 'artifacts', 'fig_e2e', 'v1', 'files', 'primary'), { recursive: true });
  fs.mkdirSync(path.join(runRoot, 'evidence'), { recursive: true });
  fs.mkdirSync(path.join(runRoot, 'provenance'), { recursive: true });
  fs.writeFileSync(
    path.join(runRoot, 'artifacts', 'fig_e2e', 'v1', 'files', 'primary', 'figure.txt'),
    'frozen figure payload\n',
    'utf8'
  );
  fs.writeFileSync(path.join(runRoot, 'events.jsonl'), '{"action":"publish"}\n', 'utf8');

  const panel = {
    schema: 'deeporganiser.science.panel.v1',
    runId,
    projectRoot,
    question: 'Export every Science deliverable',
    generatedAt: Date.now(),
    status: 'completed',
    stats: { searches: 0, artifacts: 1, evidence: 1, commands: 1, validations: 0, warnings: 0 },
    report: {
      title: 'E2E Science Export Report',
      sections: [
        {
          id: 'summary',
          heading: 'Summary',
          blocks: [{ type: 'paragraph', text: 'The frozen artifact bundle should be exportable. [E1]' }],
        },
      ],
    },
    evidence: [
      {
        id: 'E1',
        title: 'Frozen input',
        sourceType: 'dataset',
        confidence: 'high',
        path: 'data/input.csv',
      },
    ],
    artifacts: [
      {
        id: 'fig_e2e',
        runId,
        type: 'figure',
        title: 'Frozen figure',
        version: 1,
        primaryPath: 'results/figure.txt',
        code: { path: 'scripts/make_figure.py', language: 'python' },
        execution: { command: 'python scripts/make_figure.py', logPath: 'logs/figure.log', exitCode: 0 },
        evidenceIds: ['E1'],
        createdAt: Date.now(),
      },
    ],
    claims: [],
    provenance: [],
    edges: [],
    graphWarnings: [],
    usedSkills: [],
  };

  writeJson(path.join(runRoot, 'panel.json'), panel);
  writeJson(path.join(runRoot, 'state.json'), { runId });
  writeJson(path.join(runRoot, 'run.json'), { runId, status: 'completed' });
  writeJson(path.join(runRoot, 'evidence', 'items.json'), panel.evidence);
  writeJson(path.join(runRoot, 'claims', 'items.json'), []);
  writeJson(path.join(runRoot, 'pages', 'items.json'), []);
  writeJson(path.join(runRoot, 'provenance', 'nodes.json'), []);
  writeJson(path.join(runRoot, 'provenance', 'edges.json'), []);
  writeJson(path.join(runRoot, 'provenance', 'warnings.json'), []);
  writeJson(path.join(runRoot, 'skills', 'used-skills.json'), []);
  writeJson(path.join(runRoot, 'files.json'), [
    {
      path: path.join(projectRoot, 'results', 'figure.txt'),
      relativePath: 'results/figure.txt',
      role: 'primary',
      artifactId: 'fig_e2e',
      artifactVersion: 1,
      mode: 'copied',
      storedPath: 'runs/sci_run_e2e_export/artifacts/fig_e2e/v1/files/primary/figure.txt',
    },
  ]);
  writeJson(path.join(runRoot, 'artifacts', 'fig_e2e', 'v1', 'artifact.json'), panel.artifacts[0]);
  writeJson(path.join(runRoot, 'artifacts', 'fig_e2e', 'v1', 'files.json'), [
    {
      relativePath: 'results/figure.txt',
      role: 'primary',
      artifactId: 'fig_e2e',
      artifactVersion: 1,
      mode: 'copied',
      storedPath: 'runs/sci_run_e2e_export/artifacts/fig_e2e/v1/files/primary/figure.txt',
    },
  ]);

  runGit(repoPath, ['init']);
  runGit(repoPath, ['config', 'user.name', 'OpenScience E2E']);
  runGit(repoPath, ['config', 'user.email', 'openscience-e2e@local.invalid']);
  runGit(repoPath, ['add', '-A']);
  runGit(repoPath, ['commit', '-m', 'science e2e export fixture']);
  return { runId, commit: runGit(repoPath, ['rev-parse', 'HEAD']) };
};

test.describe('Science export', () => {
  test.skip(!gitAvailable(), 'git is required for Science export fixtures');

  test('exports panel, report formats, PDF, notebook, LaTeX, run bundle, and git bundle through the app bridge', async ({
    page,
  }) => {
    const projectRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'openscience-export-e2e-'));
    const keepAuditExport = process.env.OPENSCIENCE_KEEP_EXPORT_AUDIT === '1';
    try {
      const { runId, commit } = prepareFrozenScienceRepo(projectRoot);
      const result = await invokeBridge<ExportResult>(
        page,
        'science-artifact-archive:export',
        {
          projectRoot,
          runId,
          commit,
          exportTypes: ['manifest', 'panel', 'markdown', 'html', 'pdf', 'notebook', 'latex', 'run_bundle', 'git_bundle'],
        },
        60_000
      );

      expect(result.ok, result.error).toBe(true);
      expect(result.sourceCommit).toBe(commit);
      expect(result.exportDir).toBeTruthy();

      const byType = new Map(result.files.map((file) => [file.type, file]));
      for (const type of ['manifest', 'panel', 'markdown', 'html', 'pdf', 'notebook', 'latex', 'run_bundle', 'git_bundle']) {
        const file = byType.get(type);
        expect(file, `missing ${type}`).toBeTruthy();
        expect(fs.existsSync(file!.path), `${type} does not exist`).toBe(true);
        expect(fs.statSync(file!.path).size, `${type} is empty`).toBeGreaterThan(0);
      }

      const exportDir = result.exportDir!;
      expect(fs.readFileSync(path.join(exportDir, 'report.md'), 'utf8')).toContain('E2E Science Export Report');
      const reportHtml = fs.readFileSync(path.join(exportDir, 'report.html'), 'utf8');
      expect(reportHtml).toContain('<!doctype html>');
      expect(reportHtml).toContain('<code>fig_e2e</code>');
      expect(reportHtml).toContain('<table>');
      expect(reportHtml).toContain('evidence-card');
      expect(fs.readFileSync(path.join(exportDir, 'manuscript.tex'), 'utf8')).toContain('\\documentclass');
      const notebook = JSON.parse(fs.readFileSync(path.join(exportDir, 'analysis.ipynb'), 'utf8')) as {
        nbformat: number;
        cells: Array<{ cell_type: string; source: string[] }>;
      };
      expect(notebook.nbformat).toBe(4);
      expect(notebook.cells[1]?.cell_type).toBe('markdown');
      expect(notebook.cells[1]?.source.join('')).toMatch(/^## Summary/u);
      expect(fs.readFileSync(path.join(exportDir, 'report.pdf')).subarray(0, 4).toString('utf8')).toBe('%PDF');

      const manifest = JSON.parse(fs.readFileSync(path.join(exportDir, 'export-manifest.json'), 'utf8')) as {
        exports: Array<{ type: string; path: string; contentHash?: string }>;
      };
      expect(manifest.exports.map((item) => item.type)).toEqual(
        expect.arrayContaining(['markdown', 'html', 'pdf', 'notebook', 'latex', 'run_bundle', 'git_bundle'])
      );

      const listed = spawnSync('unzip', ['-l', path.join(exportDir, 'run-bundle.zip')], { encoding: 'utf8' });
      expect(listed.status).toBe(0);
      expect(listed.stdout).toContain('runs/sci_run_e2e_export/panel.json');
      expect(listed.stdout).toContain('runs/sci_run_e2e_export/artifacts/fig_e2e/v1/files/primary/figure.txt');

      if (keepAuditExport) {
        const auditDir = path.join(process.cwd(), 'output', 'science-export-audit');
        fs.rmSync(auditDir, { recursive: true, force: true });
        fs.mkdirSync(path.dirname(auditDir), { recursive: true });
        fs.cpSync(exportDir, auditDir, { recursive: true });
        fs.writeFileSync(path.join(auditDir, 'audit-source.txt'), `projectRoot=${projectRoot}\ncommit=${commit}\n`, 'utf8');
      }
    } finally {
      if (!keepAuditExport) fs.rmSync(projectRoot, { recursive: true, force: true });
    }
  });
});
