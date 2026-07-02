const fs = require('node:fs');
const path = require('node:path');
const sharp = require('sharp');

const ROOT = path.resolve(__dirname, '..');
const OUT_DIR = path.join(ROOT, 'output', 'pet-preview');
const OUT_FILE = path.join(OUT_DIR, 'pet-style-preview.png');

const STATES = [
  'idle',
  'thinking',
  'working',
  'done',
  'happy',
  'error',
  'dragging',
  'attention',
  'notification',
  'random-read',
  'sleeping',
  'carrying',
];

const STYLES = [
  { key: 'classic', label: 'Classic' },
  { key: 'deepscientist', label: 'DeepScientist' },
  { key: 'paperfold', label: 'Paperfold' },
  { key: 'observatory', label: 'Observatory' },
];

const CARD_W = 136;
const CARD_H = 168;
const ICON = 108;
const LEFT_LABEL = 130;
const GAP = 12;
const TOP = 70;
const W = LEFT_LABEL + STATES.length * (CARD_W + GAP) + GAP;
const H = TOP + STYLES.length * (CARD_H + GAP) + 20;

function esc(value) {
  return String(value).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function svgText({ width, height, body }) {
  return Buffer.from(
    `<svg width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" xmlns="http://www.w3.org/2000/svg">${body}</svg>`
  );
}

async function main() {
  fs.mkdirSync(OUT_DIR, { recursive: true });
  const composites = [
    {
      input: svgText({
        width: W,
        height: TOP,
        body: `
          <text x="22" y="32" font-family="-apple-system,BlinkMacSystemFont,Segoe UI,sans-serif" font-size="22" font-weight="750" fill="#202020">Desktop Pet Style Preview</text>
          <text x="22" y="55" font-family="-apple-system,BlinkMacSystemFont,Segoe UI,sans-serif" font-size="12" fill="#706b60">same 108px render slot · 12 representative states</text>
        `,
      }),
      left: 0,
      top: 0,
    },
  ];

  for (const [row, style] of STYLES.entries()) {
    const y = TOP + row * (CARD_H + GAP);
    composites.push({
      input: svgText({
        width: LEFT_LABEL,
        height: CARD_H,
        body: `<text x="20" y="${Math.round(CARD_H / 2)}" font-family="-apple-system,BlinkMacSystemFont,Segoe UI,sans-serif" font-size="16" font-weight="700" fill="#2b2b33">${esc(style.label)}</text>`,
      }),
      left: 0,
      top: y,
    });

    for (const [col, state] of STATES.entries()) {
      const x = LEFT_LABEL + col * (CARD_W + GAP);
      const svgPath = path.join(ROOT, 'public', 'pet-states', style.key, `${state}.svg`);
      const iconBuffer = await sharp(fs.readFileSync(svgPath), { density: 192 }).resize(ICON, ICON).png().toBuffer();
      composites.push({
        input: svgText({
          width: CARD_W,
          height: CARD_H,
          body: `
            <rect x="0.5" y="0.5" width="${CARD_W - 1}" height="${CARD_H - 1}" rx="12" fill="#fffdfa" stroke="#ded6c7"/>
            <text x="${CARD_W / 2}" y="${CARD_H - 18}" text-anchor="middle" font-family="-apple-system,BlinkMacSystemFont,Segoe UI,sans-serif" font-size="11" fill="#5f584d">${esc(state)}</text>
          `,
        }),
        left: x,
        top: y,
      });
      composites.push({ input: iconBuffer, left: x + Math.round((CARD_W - ICON) / 2), top: y + 18 });
    }
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
