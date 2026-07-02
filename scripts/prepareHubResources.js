/**
 * prepareHubResources.js
 *
 * Downloads the hub index.json and all extension zip packages
 * into resources/hub/ so they are bundled with the app as local fallback.
 *
 * Called during the build pipeline before electron-builder runs.
 *
 * Environment variables:
 *   DEEPORGANISER_HUB_TAG    - Git tag to fetch from (default: 'dist-latest')
 *   DEEPORGANISER_HUB_SKIP   - Set to '1' to skip hub resource preparation
 */

const fs = require('fs');
const path = require('path');
const https = require('https');

const PROJECT_ROOT = path.resolve(__dirname, '..');
const HUB_DIR = path.join(PROJECT_ROOT, 'resources', 'hub');

const DEFAULT_TAG = 'dist-latest';
const legacyEnvName = (suffix) => `${['AI', 'ON', 'UI'].join('')}_${suffix}`;
const readEnv = (suffix) => process.env[`DEEPORGANISER_${suffix}`] || process.env[legacyEnvName(suffix)];
const DOWNLOAD_TIMEOUT_MS = Number(readEnv('HUB_TIMEOUT_MS') || 30000);
const BASE_URLS = [
  `https://raw.githubusercontent.com/iOfficeAI/AionHub/${readEnv('HUB_TAG') || DEFAULT_TAG}/`,
  `https://cdn.jsdelivr.net/gh/iOfficeAI/AionHub@${readEnv('HUB_TAG') || DEFAULT_TAG}/`,
];

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function ensureDir(dir) {
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
}

/**
 * Download a URL to a local file path. Tries each base URL in order.
 * Returns the base URL that succeeded.
 */
async function downloadFile(relativePath, destPath) {
  for (const base of BASE_URLS) {
    const url = new URL(relativePath, base).toString();
    try {
      await downloadUrl(url, destPath);
      return url;
    } catch (error) {
      console.warn(`  [hub] Failed from ${url}: ${error.message}`);
    }
  }
  throw new Error(`Failed to download ${relativePath} from all mirrors`);
}

function downloadUrl(url, destPath) {
  return new Promise((resolve, reject) => {
    let settled = false;

    const settle = (fn, value) => {
      if (settled) return;
      settled = true;
      fn(value);
    };

    const follow = (url, redirectCount = 0) => {
      if (redirectCount > 5) {
        settle(reject, new Error('Too many redirects'));
        return;
      }

      const get = url.startsWith('https') ? https.get : require('http').get;
      const req = get(url, (res) => {
        if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
          res.resume();
          res.destroy();
          follow(res.headers.location, redirectCount + 1);
          return;
        }

        if (res.statusCode !== 200) {
          res.resume();
          res.on('end', () => settle(reject, new Error(`HTTP ${res.statusCode}`)));
          return;
        }

        const file = fs.createWriteStream(destPath);
        res.pipe(file);
        file.on('finish', () => {
          file.close(() => {
            res.destroy();
            settle(resolve);
          });
        });
        file.on('error', (err) => {
          res.destroy();
          fs.rmSync(destPath, { force: true });
          settle(reject, err);
        });
      });

      req.setTimeout(DOWNLOAD_TIMEOUT_MS, () => {
        req.destroy(new Error(`Timeout after ${DOWNLOAD_TIMEOUT_MS}ms`));
      });
      req.on('error', (err) => {
        fs.rmSync(destPath, { force: true });
        settle(reject, err);
      });
    };

    follow(url);
  });
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function prepareHubResources() {
  if (readEnv('HUB_SKIP') === '1') {
    console.log('[hub] Skipping hub resource preparation (DEEPORGANISER_HUB_SKIP=1)');
    return { skipped: true };
  }

  const tag = readEnv('HUB_TAG') || DEFAULT_TAG;
  console.log(`[hub] Preparing hub resources from tag: ${tag}`);

  // Clean and create target directory
  if (fs.existsSync(HUB_DIR)) {
    fs.rmSync(HUB_DIR, { recursive: true, force: true });
  }
  ensureDir(HUB_DIR);

  // Step 1: Download index.json
  const indexPath = path.join(HUB_DIR, 'index.json');
  console.log('[hub] Downloading index.json...');
  const indexUrl = await downloadFile('index.json', indexPath);
  console.log(`[hub] index.json downloaded from ${indexUrl}`);

  // Step 2: Parse index and download all extension zips
  const index = JSON.parse(fs.readFileSync(indexPath, 'utf-8'));
  const extensions = index.extensions || {};
  const names = Object.keys(extensions);

  console.log(`[hub] Found ${names.length} extensions to bundle`);

  const results = [];
  for (const name of names) {
    const ext = extensions[name];
    const tarball = ext.dist?.tarball;
    if (!tarball) {
      console.warn(`[hub] Skipping ${name}: no dist.tarball`);
      continue;
    }

    const zipPath = path.join(HUB_DIR, path.basename(tarball));
    try {
      const url = await downloadFile(tarball, zipPath);
      const size = fs.statSync(zipPath).size;
      console.log(`[hub] ${name} -> ${path.basename(tarball)} (${(size / 1024).toFixed(1)} KB)`);
      results.push({ name, file: path.basename(tarball), size, url });
    } catch (error) {
      console.error(`[hub] Failed to download ${name}: ${error.message}`);
      // Non-fatal: continue with other extensions
    }
  }

  // Step 3: Write manifest for debugging/verification
  const manifest = {
    tag,
    generatedAt: new Date().toISOString(),
    indexUrl,
    extensions: results,
  };
  fs.writeFileSync(path.join(HUB_DIR, 'manifest.json'), JSON.stringify(manifest, null, 2) + '\n');

  console.log(`[hub] Done: ${results.length}/${names.length} extensions bundled in resources/hub/`);
  return { skipped: false, count: results.length, total: names.length };
}

// Support both direct execution and require() from build-with-builder.js
if (require.main === module) {
  prepareHubResources().catch((err) => {
    console.error('[hub] Fatal error:', err);
    process.exit(1);
  });
}

module.exports = { prepareHubResources };
