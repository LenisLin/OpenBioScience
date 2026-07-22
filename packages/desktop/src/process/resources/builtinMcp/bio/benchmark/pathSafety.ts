import path from 'node:path';

const BENCHMARK_ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._-]{0,79}$/u;

export const assertBenchmarkId = (benchmarkId: string): string => {
  if (!BENCHMARK_ID_PATTERN.test(benchmarkId)) throw new Error('benchmarkId is not a safe identifier.');
  return benchmarkId;
};

export const normalizeBenchmarkRelativePath = (candidate: string): string => {
  if (!candidate.trim() || candidate.includes('\0')) throw new Error('Path must be a non-empty project-relative path.');
  if (path.posix.isAbsolute(candidate) || path.win32.isAbsolute(candidate) || /^[A-Za-z]:/u.test(candidate)) {
    throw new Error('Path must be project-relative.');
  }
  const segments = candidate.replaceAll('\\', '/').split('/');
  if (segments.some((segment) => !segment || segment === '.' || segment === '..')) {
    throw new Error('Path contains an unsafe segment.');
  }
  return segments.join('/');
};

export const resolveBenchmarkProjectPath = (
  projectRoot: string,
  candidate: string
): { relativePath: string; absolutePath: string } => {
  if (!path.isAbsolute(projectRoot)) throw new Error('projectRoot must be absolute.');
  const relativePath = normalizeBenchmarkRelativePath(candidate);
  const root = path.resolve(projectRoot);
  const absolutePath = path.resolve(root, ...relativePath.split('/'));
  const relative = path.relative(root, absolutePath);
  if (!relative || relative.startsWith('..') || path.isAbsolute(relative)) {
    throw new Error('Path escapes or aliases the project root.');
  }
  return { relativePath, absolutePath };
};

export const benchmarkControlRelativePath = (benchmarkId: string): string =>
  `.openbioscience/control/benchmark/v1/${assertBenchmarkId(benchmarkId)}/state.json`;

export const benchmarkOutputRelativePath = (benchmarkId: string): string =>
  `benchmarks/${assertBenchmarkId(benchmarkId)}`;
