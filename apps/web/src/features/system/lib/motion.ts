// System-state motion presets, derived from the app's single motion source.
import { durations, easings, springs } from '@/lib/motion';

export const dur = {
  dur1: durations['dur-1'],
  dur2: durations['dur-2'],
  dur3: durations['dur-3'],
  dur4: durations['dur-4'],
  dur5: durations['dur-5'],
} as const;

export const durMs = {
  dur1: durations['dur-1'] * 1000,
  dur2: durations['dur-2'] * 1000,
  dur3: durations['dur-3'] * 1000,
  dur4: durations['dur-4'] * 1000,
  dur5: durations['dur-5'] * 1000,
} as const;

export const ease = {
  out: easings['ease-out'],
  inOut: easings['ease-in-out'],
  in: easings['ease-in'],
} as const;

export const spring = springs;

/** Illustration-specific loop constants */
export const loop = {
  /** 404 timeline sweep: 3s linear sweep + 600ms end pause */
  notFoundSweepSec: 3,
  notFoundPauseMs: 600,
  notFoundFlickerStepMs: 60,
  /** 500 error slice snap cycle: 2.4s */
  errorSliceCycleSec: 2.4,
  errorSliceSnapMs: 120,
  /** Offline level meter: 1.6s ease-in-out, staggered 120ms */
  offlineBarCycleSec: 1.6,
  offlineBarStaggerSec: 0.12,
  /** Offline countdown & reconnect */
  offlineCountdownSec: 4,
  offlineReconnectedDelayMs: 800,
} as const;
