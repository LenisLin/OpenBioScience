/**
 * @license
 * Copyright 2025 DeepOrganiser (deepscientist.cc)
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * DeepOrganiser应用程序共用常量
 */

import { LEGACY_APP_NAMESPACE, legacyEnvName } from '@/common/config/legacyIdentifiers';

// ===== 文件处理相关常量 =====

/** 临时文件时间戳分隔符 */
export const APP_TIMESTAMP_SEPARATOR = '_deeporganiser_';
const LEGACY_TIMESTAMP_SEPARATOR = `_${LEGACY_APP_NAMESPACE}_`;

/** 用于匹配和清理时间戳后缀的正则表达式 */
export const APP_TIMESTAMP_REGEX = new RegExp(
  `(?:${APP_TIMESTAMP_SEPARATOR}|${LEGACY_TIMESTAMP_SEPARATOR})\\d{13}(\\.\\w+)?$`
);
export const APP_FILES_MARKER = '[[DEEPORGANISER_FILES]]';
export const LEGACY_FILES_MARKER = '[[AION_FILES]]';

// ===== 媒体类型相关常量 =====

/** 支持的图片文件扩展名 */
export const IMAGE_EXTENSIONS = ['.jpg', '.jpeg', '.png', '.gif', '.webp', '.bmp', '.tiff', '.svg'] as const;

/** 文件扩展名到MIME类型的映射 */
export const MIME_TYPE_MAP: Record<string, string> = {
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.png': 'image/png',
  '.gif': 'image/gif',
  '.webp': 'image/webp',
  '.bmp': 'image/bmp',
  '.tiff': 'image/tiff',
  '.svg': 'image/svg+xml',
};

/** MIME类型到文件扩展名的映射 */
export const MIME_TO_EXT_MAP: Record<string, string> = {
  jpeg: '.jpg',
  jpg: '.jpg',
  png: '.png',
  gif: '.gif',
  webp: '.webp',
  bmp: '.bmp',
  tiff: '.tiff',
  'svg+xml': '.svg',
};

/** 默认图片文件扩展名 */
export const DEFAULT_IMAGE_EXTENSION = '.png';

// ===== WebUI 相关常量 =====

/** WebUI default port: 25808 for production, 25809 for development, 25810 for multi-instance dev */
export const WEBUI_DEFAULT_PORT = (() => {
  if (process.env.NODE_ENV === 'production') return 25808;
  if (process.env.DEEPORGANISER_MULTI_INSTANCE === '1' || process.env[legacyEnvName('MULTI_INSTANCE')] === '1') return 25810;
  return 25809;
})();

// ===== AI Provider 相关常量 =====

// Stable ID for the Google Auth virtual provider.
// Shared between frontend (useModelProviderList) and backend (SystemActions).
export const GOOGLE_AUTH_PROVIDER_ID = 'google-auth-gemini';
