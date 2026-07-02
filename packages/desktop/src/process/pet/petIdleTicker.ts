import { screen } from 'electron';
import type { PetStateMachine } from './petStateMachine';
import type { EyeMoveData, PetPersonality } from './petTypes';

const TICK_INTERVAL = 50;

type IdleProfile = {
  idleMomentMinMs: number;
  idleMomentJitterMs: number;
  yawnTimeoutMs: number;
  deepSleepTimeoutMs: number;
  readProbability: number;
  eyeLerp: number;
};

const IDLE_PROFILES: Record<PetPersonality, IdleProfile> = {
  calm: {
    idleMomentMinMs: 34_000,
    idleMomentJitterMs: 26_000,
    yawnTimeoutMs: 78_000,
    deepSleepTimeoutMs: 420_000,
    readProbability: 0.55,
    eyeLerp: 0.22,
  },
  balanced: {
    idleMomentMinMs: 20_000,
    idleMomentJitterMs: 18_000,
    yawnTimeoutMs: 60_000,
    deepSleepTimeoutMs: 600_000,
    readProbability: 0.4,
    eyeLerp: 0.3,
  },
  lively: {
    idleMomentMinMs: 12_000,
    idleMomentJitterMs: 14_000,
    yawnTimeoutMs: 105_000,
    deepSleepTimeoutMs: 900_000,
    readProbability: 0.25,
    eyeLerp: 0.42,
  },
};

const AI_DRIVEN_STATES = new Set([
  'working',
  'thinking',
  'error',
  'notification',
  'happy',
  'sweeping',
  'building',
  'juggling',
  'carrying',
  'waking',
  'attention',
  'dragging',
]);

const SLEEP_STATES = new Set(['sleeping', 'dozing', 'yawning']);

export class PetIdleTicker {
  private interval: ReturnType<typeof setInterval> | null = null;
  private lastCursorX = 0;
  private lastCursorY = 0;
  private mouseStillSince = Date.now();
  private nextIdleMomentAt = IDLE_PROFILES.balanced.idleMomentMinMs;
  private yawnTriggered = false;
  private eyeMoveCallback: ((data: EyeMoveData) => void) | null = null;
  private petBounds = { x: 0, y: 0, width: 280, height: 280 };
  private lastEyeDx = 0;
  private lastEyeDy = 0;
  private smoothEyeDx = 0;
  private smoothEyeDy = 0;
  private profile: IdleProfile = IDLE_PROFILES.balanced;

  constructor(private sm: PetStateMachine) {}

  start(): void {
    if (this.interval) return;
    const cursor = screen.getCursorScreenPoint();
    this.lastCursorX = cursor.x;
    this.lastCursorY = cursor.y;
    this.mouseStillSince = Date.now();
    this.scheduleNextIdleMoment();
    this.interval = setInterval(() => this.tick(), TICK_INTERVAL);
  }

  stop(): void {
    if (this.interval) {
      clearInterval(this.interval);
      this.interval = null;
    }
  }

  resetIdle(): void {
    this.mouseStillSince = Date.now();
    this.scheduleNextIdleMoment();
    this.yawnTriggered = false;
  }

  setPetBounds(x: number, y: number, width: number, height: number): void {
    if (![x, y, width, height].every(Number.isFinite) || width <= 0 || height <= 0) return;
    this.petBounds = { x, y, width, height };
  }

  setPersonality(personality: PetPersonality): void {
    this.profile = IDLE_PROFILES[personality];
    this.scheduleNextIdleMoment();
  }

  onEyeMove(cb: (data: EyeMoveData) => void): void {
    this.eyeMoveCallback = cb;
  }

  private tick(): void {
    try {
      const cursor = screen.getCursorScreenPoint();
      const moved = cursor.x !== this.lastCursorX || cursor.y !== this.lastCursorY;

      if (moved) {
        this.lastCursorX = cursor.x;
        this.lastCursorY = cursor.y;
        this.mouseStillSince = Date.now();
        this.scheduleNextIdleMoment();
        this.yawnTriggered = false;

        if (SLEEP_STATES.has(this.sm.getCurrentState())) {
          this.sm.requestState('waking');
        }
      }

      const currentState = this.sm.getCurrentState();

      // Eye tracking in idle state
      if (currentState === 'idle' && this.eyeMoveCallback) {
        this.computeEyeTracking(cursor.x, cursor.y);
      }

      // Skip idle behavior during AI-driven states
      if (AI_DRIVEN_STATES.has(currentState)) return;

      const idleMs = Date.now() - this.mouseStillSince;

      // Idle timeline calibration: sleep progression wins over tiny
      // "still alive" moments once the user has truly gone quiet.
      if (idleMs >= this.profile.deepSleepTimeoutMs && currentState === 'dozing') {
        this.sm.requestState('sleeping');
        return;
      }

      if (idleMs >= this.profile.yawnTimeoutMs && !this.yawnTriggered) {
        this.yawnTriggered = true;
        this.sm.requestState('yawning');
        return;
      }

      // Periodic tiny "still alive" moments while idle. This keeps the pet
      // present on quiet desktops without interrupting AI-driven states.
      if (idleMs >= this.nextIdleMomentAt && currentState === 'idle') {
        const pick = Math.random() < this.profile.readProbability ? 'random-read' : ('random-look' as const);
        this.sm.requestState(pick);
        this.nextIdleMomentAt = idleMs + this.pickIdleMomentDelay();
      }
    } catch {
      // Never crash the tick loop
    }
  }

  private computeEyeTracking(cursorX: number, cursorY: number): void {
    const centerX = this.petBounds.x + this.petBounds.width * 0.5;
    const centerY = this.petBounds.y + this.petBounds.height * 0.4;

    const relX = cursorX - centerX;
    const relY = cursorY - centerY;
    const dist = Math.sqrt(relX * relX + relY * relY);
    if (!Number.isFinite(dist)) return;

    // Values are in SVG viewBox units (viewBox is 58 units wide, window is
    // 280px, so 1 SVG unit ≈ 4.8 rendered pixels). MAX_X=3 already renders
    // as ~14px of pupil travel — plenty visible.
    //
    // MAX_UP is smaller than MAX_X on purpose: the pupil sits high on the
    // face, so a full 3-unit upward shift makes it brush the hat and feel
    // like the eye is "popping out". 2 units keeps it safely inside the
    // head silhouette. MAX_DOWN stays 1 — looking down too far would slide
    // into the mouth.
    const MAX_X = 3;
    const MAX_UP = 1.3;
    const MAX_DOWN = 1;
    const RANGE = 300;

    let targetEyeDx = 0;
    let targetEyeDy = 0;
    if (dist > 1) {
      const s = Math.min(1, dist / RANGE);
      targetEyeDx = (relX / dist) * MAX_X * s;
      const rawDy = (relY / dist) * MAX_UP * s;
      targetEyeDy = Math.min(MAX_DOWN, Math.max(-MAX_UP, rawDy));
    }

    this.smoothEyeDx += (targetEyeDx - this.smoothEyeDx) * this.profile.eyeLerp;
    this.smoothEyeDy += (targetEyeDy - this.smoothEyeDy) * this.profile.eyeLerp;

    const eyeDx = Math.round(this.smoothEyeDx * 10) / 10;
    const eyeDy = Math.round(this.smoothEyeDy * 10) / 10;

    if (Math.abs(eyeDx - this.lastEyeDx) >= 0.1 || Math.abs(eyeDy - this.lastEyeDy) >= 0.1) {
      this.lastEyeDx = eyeDx;
      this.lastEyeDy = eyeDy;
      this.eyeMoveCallback!({
        eyeDx,
        eyeDy,
        bodyDx: eyeDx * 0.35,
        bodyRotate: eyeDx * 0.6,
      });
    }
  }

  private scheduleNextIdleMoment(): void {
    this.nextIdleMomentAt = this.pickIdleMomentDelay();
  }

  private pickIdleMomentDelay(): number {
    return this.profile.idleMomentMinMs + Math.floor(Math.random() * this.profile.idleMomentJitterMs);
  }
}
