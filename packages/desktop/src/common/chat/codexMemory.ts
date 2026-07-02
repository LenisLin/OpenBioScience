/**
 * @license
 * Copyright 2025 DeepOrganiser (deepscientist.cc)
 * SPDX-License-Identifier: Apache-2.0
 */

export function isCodexCompactionMemoryText(text: string): boolean {
  return /上下文已压缩|context compacted|compaction complete|memory compacted/i.test(text);
}

