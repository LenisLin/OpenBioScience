import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { PYMOL_TOOL_NAMES } from '@/common/types/platform/pymolTypes';

describe('PyMOL MCP schema', () => {
  it('registers exactly the stable public tool names', () => {
    const source = fs.readFileSync(
      path.resolve('packages/desktop/src/process/resources/builtinMcp/bio/pymolServer.ts'),
      'utf8'
    );
    const registeredNames = [...source.matchAll(/server\.tool\(\s*'([^']+)'/gu)].map((match) => match[1]);

    expect(registeredNames).toEqual(PYMOL_TOOL_NAMES);
  });
});
