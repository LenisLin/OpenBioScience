/**
 * @license
 * Copyright 2026 DeepOrganiser (deepscientist.cc)
 * SPDX-License-Identifier: Apache-2.0
 */

import { ipcBridge } from '@/common';
import type {
  ScienceLatexCompileEngine,
  ScienceLatexCompileRequest,
  ScienceLatexCompileResult,
} from '@/common/adapter/ipcBridge';
import { spawn } from 'child_process';
import fs from 'fs/promises';
import path from 'path';

interface CommandResult {
  command: string;
  engine: ScienceLatexCompileEngine;
  stdout: string;
  stderr: string;
  exitCode: number | null;
  signal: NodeJS.Signals | null;
  notFound?: boolean;
  timedOut?: boolean;
  error?: string;
}

const DEFAULT_TIMEOUT_MS = 120_000;
const MAX_CAPTURE_CHARS = 240_000;

const appendLimited = (current: string, chunk: Buffer | string): string => {
  const next = current + chunk.toString();
  if (next.length <= MAX_CAPTURE_CHARS) return next;
  return next.slice(next.length - MAX_CAPTURE_CHARS);
};

const isInsideWorkspace = (filePath: string, workspace?: string): boolean => {
  if (!workspace) return true;
  const workspacePath = path.resolve(workspace);
  const relative = path.relative(workspacePath, filePath);
  return relative === '' || (!relative.startsWith('..') && !path.isAbsolute(relative));
};

const runCommand = (
  engine: ScienceLatexCompileEngine,
  executable: string,
  args: string[],
  cwd: string,
  timeoutMs: number
): Promise<CommandResult> =>
  new Promise((resolve) => {
    const command = [executable, ...args].join(' ');
    const child = spawn(executable, args, {
      cwd,
      env: {
        ...process.env,
        max_print_line: process.env.max_print_line || '1000',
      },
      windowsHide: true,
    });
    let stdout = '';
    let stderr = '';
    let settled = false;

    const finish = (result: Omit<CommandResult, 'command' | 'engine' | 'stdout' | 'stderr'>): void => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      resolve({
        command,
        engine,
        stdout,
        stderr,
        ...result,
      });
    };

    const timer = setTimeout(() => {
      child.kill('SIGTERM');
      finish({
        exitCode: null,
        signal: 'SIGTERM',
        timedOut: true,
        error: `LaTeX compile timed out after ${timeoutMs}ms.`,
      });
    }, timeoutMs);

    child.stdout.on('data', (chunk) => {
      stdout = appendLimited(stdout, chunk);
    });
    child.stderr.on('data', (chunk) => {
      stderr = appendLimited(stderr, chunk);
    });
    child.on('error', (error: NodeJS.ErrnoException) => {
      finish({
        exitCode: null,
        signal: null,
        notFound: error.code === 'ENOENT',
        error: error.message,
      });
    });
    child.on('close', (exitCode, signal) => {
      finish({ exitCode, signal });
    });
  });

const writeCompileLog = async (
  sourcePath: string,
  result: CommandResult,
  pdfPath: string,
  durationMs: number
): Promise<string | undefined> => {
  try {
    const sourceDir = path.dirname(sourcePath);
    const baseName = path.basename(sourcePath, path.extname(sourcePath));
    const logDir = path.join(sourceDir, '.openscience', 'latex');
    const logPath = path.join(logDir, `${baseName}.compile.log`);
    await fs.mkdir(logDir, { recursive: true });
    await fs.writeFile(
      logPath,
      [
        `source=${sourcePath}`,
        `pdf=${pdfPath}`,
        `cwd=${sourceDir}`,
        `engine=${result.engine}`,
        `command=${result.command}`,
        `exitCode=${result.exitCode ?? 'null'}`,
        `signal=${result.signal ?? ''}`,
        `durationMs=${durationMs}`,
        result.timedOut ? 'timedOut=true' : '',
        result.error ? `error=${result.error}` : '',
        '',
        '--- stdout ---',
        result.stdout,
        '',
        '--- stderr ---',
        result.stderr,
        '',
      ]
        .filter((line) => line !== '')
        .join('\n'),
      'utf8'
    );
    return logPath;
  } catch (error) {
    console.warn('[ScienceLatexBridge] Failed to write compile log:', error);
    return undefined;
  }
};

const fileExists = async (filePath: string): Promise<boolean> => {
  try {
    await fs.access(filePath);
    return true;
  } catch {
    return false;
  }
};

const compileLatex = async (request: ScienceLatexCompileRequest): Promise<ScienceLatexCompileResult> => {
  const startedAt = Date.now();
  const sourcePath = path.resolve(request.sourcePath || '');
  const timeoutMs = Math.max(10_000, Math.min(request.timeoutMs || DEFAULT_TIMEOUT_MS, 10 * 60_000));

  const fail = (error: string, partial?: Partial<ScienceLatexCompileResult>): ScienceLatexCompileResult => ({
    ok: false,
    sourcePath,
    durationMs: Date.now() - startedAt,
    error,
    ...partial,
  });

  if (!sourcePath || !/\.tex$/iu.test(sourcePath)) {
    return fail('Only .tex source files can be compiled from the Science preview.');
  }

  if (!isInsideWorkspace(sourcePath, request.workspace)) {
    return fail('The LaTeX source is outside the active research project workspace.');
  }

  if (!(await fileExists(sourcePath))) {
    return fail('The LaTeX source file does not exist.');
  }

  let wroteSource = false;
  if (typeof request.sourceContent === 'string') {
    await fs.writeFile(sourcePath, request.sourceContent, 'utf8');
    wroteSource = true;
  }

  const sourceDir = path.dirname(sourcePath);
  const sourceFile = path.basename(sourcePath);
  const pdfPath = path.join(sourceDir, `${path.basename(sourcePath, path.extname(sourcePath))}.pdf`);

  const latexmkResult = await runCommand(
    'latexmk',
    'latexmk',
    ['-pdf', '-interaction=nonstopmode', '-halt-on-error', sourceFile],
    sourceDir,
    timeoutMs
  );
  const result =
    latexmkResult.notFound === true
      ? await runCommand(
          'pdflatex',
          'pdflatex',
          ['-interaction=nonstopmode', '-halt-on-error', sourceFile],
          sourceDir,
          timeoutMs
        )
      : latexmkResult;

  let finalResult = result;
  if (result.engine === 'pdflatex' && result.exitCode === 0) {
    finalResult = await runCommand(
      'pdflatex',
      'pdflatex',
      ['-interaction=nonstopmode', '-halt-on-error', sourceFile],
      sourceDir,
      timeoutMs
    );
    finalResult.stdout = `${result.stdout}\n${finalResult.stdout}`;
    finalResult.stderr = `${result.stderr}\n${finalResult.stderr}`;
    finalResult.command = `${result.command} && ${finalResult.command}`;
  }

  const durationMs = Date.now() - startedAt;
  const logPath = await writeCompileLog(sourcePath, finalResult, pdfPath, durationMs);
  const pdfReady = await fileExists(pdfPath);
  const ok = finalResult.exitCode === 0 && pdfReady;

  return {
    ok,
    engine: finalResult.engine,
    command: finalResult.command,
    sourcePath,
    pdfPath: pdfReady ? pdfPath : undefined,
    logPath,
    stdout: finalResult.stdout,
    stderr: finalResult.stderr,
    durationMs,
    exitCode: finalResult.exitCode,
    wroteSource,
    error: ok
      ? undefined
      : finalResult.error ||
        (finalResult.notFound
          ? 'Neither latexmk nor pdflatex is available in PATH.'
          : pdfReady
            ? 'LaTeX exited with an error.'
            : 'LaTeX did not produce a PDF.'),
  };
};

export function initScienceLatexBridge(): void {
  ipcBridge.scienceLatex.compile.provider(compileLatex);
}
