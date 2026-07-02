const fs = require('node:fs');
const path = require('node:path');
const sharp = require('sharp');

const ROOT = path.resolve(__dirname, '..');
const STATE_DIR = path.join(ROOT, 'public', 'pet-states', 'deepscientist');
const OUT_DIR = path.join(ROOT, 'output', 'pet-preview');
const OUT_FILE = path.join(OUT_DIR, 'deepscientist-pet-states.png');

const STATES = [
  'idle',
  'thinking',
  'working',
  'done',
  'happy',
  'error',
  'notification',
  'attention',
  'dragging',
  'poke-left',
  'poke-right',
  'random-look',
  'random-read',
  'yawning',
  'dozing',
  'sleeping',
  'waking',
  'sweeping',
  'building',
  'carrying',
  'juggling',
];

const CARD_W = 220;
const CARD_H = 250;
const ICON = 168;
const GAP = 18;
const COLS = 4;
const ROWS = Math.ceil(STATES.length / COLS);
const W = COLS * CARD_W + (COLS + 1) * GAP;
const H = ROWS * CARD_H + (ROWS + 1) * GAP + 72;

function esc(value) {
  return String(value).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function labelSvg(label) {
  return Buffer.from(`
    <svg width="${CARD_W}" height="34" viewBox="0 0 ${CARD_W} 34" xmlns="http://www.w3.org/2000/svg">
      <text x="${CARD_W / 2}" y="22" text-anchor="middle"
        font-family="-apple-system,BlinkMacSystemFont,Segoe UI,sans-serif"
        font-size="13" font-weight="650" letter-spacing=".6" fill="#3a3a3a">${esc(label)}</text>
    </svg>
  `);
}

function titleSvg() {
  return Buffer.from(`
    <svg width="${W}" height="72" viewBox="0 0 ${W} 72" xmlns="http://www.w3.org/2000/svg">
      <text x="${GAP}" y="31" font-family="-apple-system,BlinkMacSystemFont,Segoe UI,sans-serif"
        font-size="21" font-weight="750" fill="#202020">DeepScientist Pet · SVG State Preview</text>
      <text x="${GAP}" y="55" font-family="-apple-system,BlinkMacSystemFont,Segoe UI,sans-serif"
        font-size="12" fill="#707070">first visual pass · 21 animated states · default DeepScientist style</text>
    </svg>
  `);
}

async function main() {
  fs.mkdirSync(OUT_DIR, { recursive: true });

  const composites = [
    {
      input: titleSvg(),
      left: 0,
      top: 0,
    },
  ];

  for (const [index, state] of STATES.entries()) {
    const col = index % COLS;
    const row = Math.floor(index / COLS);
    const x = GAP + col * (CARD_W + GAP);
    const y = GAP + 72 + row * (CARD_H + GAP);
    const svgPath = path.join(STATE_DIR, `${state}.svg`);
    const iconBuffer = await sharp(fs.readFileSync(svgPath), { density: 192 }).resize(ICON, ICON).png().toBuffer();
    const bg = Buffer.from(`
      <svg width="${CARD_W}" height="${CARD_H}" viewBox="0 0 ${CARD_W} ${CARD_H}" xmlns="http://www.w3.org/2000/svg">
        <rect x="1" y="1" width="${CARD_W - 2}" height="${CARD_H - 2}" rx="12" fill="#fbfaf7" stroke="#e6dfcc" stroke-width="1.4"/>
        <rect x="16" y="18" width="${CARD_W - 32}" height="${ICON + 12}" rx="12" fill="#ffffff" stroke="#eee8d8" stroke-width="1"/>
      </svg>
    `);
    composites.push({ input: bg, left: x, top: y });
    composites.push({
      input: iconBuffer,
      left: x + Math.round((CARD_W - ICON) / 2),
      top: y + 22,
    });
    composites.push({ input: labelSvg(state), left: x, top: y + CARD_H - 45 });
  }

  await sharp({
    create: {
      width: W,
      height: H,
      channels: 4,
      background: '#f4f1ea',
    },
  })
    .composite(composites)
    .png()
    .toFile(OUT_FILE);

  console.log(OUT_FILE);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
