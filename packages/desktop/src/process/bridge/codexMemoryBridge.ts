/**
 * @license
 * Copyright 2025 DeepOrganiser (deepscientist.cc)
 * SPDX-License-Identifier: Apache-2.0
 */

import { ipcBridge } from '@/common';
import {
  getCodexConversationMemoryDetail,
  listCodexConversationMemories,
  persistCodexCompactionMemory,
  scanCodexConversationMemory,
} from '@/deepscientist_lark/codex_memory/service';

export function initCodexMemoryBridge(): void {
  ipcBridge.codexMemory.scan.provider(scanCodexConversationMemory);
  ipcBridge.codexMemory.persist.provider(async (request) => {
    const result = await persistCodexCompactionMemory(request);
    if (result.ok && result.saved) {
      ipcBridge.codexMemory.changed.emit({
        conversationId: result.conversationId,
        memoryId: result.memory?.id,
      });
    }
    return result;
  });
  ipcBridge.codexMemory.list.provider(({ conversationId }) => listCodexConversationMemories(conversationId));
  ipcBridge.codexMemory.get.provider(getCodexConversationMemoryDetail);
}
