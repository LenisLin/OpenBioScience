const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '..');
const OUT_ROOT = path.join(ROOT, 'public', 'pet-states');
const VIEWBOX = '-28 -28 156 156';
const WIDTH = 500;
const HEIGHT = 500;

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

const paperConfigs = {
  idle: { body: 'pf-float', eyes: 'dot', mouth: 'smile', mark: 'none' },
  thinking: { body: 'pf-think', eyes: 'up', mouth: 'flat', mark: 'thought' },
  working: { body: 'pf-work', eyes: 'focus', mouth: 'flat', mark: 'none' },
  done: { body: 'pf-pop', eyes: 'happy', mouth: 'laugh', mark: 'check' },
  happy: { body: 'pf-happy', eyes: 'happy', mouth: 'laugh', mark: 'none' },
  error: { body: 'pf-shake', eyes: 'x', mouth: 'frown', mark: 'warning' },
  dragging: { body: 'pf-drag', eyes: 'wide', mouth: 'o', mark: 'none' },
  attention: { body: 'pf-pop', eyes: 'wide', mouth: 'smallO', mark: 'bang' },
  'poke-left': { body: 'pf-poke-left', eyes: 'right', mouth: 'wobble', mark: 'none' },
  'poke-right': { body: 'pf-poke-right', eyes: 'left', mouth: 'wobble', mark: 'none' },
  notification: { body: 'pf-float', eyes: 'dot', mouth: 'smile', mark: 'mail' },
  'random-look': { body: 'pf-float', eyes: 'lookAround', mouth: 'smile', mark: 'none' },
  'random-read': { body: 'pf-read', eyes: 'down', mouth: 'flat', mark: 'none' },
  yawning: { body: 'pf-yawn', eyes: 'sleepy', mouth: 'yawn', mark: 'none' },
  dozing: { body: 'pf-doze', eyes: 'half', mouth: 'sleepy', mark: 'tinyZ' },
  sleeping: { body: 'pf-sleep', eyes: 'closed', mouth: 'sleepy', mark: 'zzz' },
  waking: { body: 'pf-wake', eyes: 'wink', mouth: 'smallO', mark: 'wake' },
  sweeping: { body: 'pf-work', eyes: 'downFocus', mouth: 'smile', mark: 'none' },
  juggling: { body: 'pf-juggle', eyes: 'up', mouth: 'smallO', mark: 'none' },
  building: { body: 'pf-work', eyes: 'focus', mouth: 'flat', mark: 'none' },
  carrying: { body: 'pf-carry', eyes: 'strain', mouth: 'teeth', mark: 'none' },
};

const obsConfigs = {
  idle: { body: 'obs-float', eyes: 'dot', mouth: 'smile', tone: 'normal', mark: 'ticks' },
  thinking: { body: 'obs-think', eyes: 'up', mouth: 'flat', tone: 'normal', mark: 'scanTicks' },
  working: { body: 'obs-work', eyes: 'focus', mouth: 'flat', tone: 'normal', mark: 'gauge' },
  done: { body: 'obs-pop', eyes: 'happy', mouth: 'laugh', tone: 'good', mark: 'check' },
  happy: { body: 'obs-happy', eyes: 'happy', mouth: 'laugh', tone: 'normal', mark: 'stars' },
  error: { body: 'obs-shake', eyes: 'x', mouth: 'frown', tone: 'error', mark: 'glitch' },
  dragging: { body: 'obs-drag', eyes: 'wide', mouth: 'o', tone: 'normal', mark: 'wind' },
  attention: { body: 'obs-pop', eyes: 'wide', mouth: 'smallO', tone: 'normal', mark: 'bang' },
  'poke-left': { body: 'obs-poke-left', eyes: 'right', mouth: 'wobble', tone: 'normal', mark: 'rippleLeft' },
  'poke-right': { body: 'obs-poke-right', eyes: 'left', mouth: 'wobble', tone: 'normal', mark: 'rippleRight' },
  notification: { body: 'obs-float', eyes: 'happy', mouth: 'smile', tone: 'normal', mark: 'signal' },
  'random-look': { body: 'obs-float', eyes: 'lookAround', mouth: 'smile', tone: 'normal', mark: 'ticks' },
  'random-read': { body: 'obs-read', eyes: 'down', mouth: 'flat', tone: 'normal', mark: 'starMap' },
  yawning: { body: 'obs-yawn', eyes: 'sleepy', mouth: 'yawn', tone: 'dim', mark: 'steam' },
  dozing: { body: 'obs-doze', eyes: 'half', mouth: 'sleepy', tone: 'dim', mark: 'tinyZ' },
  sleeping: { body: 'obs-sleep', eyes: 'closed', mouth: 'sleepy', tone: 'sleep', mark: 'zzz' },
  waking: { body: 'obs-wake', eyes: 'wink', mouth: 'smallO', tone: 'normal', mark: 'wake' },
  sweeping: { body: 'obs-work', eyes: 'downFocus', mouth: 'smile', tone: 'normal', mark: 'brush' },
  juggling: { body: 'obs-juggle', eyes: 'up', mouth: 'smallO', tone: 'normal', mark: 'juggle' },
  building: { body: 'obs-work', eyes: 'focus', mouth: 'flat', tone: 'normal', mark: 'blocks' },
  carrying: { body: 'obs-carry', eyes: 'strain', mouth: 'teeth', tone: 'normal', mark: 'sample' },
};

function cssCommon() {
  return `
    .ink{stroke:#2b2b33;stroke-width:4;stroke-linecap:round;stroke-linejoin:round}
    .fine{stroke:#2b2b33;stroke-width:2.4;stroke-linecap:round;stroke-linejoin:round}
    .face{stroke:#2b2b33;stroke-width:3.2;stroke-linecap:round;stroke-linejoin:round;fill:none}
    .face-bold{stroke:#2b2b33;stroke-width:3.8;stroke-linecap:round;stroke-linejoin:round;fill:none}
    .face-fill{fill:#2b2b33}
    .gold-fill{fill:#d4a63c}
    .gold-line{stroke:#d4a63c;stroke-width:2.6;stroke-linecap:round;stroke-linejoin:round;fill:none}
    .warn-fill{fill:#e8602c}
    .good-fill{fill:#4fb477}
    .shadow{fill:#2b2b33;opacity:.12;animation:petShadow 3s ease-in-out infinite;transform-origin:50px 86px}
    .spark{animation:petSpark 2.2s ease-in-out infinite;transform-origin:center}
    .spark2{animation-delay:.35s}
    .dot1{animation:petDot 1.35s ease-in-out infinite}
    .dot2{animation:petDot 1.35s ease-in-out .22s infinite}
    .dot3{animation:petDot 1.35s ease-in-out .44s infinite}
    .drift{animation:petDrift 2.4s ease-in-out infinite}
    .eye-look{animation:petEyeLook 4s ease-in-out infinite}
    @keyframes petShadow{0%,100%{transform:scaleX(1)}50%{transform:scaleX(.82);opacity:.09}}
    @keyframes petSpark{0%,100%{transform:scale(.88);opacity:.55}50%{transform:scale(1.12);opacity:1}}
    @keyframes petDot{0%,100%{transform:translateY(0);opacity:.45}50%{transform:translateY(-2px);opacity:1}}
    @keyframes petDrift{0%,100%{transform:translate(0,0);opacity:.35}50%{transform:translate(5px,-4px);opacity:1}}
    @keyframes petEyeLook{0%,100%{transform:translateX(0)}32%{transform:translateX(2.5px)}68%{transform:translateX(-2.5px)}}
    @media (prefers-reduced-motion:reduce){*{animation:none!important}}
  `;
}

function paperCss() {
  return `
    ${cssCommon()}
    .paper-main{fill:#fffdf8;stroke:#2b2b33;stroke-width:4;stroke-linecap:round;stroke-linejoin:round}
    .paper-panel-a{fill:#fff3df}
    .paper-panel-b{fill:#f3ecdf}
    .paper-panel-c{fill:#ffffff;opacity:.9}
    .paper-anchor{fill:#d4a63c;stroke:#2b2b33;stroke-width:2.6;stroke-linecap:round;stroke-linejoin:round}
    .paper-warm{fill:#e8602c}
    .paper-crease{stroke:#9d9485;stroke-width:1.35;stroke-linecap:round;stroke-linejoin:round;fill:none;opacity:.36}
    .paper-crease-strong{stroke:#2b2b33;stroke-width:1.7;stroke-linecap:round;stroke-linejoin:round;fill:none;opacity:.62}
    .paper-card{fill:#fff8eb;stroke:#2b2b33;stroke-width:2.4;stroke-linecap:round;stroke-linejoin:round}
    .paper-soft-line{stroke:#8d8678;stroke-width:1.8;stroke-linecap:round;stroke-linejoin:round;fill:none;opacity:.78}
    .pf-float{animation:pfFloat 3.2s ease-in-out infinite;transform-origin:50px 52px}
    .pf-think{animation:pfThink 2.4s ease-in-out infinite;transform-origin:50px 52px}
    .pf-work{animation:pfWork 1.2s ease-in-out infinite;transform-origin:50px 52px}
    .pf-pop{animation:pfPop 1.35s cubic-bezier(.2,1.45,.34,1) infinite;transform-origin:50px 52px}
    .pf-happy{animation:pfHappy 1.8s ease-in-out infinite;transform-origin:50px 52px}
    .pf-shake{animation:pfShake .5s ease-in-out infinite;transform-origin:50px 52px}
    .pf-drag{animation:pfDrag 1.1s ease-in-out infinite;transform-origin:50px 52px}
    .pf-poke-left{animation:pfPokeLeft 1.35s ease-in-out infinite;transform-origin:50px 52px}
    .pf-poke-right{animation:pfPokeRight 1.35s ease-in-out infinite;transform-origin:50px 52px}
    .pf-read{animation:pfRead 3s ease-in-out infinite;transform-origin:50px 52px}
    .pf-yawn{animation:pfYawn 2.7s ease-in-out infinite;transform-origin:50px 52px}
    .pf-doze{animation:pfDoze 3.6s ease-in-out infinite;transform-origin:50px 52px}
    .pf-sleep{animation:pfSleep 4.4s ease-in-out infinite;transform-origin:50px 56px}
    .pf-wake{animation:pfWake 1.4s ease-out infinite;transform-origin:50px 52px}
    .pf-juggle{animation:pfJuggle 1.5s ease-in-out infinite;transform-origin:50px 52px}
    .pf-carry{animation:pfCarry .9s ease-in-out infinite;transform-origin:50px 52px}
    .pf-corner{animation:pfCorner 4s ease-in-out infinite;transform-origin:36px 29px}
    .pf-ribbon{animation:pfRibbon 3s ease-in-out infinite;transform-origin:31px 24px}
    @keyframes pfFloat{0%,100%{transform:translateY(0)}50%{transform:translateY(-3.2px)}}
    @keyframes pfThink{0%,100%{transform:rotate(-3deg)}50%{transform:rotate(5.5deg) translateY(-1.8px)}}
    @keyframes pfWork{0%,100%{transform:translateY(0) rotate(0)}50%{transform:translateY(-2.4px) rotate(-2.1deg)}}
    @keyframes pfPop{0%,100%{transform:scale(1)}45%{transform:scale(1.115)}70%{transform:scale(.98)}}
    @keyframes pfHappy{0%,100%{transform:rotate(0) translateY(0)}35%{transform:rotate(-5.5deg) translateY(-3px)}70%{transform:rotate(5deg)}}
    @keyframes pfShake{0%,100%{transform:translateX(0)}25%{transform:translateX(-2.3px)}75%{transform:translateX(2.3px)}}
    @keyframes pfDrag{0%,100%{transform:translateY(-4px) rotate(3deg)}50%{transform:translateY(-9px) rotate(-4.2deg) scale(.965,1.07)}}
    @keyframes pfPokeLeft{0%,100%{transform:rotate(0)}38%{transform:rotate(-10.5deg) translateX(-3px)}70%{transform:rotate(3deg)}}
    @keyframes pfPokeRight{0%,100%{transform:rotate(0)}38%{transform:rotate(10.5deg) translateX(3px)}70%{transform:rotate(-3deg)}}
    @keyframes pfRead{0%,100%{transform:translateY(0) rotate(0)}50%{transform:translateY(2.2px) rotate(-1.8deg)}}
    @keyframes pfYawn{0%,100%{transform:scale(1)}45%{transform:translateY(3px) scale(1.055,.91)}}
    @keyframes pfDoze{0%,100%{transform:translateY(0) rotate(0)}50%{transform:translateY(3px) rotate(-2.8deg)}}
    @keyframes pfSleep{0%,100%{transform:translateY(5px) scale(1.08,.66)}50%{transform:translateY(2px) scale(1.055,.72)}}
    @keyframes pfWake{0%{transform:translateY(6px) scale(.93,.68)}45%{transform:translateY(-3px) scale(1.075)}100%{transform:scale(1)}}
    @keyframes pfJuggle{0%,100%{transform:translateY(0)}50%{transform:translateY(3px)}}
    @keyframes pfCarry{0%,100%{transform:translateX(-1.7px) translateY(2.5px)}50%{transform:translateX(2.4px) translateY(4.8px)}}
    @keyframes pfCorner{0%,88%,100%{transform:rotate(0)}92%{transform:rotate(-7deg)}96%{transform:rotate(4deg)}}
    @keyframes pfRibbon{0%,100%{transform:rotate(-2deg)}50%{transform:rotate(4deg)}}
  `;
}

function obsCss() {
  return `
    ${cssCommon()}
    .obs-shell{fill:#fbfdff;stroke:#2b2b33;stroke-width:4;stroke-linecap:round;stroke-linejoin:round}
    .obs-dome{fill:#eaf3f8;stroke:#2b2b33;stroke-width:4;stroke-linecap:round;stroke-linejoin:round}
    .obs-base{fill:#ffffff;stroke:#2b2b33;stroke-width:4;stroke-linecap:round;stroke-linejoin:round}
    .obs-window{fill:#eef8fb;stroke:#2b2b33;stroke-width:4}
    .obs-window-good{fill:#effcf5}
    .obs-window-error{fill:#fff3f0}
    .obs-window-dim{fill:#edf2f7}
    .obs-window-sleep{fill:#e7eef5}
    .obs-core{fill:#ffffff;opacity:.58}
    .obs-glass{fill:none;stroke:#ffffff;stroke-width:2.4;stroke-linecap:round;opacity:.7}
    .obs-accent-line{stroke:#5d8fb2;stroke-width:3.2;stroke-linecap:round;stroke-linejoin:round;fill:none}
    .obs-accent-fill{fill:#5d8fb2}
    .obs-float{animation:obsFloat 3.2s ease-in-out infinite;transform-origin:50px 52px}
    .obs-think{animation:obsThink 2.5s ease-in-out infinite;transform-origin:50px 52px}
    .obs-work{animation:obsWork 1.25s ease-in-out infinite;transform-origin:50px 52px}
    .obs-pop{animation:obsPop 1.4s cubic-bezier(.2,1.45,.34,1) infinite;transform-origin:50px 52px}
    .obs-happy{animation:obsHappy 1.8s ease-in-out infinite;transform-origin:50px 52px}
    .obs-shake{animation:obsShake .5s ease-in-out infinite;transform-origin:50px 52px}
    .obs-drag{animation:obsDrag 1.1s ease-in-out infinite;transform-origin:50px 52px}
    .obs-poke-left{animation:obsPokeLeft 1.35s ease-in-out infinite;transform-origin:50px 52px}
    .obs-poke-right{animation:obsPokeRight 1.35s ease-in-out infinite;transform-origin:50px 52px}
    .obs-read{animation:obsRead 3s ease-in-out infinite;transform-origin:50px 52px}
    .obs-yawn{animation:obsYawn 2.7s ease-in-out infinite;transform-origin:50px 52px}
    .obs-doze{animation:obsDoze 3.6s ease-in-out infinite;transform-origin:50px 52px}
    .obs-sleep{animation:obsSleep 4.4s ease-in-out infinite;transform-origin:50px 56px}
    .obs-wake{animation:obsWake 1.4s ease-out infinite;transform-origin:50px 52px}
    .obs-juggle{animation:obsJuggle 1.5s ease-in-out infinite;transform-origin:50px 52px}
    .obs-carry{animation:obsCarry .9s ease-in-out infinite;transform-origin:50px 52px}
    .obs-antenna{animation:obsAntenna 2.6s ease-in-out infinite;transform-origin:50px 13px}
    .obs-tick{animation:obsTick 1.8s ease-in-out infinite}
    @keyframes obsFloat{0%,100%{transform:translateY(0)}50%{transform:translateY(-2.2px)}}
    @keyframes obsThink{0%,100%{transform:rotate(-2deg)}50%{transform:rotate(3deg) translateY(-1px)}}
    @keyframes obsWork{0%,100%{transform:translateY(0) scale(1)}50%{transform:translateY(-1px) scale(1.015,.985)}}
    @keyframes obsPop{0%,100%{transform:scale(1)}45%{transform:scale(1.08)}70%{transform:scale(.985)}}
    @keyframes obsHappy{0%,100%{transform:rotate(0) translateY(0)}35%{transform:rotate(-3deg) translateY(-2px)}70%{transform:rotate(3deg)}}
    @keyframes obsShake{0%,100%{transform:translateX(0)}25%{transform:translateX(-1.5px)}75%{transform:translateX(1.5px)}}
    @keyframes obsDrag{0%,100%{transform:translateY(-3px) rotate(2deg)}50%{transform:translateY(-7px) rotate(-2deg)}}
    @keyframes obsPokeLeft{0%,100%{transform:rotate(0)}38%{transform:rotate(-8deg) translateX(-2px)}70%{transform:rotate(2deg)}}
    @keyframes obsPokeRight{0%,100%{transform:rotate(0)}38%{transform:rotate(8deg) translateX(2px)}70%{transform:rotate(-2deg)}}
    @keyframes obsRead{0%,100%{transform:translateY(0)}50%{transform:translateY(1.4px)}}
    @keyframes obsYawn{0%,100%{transform:scale(1)}45%{transform:translateY(2px) scale(1.03,.94)}}
    @keyframes obsDoze{0%,100%{transform:translateY(0) rotate(0)}50%{transform:translateY(2px) rotate(-1.5deg)}}
    @keyframes obsSleep{0%,100%{transform:translateY(4px) scale(.98,.86)}50%{transform:translateY(2px) scale(1,.9)}}
    @keyframes obsWake{0%{transform:translateY(5px) scale(.94,.8)}45%{transform:translateY(-2px) scale(1.06)}100%{transform:scale(1)}}
    @keyframes obsJuggle{0%,100%{transform:translateY(0)}50%{transform:translateY(2px)}}
    @keyframes obsCarry{0%,100%{transform:translateX(-1px) translateY(2px)}50%{transform:translateX(1.5px) translateY(4px)}}
    @keyframes obsAntenna{0%,100%{transform:rotate(-2deg)}50%{transform:rotate(4deg)}}
    @keyframes obsTick{0%,100%{opacity:.4}50%{opacity:1}}
  `;
}

function eyes(type) {
  switch (type) {
    case 'up':
      return '<circle class="face-fill" cx="42" cy="47" r="2.5"/><circle class="face-fill" cx="58" cy="46" r="2.5"/>';
    case 'focus':
      return '<circle class="face-fill" cx="42" cy="49" r="2.4"/><circle class="face-fill" cx="58" cy="49" r="2.4"/><path class="face" d="M37 44l9 2M63 44l-9 2"/>';
    case 'downFocus':
      return '<circle class="face-fill" cx="42" cy="50" r="2.4"/><circle class="face-fill" cx="58" cy="50" r="2.4"/><path class="face" d="M38 46h8M54 46h8"/>';
    case 'happy':
      return '<path class="face" d="M37 49q5 4 10 0M53 49q5 4 10 0"/>';
    case 'x':
      return '<path class="face" d="M38 45l7 7M45 45l-7 7M55 45l7 7M62 45l-7 7"/>';
    case 'wide':
      return '<circle cx="42" cy="48" r="4" class="face"/><circle cx="58" cy="48" r="4" class="face"/><circle class="face-fill" cx="42" cy="48" r="1.4"/><circle class="face-fill" cx="58" cy="48" r="1.4"/>';
    case 'left':
      return '<circle class="face-fill" cx="40" cy="48" r="2.6"/><circle class="face-fill" cx="56" cy="48" r="2.6"/>';
    case 'right':
      return '<circle class="face-fill" cx="44" cy="48" r="2.6"/><circle class="face-fill" cx="60" cy="48" r="2.6"/>';
    case 'lookAround':
      return '<g class="eye-look"><circle class="face-fill" cx="42" cy="48" r="2.6"/><circle class="face-fill" cx="58" cy="48" r="2.6"/></g>';
    case 'down':
      return '<path class="face" d="M37 49q5 2 10 0M53 49q5 2 10 0"/>';
    case 'sleepy':
      return '<path class="face" d="M37 49q5 2 10 0M53 49q5 2 10 0"/>';
    case 'half':
      return '<path class="face" d="M37 49q5 2 10 0M54 49h8"/>';
    case 'closed':
      return '<path class="face" d="M37 49q5 3 10 0M53 49q5 3 10 0"/>';
    case 'wink':
      return '<circle class="face-fill" cx="42" cy="48" r="2.7"/><path class="face" d="M54 49q5 3 10 0"/>';
    case 'strain':
      return '<path class="face" d="M37 47q5-3 10 0M53 47q5-3 10 0"/>';
    default:
      return '<circle class="face-fill" cx="42" cy="48" r="2.6"/><circle class="face-fill" cx="58" cy="48" r="2.6"/>';
  }
}

function mouth(type) {
  switch (type) {
    case 'flat':
      return '<path class="face" d="M44 58h12"/>';
    case 'laugh':
      return '<path class="face" d="M41 56q9 8 18 0"/>';
    case 'frown':
      return '<path class="face" d="M43 61q7-5 14 0"/>';
    case 'o':
      return '<ellipse cx="50" cy="58" rx="3.7" ry="4.2" class="face-fill"/>';
    case 'smallO':
      return '<circle cx="50" cy="58" r="2.7" class="face-fill"/>';
    case 'wobble':
      return '<path class="face" d="M43 59q4-3 7 0t7 0"/>';
    case 'yawn':
      return '<ellipse cx="50" cy="59" rx="4.3" ry="5.5" class="face"/>';
    case 'sleepy':
      return '<path class="face" d="M44 59q6 3 12 0"/>';
    case 'teeth':
      return '<path class="face" d="M43 57h14v5H43z"/><path class="fine" d="M50 57v5"/>';
    default:
      return '<path class="face" d="M43 57q7 6 14 0"/>';
  }
}

function paperEyes(type) {
  const dot = (cx, cy, r = 3.15) => `<circle class="face-fill" cx="${cx}" cy="${cy}" r="${r}"/>`;
  const browFlat = '<path class="paper-crease-strong" d="M36 43l8 1M64 43l-8 1"/>';
  const browDown = '<path class="paper-crease-strong" d="M37 42l7 3M63 42l-7 3"/>';
  const browUp = '<path class="paper-crease-strong" d="M37 44l7-3M63 44l-7-3"/>';

  switch (type) {
    case 'up':
      return browUp + dot(40, 45) + dot(60, 45);
    case 'focus':
      return browDown + '<path class="face" d="M36 48h8M56 48h8"/>';
    case 'downFocus':
      return browDown + dot(40, 51, 2.75) + dot(60, 51, 2.75);
    case 'happy':
      return '<path class="face" d="M35 48q5 5 10 0M55 48q5 5 10 0"/>';
    case 'x':
      return (
        browDown +
        '<path class="face-bold" d="M37 45l7 6M44 45l-7 6"/><path class="face-bold" d="M56 45l7 6M63 45l-7 6"/>'
      );
    case 'wide':
      return '<circle cx="40" cy="48" r="4.4" class="face"/><circle cx="60" cy="48" r="4.4" class="face"/>';
    case 'left':
      return browFlat + dot(38, 48) + dot(58, 48);
    case 'right':
      return browFlat + dot(42, 48) + dot(62, 48);
    case 'lookAround':
      return `<g class="eye-look">${dot(40, 48)}${dot(60, 48)}</g>`;
    case 'down':
      return '<path class="face" d="M36 46q4 3 8 0M56 46q4 3 8 0"/>' + dot(40, 50, 2.55) + dot(60, 50, 2.55);
    case 'sleepy':
      return '<path class="face" d="M35 49q5 3 10 0M55 49q5 3 10 0"/>';
    case 'half':
      return '<path class="face" d="M35 49q5 3 10 0M55 48h10"/>';
    case 'closed':
      return '<path class="face" d="M35 48q5 4 10 0M55 48q5 4 10 0"/>';
    case 'wink':
      return dot(40, 48) + '<path class="face" d="M55 49q5 3 10 0"/>';
    case 'strain':
      return browDown + '<path class="face" d="M35 47q5-3 10 0M55 47q5-3 10 0"/>';
    default:
      return dot(40, 48) + dot(60, 48);
  }
}

function paperMouth(type) {
  switch (type) {
    case 'flat':
      return '<path class="face" d="M43 58h14"/>';
    case 'laugh':
      return '<path class="face-bold" d="M39 55q11 10 22 0"/>';
    case 'frown':
      return '<path class="face" d="M42 61q8-5 16 0"/>';
    case 'o':
      return '<rect x="46" y="55" width="8" height="7" rx="1.5" class="face"/>';
    case 'smallO':
      return '<rect x="47.5" y="56" width="5" height="5" rx="1" class="face"/>';
    case 'wobble':
      return '<path class="face" d="M42 59q4-3.5 8 0t8 0"/>';
    case 'yawn':
      return '<ellipse cx="50" cy="59" rx="4.5" ry="5.5" class="face"/>';
    case 'sleepy':
      return '<path class="face" d="M44 59q6 2.5 12 0"/>';
    case 'teeth':
      return '<path class="face" d="M43 58l4 2.5 3-2.5 3 2.5 4-2.5"/>';
    default:
      return '<path class="face" d="M43 57q7 4 14 0"/>';
  }
}

function paperMark(type) {
  switch (type) {
    case 'thought':
      return '<circle class="gold-fill dot1" cx="76" cy="20" r="2.6"/><circle class="gold-fill dot2" cx="84" cy="15" r="2"/>';
    case 'check':
      return '<path class="gold-line spark" d="M68 28l5 5 11-13"/>';
    case 'warning':
      return '<g class="spark"><path class="warn-fill" d="M74 18l8 14H66z"/><path class="fine" d="M74 23v4M74 30h.1"/></g>';
    case 'bang':
      return '<path class="gold-line spark" d="M74 14v12" style="stroke-width:3.4"/><circle class="gold-fill" cx="74" cy="32" r="1.8"/>';
    case 'mail':
      return '<circle class="warn-fill spark" cx="76" cy="22" r="3.6"/>';
    case 'tinyZ':
      return '<path class="gold-line drift" d="M70 22h5l-5 5h5" style="stroke-width:2.4"/>';
    case 'zzz':
      return '<path class="gold-line drift" d="M68 24h7l-7 7h7" style="stroke-width:2.5"/><path class="gold-line drift" d="M78 16h5l-5 5h5" style="stroke-width:2.2"/>';
    case 'wake':
      return '<path class="gold-line spark" d="M27 20l-5-7M50 15v-8M73 20l5-7"/>';
    default:
      return '';
  }
}

function obsMark(type) {
  switch (type) {
    case 'ticks':
      return '<path class="obs-accent-line obs-tick" d="M72 41h6M69 59l5 3"/>';
    case 'scanTicks':
      return '<path class="obs-accent-line dot1" d="M69 33l4-4"/><path class="obs-accent-line dot2" d="M76 45h6"/><path class="obs-accent-line dot3" d="M69 61l4 4"/>';
    case 'gauge':
      return '<path class="obs-accent-line dot1" d="M38 75v-5M45 75v-8M52 75v-4M59 75v-7"/><circle class="good-fill" cx="66" cy="36" r="2.2"/>';
    case 'check':
      return '<path class="obs-accent-line spark" d="M68 29l5 5 11-13"/>';
    case 'stars':
      return '<path class="obs-accent-fill spark" d="M77 24l2 5 5 2-5 2-2 5-2-5-5-2 5-2z"/><path class="obs-accent-fill spark2" d="M22 74l1.8 4 4 1.8-4 1.8-1.8 4-1.8-4-4-1.8 4-1.8z"/>';
    case 'glitch':
      return '<path class="warn-fill spark" d="M74 21l7 12H67z"/><path class="fine" d="M75 26v4M75 33h.1"/><path class="obs-accent-line dot2" d="M34 45h9M57 53h9M40 62h14"/>';
    case 'wind':
      return '<path class="obs-accent-line" d="M20 67h-9M23 75H12M79 25h8"/>';
    case 'bang':
      return '<path class="obs-accent-line spark" d="M74 19v12M74 36h.1"/>';
    case 'rippleLeft':
      return '<path class="obs-accent-line spark" d="M24 48q-7 4 0 8M18 45q-12 7 0 14"/>';
    case 'rippleRight':
      return '<path class="obs-accent-line spark" d="M76 48q7 4 0 8M82 45q12 7 0 14"/>';
    case 'signal':
      return '<path class="obs-accent-line spark" d="M71 22q8 5 0 10M77 18q13 9 0 18"/><circle class="obs-accent-fill" cx="68" cy="27" r="2"/>';
    case 'starMap':
      return '<g class="spark2"><path class="obs-accent-line" d="M36 67h28M39 72h22"/><circle class="obs-accent-fill" cx="42" cy="67" r="1.4"/><circle class="obs-accent-fill" cx="58" cy="72" r="1.4"/></g>';
    case 'steam':
      return '<circle class="gold-fill dot1" cx="72" cy="22" r="2.2"/><circle class="gold-fill dot2" cx="79" cy="16" r="1.8"/>';
    case 'tinyZ':
      return '<path class="obs-accent-line dot2" d="M72 18h8l-8 9h8"/>';
    case 'zzz':
      return '<path class="obs-accent-line dot1" d="M69 12h8l-8 9h8"/><path class="obs-accent-line dot2" d="M80 23h7l-7 8h7"/>';
    case 'wake':
      return '<path class="obs-accent-line spark" d="M28 21l-5-7M50 15v-8M72 21l5-7"/>';
    case 'brush':
      return '<path class="obs-accent-line drift" d="M20 80h-9M25 85H10M76 81h8"/><path class="fine" d="M65 75q8 6 17 0"/>';
    case 'juggle':
      return '<circle class="obs-accent-fill dot1" cx="27" cy="29" r="2.6"/><circle class="obs-accent-fill dot2" cx="50" cy="18" r="2.4"/><circle class="obs-accent-fill dot3" cx="73" cy="29" r="2.6"/>';
    case 'blocks':
      return '<g class="spark2"><path class="obs-shell" d="M67 70h10v10H67z"/><path class="obs-shell" d="M77 70h10v10H77z"/><path class="obs-shell" d="M72 60h10v10H72z"/></g>';
    case 'sample':
      return '<g><path class="obs-base" d="M38 80h24v13H38z"/><path class="obs-accent-line" d="M42 85h16"/></g>';
    default:
      return '';
  }
}

function paperTransform(mark) {
  if (mark === 'box') return 'translate(0 -3)';
  if (mark === 'zzz') return 'translate(0 6) scale(1.05 .78)';
  return '';
}

function paperSvg(name) {
  const config = paperConfigs[name] || paperConfigs.idle;
  const tx = paperTransform(config.mark);
  return `<svg viewBox="${VIEWBOX}" width="${WIDTH}" height="${HEIGHT}" fill="none" xmlns="http://www.w3.org/2000/svg">
  <defs><style>${paperCss()}</style></defs>
  <ellipse class="shadow" cx="50" cy="90" rx="23" ry="3.8"/>
  ${paperMark(config.mark)}
  <g class="idle-track">
    <g transform="translate(-3.5 -4) scale(1.07)">
      <g class="${config.body}">
      <g transform="${tx}">
        <path class="paper-main" d="M22 46 36 20 50 34 64 20 78 46 70 73 56 88H44L30 73z"/>
        <path class="paper-panel-a" d="M23 46 36 20 42 42z"/>
        <path class="paper-panel-b" d="M77 46 64 20 58 42z"/>
        <path class="paper-panel-c" d="M35 43 50 34 65 43 60 71 50 80 40 71z"/>
        <path class="paper-panel-b" d="M30 73 35 43 40 72 44 86z"/>
        <path class="paper-panel-a" d="M70 73 65 43 60 72 56 86z"/>
        <path class="paper-anchor pf-corner" d="M36 22 40 39 27 43z"/>
        <path class="paper-anchor" d="M64 22 60 39 73 43z"/>
        <path class="paper-crease-strong" d="M36 43h28"/>
        <path class="paper-crease" d="M42 42 50 34 58 42M41 72l9 8 9-8M31 72l9-29M69 72l-9-29"/>
        <g class="idle-pupil">${paperEyes(config.eyes)}</g>
        ${paperMouth(config.mouth)}
      </g>
      </g>
    </g>
  </g>
</svg>
`;
}

function obsWindowClass(tone) {
  if (tone === 'good') return 'obs-window obs-window-good';
  if (tone === 'error') return 'obs-window obs-window-error';
  if (tone === 'dim') return 'obs-window obs-window-dim';
  if (tone === 'sleep') return 'obs-window obs-window-sleep';
  return 'obs-window';
}

function obsTransform(mark) {
  if (mark === 'sample') return 'translate(0 -3)';
  if (mark === 'zzz') return 'translate(0 4) scale(.98 .9)';
  return '';
}

function observatorySvg(name) {
  const config = obsConfigs[name] || obsConfigs.idle;
  const tx = obsTransform(config.mark);
  return `<svg viewBox="${VIEWBOX}" width="${WIDTH}" height="${HEIGHT}" fill="none" xmlns="http://www.w3.org/2000/svg">
  <defs><style>${obsCss()}</style></defs>
  <ellipse class="shadow" cx="50" cy="89" rx="20" ry="3.5"/>
  ${obsMark(config.mark)}
  <g class="idle-track">
    <g class="${config.body}">
      <g transform="${tx}">
        <path class="obs-dome" d="M17 55q5-38 33-38t33 38z"/>
        <path class="obs-base" d="M20 52h60l-6 24q-3 12-16 13H42q-13-1-16-13z"/>
        <circle class="obs-accent-fill spark" cx="50" cy="12" r="4.4"/>
        <circle class="${obsWindowClass(config.tone)}" cx="50" cy="52" r="21"/>
        <circle class="obs-core" cx="50" cy="52" r="16"/>
        <path class="obs-glass" d="M40 37q6-4 14-3"/>
        <path class="obs-accent-line obs-tick" d="M71 44l5-2M73 55h6M69 63l4 3"/>
        <path class="fine" d="M35 86v6M65 86v6"/>
        <g class="idle-pupil">${eyes(config.eyes)}</g>
        ${mouth(config.mouth)}
      </g>
    </g>
  </g>
</svg>
`;
}

function writeStyle(style, renderer) {
  const outDir = path.join(OUT_ROOT, style);
  fs.mkdirSync(outDir, { recursive: true });
  for (const state of STATES) {
    fs.writeFileSync(path.join(outDir, `${state}.svg`), renderer(state));
  }
}

writeStyle('paperfold', paperSvg);
writeStyle('observatory', observatorySvg);

console.log(`Generated ${STATES.length} paperfold and ${STATES.length} observatory pet states in ${OUT_ROOT}`);
