const fs = require('node:fs');
const path = require('node:path');

const OUT_DIR = path.resolve(__dirname, '..', 'public', 'pet-states', 'deepscientist');
const VIEWBOX_MIN = -28;
const VIEWBOX_SIZE = 156;

const STATES = [
  'idle',
  'thinking',
  'working',
  'done',
  'happy',
  'error',
  'dragging',
  'attention',
  'poke-left',
  'poke-right',
  'notification',
  'random-look',
  'random-read',
  'yawning',
  'dozing',
  'sleeping',
  'waking',
  'sweeping',
  'juggling',
  'building',
  'carrying',
];

const configs = {
  idle: { eyes: 'dot', mouth: 'smile', body: 'float', ring: 'drift', mark: 'leaf' },
  thinking: { eyes: 'up', mouth: 'flat', body: 'breathe', ring: 'still', mark: 'thought' },
  working: { eyes: 'focus', mouth: 'flat', body: 'work', ring: 'fast', mark: 'data' },
  done: { eyes: 'happy', mouth: 'laugh', body: 'pop', ring: 'pulse', mark: 'spark' },
  happy: { eyes: 'happy', mouth: 'softLaugh', body: 'happy', ring: 'drift', mark: 'heart' },
  error: { eyes: 'x', mouth: 'frown', body: 'shake', ring: 'error', mark: 'sweat' },
  dragging: { eyes: 'surprise', mouth: 'o', body: 'drag', ring: 'under', mark: 'none' },
  attention: { eyes: 'wide', mouth: 'o', body: 'pop', ring: 'pulse', mark: 'ping' },
  'poke-left': { eyes: 'left', mouth: 'wobble', body: 'pokeLeft', ring: 'tiltRight', mark: 'tapLeft' },
  'poke-right': { eyes: 'right', mouth: 'wobble', body: 'pokeRight', ring: 'tiltLeft', mark: 'tapRight' },
  notification: { eyes: 'curious', mouth: 'smallO', body: 'breathe', ring: 'pulse', mark: 'notice' },
  'random-look': { eyes: 'lookAround', mouth: 'smile', body: 'breathe', ring: 'drift', mark: 'none' },
  'random-read': { eyes: 'down', mouth: 'flat', body: 'breathe', ring: 'desk', mark: 'none' },
  yawning: { eyes: 'closed', mouth: 'yawn', body: 'yawn', ring: 'sleepy', mark: 'sleepDot' },
  dozing: { eyes: 'half', mouth: 'sleepy', body: 'doze', ring: 'sleepy', mark: 'tinyZ' },
  sleeping: { eyes: 'sleep', mouth: 'sleepy', body: 'sleep', ring: 'cradle', mark: 'zzz' },
  waking: { eyes: 'wink', mouth: 'smallO', body: 'wake', ring: 'lift', mark: 'wake' },
  sweeping: { eyes: 'downFocus', mouth: 'smile', body: 'work', ring: 'funnel', mark: 'debris' },
  juggling: { eyes: 'sideFocus', mouth: 'smallO', body: 'juggle', ring: 'orbit', mark: 'orbs' },
  building: { eyes: 'focus', mouth: 'flat', body: 'work', ring: 'dash', mark: 'none' },
  carrying: { eyes: 'strain', mouth: 'teeth', body: 'carry', ring: 'top', mark: 'none' },
};

function css() {
  return `
    .body{fill:#fffdfa;stroke:#242424;stroke-width:4.8;stroke-linecap:round;stroke-linejoin:round}
    .face{stroke:#242424;stroke-width:2.8;stroke-linecap:round;stroke-linejoin:round;fill:none}
    .face-fill{fill:#242424}
    .gold-fill{fill:#b99d4d}
    .gold-line{stroke:#b99d4d;stroke-width:2.8;stroke-linecap:round;stroke-linejoin:round;fill:none}
    .ring-back{stroke:#242424;stroke-width:4.4;stroke-linecap:round;fill:none;opacity:.16}
    .ring-gold{stroke:#b99d4d;stroke-width:3.2;stroke-linecap:round;fill:none}
    .shadow{fill:#242424;opacity:.14;animation:shadow 3s ease-in-out infinite;transform-origin:50px 86px}
    .float{animation:float 3.2s ease-in-out infinite;transform-origin:50px 52px}
    .breathe{animation:breathe 3s ease-in-out infinite;transform-origin:50px 52px}
    .work{animation:work 1.25s ease-in-out infinite;transform-origin:50px 52px}
    .pop{animation:pop 1.4s cubic-bezier(.2,1.45,.34,1) infinite;transform-origin:50px 52px}
    .happy{animation:happy 1.8s ease-in-out infinite;transform-origin:50px 52px}
    .shake{animation:shake .5s ease-in-out infinite;transform-origin:50px 52px}
    .drag{animation:drag 1.1s ease-in-out infinite;transform-origin:50px 52px}
    .pokeLeft{animation:pokeLeft 1.35s ease-in-out infinite;transform-origin:50px 52px}
    .pokeRight{animation:pokeRight 1.35s ease-in-out infinite;transform-origin:50px 52px}
    .yawn{animation:yawn 2.6s ease-in-out infinite;transform-origin:50px 52px}
    .doze{animation:doze 3.6s ease-in-out infinite;transform-origin:50px 52px}
    .sleep{animation:sleep 4.4s ease-in-out infinite;transform-origin:50px 56px}
    .wake{animation:wake 1.4s ease-out infinite;transform-origin:50px 52px}
    .juggle{animation:juggle 1.5s ease-in-out infinite;transform-origin:50px 52px}
    .carry{animation:carry .8s ease-in-out infinite;transform-origin:50px 52px}
    .ring-drift{animation:ringDrift 5.8s ease-in-out infinite;transform-origin:50px 52px}
    .ring-fast{animation:ringSpin 2s linear infinite;transform-origin:50px 52px}
    .ring-still{animation:ringStill 3s ease-in-out infinite;transform-origin:50px 52px}
    .ring-pulse{animation:ringPulse 1.5s ease-in-out infinite;transform-origin:50px 52px}
    .ring-error{animation:ringError .55s ease-in-out infinite;transform-origin:50px 52px}
    .ring-lift{animation:ringLift 1.4s ease-out infinite;transform-origin:50px 52px}
    .ring-orbit{animation:ringSpin 2.4s linear infinite;transform-origin:50px 52px}
    .ring-dash .ring-gold{stroke-dasharray:7 6;animation:dashFlow 1s linear infinite}
    .ring-funnel{animation:ringSpin 1.8s linear infinite;transform-origin:50px 52px}
    .eye-look{animation:eyeLook 4s ease-in-out infinite}
    .spark{animation:spark 2.2s ease-in-out infinite;transform-origin:center}
    .spark2{animation-delay:.35s}
    .dot1{animation:dot 1.35s ease-in-out infinite}
    .dot2{animation:dot 1.35s ease-in-out .22s infinite}
    .dot3{animation:dot 1.35s ease-in-out .44s infinite}
    .driftDot{animation:driftDot 2.4s ease-in-out infinite}
    @keyframes shadow{0%,100%{transform:scaleX(1)}50%{transform:scaleX(.82);opacity:.1}}
    @keyframes float{0%,100%{transform:translateY(0)}50%{transform:translateY(-2.5px)}}
    @keyframes breathe{0%,100%{transform:scale(1)}50%{transform:scale(1.018,.982)}}
    @keyframes work{0%,100%{transform:translateY(0)}50%{transform:translateY(-2px)}}
    @keyframes pop{0%,100%{transform:scale(1)}45%{transform:scale(1.08)}70%{transform:scale(.985)}}
    @keyframes happy{0%,100%{transform:rotate(0) translateY(0)}35%{transform:rotate(-4deg) translateY(-2px)}70%{transform:rotate(4deg)}}
    @keyframes shake{0%,100%{transform:translateX(0)}25%{transform:translateX(-1.5px)}75%{transform:translateX(1.5px)}}
    @keyframes drag{0%,100%{transform:translateY(-3px) scale(1,.98)}50%{transform:translateY(-7px) scale(.97,1.05)}}
    @keyframes pokeLeft{0%,100%{transform:rotate(0)}38%{transform:rotate(-8deg) translateX(-2px)}70%{transform:rotate(2deg)}}
    @keyframes pokeRight{0%,100%{transform:rotate(0)}38%{transform:rotate(8deg) translateX(2px)}70%{transform:rotate(-2deg)}}
    @keyframes yawn{0%,100%{transform:scale(1)}45%{transform:translateY(2px) scale(1.04,.92)}}
    @keyframes doze{0%,100%{transform:translateY(0) rotate(0)}50%{transform:translateY(2px) rotate(-2deg)}}
    @keyframes sleep{0%,100%{transform:translateY(3px) scale(.96)}50%{transform:translateY(1px) scale(.98)}}
    @keyframes wake{0%{transform:translateY(4px) scale(.92)}45%{transform:translateY(-2px) scale(1.08)}100%{transform:scale(1)}}
    @keyframes juggle{0%,100%{transform:translateY(0)}50%{transform:translateY(2px)}}
    @keyframes carry{0%,100%{transform:translateX(-1px)}50%{transform:translateX(1.5px)}}
    @keyframes ringDrift{0%,100%{transform:rotate(-2deg)}50%{transform:rotate(2deg)}}
    @keyframes ringSpin{to{transform:rotate(360deg)}}
    @keyframes ringStill{0%,100%{opacity:.8}50%{opacity:1}}
    @keyframes ringPulse{0%,100%{transform:scale(1)}50%{transform:scale(1.08)}}
    @keyframes ringError{0%,100%{transform:rotate(10deg)}30%{transform:rotate(3deg)}70%{transform:rotate(17deg)}}
    @keyframes ringLift{0%{transform:translateY(8px) rotate(-14deg)}100%{transform:translateY(0) rotate(0)}}
    @keyframes dashFlow{to{stroke-dashoffset:-26}}
    @keyframes eyeLook{0%,100%{transform:translateX(0)}32%{transform:translateX(2.5px)}68%{transform:translateX(-2.5px)}}
    @keyframes spark{0%,100%{transform:scale(.88);opacity:.55}50%{transform:scale(1.12);opacity:1}}
    @keyframes dot{0%,100%{transform:translateY(0);opacity:.45}50%{transform:translateY(-2px);opacity:1}}
    @keyframes driftDot{0%,100%{transform:translate(0,0);opacity:.35}50%{transform:translate(5px,-4px);opacity:1}}
    @media (prefers-reduced-motion:reduce){*{animation:none!important}}
  `;
}

function bodyTransform(kind) {
  switch (kind) {
    case 'carry':
      return 'translate(0 7) scale(1.06 .86)';
    case 'sleep':
      return 'translate(0 4) scale(.98)';
    default:
      return '';
  }
}

function ringPose(kind) {
  switch (kind) {
    case 'under':
      return 'translate(0 12) scale(1 .5)';
    case 'desk':
      return 'translate(0 17) scale(.92 .34)';
    case 'sleepy':
      return 'translate(0 8) rotate(12 50 52) scale(.92 .65)';
    case 'cradle':
      return 'translate(0 14) rotate(8 50 52) scale(.86 .5)';
    case 'tiltLeft':
      return 'rotate(-12 50 52)';
    case 'tiltRight':
      return 'rotate(12 50 52)';
    case 'error':
      return 'rotate(22 50 52) translate(1 -2)';
    case 'funnel':
      return 'rotate(-36 50 52) scale(1 .62)';
    case 'top':
      return 'translate(0 -18) rotate(-4 50 52) scale(.95 .38)';
    case 'lift':
      return 'rotate(-18 50 52)';
    default:
      return 'rotate(-18 50 52)';
  }
}

function ringMotion(kind) {
  switch (kind) {
    case 'fast':
      return 'ring-fast';
    case 'still':
      return 'ring-still';
    case 'pulse':
      return 'ring-pulse';
    case 'error':
      return 'ring-error';
    case 'lift':
      return 'ring-lift';
    case 'orbit':
      return 'ring-orbit';
    case 'dash':
      return 'ring-dash ring-drift';
    case 'funnel':
      return 'ring-funnel';
    case 'top':
      return 'shake';
    default:
      return 'ring-drift';
  }
}

function ring(kind) {
  const pose = ringPose(kind);
  const motion = ringMotion(kind);
  return `
    <g transform="${pose}">
      <g class="${motion}">
        <ellipse cx="50" cy="52" rx="34" ry="11" class="ring-back"/>
        <ellipse cx="50" cy="52" rx="34" ry="11" class="ring-gold"/>
      </g>
    </g>
  `;
}

function eyes(type) {
  switch (type) {
    case 'up':
      return '<circle class="face-fill" cx="42" cy="44" r="2.8"/><circle class="face-fill" cx="59" cy="43" r="2.8"/>';
    case 'focus':
      return '<circle class="face-fill" cx="42" cy="47" r="2.5"/><circle class="face-fill" cx="58" cy="47" r="2.5"/><path class="face" d="M37 42l9 2M63 42l-9 2"/>';
    case 'downFocus':
      return '<circle class="face-fill" cx="42" cy="49" r="2.5"/><circle class="face-fill" cx="58" cy="49" r="2.5"/><path class="face" d="M38 45h8M54 45h8"/>';
    case 'happy':
      return '<path class="face" d="M37 47q5 4 10 0M53 47q5 4 10 0"/>';
    case 'x':
      return '<path class="face" d="M38 43l7 7M45 43l-7 7M55 43l7 7M62 43l-7 7"/>';
    case 'surprise':
      return '<circle cx="42" cy="46" r="4" class="face"/><circle cx="58" cy="46" r="4" class="face"/><circle class="face-fill" cx="42" cy="46" r="1.4"/><circle class="face-fill" cx="58" cy="46" r="1.4"/>';
    case 'wide':
      return '<circle class="face-fill" cx="42" cy="46" r="3.5"/><circle class="face-fill" cx="58" cy="46" r="3.5"/>';
    case 'left':
      return '<circle class="face-fill" cx="40" cy="46" r="2.7"/><circle class="face-fill" cx="56" cy="46" r="2.7"/>';
    case 'right':
      return '<circle class="face-fill" cx="44" cy="46" r="2.7"/><circle class="face-fill" cx="60" cy="46" r="2.7"/>';
    case 'curious':
      return '<circle class="face-fill" cx="42" cy="46" r="2.8"/><circle class="face-fill" cx="57" cy="47" r="2.8"/><path class="gold-line" d="M63 39q3-4 7-1"/>';
    case 'lookAround':
      return '<g class="eye-look"><circle class="face-fill" cx="42" cy="46" r="2.7"/><circle class="face-fill" cx="58" cy="46" r="2.7"/></g>';
    case 'down':
      return '<path class="face" d="M37 47q5 2 10 0M53 47q5 2 10 0"/>';
    case 'closed':
      return '<path class="face" d="M37 47q5 4 10 0M53 47q5 4 10 0"/>';
    case 'half':
      return '<path class="face" d="M37 47q5 2 10 0M54 47h8"/>';
    case 'sleep':
      return '<path class="face" d="M37 47q5 3 10 0M53 47q5 3 10 0"/>';
    case 'wink':
      return '<circle class="face-fill" cx="42" cy="46" r="2.8"/><path class="face" d="M54 47q5 3 10 0"/>';
    case 'sideFocus':
      return '<circle class="face-fill" cx="40" cy="46" r="2.7"/><circle class="face-fill" cx="58" cy="46" r="2.7"/><path class="face" d="M36 42l8 2M62 42l-8 2"/>';
    case 'strain':
      return '<path class="face" d="M37 45q5-3 10 0M53 45q5-3 10 0"/>';
    default:
      return '<circle class="face-fill" cx="42" cy="46" r="2.8"/><circle class="face-fill" cx="58" cy="46" r="2.8"/>';
  }
}

function mouth(type) {
  switch (type) {
    case 'flat':
      return '<path class="face" d="M44 56h12"/>';
    case 'laugh':
      return '<path class="face" d="M41 54q9 9 18 0"/>';
    case 'softLaugh':
      return '<path class="face" d="M42 54q8 7 16 0"/>';
    case 'frown':
      return '<path class="face" d="M43 59q7-5 14 0"/>';
    case 'o':
      return '<ellipse cx="50" cy="56" rx="3.8" ry="4.4" class="face-fill"/>';
    case 'smallO':
      return '<circle cx="50" cy="56" r="2.8" class="face-fill"/>';
    case 'wobble':
      return '<path class="face" d="M43 57q4-3 7 0t7 0"/>';
    case 'yawn':
      return '<ellipse cx="50" cy="57" rx="4.3" ry="5.4" class="face-fill"/>';
    case 'sleepy':
      return '<path class="face" d="M44 56q6 3 12 0"/>';
    case 'teeth':
      return '<path class="face" d="M43 56h14M46 54v4M50 54v4M54 54v4"/>';
    default:
      return '<path class="face" d="M43 54q7 6 14 0"/>';
  }
}

function mark(type) {
  switch (type) {
    case 'thought':
      return '<circle class="gold-fill dot1" cx="70" cy="22" r="2.2"/><circle class="gold-fill dot2" cx="77" cy="17" r="2"/><circle class="gold-fill dot3" cx="84" cy="14" r="1.7"/>';
    case 'data':
      return '<circle class="gold-fill driftDot" cx="25" cy="68" r="2"/><circle class="gold-fill driftDot" cx="76" cy="31" r="1.8" style="animation-delay:.3s"/><circle class="gold-fill driftDot" cx="82" cy="60" r="1.6" style="animation-delay:.6s"/>';
    case 'spark':
      return '<path class="gold-fill spark" d="M76 15l3 6 6 3-6 3-3 6-3-6-6-3 6-3z"/><path class="gold-fill spark spark2" d="M24 66l2.2 4.4 4.4 2.2-4.4 2.2-2.2 4.4-2.2-4.4-4.4-2.2 4.4-2.2z"/>';
    case 'heart':
      return '<path class="gold-fill spark" d="M77 22c3-5 10-2 8 4-1 4-8 8-8 8s-7-4-8-8c-2-6 5-9 8-4z"/>';
    case 'sweat':
      return '<path d="M75 20c4 4 6 7 6 10a5.4 5.4 0 0 1-10.8 0c0-3 2-6 4.8-10z" fill="#fffdfa" stroke="#242424" stroke-width="2.4" stroke-linejoin="round"/><path class="gold-line" d="M24 68c-4 0-7-2-9-5"/>';
    case 'ping':
      return '<path class="gold-fill spark" d="M50 10l2.6 7 7 2.6-7 2.6-2.6 7-2.6-7-7-2.6 7-2.6z"/>';
    case 'tapLeft':
      return '<path class="gold-line" d="M19 50h9M23 44l6 6-6 6"/>';
    case 'tapRight':
      return '<path class="gold-line" d="M81 50h-9M77 44l-6 6 6 6"/>';
    case 'notice':
      return '<circle class="gold-fill spark" cx="72" cy="22" r="4.5"/><circle class="ring-gold ring-pulse" cx="72" cy="22" r="8"/><path class="gold-line" d="M64 28q8 5 16 0" opacity=".65"/>';
    case 'sleepDot':
      return '<circle class="gold-fill dot1" cx="74" cy="25" r="3"/><circle class="gold-fill dot2" cx="82" cy="18" r="2.1"/>';
    case 'tinyZ':
      return '<path class="gold-line spark" d="M74 22h6l-6 6h7M82 15h4.5l-4.5 4.5h5"/>';
    case 'zzz':
      return '<path class="gold-line spark" d="M70 22h8l-8 8h9M80 12h6l-6 6h7"/>';
    case 'wake':
      return '<path class="gold-fill spark" d="M28 17l2.4 6.5 6.5 2.4-6.5 2.4-2.4 6.5-2.4-6.5-6.5-2.4 6.5-2.4z"/><path class="gold-fill spark spark2" d="M73 17l2 5 5 2-5 2-2 5-2-5-5-2 5-2z"/>';
    case 'debris':
      return '<circle class="gold-fill driftDot" cx="20" cy="68" r="2"/><circle class="gold-fill driftDot" cx="30" cy="75" r="1.8" style="animation-delay:.25s"/><circle class="gold-fill driftDot" cx="79" cy="28" r="1.6" style="animation-delay:.5s"/>';
    case 'orbs':
      return '<circle class="gold-fill dot1" cx="26" cy="29" r="3.3"/><circle class="gold-fill dot2" cx="50" cy="17" r="3"/><circle class="gold-fill dot3" cx="74" cy="29" r="3.3"/>';
    case 'leaf':
      return '<path class="gold-fill spark" d="M23 28c-6-1-9-4-10-8 5 1 9 4 10 8z"/><path class="gold-fill spark spark2" d="M77 27c6-1 9-4 10-8-5 1-9 4-10 8z"/>';
    default:
      return '';
  }
}

function core(config) {
  const bodyClass = config.body || 'float';
  const bodyTx = bodyTransform(config.body);
  return `
    ${ring(config.ring)}
    <g class="${bodyClass}">
      <g transform="${bodyTx}">
        <circle cx="50" cy="52" r="22" class="body"/>
        <circle class="gold-fill spark2" cx="64" cy="38" r="2.6" opacity=".85"/>
        ${eyes(config.eyes)}
        ${mouth(config.mouth)}
      </g>
    </g>
  `;
}

function svgForState(name) {
  const config = configs[name] || configs.idle;
  return `<svg viewBox="${VIEWBOX_MIN} ${VIEWBOX_MIN} ${VIEWBOX_SIZE} ${VIEWBOX_SIZE}" width="500" height="500" fill="none" xmlns="http://www.w3.org/2000/svg">
  <defs><style>${css()}</style></defs>
  <ellipse class="shadow" cx="50" cy="86" rx="18" ry="3.5"/>
  ${mark(config.mark)}
  ${core(config)}
</svg>
`;
}

fs.mkdirSync(OUT_DIR, { recursive: true });
for (const state of STATES) {
  fs.writeFileSync(path.join(OUT_DIR, `${state}.svg`), svgForState(state));
}

console.log(`Generated ${STATES.length} Smart Core DeepScientist pet states in ${OUT_DIR}`);
