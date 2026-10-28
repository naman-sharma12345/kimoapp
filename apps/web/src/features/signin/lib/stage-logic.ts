import type {
  AgentStep,
  SignInErrorKind,
  StageFrameState,
  ViewerScene,
} from '../types/sign-in';
import type { AuthProvider } from '@kimo/client';

export const LOOP_DURATION_SEC = 14.0;
export const TIMELINE_TOTAL_SEC = 7.2;
export const FPS = 30;

export const CAPTION_WORDS = [
  'we',
  'drove',
  'until',
  'the',
  'sky',
  'turned',
  'gold',
] as const;

export const TITLE_WORDS = ['the', 'long', 'way', 'home'] as const;

/**
 * Formats seconds into hh:mm:ss:ff at 30fps (e.g. 00:00:04:12).
 */
export function formatTimecode(seconds: number, fps: number = FPS): string {
  const clamped = Math.max(0, Math.min(seconds, TIMELINE_TOTAL_SEC));
  const totalFrames = Math.floor(clamped * fps + 1e-6);
  const ff = totalFrames % fps;
  const totalSeconds = Math.floor(totalFrames / fps);
  const ss = totalSeconds % 60;
  const mm = Math.floor(totalSeconds / 60) % 60;
  const hh = Math.floor(totalSeconds / 3600);

  const pad = (n: number) => String(n).padStart(2, '0');
  return `${pad(hh)}:${pad(mm)}:${pad(ss)}:${pad(ff)}`;
}

/**
 * Deterministic seeded heights for the 40 waveform bars in a1 ("lofi bed")
 * and 24 waveform bars in a2 ("vo"). Values are percentages in [25, 95].
 */
export function generateSeededWaveform(count: number, seed: number): number[] {
  const bars: number[] = [];
  let s = seed;
  for (let i = 0; i < count; i++) {
    s = (s * 1664525 + 1013904223) % 4294967296;
    const norm = s / 4294967296;
    bars.push(Math.round(25 + norm * 70));
  }
  return bars;
}

export const LOFI_WAVEFORM = generateSeededWaveform(40, 42);
export const VO_WAVEFORM = generateSeededWaveform(24, 108);

/**
 * Resolves the agent log step for a given loop timestamp (0..14s).
 */
export function getAgentStepAtTime(
  loopTime: number,
  reducedMotion: boolean,
): AgentStep {
  if (reducedMotion) {
    return {
      id: 'ready',
      text: 'ready. press play.',
      tool: '',
      statusIcon: 'check',
    };
  }

  if (loopTime < 0.8) {
    return {
      id: 'analyze',
      text: 'reading your footage',
      tool: 'analyze_media',
      statusIcon: 'pulse',
    };
  }
  if (loopTime < 2.6) {
    return {
      id: 'cut',
      text: 'cutting to the beat',
      tool: 'cut_to_beats',
      statusIcon: 'pulse',
    };
  }
  if (loopTime < 3.4) {
    return {
      id: 'caption',
      text: 'writing captions',
      tool: 'caption_words',
      statusIcon: 'pulse',
    };
  }
  if (loopTime < 4.2) {
    return {
      id: 'music',
      text: 'scoring with a lofi bed',
      tool: 'add_music',
      statusIcon: 'pulse',
    };
  }
  if (loopTime < 5.0) {
    return {
      id: 'voice',
      text: 'recording the voiceover',
      tool: 'voice_generate',
      statusIcon: 'pulse',
    };
  }
  if (loopTime < 6.0) {
    return {
      id: 'grade',
      text: 'grading the road warm',
      tool: 'color_grade',
      statusIcon: 'pulse',
    };
  }
  if (loopTime < 6.4) {
    return {
      id: 'ready',
      text: 'ready. press play.',
      tool: '',
      statusIcon: 'check',
    };
  }
  return {
    id: 'preview',
    text: 'playing your cut',
    tool: 'preview',
    statusIcon: 'check',
  };
}

/**
 * Calculates how many words of "we drove until the sky turned gold" are active (cream-100)
 * as playhead moves across 0.4s to 4.6s.
 */
export function getActiveCaptionWordCount(playheadSec: number): number {
  const start = 0.4;
  const end = 4.6;
  if (playheadSec < start) return 0;
  if (playheadSec >= end) return CAPTION_WORDS.length;
  const progress = (playheadSec - start) / (end - start);
  return Math.min(
    CAPTION_WORDS.length,
    Math.floor(progress * CAPTION_WORDS.length) + 1,
  );
}

/**
 * Computes the complete declarative Stage state for any moment in the 14.0s loop
 * (or the static reduced-motion snapshot).
 */
export function getStageFrameAtTime(
  rawElapsedSec: number,
  reducedMotion: boolean,
): StageFrameState {
  if (reducedMotion) {
    const parkedPlayhead = 4.8;
    return {
      loopTime: 6.0,
      playheadSec: parkedPlayhead,
      timecode: formatTimecode(parkedPlayhead),
      scene: 'title',
      sceneProgress: 1,
      isWarmGraded: true,
      showGradeTag: false,
      showCaptions: false,
      activeWordCount: CAPTION_WORDS.length,
      v1DawnVisible: true,
      v1RoadVisible: true,
      v1TitleVisible: true,
      isRoadTrimmed: true,
      showTrimBracket: false,
      t1Visible: true,
      a1Visible: true,
      a2Visible: true,
      fxBarVisible: true,
      stageFadingOut: false,
      agentStep: getAgentStepAtTime(6.0, true),
    };
  }

  const loopTime =
    ((rawElapsedSec % LOOP_DURATION_SEC) + LOOP_DURATION_SEC) %
    LOOP_DURATION_SEC;

  const isPlaying = loopTime >= 6.4 && loopTime < 13.6;
  const playheadSec = isPlaying
    ? Math.min(TIMELINE_TOTAL_SEC, loopTime - 6.4)
    : 0;

  let scene: ViewerScene = 'empty';
  let sceneProgress = 0;

  if (isPlaying) {
    if (playheadSec < 2.4) {
      scene = 'dawn';
      sceneProgress = playheadSec / 2.4;
    } else if (playheadSec < 4.8) {
      scene = 'road';
      sceneProgress = (playheadSec - 2.4) / 2.4;
    } else {
      scene = 'title';
      sceneProgress = Math.min(1, (playheadSec - 4.8) / 2.4);
    }
  } else if (loopTime >= 5.0 && loopTime < 6.4) {
    // While grading and readying between 5.0s and 6.4s, preview road/dawn frame
    scene = loopTime < 6.0 ? 'road' : 'dawn';
    sceneProgress = loopTime < 6.0 ? 0.6 : 0;
  } else if (loopTime >= 0.8 && loopTime < 5.0) {
    scene = 'dawn';
    sceneProgress = 0.25;
  }

  // Halfway through Scene 2 (playhead >= 3.6s) or during the 5.0s–6.0s grading step
  const isWarmGraded =
    (scene === 'road' && playheadSec >= 3.6) ||
    (loopTime >= 5.0 && loopTime < 6.0);

  const showGradeTag =
    (isPlaying && scene === 'road' && playheadSec >= 3.6) ||
    (loopTime >= 5.0 && loopTime < 6.0);

  const showCaptions =
    isPlaying &&
    (scene === 'dawn' || scene === 'road') &&
    playheadSec >= 0.4 &&
    playheadSec <= 4.6;

  return {
    loopTime,
    playheadSec,
    timecode: formatTimecode(playheadSec),
    scene,
    sceneProgress,
    isWarmGraded,
    showGradeTag,
    showCaptions,
    activeWordCount: getActiveCaptionWordCount(playheadSec),
    v1DawnVisible: loopTime >= 0.8,
    v1RoadVisible: loopTime >= 0.92,
    v1TitleVisible: loopTime >= 1.04,
    isRoadTrimmed: loopTime >= 2.0,
    showTrimBracket: loopTime >= 2.0 && loopTime < 2.3,
    t1Visible: loopTime >= 2.6,
    a1Visible: loopTime >= 3.4,
    a2Visible: loopTime >= 4.2,
    fxBarVisible: loopTime >= 5.0,
    stageFadingOut: loopTime >= 13.6,
    agentStep: getAgentStepAtTime(loopTime, false),
  };
}

/**
 * Returns the exact copy for each error variant as specified by the prompt.
 */
export function getErrorCopy(
  kind: SignInErrorKind,
  provider: AuthProvider = 'github',
): {
  message: string;
  canRetry: boolean;
} {
  switch (kind) {
    case 'not_allowed':
      return {
        message: `this ${provider} account can't be used with kimo yet.`,
        canRetry: true,
      };
    case 'cancelled':
      return {
        message: `${provider} sign-in was cancelled. try again when you're ready.`,
        canRetry: true,
      };
    case 'expired':
      return {
        message: 'that sign-in link expired. start again.',
        canRetry: true,
      };
    case 'unavailable':
      return {
        message: `${provider} sign-in isn't available right now.`,
        canRetry: false,
      };
    case 'rate_limited':
      return {
        message:
          'too many sign-in attempts. wait a few minutes, then try again.',
        canRetry: false,
      };
    case 'network':
      return {
        message: "couldn't reach kimo. check your connection and try again.",
        canRetry: true,
      };
    default:
      return {
        message: `${provider} sign-in didn't finish. try again?`,
        canRetry: true,
      };
  }
}
