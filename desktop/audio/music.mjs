import { spectrum } from './voice.mjs';
import { run } from './process.mjs';

export const barSeconds = (bpm) => 240 / Math.max(40, Math.min(240, bpm));
export function fitMusic(track, duration) {
  const bar = barSeconds(track.bpm ?? 100);
  const start = track.loop_start ?? 0;
  const available = Math.max(0.05, (track.loop_end ?? track.duration) - start);
  const bars = Math.max(1, Math.floor(available / bar + 0.001));
  const period = Math.min(available, bars * bar);
  return {
    start,
    period,
    crossfade: Math.min(0.12, 60 / (track.bpm ?? 100) / 4),
    duration,
    fade:
      Math.abs(duration / bar - Math.round(duration / bar)) < 0.005
        ? 0.04
        : Math.min(1.5, duration / 3),
    bars,
  };
}
export function beatGrid(track, duration, offset = 0) {
  const beat = 60 / (track.bpm ?? 100),
    grid = [];
  for (let i = 0; offset + i * beat <= duration; i++)
    grid.push({ t: +(offset + i * beat).toFixed(6), downbeat: i % 4 === 0 });
  return grid;
}
/** Reuses transcript timings. Without words, source VOICE clip spans are conservative speech. */
export function speechIntervals(edl) {
  const spans = [];
  const words = edl.camera_plan?.words ?? {};
  for (const t of edl.audio ?? [])
    if (t.role === 'VOICE')
      for (const c of t.clips) {
        if (edl.sources.find((s) => s.id === c.src)?.audio === false) continue;
        const path = edl.sources
          .find((s) => s.id === c.src)
          ?.path?.replaceAll('\\', '/');
        const ws = words[c.src] ?? words[c.linked] ?? words[path] ?? [];
        if (!ws.length)
          spans.push([c.at, c.at + (c.dur ?? (c.out - c.in) / (c.speed ?? 1))]);
        else
          for (const w of ws) {
            const a = Number(w.start ?? w.t0 ?? w.at),
              b = Number(w.end ?? w.t1 ?? a + (w.dur ?? 0.1));
            const x = Math.max(a, c.in ?? 0),
              y = Math.min(b, c.out ?? Infinity);
            if (Number.isFinite(x + y) && y > x)
              spans.push([
                c.at + (x - (c.in ?? 0)) / (c.speed ?? 1),
                c.at + (y - (c.in ?? 0)) / (c.speed ?? 1),
              ]);
          }
      }
  const merged = [];
  for (const span of spans.sort((a, b) => a[0] - b[0])) {
    const last = merged.at(-1);
    if (last && span[0] - last[1] <= 0.8) last[1] = Math.max(last[1], span[1]);
    else merged.push([...span]);
  }
  return merged;
}
export function duckEnvelope(spans, duration, { hook = false } = {}) {
  const points = [{ t: 0, db: hook ? 0 : spans.length ? -9 : 0 }];
  for (const [a, b] of spans) {
    if (b <= 0 || a >= duration) continue;
    const start = Math.max(hook ? 0.75 : 0, a - 0.05);
    points.push(
      { t: Math.max(0, start - 0.25), db: hook && start <= 0.75 ? 0 : -9 },
      { t: start, db: -16 },
      { t: Math.min(duration, b + 0.05), db: -16 },
      { t: Math.min(duration, b + 0.3), db: -9 },
    );
  }
  // Stable ordering gives speech priority where adjacent ramps overlap.
  const sorted = points.sort((a, b) => a.t - b.t),
    result = [];
  for (const p of sorted) {
    const last = result.at(-1);
    if (last && last.t === p.t) last.db = Math.min(last.db, p.db);
    else result.push(p);
  }
  return result;
}
export function envelopeExpression(points) {
  if (!points.length) return '1';
  let expr = String(points.at(-1).db);
  for (let i = points.length - 2; i >= 0; i--) {
    const a = points[i],
      b = points[i + 1];
    expr = `if(lt(t,${b.t}),${a.db}+(t-${a.t})*${(b.db - a.db) / Math.max(1e-6, b.t - a.t)},${expr})`;
  }
  return `pow(10,(${expr})/20)`;
}
/** Bounded spectral-flux onset autocorrelation for imported music; never claims exact beats. */
export async function detectBeats(ffmpeg, source, options = {}) {
  const { stdout } = await run(
    ffmpeg,
    [
      '-t',
      '24',
      '-i',
      source,
      '-vn',
      '-ar',
      '12000',
      '-ac',
      '1',
      '-f',
      'f32le',
      '-',
    ],
    {
      ...options,
      binary: true,
      title: 'music: estimating the imported track beat grid',
    },
  );
  const samples = new Float32Array(stdout.length / 4);
  for (let i = 0; i < samples.length; i++)
    samples[i] = stdout.readFloatLE(i * 4);
  const flux = [],
    hop = 256;
  let previous = new Float64Array(512);
  for (let i = 0; i + 1024 < samples.length; i += hop) {
    const s = spectrum(samples.subarray(i, i + 1024));
    flux.push(s.reduce((a, v, k) => a + Math.max(0, v - previous[k]), 0));
    previous = s;
  }
  let best = 0,
    bpm = 100,
    phase = 0;
  for (let b = 60; b <= 180; b++) {
    const lag = Math.round(((60 / b) * 12000) / hop);
    let sum = 0;
    for (let i = lag; i < flux.length; i++) sum += flux[i] * flux[i - lag];
    if (sum > best) {
      best = sum;
      bpm = b;
    }
  }
  const lag = Math.max(1, Math.round(((60 / bpm) * 12000) / hop));
  let peak = 0;
  for (let k = 0; k < lag; k++) {
    let sum = 0;
    for (let i = k; i < flux.length; i += lag) sum += flux[i];
    if (sum > peak) {
      peak = sum;
      phase = (k * hop) / 12000;
    }
  }
  return { bpm, beat_offset: phase, estimated: true };
}
