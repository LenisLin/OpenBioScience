import type { ConversationContextValue } from '@/renderer/hooks/context/ConversationContext';

export const isCodexConversationRuntime = (context?: ConversationContextValue | null): boolean =>
  context?.type === 'codex' || (context?.type === 'acp' && context.backend === 'codex');

