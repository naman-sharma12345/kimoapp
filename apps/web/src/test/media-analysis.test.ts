import { describe, expect, it } from 'vitest';
import { detectBeats, frameLevels, silenceRanges } from '@/lib/media-analysis';

const RATE = 8000;
function tone(seconds: number, amplitude: number) {
  return Float32Array.from(
    { length: Math.round(seconds * RATE) },
    (_, i) => amplitude * Math.sin((2 * Math.PI * 220 * i) / RATE),
  );
}
function join(...parts: Float32Array[]) {
  const out = new Float32Array(parts.reduce((n, p) => n + p.length, 0));
  let offset = 0;
  for (const part of parts) {
    out.set(part, offset);
    offset += part.length;
  }
  return out;
}

describe('in-browser clip analysis (numbers only)', () => {
  it('finds the pauses between speech', () => {
    const samples = join(tone(1, 0.5), tone(0.8, 0.0005), tone(1.2, 0.5));
    const { levels, peakDb } = frameLevels(samples, RATE);
    expect(peakDb).toBeGreaterThan(-7);
    const { silences, speech } = silenceRanges(levels, 3);
    expect(silences).toHaveLength(1);
    const [from, to] = silences[0] ?? [0, 0];
    expect(from).toBeCloseTo(1, 1);
    expect(to).toBeCloseTo(1.8, 1);
    expect(speech).toHaveLength(2);
  });

  it('tracks a 120 bpm click', () => {
    const samples = new Float32Array(RATE * 8);
    for (let beat = 0.25; beat < 8; beat += 0.5)
      for (let i = 0; i < 400; i++)
        samples[Math.round(beat * RATE) + i] = 0.9 * Math.exp(-i / 80);
    const result = detectBeats(samples, RATE, 8);
    expect(result?.bpm).toBeGreaterThan(115);
    expect(result?.bpm).toBeLessThan(125);
    expect(result?.beats.length).toBeGreaterThan(12);
  });
});

describe('chunked analysis for long clips', () => {
  it('matches the one-pass levels and reports progress up to 1', async () => {
    const { frameLevelsChunked } = await import('@/lib/media-analysis');
    const samples = join(tone(20, 0.5), tone(2, 0.0005), tone(20, 0.5));
    const sync = frameLevels(samples, RATE);
    const seen: number[] = [];
    let pauses = 0;
    const chunked = await frameLevelsChunked(
      samples,
      RATE,
      (value) => seen.push(value),
      async () => {
        pauses++;
      },
    );
    expect(chunked.levels).toEqual(sync.levels);
    expect(chunked.peakDb).toBeCloseTo(sync.peakDb, 5);
    expect(chunked.integratedDb).toBeCloseTo(sync.integratedDb, 5);
    expect(pauses).toBeGreaterThan(1);
    expect(seen.at(-1)).toBe(1);
  });
});
