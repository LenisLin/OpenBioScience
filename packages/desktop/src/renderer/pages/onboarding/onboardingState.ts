const ONBOARDING_VERSION = 1;
const COMPLETED_KEY = 'openscience.onboarding.completed';
const VERSION_KEY = 'openscience.onboarding.version';
const SKIPPED_KEY = 'openscience.onboarding.skipped';

const safeLocalStorage = (): Storage | null => {
  try {
    return typeof window === 'undefined' ? null : window.localStorage;
  } catch {
    return null;
  }
};

export function shouldShowOnboarding(): boolean {
  const storage = safeLocalStorage();
  if (!storage) return false;
  return storage.getItem(COMPLETED_KEY) !== 'true' || storage.getItem(VERSION_KEY) !== String(ONBOARDING_VERSION);
}

export function completeOnboarding(options?: { skipped?: boolean }): void {
  const storage = safeLocalStorage();
  if (!storage) return;
  storage.setItem(COMPLETED_KEY, 'true');
  storage.setItem(VERSION_KEY, String(ONBOARDING_VERSION));
  storage.setItem(SKIPPED_KEY, options?.skipped ? 'true' : 'false');
}

export function resetOnboarding(): void {
  const storage = safeLocalStorage();
  if (!storage) return;
  storage.removeItem(COMPLETED_KEY);
  storage.removeItem(VERSION_KEY);
  storage.removeItem(SKIPPED_KEY);
}

export function getOnboardingVersion(): number {
  return ONBOARDING_VERSION;
}
