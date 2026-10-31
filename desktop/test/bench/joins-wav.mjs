// Join review (Phase 3.5): the first N seconds of a render's audio with a short
// beep just before every cut of its cut plan, so each join can be listened to
// for chops. Usage:
//   node desktop/test/bench/joins-wav.mjs <render.mp4|mkv> <cutplan.json|edit.edl.json> [out.wav] [--seconds 20]
// Prints the cut times and what was removed at each. Offline; no AI calls.
import { readFileSync, writeFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { wavBuffer } from '../../transcript.mjs';
import { toolPaths } from './run.mjs';

export const RATE = 48000;

/** Cut times on the output timeline (every kept segment after the first). */
export function cutTimes(plan) {
  const keep = plan.keep ?? plan.cut_plan?.keep ?? [];
  return keep.slice(1).map((k, i) => ({ at: k.at, from: keep[i].out, to: k.in, zoom: k.zoom ?? 1 }));
}

/** Mixes a 1 kHz, 60 ms, −18 dBFS beep ending `lead` seconds before each cut. */
export function beepBeforeCuts(samples, cuts, { rate = RATE, lead = 0.15, dur = 0.06, level = 0.125 } = {}) {
  const out = Float32Array.from(samples);
  for (const c of cuts) {
    const a = Math.round((c.at - lead - dur) * rate);
    const n = Math.round(dur * rate);
    for (let i = 0; i < n; i++) {
      const k = a + i;
      if (k < 0 || k >= out.length) continue;
      const env = Math.min(1, i / 96, (n - i) / 96);
      out[k] = Math.max(-1, Math.min(1, out[k] + level * env * Math.sin((2 * Math.PI * 1000 * i) / rate)));
    }
  }
  return out;
}

if (import.meta.url === `file://${process.argv[1]}` || process.argv[1]?.endsWith('joins-wav.mjs')) {
  const args = process.argv.slice(2);
  const sAt = args.indexOf('--seconds');
  const seconds = sAt >= 0 ? Number(args.splice(sAt, 2)[1]) : 20;
  const [render, planFile, out = 'joins.wav'] = args;
  if (!render || !planFile) {
    console.error('usage: joins-wav.mjs <render> <cutplan.json|edit.edl.json> [out.wav] [--seconds 20]');
    process.exit(2);
  }
  const plan = JSON.parse(readFileSync(planFile, 'utf8'));
  const { ffmpeg } = toolPaths();
  const r = spawnSync(ffmpeg, ['-v', 'error', '-i', render, '-t', String(seconds), '-map', '0:a:0', '-ac', '1', '-ar', String(RATE), '-f', 's16le', 'pipe:1'], { maxBuffer: 1 << 28 });
  if (r.status !== 0) throw new Error(String(r.stderr));
  const pcm = new Float32Array(r.stdout.length / 2);
  for (let i = 0; i < pcm.length; i++) pcm[i] = r.stdout.readInt16LE(i * 2) / 32768;
  const cuts = cutTimes(plan).filter((c) => c.at < seconds);
  writeFileSync(out, wavBuffer(beepBeforeCuts(pcm, cuts), RATE));
  const removed = plan.removed ?? [];
  for (const c of cuts) {
    const why = removed.filter((x) => x.in >= Math.min(c.from, c.to) - 1e-3 && x.out <= Math.max(c.from, c.to) + 1e-3).map((x) => x.reason);
    console.log(`${c.at.toFixed(2)} s  cut ${c.from.toFixed(2)} → ${c.to.toFixed(2)}  ${why.join(', ') || (c.to < c.from ? 'story reorder' : '')}${c.zoom !== 1 ? `  [punch ${c.zoom}]` : ''}`);
  }
  console.log(`${cuts.length} joins in the first ${seconds} s → ${out}`);
}
