/**
 * @license
 * Copyright 2025 DeepOrganiser (deepscientist.cc)
 * SPDX-License-Identifier: Apache-2.0
 */

import { ipcBridge } from '@/common';
import type { PreviewContentType } from '@/common/types/office/preview';
import type { LocalFileLinkReference } from '@/renderer/components/Markdown/markdownUtils';
import {
  LARGE_TEXT_PREVIEW_MAX_LENGTH,
  LARGE_TEXT_PREVIEW_THRESHOLD,
} from '@/renderer/pages/conversation/Preview/constants';
import { getContentTypeByExtension } from '@/renderer/pages/conversation/Preview/fileUtils';
import {
  usePreviewContext,
  type OpenPreviewOptions,
  type PreviewMetadata,
} from '@/renderer/pages/conversation/Preview/context/PreviewContext';
import {
  getFileNameFromSciencePath,
  resolveScienceArtifactStoredPath,
  resolveSciencePreviewPath,
} from '@/renderer/utils/science/scienceProjectIndex';
import { useCallback } from 'react';

const getPreviewLanguage = (file_name: string): string => {
  const dotIndex = file_name.lastIndexOf('.');
  return dotIndex >= 0 ? file_name.slice(dotIndex + 1).toLowerCase() : '';
};

const isDelimitedSpreadsheet = (fileName: string): boolean => /\.(csv|tsv)$/iu.test(fileName);

const shouldReadPreviewContent = (contentType: PreviewContentType, fileName: string): boolean =>
  isDelimitedSpreadsheet(fileName) || !['pdf', 'word', 'excel', 'ppt'].includes(contentType);

const uniquePaths = (...paths: Array<string | undefined>): string[] => {
  const seen = new Set<string>();
  return paths
    .filter((item): item is string => Boolean(item && item.trim()))
    .filter((item) => {
      const key = item.replace(/\\/g, '/').replace(/\/+/g, '/');
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
};

export const useLocalFilePreview = (workspace?: string) => {
  const { openPreview } = usePreviewContext();

  return useCallback(
    async (
      file_path: string,
      reference?: LocalFileLinkReference,
      metadataOverride?: Partial<PreviewMetadata>,
      options?: OpenPreviewOptions
    ) => {
      const effectiveWorkspace = metadataOverride?.workspace || workspace;
      const fileName = getFileNameFromSciencePath(file_path);
      const contentType = getContentTypeByExtension(fileName);
      const sciencePanel = metadataOverride?.science?.panel;
      const artifactId = metadataOverride?.science?.artifactId;
      const artifactVersion = metadataOverride?.science?.artifactVersion;
      const scienceArtifact =
        sciencePanel && artifactId
          ? sciencePanel.artifacts.find(
              (artifact) =>
                artifact.id === artifactId && (artifactVersion == null || artifact.version === artifactVersion)
            )
          : undefined;
      const resolvedPath = resolveSciencePreviewPath(effectiveWorkspace, file_path) || file_path;
      const archivedPath = resolveScienceArtifactStoredPath(
        effectiveWorkspace,
        sciencePanel,
        file_path,
        scienceArtifact
      );
      const candidatePaths = uniquePaths(resolvedPath, file_path, archivedPath);

      const loadCandidate = async (
        candidatePath: string
      ): Promise<{ content: string; isLargeTextTruncated: boolean; path: string } | undefined> => {
        let content = '';
        let isLargeTextTruncated = false;
        try {
          const metadata = await ipcBridge.fs.getFileMetadata.invoke({
            path: candidatePath,
            workspace: effectiveWorkspace,
          });
          if (metadata == null) throw null;

          if (contentType === 'image') {
            const imageContent = await ipcBridge.fs.getImageBase64.invoke({
              path: candidatePath,
              workspace: effectiveWorkspace,
            });
            if (imageContent == null) throw null;
            content = imageContent;
          } else if (shouldReadPreviewContent(contentType, fileName)) {
            const textContent = await ipcBridge.fs.readFile.invoke({
              path: candidatePath,
              workspace: effectiveWorkspace,
            });
            if (textContent == null) throw null;
            content = textContent;

            if (contentType === 'code' && content.length > LARGE_TEXT_PREVIEW_THRESHOLD) {
              content = content.slice(0, LARGE_TEXT_PREVIEW_MAX_LENGTH);
              isLargeTextTruncated = true;
            }
          }
          return { content, isLargeTextTruncated, path: candidatePath };
        } catch {
          return undefined;
        }
      };

      const loadFirstCandidate = async (
        index = 0
      ): Promise<{ content: string; isLargeTextTruncated: boolean; path: string } | undefined> => {
        if (index >= candidatePaths.length) return undefined;
        const loaded = await loadCandidate(candidatePaths[index]);
        return loaded || loadFirstCandidate(index + 1);
      };

      const loaded = await loadFirstCandidate();
      if (loaded) {
        openPreview(
          loaded.content,
          contentType,
          {
            title: fileName,
            file_name: fileName,
            workspace: effectiveWorkspace,
            language: getPreviewLanguage(fileName),
            truncated: loaded.isLargeTextTruncated,
            targetLine: reference?.line,
            targetColumn: reference?.column,
            editable:
              contentType === 'markdown' ||
              contentType === 'image' ||
              contentType === 'molecular_structure' ||
              loaded.isLargeTextTruncated
                ? false
                : undefined,
            ...metadataOverride,
            file_path: loaded.path,
          },
          options || { replace: true }
        );
        return;
      }

      openPreview(
        '',
        contentType,
        {
          title: fileName,
          file_name: fileName,
          workspace: effectiveWorkspace,
          language: getPreviewLanguage(fileName),
          targetLine: reference?.line,
          targetColumn: reference?.column,
          editable: false,
          missingFile: true,
          ...metadataOverride,
          file_path: resolvedPath,
        },
        options || { replace: true }
      );
    },
    [openPreview, workspace]
  );
};
