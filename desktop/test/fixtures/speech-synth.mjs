// Synthetic, TTS-free speech fixtures: "words" are harmonic tone bursts, gaps
// are near-silent room tone. Known word edges, gaps and duplicate lines let
// the cut planner be tested exactly.
export const RATE = 16000;

function rng(seed) {
  let x = seed >>> 0 || 1;
  return () => ((x = (x * 1664525 + 1013904223) >>> 0) / 4294967296) * 2 - 1;
}

/**
 * script: [{w, dur, gap?}] (gap = silence after the word, seconds),
 * lead = silence before the first word. Returns {samples, words, duration}
 * where words carry the TRUE edges.
 */
export function synth(script, { lead = 0.5, tail = 0.5, amp = 0.3, noise = 0.0008, seed = 7 } = {}) {
  const words = [];
  let t = lead;
  for (const x of script) {
    words.push({ w: x.w, start: +t.toFixed(4), end: +(t + x.dur).toFixed(4), conf: x.conf ?? 0.9, tail: x.tail });
    t += x.dur + (x.tail?.dur ?? 0) + (x.gap ?? 0.05);
  }
  const duration = t + tail;
  const n = Math.ceil(duration * RATE);
  const samples = new Float32Array(n);
  const r = rng(seed);
  for (let i = 0; i < n; i++) samples[i] = noise * r();
  words.forEach((w, k) => {
    const f0 = 140 + (k % 5) * 15;
    const a = Math.round(w.start * RATE);
    const b = Math.round(w.end * RATE);
    for (let i = a; i < b; i++) {
      const tt = (i - a) / RATE;
      const env = Math.min(1, (i - a) / 80, (b - i) / 80);
      samples[i] += env * amp * (Math.sin(2 * Math.PI * f0 * tt) * 0.6 + Math.sin(4 * Math.PI * f0 * tt) * 0.3 + Math.sin(6 * Math.PI * f0 * tt) * 0.1);
    }
    if (w.tail) {
      // quiet unvoiced tail ("s") or closure + burst ("t")
      const s = Math.round((w.end + (w.tail.closure ?? 0)) * RATE);
      const e = Math.round((w.end + w.tail.dur) * RATE);
      for (let i = s; i < e; i++) samples[i] += w.tail.amp * r();
      w.trueEnd = +(w.end + w.tail.dur).toFixed(4);
    }
  });
  return { samples, words: words.map(({ tail, ...w }) => ({ ...w, trueEnd: w.trueEnd ?? w.end })), duration };
}

/** Whisper-style drift: starts late, ends early (what refinement must undo). */
export const drift = (words, s = 0.08, e = -0.06) => words.map((w) => ({ w: w.w, start: +(w.start + s).toFixed(3), end: +(w.end + e).toFixed(3), conf: w.conf }));

/** Words of a sentence, 0.22 s each with 0.05 s gaps; gap after the last word. */
export const line = (text, gap = 0.05, dur = 0.22) => {
  const ws = text.split(' ');
  return ws.map((w, i) => ({ w, dur, gap: i === ws.length - 1 ? gap : 0.05 }));
};
