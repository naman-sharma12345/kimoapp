// Account motion presets, derived from the app's single motion source.
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
  staggerSegment: 50,
  staggerSection: 60,
  shakeTotal: 240,
  checkHold: 1200,
} as const;

export const ease = {
  out: easings['ease-out'],
  inOut: easings['ease-in-out'],
  in: easings['ease-in'],
} as const;

export const spring = springs;

export const stagger = {
  segment: 0.05,
  section: 0.06,
} as const;
