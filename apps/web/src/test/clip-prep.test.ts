import { afterEach, describe, expect, it } from 'vitest';
import {
  CLIP_PREP_TITLE,
  clipPrepSnapshot,
  clipProgress,
  firstPromptGate,
  isPreparing,
  overallProgress,
  prepareClip,
  resetClipPrep,
  subscribeClipPrep,
  type ClipStage,
} from '@/lib/clip-prep';

afterEach(() => resetClipPrep());

describe('clip prep stages', () => {
  it('moves a clip reading → thumbnails → analysing audio → ready with rising progress', async () => {
    const stages: ClipStage[] = [];
    const progress: number[] = [];
    const stop = subscribeClipPrep(() => {
      const clip = clipPrepSnapshot()[0];
      if (!clip) return;
      if (stages.at(-1) !== clip.stage) stages.push(clip.stage);
      progress.push(clip.progress);
    });
    const file = new File([new Uint8Array(4096)], 'screen.mp4', {
      type: 'video/mp4',
    });
    let thumbed = false;
    const result = await prepareClip(
      { id: 'a1', name: 'screen.mp4', kind: 'video' },
      file,
      {
        thumbnail: async () => {
          thumbed = true;
        },
        analyze: async (bytes, onProgress) => {
          expect(bytes.byteLength).toBe(4096);
          expect(isPreparing()).toBe(true);
          onProgress(0.5);
          onProgress(1);
          return { assetId: 'a1', silences: [], speech: [] };
        },
      },
    );
    stop();
    expect(thumbed).toBe(true);
    expect(result?.assetId).toBe('a1');
    expect(stages).toEqual(['reading', 'thumbnails', 'analysing', 'ready']);
    for (let i = 1; i < progress.length; i++)
      expect(progress[i]).toBeGreaterThanOrEqual(progress[i - 1] ?? 0);
    expect(progress.at(-1)).toBe(1);
    expect(isPreparing()).toBe(false);
  });

  it('skips the poster for audio and still ends ready when analysis fails', async () => {
    let thumbed = false;
    const result = await prepareClip(
      { id: 'm1', name: 'song.mp3', kind: 'audio' },
      new File([new Uint8Array(10)], 'song.mp3', { type: 'audio/mpeg' }),
      {
        thumbnail: async () => {
          thumbed = true;
        },
        analyze: async () => {
          throw new Error('codec');
        },
      },
    );
    expect(thumbed).toBe(false);
    expect(result).toBeUndefined();
    expect(clipPrepSnapshot()[0]?.stage).toBe('ready');
  });

  it('weights stages into one bar and averages clips', () => {
    expect(clipProgress('reading', 0)).toBe(0);
    expect(clipProgress('thumbnails')).toBeCloseTo(0.2);
    expect(clipProgress('analysing', 0.5)).toBeCloseTo(0.65);
    expect(clipProgress('ready')).toBe(1);
    expect(
      overallProgress([
        { assetId: 'a', name: 'a', stage: 'ready', progress: 1 },
        { assetId: 'b', name: 'b', stage: 'reading', progress: 0 },
      ]),
    ).toBe(0.5);
  });

  it('never says uploading', () => {
    expect(CLIP_PREP_TITLE).toBe(
      'getting your clips ready, they stay on this device',
    );
    expect(CLIP_PREP_TITLE).not.toMatch(/upload/i);
  });
});

describe('first AI edit hold', () => {
  const base = {
    prompt: 'cut the pauses',
    aiReady: true,
    alreadyRun: false,
    missingClips: 0,
    preparing: false,
  };
  it('waits while clips are getting ready or missing', () => {
    expect(firstPromptGate({ ...base, preparing: true })).toBe('wait');
    expect(firstPromptGate({ ...base, missingClips: 1 })).toBe('wait');
  });
  it('runs once clips are ready', () => {
    expect(firstPromptGate(base)).toBe('run');
  });
  it('skips with no prompt, no AI, or when it already ran', () => {
    expect(firstPromptGate({ ...base, prompt: undefined })).toBe('skip');
    expect(firstPromptGate({ ...base, aiReady: false })).toBe('skip');
    expect(firstPromptGate({ ...base, alreadyRun: true })).toBe('skip');
  });
});
