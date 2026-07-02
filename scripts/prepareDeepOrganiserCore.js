/**
 * CLI wrapper for prepare-deeporganiser-core.
 *
 * Reads environment variables and invokes the shared module.
 *
 * Version resolution order:
 *  1. DEEPORGANISER_CORE_RUN_ID env (download from upstream manual build artifact)
 *  2. DEEPORGANISER_CORE_VERSION env (for ad-hoc release overrides)
 *  3. "deepOrganiserCoreVersion" field in repo-root package.json (the pin)
 *  4. 'latest' (fallback; not recommended for reproducible builds)
 *
 * Environment variables:
 *  - DEEPORGANISER_CORE_RUN_ID: upstream manual build workflow run id
 *  - DEEPORGANISER_CORE_VERSION: override the pinned version
 *  - DEEPORGANISER_CORE_ARCH: target architecture (default: process.arch)
 *  - GH_TOKEN / GITHUB_TOKEN: GitHub API token (for rate limiting)
 */

const path = require('path');
const { prepareDeepOrganiserCore } = require('../packages/shared-scripts/src/prepare-deeporganiser-core.js');
const { resolveDeepOrganiserCoreVersion } = require('./resolveDeepOrganiserCoreVersion.js');

const projectRoot = path.resolve(__dirname, '..');
const platform = process.platform;
// Support cross-compilation: DEEPORGANISER_CORE_ARCH > npm_config_target_arch > process.arch
const arch = process.env.DEEPORGANISER_CORE_ARCH || process.env.npm_config_target_arch || process.arch;
const version = resolveDeepOrganiserCoreVersion(projectRoot);

try {
  prepareDeepOrganiserCore({ projectRoot, platform, arch, version });
} catch (error) {
  console.error('❌ prepareDeepOrganiserCore failed:', error.message);
  process.exit(1);
}

module.exports = function () {
  try {
    return prepareDeepOrganiserCore({ projectRoot, platform, arch, version });
  } catch (error) {
    console.error('❌ prepareDeepOrganiserCore failed:', error.message);
    throw error;
  }
};
