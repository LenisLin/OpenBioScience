#!/usr/bin/env node
/**
 * Build builtin MCP server scripts as fully self-contained CJS bundles.
 *
 * electron-vite's externalizeDepsPlugin leaves all npm packages as require()
 * calls, which works for Electron's main process (ASAR virtual FS patches
 * require()) but fails when an external `node` process runs the script from
 * app.asar.unpacked — there is no ASAR support there.
 *
 * This script uses esbuild's programmatic API (instead of CLI flags) to avoid
 * shell-quoting issues with special characters in --define values.
 */

const esbuild = require('esbuild');
const path = require('path');
const fs = require('fs');

const ROOT = path.resolve(__dirname, '..');

function firstExisting(candidates) {
  return candidates.find((candidate) => fs.existsSync(candidate));
}

function packageEntryDir(packageName) {
  try {
    return path.dirname(require.resolve(packageName, { paths: [ROOT] }));
  } catch {
    return undefined;
  }
}

const dependencyCompatPlugin = {
  name: 'builtin-mcp-dependency-compat',
  setup(build) {
    const gaxiosEntryDir = packageEntryDir('gaxios');
    const entitiesEntryDir = packageEntryDir('entities');
    const gaxiosCommon = firstExisting([
      ...(gaxiosEntryDir ? [path.join(gaxiosEntryDir, 'common.js')] : []),
      path.join(ROOT, 'node_modules/.bun/node_modules/gaxios/build/cjs/src/common.js'),
      path.join(ROOT, 'node_modules/gaxios/build/cjs/src/common.js'),
    ]);
    const entitiesDecode = firstExisting([
      path.join(ROOT, 'node_modules/.bun/node_modules/entities/dist/esm/decode.js'),
      path.join(ROOT, 'node_modules/entities/dist/esm/decode.js'),
      ...(entitiesEntryDir ? [path.join(entitiesEntryDir, '../esm/decode.js')] : []),
    ]);
    const unicornMagic = firstExisting([
      path.join(ROOT, 'node_modules/.bun/unicorn-magic@0.3.0/node_modules/unicorn-magic/node.js'),
      path.join(ROOT, 'node_modules/unicorn-magic/node.js'),
    ]);
    const aliases = {
      ...(gaxiosCommon ? { 'gaxios/build/src/common': gaxiosCommon } : {}),
      ...(entitiesDecode ? { 'entities/lib/decode.js': entitiesDecode } : {}),
      ...(unicornMagic ? { 'unicorn-magic': unicornMagic } : {}),
    };

    build.onResolve({ filter: /^(gaxios\/build\/src\/common|entities\/lib\/decode\.js|unicorn-magic)$/ }, (args) => {
      const alias = aliases[args.path];
      return alias ? { path: alias } : undefined;
    });
  },
};

const SHARED_OPTIONS = {
  bundle: true,
  platform: 'node',
  format: 'cjs',
  external: ['electron'],
  plugins: [dependencyCompatPlugin],
  tsconfig: path.join(ROOT, 'tsconfig.json'),
  loader: { '.wasm': 'empty' },
  define: {
    // @office-ai/aioncli-core uses import.meta.url for version detection.
    // Provide a valid file: URL so fileURLToPath() does not throw at startup.
    'import.meta.url': JSON.stringify('file:///C:/placeholder'),
  },
};

async function main() {
  await Promise.all([
    esbuild.build({
      ...SHARED_OPTIONS,
      entryPoints: [path.join(ROOT, 'packages/desktop/src/process/resources/builtinMcp/imageGenServer.ts')],
      outfile: path.join(ROOT, 'out/main/builtin-mcp-image-gen.js'),
    }),
    esbuild.build({
      ...SHARED_OPTIONS,
      entryPoints: [path.join(ROOT, 'packages/desktop/src/process/resources/builtinMcp/larkProjectAgentServer.ts')],
      outfile: path.join(ROOT, 'out/main/builtin-mcp-lark-project-agent.js'),
    }),
    esbuild.build({
      ...SHARED_OPTIONS,
      entryPoints: [path.join(ROOT, 'packages/desktop/src/process/resources/builtinMcp/medicalEvidenceServer.ts')],
      outfile: path.join(ROOT, 'out/main/builtin-mcp-medical-evidence.js'),
    }),
    esbuild.build({
      ...SHARED_OPTIONS,
      entryPoints: [path.join(ROOT, 'packages/desktop/src/process/resources/builtinMcp/researchEvidenceServer.ts')],
      outfile: path.join(ROOT, 'out/main/builtin-mcp-research-evidence.js'),
    }),
    esbuild.build({
      ...SHARED_OPTIONS,
      entryPoints: [path.join(ROOT, 'packages/desktop/src/process/resources/builtinMcp/scienceArtifactServer.ts')],
      outfile: path.join(ROOT, 'out/main/builtin-mcp-science-artifact.js'),
    }),
    esbuild.build({
      ...SHARED_OPTIONS,
      entryPoints: [path.join(ROOT, 'packages/desktop/src/process/resources/builtinMcp/labSkillServer.ts')],
      outfile: path.join(ROOT, 'out/main/builtin-mcp-lab-skill.js'),
    }),
    esbuild.build({
      ...SHARED_OPTIONS,
      entryPoints: [path.join(ROOT, 'packages/desktop/src/process/resources/builtinMcp/userInputServer.ts')],
      outfile: path.join(ROOT, 'out/main/builtin-mcp-user-input.js'),
    }),
    esbuild.build({
      ...SHARED_OPTIONS,
      entryPoints: [path.join(ROOT, 'packages/desktop/src/process/resources/builtinMcp/bioServer.ts')],
      outfile: path.join(ROOT, 'out/main/builtin-mcp-bio.js'),
    }),
    esbuild.build({
      ...SHARED_OPTIONS,
      entryPoints: [path.join(ROOT, 'packages/desktop/src/process/resources/builtinMcp/bio/pymolServer.ts')],
      outfile: path.join(ROOT, 'out/main/builtin-mcp-pymol.js'),
    }),
  ]);
}

main().catch((err) => {
  console.error('MCP server build failed:', err);
  process.exit(1);
});
