const LOAD_TIMEOUT = 3000;
const FADE_MS = 150;
const PET_STATES_BASE_PATH = '../pet-states';
type PetStyle = 'deepscientist' | 'classic' | 'paperfold' | 'observatory';
const TRACKING_CENTERS: Record<PetStyle, { x: number; y: number }> = {
  deepscientist: { x: 50, y: 50 },
  classic: { x: 11, y: 12 },
  paperfold: { x: 50, y: 50 },
  observatory: { x: 50, y: 50 },
};
let currentObject: HTMLObjectElement | null = document.getElementById('pet') as HTMLObjectElement;
let currentStyle: PetStyle = 'deepscientist';
let currentState = 'idle';

function getStateAssetPath(state: string, style = currentStyle): string {
  return `${PET_STATES_BASE_PATH}/${style}/${state}.svg`;
}

function getFallbackAssetPath(state: string): string | undefined {
  if (state !== 'idle') return getStateAssetPath('idle');
  if (currentStyle !== 'classic') return getStateAssetPath('idle', 'classic');
  return undefined;
}

function loadCurrentState(): void {
  loadSvg(getStateAssetPath(currentState), getFallbackAssetPath(currentState));
}

function setupTransitions(_target: HTMLObjectElement | null): void {
  // Intentionally empty: eye tracking now writes SVG `transform` attributes on
  // the .idle-pupil / .idle-track wrappers (see onEyeMove below), which are
  // not affected by CSS `transition` — that property only animates CSS
  // transforms. Smoothing comes from the tick rate, not from CSS transitions.
}

/**
 * Load a new SVG state and cross-fade it over the previous one. The old object
 * is removed only after the fade completes, so there's no white flash between
 * states. If a state asset is missing, fall back to idle so the pet never gets
 * stuck on a stale frame while designers are iterating on the SVG set.
 */
function loadSvg(svgPath: string, fallbackPath?: string): void {
  const newObj = document.createElement('object');
  newObj.type = 'image/svg+xml';
  newObj.id = 'pet';
  newObj.style.position = 'absolute';
  newObj.style.inset = '0';
  newObj.style.width = '100%';
  newObj.style.height = '100%';
  newObj.style.opacity = '0';
  newObj.style.transition = `opacity ${FADE_MS}ms ease-out`;
  newObj.data = svgPath;

  let settled = false;

  const fail = (): void => {
    if (settled) return;
    settled = true;
    clearTimeout(timeout);
    newObj.remove();
    if (fallbackPath && fallbackPath !== svgPath) {
      loadSvg(fallbackPath);
    }
  };

  const timeout = setTimeout(fail, LOAD_TIMEOUT);

  newObj.addEventListener('load', () => {
    if (settled) return;
    settled = true;
    clearTimeout(timeout);
    setupTransitions(newObj);

    const oldObj = currentObject;
    // Clear the old id immediately so duplicate #pet selectors (from CSS and
    // setupTransitions' query) never see two elements at once during the fade.
    if (oldObj) oldObj.removeAttribute('id');
    currentObject = newObj;

    // Trigger the fade on the next frame so the browser has painted the
    // initial opacity:0 state — otherwise the transition is skipped and the
    // swap is instant.
    requestAnimationFrame(() => {
      newObj.style.opacity = '1';
      if (oldObj) oldObj.style.opacity = '0';
    });

    // Remove the old object after the cross-fade completes. Keep a reference
    // via closure so we don't race with another state change in the meantime.
    if (oldObj) {
      setTimeout(() => {
        oldObj.remove();
      }, FADE_MS);
    }
  });
  newObj.addEventListener('error', fail);

  document.body.appendChild(newObj);
}

// The initial SVG is hard-coded in pet.html without any transition setup or
// positioning — mirror the runtime swap target so subsequent cross-fades work
// and eye/body transforms animate from the start.
if (currentObject) {
  currentObject.style.position = 'absolute';
  currentObject.style.inset = '0';
  currentObject.style.transition = `opacity ${FADE_MS}ms ease-out`;
  currentObject.addEventListener('load', () => {
    setupTransitions(currentObject);
  });
}

window.petAPI.onStateChange((state: string) => {
  currentState = state;
  loadCurrentState();
});

window.petAPI.onStyleChange((style) => {
  currentStyle = style;
  loadCurrentState();
});

window.petAPI.onEyeMove(({ eyeDx, eyeDy, bodyDx, bodyRotate }) => {
  if (!currentObject) return;
  const doc = currentObject.contentDocument;
  if (!doc) return;
  const trackingCenter = TRACKING_CENTERS[currentStyle];

  // Target the dedicated wrapper groups (.idle-pupil and .idle-track) rather
  // than the animated .idle-eye / .idle-body. Those already have CSS keyframes
  // running — writing style.transform to them gets overwritten every frame, so
  // tracking becomes invisible. The wrappers have no animation of their own,
  // so their SVG transform attributes stick. Using setAttribute (not style)
  // because SVG transform attributes and CSS transforms are separate channels
  // in SVG — the attribute stacks on top of the descendant's CSS animation
  // without overwriting it.
  const pupil = doc.querySelector('.idle-pupil') as SVGGElement | null;
  const track = doc.querySelector('.idle-track') as SVGGElement | null;

  if (pupil) pupil.setAttribute('transform', `translate(${eyeDx} ${eyeDy})`);
  // rotate(angle cx cy) — each style uses its own SVG viewBox and visual
  // center, so keep the pivot style-aware instead of hard-coding one pose.
  if (track) {
    track.setAttribute(
      'transform',
      `translate(${bodyDx} 0) rotate(${bodyRotate} ${trackingCenter.x} ${trackingCenter.y})`
    );
  }
});
