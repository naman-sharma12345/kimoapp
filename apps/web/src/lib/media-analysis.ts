'use client';
import type { AssetAnalysis } from '@kimo/client';

/**
 * Measures a clip's sound in the browser so the AI editor can work with
 * real material: where there is speech or silence, how loud it is, and the
 * beat grid of music. Only these numbers are sent, never the audio.
 */
const MAX_BYTES = 300 * 1024 ** 2;
const MAX_SECONDS = 20 * 60;
const FRAME = 0.02;
const MIN_SILENCE = 0.3;

type Range = [number, number];
const round = (value: number) => Math.round(value * 1000) / 1000;
const db = (value: number) =>
  value > 0 ? Math.max(-120, 20 * Math.log10(value)) : -120;

function mono(buffer: AudioBuffer) {
  const out = new Float32Array(buffer.length);
  for (let channel = 0; channel < buffer.numberOfChannels; channel++) {
    const data = buffer.getChannelData(channel);
    for (let index = 0; index < data.length; index++)
      out[index] =
        (out[index] ?? 0) + (data[index] ?? 0) / buffer.numberOfChannels;
  }
  return out;
}

/** RMS level per 20 ms frame, in dBFS. */
export function frameLevels(samples: Float32Array, rate: number) {
  const size = Math.max(1, Math.round(rate * FRAME));
  const levels = new Float32Array(Math.ceil(samples.length / size));
  let peak = 0;
  let sumSquares = 0;
  for (let frame = 0; frame < levels.length; frame++) {
    let sum = 0;
    const end = Math.min(samples.length, (frame + 1) * size);
    for (let index = frame * size; index < end; index++) {
      const value = samples[index] ?? 0;
      sum += value * value;
      peak = Math.max(peak, Math.abs(value));
    }
    sumSquares += sum;
    levels[frame] = db(Math.sqrt(sum / Math.max(1, end - frame * size)));
  }
  return {
    levels,
    peakDb: db(peak),
    integratedDb: db(Math.sqrt(sumSquares / Math.max(1, samples.length))),
  };
}

/** Quiet stretches of at least 0.3 s, relative to the clip's own noise floor. */
export function silenceRanges(levels: Float32Array, duration: number) {
  const sorted = [...levels].sort((a, b) => a - b);
  const floor = sorted[Math.floor(sorted.length * 0.1)] ?? -120;
  const threshold = Math.min(-30, Math.max(-55, floor + 10));
  const silences: Range[] = [];
  let start = -1;
  for (let frame = 0; frame <= levels.length; frame++) {
    const quiet = frame < levels.length && (levels[frame] ?? -120) < threshold;
    if (quiet && start < 0) start = frame;
    if (!quiet && start >= 0) {
      const from = start * FRAME;
      const to = Math.min(duration, frame * FRAME);
      if (to - from >= MIN_SILENCE) silences.push([round(from), round(to)]);
      start = -1;
    }
  }
  const speech: Range[] = [];
  let cursor = 0;
  for (const [from, to] of silences) {
    if (from - cursor > 0.05) speech.push([round(cursor), round(from)]);
    cursor = to;
  }
  if (duration - cursor > 0.05) speech.push([round(cursor), round(duration)]);
  return { silences: silences.slice(0, 500), speech: speech.slice(0, 500) };
}

/**
 * A simple beat tracker: an energy onset curve, tempo by autocorrelation
 * between 70 and 180 bpm, and the phase that lines up with most onsets.
 */
export function detectBeats(
  samples: Float32Array,
  rate: number,
  duration: number,
) {
  const hop = Math.max(1, Math.round(rate * 0.01));
  const frames = Math.floor(samples.length / hop);
  if (frames < 400) return undefined;
  const energy = new Float32Array(frames);
  for (let frame = 0; frame < frames; frame++) {
    let sum = 0;
    for (let index = frame * hop; index < (frame + 1) * hop; index++)
      sum += (samples[index] ?? 0) ** 2;
    energy[frame] = Math.log1p(sum * 1000);
  }
  const onset = new Float32Array(frames);
  for (let frame = 1; frame < frames; frame++)
    onset[frame] = Math.max(0, (energy[frame] ?? 0) - (energy[frame - 1] ?? 0));
  const minLag = Math.round(60 / 180 / 0.01);
  const maxLag = Math.round(60 / 70 / 0.01);
  let bestLag = 0;
  let bestScore = 0;
  for (let lag = minLag; lag <= maxLag; lag++) {
    let score = 0;
    for (let frame = lag; frame < frames; frame++)
      score += (onset[frame] ?? 0) * (onset[frame - lag] ?? 0);
    if (score > bestScore) {
      bestScore = score;
      bestLag = lag;
    }
  }
  if (!bestLag || !bestScore) return undefined;
  let bestPhase = 0;
  let phaseScore = -1;
  for (let phase = 0; phase < bestLag; phase++) {
    let score = 0;
    for (let frame = phase; frame < frames; frame += bestLag)
      score += onset[frame] ?? 0;
    if (score > phaseScore) {
      phaseScore = score;
      bestPhase = phase;
    }
  }
  const period = bestLag * 0.01;
  const beats: number[] = [];
  for (
    let time = bestPhase * 0.01;
    time < duration && beats.length < 4000;
    time += period
  )
    beats.push(round(time));
  return { beats, bpm: Math.round((60 / period) * 10) / 10 };
}

/** Analyses one clip's audio, or answers undefined when it can't. */
export async function analyzeClip(
  assetId: string,
  file: File,
  kind: 'video' | 'audio',
): Promise<AssetAnalysis | undefined> {
  if (file.size > MAX_BYTES || typeof AudioContext === 'undefined')
    return undefined;
  const context = new AudioContext();
  try {
    const buffer = await context.decodeAudioData(await file.arrayBuffer());
    if (!buffer.duration || buffer.duration > MAX_SECONDS) return undefined;
    const samples = mono(buffer);
    const { levels, peakDb, integratedDb } = frameLevels(
      samples,
      buffer.sampleRate,
    );
    const { silences, speech } = silenceRanges(levels, buffer.duration);
    const music =
      kind === 'audio'
        ? detectBeats(samples, buffer.sampleRate, buffer.duration)
        : undefined;
    return {
      assetId,
      silences,
      speech,
      loudness: {
        integratedDb: Math.round(integratedDb * 10) / 10,
        peakDb: Math.round(peakDb * 10) / 10,
      },
      ...(music ? music : {}),
    };
  } catch {
    // No audio track, or a codec the browser can't decode.
    return undefined;
  } finally {
    await context.close().catch(() => undefined);
  }
}
