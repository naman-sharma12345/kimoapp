// Cheap two-speaker diarisation (Phase 3.4) for podcast framing in Phase 4.
// 1) stereo-separated recordings: each word goes to the louder channel;
// 2) otherwise mouth-region motion energy per person, correlated with the
//    voice: whoever's mouth moves while the voice is on is speaking.
// People boxes from an earlier SAM pass are reused when given (no new calls).
import { spawnBackground as spawn } from './resources.cjs';
import { HOP } from './transcript.mjs';

const pipe = (ffmpeg, args, onData, signal) =>
  new Promise((done) => {
    const child = spawn(ffmpeg, ['-nostdin', '-hide_banner', '-loglevel', 'error', ...args, 'pipe:1'], { windowsHide: true, stdio: ['ignore', 'pipe', 'ignore'], signal });
    child.stdout.on('data', onData);
    child.on('error', () => done(false));
    child.on('exit', (code) => done(code === 0));
  });

const dB = (ms) => (ms > 1e-12 ? 10 * Math.log10(ms) : -120);

/** Per-word loudness of each stereo channel: [{l, r}] (dBFS). */
export function channelLevels(words, interleaved, rate = 16000) {
  return words.map((w) => {
    const a = Math.max(0, Math.floor(w.start * rate));
    const b = Math.min(interleaved.length / 2, Math.ceil(w.end * rate));
    let l = 0;
    let r = 0;
    for (let i = a; i < b; i++) {
      l += interleaved[2 * i] ** 2;
      r += interleaved[2 * i + 1] ** 2;
    }
    const n = Math.max(1, b - a);
    return { l: dB(l / n), r: dB(r / n) };
  });
}

/** Stereo split: separated when the median |L−R| ≥ 6 dB and both sides lead ≥ 15 % of words. */
export function stereoSpeakers(levels) {
  if (levels.length < 4) return null;
  const diff = levels.map((x) => x.l - x.r);
  const sorted = diff.map(Math.abs).sort((a, b) => a - b);
  const median = sorted[Math.floor(sorted.length / 2)];
  const left = diff.filter((d) => d > 3).length / diff.length;
  const right = diff.filter((d) => d < -3).length / diff.length;
  if (median < 6 || left < 0.15 || right < 0.15) return null;
  return { method: 'stereo', confidence: Math.min(1, median / 20), labels: diff.map((d) => (d >= 0 ? 'S1' : 'S2')) };
}

const pearson = (a, b) => {
  const n = Math.min(a.length, b.length);
  if (n < 3) return 0;
  let ma = 0;
  let mb = 0;
  for (let i = 0; i < n; i++) (ma += a[i]), (mb += b[i]);
  ma /= n;
  mb /= n;
  let num = 0;
  let da = 0;
  let db = 0;
  for (let i = 0; i < n; i++) {
    num += (a[i] - ma) * (b[i] - mb);
    da += (a[i] - ma) ** 2;
    db += (b[i] - mb) ** 2;
  }
  return da && db ? num / Math.sqrt(da * db) : 0;
};

/**
 * Visual split from per-person mouth motion series (fps samples) and the voice
 * energy: each sentence goes to the person whose mouth motion during it is
 * highest relative to their own silent baseline. Returns null when the two
 * people cannot be told apart (low confidence).
 */
export function visualSpeakers({ motion, fps, energy, words, sentences }) {
  if (!motion?.length || motion[0].length < 10 || !words.length) return null;
  const n = motion[0].length;
  const voice = new Array(n).fill(0);
  for (let f = 0; f < n; f++) {
    const a = Math.floor(f / fps / energy.hop);
    const b = Math.min(energy.db.length, Math.floor((f + 1) / fps / energy.hop));
    let s = 0;
    for (let k = a; k < b; k++) s += 10 ** (energy.db[k] / 10);
    voice[f] = b > a ? s / (b - a) : 0;
  }
  const silent = voice.map((v) => dB(v) < (energy.floor ?? -60) + 8);
  const base = motion.map((m) => {
    const q = m.filter((_, f) => silent[f]).sort((x, y) => x - y);
    return (q.length ? q[Math.floor(q.length / 2)] : m.toSorted((x, y) => x - y)[Math.floor(n / 2)]) + 1e-3;
  });
  const corr = motion.map((m) => pearson(m, voice));
  const labels = new Array(words.length);
  let sep = 0;
  for (const s of sentences) {
    const a = Math.max(0, Math.floor(s.start * fps));
    const b = Math.min(n, Math.ceil(s.end * fps));
    const score = motion.map((m, k) => {
      let t = 0;
      for (let f = a; f < b; f++) t += m[f];
      return t / Math.max(1, b - a) / base[k];
    });
    const who = score[0] >= score[1] ? 0 : 1;
    sep += Math.abs(Math.log(score[0] / score[1])) * (s.end - s.start);
    for (let i = s.w0; i <= s.w1; i++) labels[i] = `S${who + 1}`;
  }
  const total = sentences.reduce((a, s) => a + s.end - s.start, 0) || 1;
  const confidence = Math.min(1, sep / total / 0.7) * (Math.max(...corr) > 0.05 ? 1 : 0.5);
  if (confidence < 0.25 || new Set(labels).size < 2) return null;
  return { method: 'visual', confidence: +confidence.toFixed(2), correlation: corr.map((c) => +c.toFixed(3)), labels };
}

/** Default mouth regions: the two halves of a wide two-shot, or lower-middle of given person boxes. */
export function mouthRegions(people) {
  if (Array.isArray(people) && people.length >= 2)
    return people
      .slice(0, 2)
      .sort((a, b) => a.x - b.x)
      .map((p) => ({ x0: p.x + p.w * 0.25, x1: p.x + p.w * 0.75, y0: p.y + p.h * 0.5, y1: p.y + p.h * 0.85 }));
  return [
    { x0: 0.08, x1: 0.46, y0: 0.3, y1: 0.75 },
    { x0: 0.54, x1: 0.92, y0: 0.3, y1: 0.75 },
  ];
}

/**
 * Diarise one clip in place: words[].speaker = 'S1' | 'S2'. Tries the stereo
 * channels first, then mouth motion. Returns {method, confidence} or null.
 */
export async function diarise({ ffmpeg, file, transcript, people, signal }) {
  const words = transcript.words;
  if (words.length < 4) return null;
  if (file.audio) {
    const chunks = [];
    await pipe(ffmpeg, ['-i', file.path, '-map', '0:a:0', '-vn', '-ac', '2', '-ar', '16000', '-f', 's16le'], (d) => chunks.push(d), signal);
    const buf = Buffer.concat(chunks);
    const pcm = new Float32Array(Math.floor(buf.length / 2));
    for (let i = 0; i < pcm.length; i++) pcm[i] = buf.readInt16LE(i * 2) / 32768;
    const st = stereoSpeakers(channelLevels(words, pcm));
    if (st) {
      words.forEach((w, i) => (w.speaker = st.labels[i]));
      return { method: st.method, confidence: st.confidence };
    }
  }
  if (!(file.width > 0)) return null;
  const fps = 10;
  const h = 72;
  const rotated = Math.abs(file.rotation ?? 0) % 180 === 90;
  const w = Math.max(16, Math.round((h * (rotated ? file.height / file.width : file.width / file.height)) / 2) * 2);
  const regions = mouthRegions(people).map((r) => ({ x0: Math.floor(r.x0 * w), x1: Math.ceil(r.x1 * w), y0: Math.floor(r.y0 * h), y1: Math.ceil(r.y1 * h) }));
  const motion = regions.map(() => []);
  let prev = null;
  let pending = Buffer.alloc(0);
  await pipe(
    ffmpeg,
    ['-i', file.path, '-an', '-vf', `fps=${fps},scale=${w}:${h}:flags=area,format=gray`, '-f', 'rawvideo'],
    (d) => {
      pending = Buffer.concat([pending, d]);
      while (pending.length >= w * h) {
        const f = pending.subarray(0, w * h);
        regions.forEach((r, k) => {
          let s = 0;
          let c = 0;
          if (prev)
            for (let y = r.y0; y < r.y1; y++)
              for (let x = r.x0; x < r.x1; x++) {
                s += Math.abs(f[y * w + x] - prev[y * w + x]);
                c++;
              }
          motion[k].push(c ? s / c : 0);
        });
        prev = Buffer.from(f);
        pending = pending.subarray(w * h);
      }
    },
    signal,
  );
  const v = visualSpeakers({ motion, fps, energy: transcript.energy ?? { hop: HOP, db: [], floor: -60 }, words, sentences: transcript.sentences });
  if (!v) return null;
  words.forEach((w, i) => (w.speaker = v.labels[i]));
  return { method: v.method, confidence: v.confidence };
}
