import { chromium } from "playwright";
import { mkdir } from "node:fs/promises";
import { existsSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(__dirname, "..");
const source = resolve(repoRoot, "resources/readme/source/open-design-style-readme.html");
const outDir = resolve(repoRoot, "resources/readme");
const chromeCandidates = [
  "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
  "/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge",
];
const executablePath = chromeCandidates.find((candidate) => existsSync(candidate));

await mkdir(outDir, { recursive: true });

const browser = await chromium.launch({
  headless: true,
  ...(executablePath ? { executablePath } : {}),
});
const page = await browser.newPage({
  viewport: { width: 2100, height: 1450 },
  deviceScaleFactor: 1,
});

await page.goto(pathToFileURL(source).href, { waitUntil: "networkidle" });
for (const panel of await page.$$("[data-name]")) {
  const name = await panel.getAttribute("data-name");
  const outPath = resolve(outDir, `${name}.png`);
  await panel.screenshot({ path: outPath });
  console.log(outPath);
}

await browser.close();
