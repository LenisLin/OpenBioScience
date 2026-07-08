/**
 * @license
 * Copyright 2026 DeepOrganiser (deepscientist.cc)
 * SPDX-License-Identifier: Apache-2.0
 */

import fs from 'node:fs';
import path from 'node:path';

const uniqueStrings = (values: Array<string | undefined>): string[] =>
  Array.from(new Set(values.map((value) => value?.trim()).filter((value): value is string => Boolean(value)))).sort();

const allowedPathRoots = (): string[] =>
  uniqueStrings([
    process.env.OPENBIOSCIENCE_WORKSPACE_ROOT,
    process.env.OPENBIOSCIENCE_RUNTIME_ROOT,
    process.env.OPENSCIENCE_RUNTIME_ROOT,
    process.env.DEEPORGANISER_WORK_DIR,
  ]).filter((root) => path.isAbsolute(root));

const isPathUnderRoot = (candidate: string, root: string): boolean => {
  const relative = path.relative(path.resolve(root), path.resolve(candidate));
  return relative === '' || (!relative.startsWith('..') && !path.isAbsolute(relative));
};

export const safeAbsolutePathStatus = (candidate: string): 'available' | 'unverified' => {
  if (!path.isAbsolute(candidate)) return 'unverified';
  if (!allowedPathRoots().some((root) => isPathUnderRoot(candidate, root))) return 'unverified';
  return fs.existsSync(candidate) ? 'available' : 'unverified';
};
