import type { SystemErrorInfo } from '../types/system-state-page';

export interface TimelineSegment {
  id: 'clip-1' | 'clip-2' | 'gap' | 'clip-3';
  kind: 'clip' | 'gap';
  /** Normalized start [0..1] along the inner timeline track */
  start: number;
  /** Normalized end [0..1] along the inner timeline track */
  end: number;
  /** CSS variable tint when viewer is over this segment */
  tintVar: string;
}

/**
 * 3 clips (#3A3833, r6) sit on the track with a visible gap in the middle
 * where a clip is missing; the gap has a 1px dashed --line-strong outline.
 * Track inner width is 296px (320px - 2 * 12px padding).
 */
export const NOT_FOUND_SEGMENTS: readonly TimelineSegment[] = [
  {
    id: 'clip-1',
    kind: 'clip',
    start: 0.0,
    end: 0.24,
    tintVar: 'var(--track-video)',
  },
  {
    id: 'clip-2',
    kind: 'clip',
    start: 0.26,
    end: 0.45,
    tintVar: 'var(--track-video)',
  },
  {
    id: 'gap',
    kind: 'gap',
    start: 0.47,
    end: 0.72,
    tintVar: 'var(--viewer-bg)',
  },
  {
    id: 'clip-3',
    kind: 'clip',
    start: 0.74,
    end: 1.0,
    tintVar: 'var(--track-video)',
  },
] as const;

/** Center of the missing gap (used when prefers-reduced-motion is enabled) */
export const REDUCED_MOTION_PLAYHEAD_PROGRESS = 0.595;

export interface PlayheadFrameState {
  /** Normalized playhead position [0..1] across the track */
  progress: number;
  /** Whether the playhead is currently inside the missing clip gap */
  isInGap: boolean;
  /** Whether the playhead is over an active clip */
  isOverClip: boolean;
  /** Opacity for the "no media" label (1, 0.4, 1 at 60ms steps when in gap) */
  noMediaOpacity: number;
}

/**
 * Pure calculation for the 404 timeline playhead & viewer state at any elapsed ms.
 * Playhead sweeps left-to-right over 3000ms linear, then pauses 600ms at the end.
 */
export function computePlayheadState(
  elapsedMs: number,
  reducedMotion: boolean,
  sweepMs = 3000,
  pauseMs = 600,
  flickerStepMs = 60,
): PlayheadFrameState {
  if (reducedMotion) {
    return {
      progress: REDUCED_MOTION_PLAYHEAD_PROGRESS,
      isInGap: true,
      isOverClip: false,
      noMediaOpacity: 1,
    };
  }

  const totalCycleMs = sweepMs + pauseMs;
  const cycleTime = ((elapsedMs % totalCycleMs) + totalCycleMs) % totalCycleMs;
  const progress = cycleTime >= sweepMs ? 1 : cycleTime / sweepMs;

  const gapSeg = NOT_FOUND_SEGMENTS[2] ?? { start: 0, end: 0 };
  const isInGap = progress >= gapSeg.start && progress <= gapSeg.end;
  const isOverClip = NOT_FOUND_SEGMENTS.some(
    (seg) =>
      seg.kind === 'clip' && progress >= seg.start && progress <= seg.end,
  );

  let noMediaOpacity = 1;
  if (isInGap) {
    const gapStartMs = gapSeg.start * sweepMs;
    const msInGap = Math.max(0, cycleTime - gapStartMs);
    const stepIndex = Math.floor(msInGap / flickerStepMs);
    // 2-frame flicker (opacity 1, 0.4, 1 at 60ms steps) on entry and periodic re-trigger
    const modStep = stepIndex % 8;
    noMediaOpacity = modStep === 1 ? 0.4 : 1;
  }

  return {
    progress,
    isInGap,
    isOverClip,
    noMediaOpacity,
  };
}

export type OfflinePhase = 'countdown' | 'reconnecting' | 'online';

export interface OfflineStatusState {
  phase: OfflinePhase;
  secondsRemaining: number;
}

/**
 * Pure transition function for the offline status countdown loop:
 * 4s -> 3s -> 2s -> 1s -> 'reconnecting' -> 4s (if still offline) or 'online'.
 */
export function stepOfflineStatus(
  current: OfflineStatusState,
): OfflineStatusState {
  if (current.phase === 'online') {
    return current;
  }
  if (current.phase === 'reconnecting') {
    return { phase: 'countdown', secondsRemaining: 4 };
  }
  if (current.secondsRemaining > 1) {
    return {
      phase: 'countdown',
      secondsRemaining: current.secondsRemaining - 1,
    };
  }
  return { phase: 'reconnecting', secondsRemaining: 0 };
}

/**
 * Formats the error digest and message for the collapsible mono block.
 */
export function formatErrorDigest(error?: SystemErrorInfo): string {
  if (!error) {
    return 'digest: kimo_err_0x9f4a2c\nmessage: unexpected frame drop in render pipeline';
  }
  const lines: string[] = [];
  if (error.digest) {
    lines.push(`digest: ${error.digest}`);
  }
  lines.push(`message: ${error.message}`);
  return lines.join('\n');
}
