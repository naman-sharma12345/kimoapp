// Sign-in motion presets, derived from the app's single motion source.
import { durations, easings, springs } from '@/lib/motion';

export const DUR = {
  dur1: durations['dur-1'],
  dur2: durations['dur-2'],
  dur3: durations['dur-3'],
  dur4: durations['dur-4'],
  dur5: durations['dur-5'],
} as const;

export const DUR_MS = {
  dur1: durations['dur-1'] * 1000,
  dur2: durations['dur-2'] * 1000,
  dur3: durations['dur-3'] * 1000,
  dur4: durations['dur-4'] * 1000,
  dur5: durations['dur-5'] * 1000,
} as const;

export const EASE = {
  easeOut: easings['ease-out'],
  easeInOut: easings['ease-in-out'],
  easeIn: easings['ease-in'],
} as const;

export const SPRING = springs;
