/**
 * Resolve the DeepOrganiser Core version tag to download for packaging.
 *
 * Order:
 *   1. DEEPORGANISER_CORE_VERSION env (ad-hoc override, e.g. CI dispatch input)
 *   2. "deepOrganiserCoreVersion" field in repo-root package.json (the pin)
 *   3. 'latest' (GitHub API releases/latest; non-reproducible fallback)
 *
 * Keep this file tiny and dependency-free — packaging may call it before any
 * project-level install has necessarily completed.
 */

const fs = require('fs');
const path = require('path');

function resolveDeepOrganiserCoreVersion(projectRoot) {
  const envOverride = process.env.DEEPORGANISER_CORE_VERSION;
  if (envOverride && envOverride.trim()) {
    return envOverride.trim();
  }

  try {
    const pkgPath = path.join(projectRoot, 'package.json');
    const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf-8'));
    if (pkg && typeof pkg.deepOrganiserCoreVersion === 'string' && pkg.deepOrganiserCoreVersion.trim()) {
      return pkg.deepOrganiserCoreVersion.trim();
    }
  } catch {
    // fall through
  }

  return 'latest';
}

module.exports = { resolveDeepOrganiserCoreVersion };
