/**
 * @license
 * Copyright 2026 DeepOrganiser (deepscientist.cc)
 * SPDX-License-Identifier: Apache-2.0
 */

export type MentionRange = {
  query: string;
  start: number;
  end: number;
};

function clampOffset(value: number, length: number): number {
  return Math.max(0, Math.min(value, length));
}

function startsWithCaseInsensitive(value: string, prefix: string): boolean {
  return value.toLocaleLowerCase().startsWith(prefix.toLocaleLowerCase());
}

export function findMentionAtCaret(text: string, caretOffset: number): MentionRange | null {
  const safeCaretOffset = clampOffset(caretOffset, text.length);
  const beforeCaret = text.slice(0, safeCaretOffset);
  const atIndex = beforeCaret.lastIndexOf('@');
  if (atIndex < 0) return null;
  const query = text.slice(atIndex + 1, safeCaretOffset);
  if (/[\s@]/.test(query)) return null;
  return {
    query,
    start: atIndex,
    end: safeCaretOffset,
  };
}

export function buildMentionInsertion(
  text: string,
  contactName: string,
  range: MentionRange | null | undefined,
  fallbackCaretOffset: number
): { text: string; caretOffset: number } {
  const fallbackOffset = clampOffset(fallbackCaretOffset, text.length);
  const activeRange = range ?? findMentionAtCaret(text, fallbackOffset);
  const start = clampOffset(activeRange?.start ?? fallbackOffset, text.length);
  const end = clampOffset(activeRange?.end ?? fallbackOffset, text.length);
  const query = activeRange ? text.slice(start + 1, end) : '';
  const prefix = text.slice(0, start);
  let suffix = text.slice(end);

  const remainingContactName =
    query && startsWithCaseInsensitive(contactName, query) ? contactName.slice(query.length) : '';
  if (remainingContactName && startsWithCaseInsensitive(suffix, remainingContactName)) {
    suffix = suffix.slice(remainingContactName.length);
  }

  const needsSpaceAfter = suffix.length === 0 || !/^\s/u.test(suffix);
  const mentionText = `@${contactName}${needsSpaceAfter ? ' ' : ''}`;
  return {
    text: `${prefix}${mentionText}${suffix}`,
    caretOffset: prefix.length + mentionText.length,
  };
}
