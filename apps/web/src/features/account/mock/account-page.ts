import type {
  AccountPreferences,
  AccountUsage,
  AccountUser,
  PreferenceKey,
} from '../types/account-page';

export const mockUser: AccountUser = {
  name: 'mira vance',
  email: 'mira@getkimo.tech',
};

/**
 * Returns an ISO string 5h 12m in the future so the initial render reads "resets in 5h 12m"
 * and ticks down live each minute.
 */
export function createMockResetIso(nowMs: number = Date.now()): string {
  const offsetMs = (5 * 60 + 12) * 60 * 1000;
  return new Date(nowMs + offsetMs).toISOString();
}

export const mockUsageLoaded: AccountUsage = {
  videosToday: 3,
  videosLimit: 10,
  renderMinutes: 11,
  renderMinutesLimit: 30,
  resetsAt: createMockResetIso(),
};

export const mockUsageLimitReached: AccountUsage = {
  videosToday: 10,
  videosLimit: 10,
  renderMinutes: 30,
  renderMinutesLimit: 30,
  resetsAt: createMockResetIso(),
};

export const mockInitialPreferences: AccountPreferences = {
  defaultAspect: '16:9',
  captionsDefault: true,
  webImages: true,
  reduceMotion: false,
  soundOnApproval: false,
};

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => {
    window.setTimeout(resolve, ms);
  });
}

export async function fakeUpdatePreference<K extends PreferenceKey>(
  _key: K,
  _value: AccountPreferences[K],
  shouldFail: boolean = false,
): Promise<void> {
  await sleep(320);
  if (shouldFail) {
    throw new Error("couldn't save that. try again.");
  }
}

export async function fakeExportData(): Promise<void> {
  await sleep(680);
}

export async function fakeDeleteAccount(): Promise<void> {
  await sleep(760);
}

export async function fakeContinueWithGoogle(): Promise<void> {
  await sleep(420);
}
