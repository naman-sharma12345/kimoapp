// Projects motion presets, derived from the app's single motion source.
import type { Transition } from 'motion/react';
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
  out: easings['ease-out'],
  inOut: easings['ease-in-out'],
  in: easings['ease-in'],
} as const;

export const SPRING = springs;

export const TRANSITION = {
  hover: { duration: DUR.dur1, ease: EASE.out } satisfies Transition,
  small: { duration: DUR.dur2, ease: EASE.out } satisfies Transition,
  popIn: { duration: DUR.dur3, ease: EASE.out } satisfies Transition,
  popOut: { duration: DUR.dur2, ease: EASE.in } satisfies Transition,
  sectionIn: { duration: DUR.dur4, ease: EASE.out } satisfies Transition,
  dialogIn: { duration: DUR.dur4, ease: EASE.out } satisfies Transition,
  dialogOut: { duration: DUR.dur3, ease: EASE.in } satisfies Transition,
  screen: { duration: DUR.dur5, ease: EASE.out } satisfies Transition,
  reducedFade: { duration: DUR.dur2, ease: EASE.out } satisfies Transition,
} as const;
