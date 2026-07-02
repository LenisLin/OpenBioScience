/**
 * @license
 * Copyright 2026 DeepOrganiser (deepscientist.cc)
 * SPDX-License-Identifier: Apache-2.0
 */

import { ipcBridge } from '@/common';
import {
  exportScienceArtifactSnapshot,
  listScienceArtifactHistory,
  resolveScienceArtifactFileProvenance,
} from '@/process/services/scienceArtifactGitStore';
import { BrowserWindow } from 'electron';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

const hashFile = (filePath: string): string => {
  const digest = crypto.createHash('sha256');
  digest.update(fs.readFileSync(filePath));
  return digest.digest('hex');
};

const updateExportManifest = (
  exportDir: string,
  files: Array<{ type: string; path: string; contentHash?: string }>
): void => {
  const manifestPath = path.join(exportDir, 'export-manifest.json');
  if (!fs.existsSync(manifestPath)) return;
  try {
    const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8')) as Record<string, unknown>;
    manifest.exports = files
      .filter((file) => file.type !== 'manifest')
      .map((file) => ({
        type: file.type,
        path: path.relative(exportDir, file.path),
        contentHash: file.contentHash,
      }));
    fs.writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`, 'utf8');
    const manifestRecord = files.find((file) => file.type === 'manifest' && file.path === manifestPath);
    if (manifestRecord) manifestRecord.contentHash = hashFile(manifestPath);
  } catch (error) {
    console.warn('[ScienceArtifactArchiveBridge] Failed to update export manifest:', error);
  }
};

const printHtmlToPdf = async (htmlPath: string, pdfPath: string): Promise<void> => {
  const win = new BrowserWindow({
    show: false,
    webPreferences: {
      sandbox: true,
      contextIsolation: true,
      nodeIntegration: false,
    },
  });
  try {
    await win.loadFile(htmlPath);
    const data = await win.webContents.printToPDF({
      printBackground: true,
      pageSize: 'A4',
      margins: {
        marginType: 'default',
      },
    });
    fs.writeFileSync(pdfPath, data);
  } finally {
    win.destroy();
  }
};

export function initScienceArtifactArchiveBridge(): void {
  ipcBridge.scienceArtifactArchive.history.provider(async (request) => {
    const result = listScienceArtifactHistory(request);
    return {
      ok: result.ok,
      head: result.head,
      items: result.items,
      error: result.error,
    };
  });
  ipcBridge.scienceArtifactArchive.resolveFile.provider(async (request) =>
    resolveScienceArtifactFileProvenance(request)
  );
  ipcBridge.scienceArtifactArchive.export.provider(async (request) => {
    const wantsPdf = request.exportTypes?.includes('pdf') === true;
    const exportTypes = request.exportTypes
      ? Array.from(new Set([...request.exportTypes.filter((item) => item !== 'pdf'), ...(wantsPdf ? ['html' as const] : [])]))
      : request.exportTypes;
    const result = exportScienceArtifactSnapshot({
      ...request,
      exportTypes,
    });
    if (result.ok && wantsPdf && result.exportDir) {
      const htmlPath = path.join(result.exportDir, 'report.html');
      const pdfPath = path.join(result.exportDir, 'report.pdf');
      if (fs.existsSync(htmlPath)) {
        try {
          await printHtmlToPdf(htmlPath, pdfPath);
          result.files.push({
            type: 'pdf',
            path: pdfPath,
            contentHash: hashFile(pdfPath),
          });
          updateExportManifest(result.exportDir, result.files);
        } catch (error) {
          result.files.push({
            type: 'pdf_error',
            path: pdfPath,
            contentHash: error instanceof Error ? error.message : String(error),
          });
          updateExportManifest(result.exportDir, result.files);
        }
      }
    }
    return {
      ok: result.ok,
      exportId: result.exportId,
      exportDir: result.exportDir,
      sourceCommit: result.sourceCommit,
      files: result.files,
      error: result.error,
    };
  });
}
