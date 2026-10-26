import type { Transition } from 'motion/react';

// Mirrors tokens.css. Components import these presets, never define motion values.
export const durations = {
  'dur-1': 0.09,
  'dur-2': 0.14,
  'dur-3': 0.22,
  'dur-4': 0.36,
  'dur-5': 0.64,
} as const;
export const easings = {
  'ease-out': [0.22, 1, 0.36, 1],
  'ease-in-out': [0.65, 0, 0.35, 1],
  'ease-in': [0.55, 0, 1, 0.45],
} as const;
export const springs = {
  snappy: { type: 'spring', stiffness: 520, damping: 40, mass: 0.8 },
  soft: { type: 'spring', stiffness: 260, damping: 32 },
} as const satisfies Record<string, Transition>;

export const uiTiming = {
  tooltip: 400,
  toast: 4000,
  errorToast: 8000,
  placeholderRotation: 3200,
  placeholderFade: 220,
  landingExit: 640,
  landingReduced: 220,
  typingIdle: 1600,
} as const;
export function sharedIndicator(reduced: boolean) {
  return {
    initial: { opacity: 0 },
    animate: { opacity: 1 },
    transition: reduced ? { duration: durations['dur-2'] } : springs.snappy,
  };
}
export function toggleKnob(checked: boolean, reduced: boolean) {
  return {
    initial: reduced ? { opacity: 0, x: checked ? 12 : 0 } : (false as const),
    animate: { x: checked ? 12 : 0, opacity: 1 },
    transition: reduced
      ? { duration: 0, opacity: { duration: durations['dur-2'] } }
      : springs.snappy,
  };
}
export function toastMotion(stacked: boolean, reduced: boolean) {
  return {
    initial: { opacity: 0, y: reduced ? 0 : 12 },
    animate: {
      opacity: stacked ? 0.7 : 1,
      y: 0,
      scale: reduced ? 1 : stacked ? 0.96 : 1,
    },
    exit: { opacity: 0 },
    transition: reduced ? { duration: durations['dur-2'] } : springs.soft,
  };
}
export const motionPresets = {
  enter: {
    initial: { opacity: 0, y: 8 },
    animate: { opacity: 1, y: 0 },
    transition: { duration: durations['dur-3'], ease: easings['ease-out'] },
  },
  fade: {
    initial: { opacity: 0 },
    animate: { opacity: 1 },
    transition: { duration: durations['dur-2'], ease: easings['ease-out'] },
  },
} as const;
export function motionDemo(
  duration: keyof typeof durations,
  easing: keyof typeof easings,
  reduced: boolean,
) {
  return reduced
    ? {
        initial: { opacity: 0 },
        animate: { opacity: 1 },
        transition: { duration: durations['dur-2'], ease: easings['ease-out'] },
      }
    : {
        initial: { x: 0 },
        animate: { x: 64 },
        transition: { duration: durations[duration], ease: easings[easing] },
      };
}
