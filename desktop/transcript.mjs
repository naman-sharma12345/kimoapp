// Word-accurate transcript for the cut planner (Phase 3.1).
// whisper.cpp (bundled build, word timestamps) on a 16 kHz mono extract,
// word edges snapped to the audio's own energy, fillers tagged per language,
// cached by audio hash. Pure JS, Node 20 ESM; everything runs on this PC.
import { spawnBackground as spawn, workerThreads } from './resources.cjs';
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, writeFileSync, rmSync } from 'node:fs';
import { availableParallelism } from 'node:os';
import { join, basename } from 'node:path';

export const TRANSCRIPT_VERSION = 3;
export const SAMPLE_RATE = 16000;
export const HOP = 0.01; // energy frame, seconds
export const PITCH_HOP = 0.02;

const FILLERS = JSON.parse(readFileSync(new URL('./data/fillers.json', import.meta.url), 'utf8'));
export { FILLERS };

// ---------------------------------------------------------------- audio

const run = (bin, args, { signal, binary = false } = {}) =>
  new Promise((done) => {
    let child;
    try {
      child = spawn(bin, bin.match(/ffmpeg(\.exe)?$/i) ? ['-nostdin', ...args] : args, { windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'], signal });
    } catch (e) {
      done({ code: -1, out: binary ? Buffer.alloc(0) : '', err: String(e.message) });
      return;
    }
    const chunks = [];
    let err = '';
    child.stdout.on('data', (d) => chunks.push(d));
    child.stderr.on('data', (d) => (err = (err + d).slice(-20000)));
    child.on('error', (e) => done({ code: -1, out: binary ? Buffer.alloc(0) : '', err: String(e.message) }));
    child.on('exit', (code) => {
      const out = Buffer.concat(chunks);
      done({ code, out: binary ? out : out.toString('utf8'), err });
    });
  });

/** 16 kHz mono s16le WAV of a file's first audio stream (what whisper reads). */
export async function extractSpeechWav(ffmpeg, input, out, { signal } = {}) {
  const r = await run(ffmpeg, ['-hide_banner', '-loglevel', 'error', '-y', '-i', input, '-map', '0:a:0', '-vn', '-ac', '1', '-ar', String(SAMPLE_RATE), '-c:a', 'pcm_s16le', out], { signal });
  if (r.code !== 0 || !existsSync(out)) throw new Error(`audio extract failed: ${String(r.err).trim().split('\n').pop() || r.code}`);
  return out;
}

/** Float32 samples from a 16-bit PCM WAV buffer (mono or the first channel). */
export function wavSamples(buffer) {
  let pos = 12;
  let channels = 1;
  let rate = SAMPLE_RATE;
  while (pos + 8 <= buffer.length) {
    const id = buffer.toString('ascii', pos, pos + 4);
    const size = buffer.readUInt32LE(pos + 4);
    if (id === 'fmt ') {
      channels = buffer.readUInt16LE(pos + 10);
      rate = buffer.readUInt32LE(pos + 12);
    }
    if (id === 'data') {
      const end = Math.min(buffer.length, pos + 8 + size);
      const count = Math.floor((end - pos - 8) / 2 / channels);
      const samples = new Float32Array(count);
      for (let i = 0; i < count; i++) samples[i] = buffer.readInt16LE(pos + 8 + i * 2 * channels) / 32768;
      return { samples, rate };
    }
    pos += 8 + size + (size & 1);
  }
  throw new Error('not a PCM WAV file');
}

/** Little-endian 16-bit mono WAV (used by tests and the joins review tool). */
export function wavBuffer(samples, rate = SAMPLE_RATE) {
  const b = Buffer.alloc(44 + samples.length * 2);
  b.write('RIFF', 0);
  b.writeUInt32LE(36 + samples.length * 2, 4);
  b.write('WAVEfmt ', 8);
  b.writeUInt32LE(16, 16);
  b.writeUInt16LE(1, 20);
  b.writeUInt16LE(1, 22);
  b.writeUInt32LE(rate, 24);
  b.writeUInt32LE(rate * 2, 28);
  b.writeUInt16LE(2, 32);
  b.writeUInt16LE(16, 34);
  b.write('data', 36);
  b.writeUInt32LE(samples.length * 2, 40);
  for (let i = 0; i < samples.length; i++) b.writeInt16LE(Math.max(-32768, Math.min(32767, Math.round(samples[i] * 32767))), 44 + i * 2);
  return b;
}

const dbOf = (meanSquare) => (meanSquare > 1e-12 ? 10 * Math.log10(meanSquare) : -120);

/** RMS loudness in dBFS per 10 ms frame. */
export function rmsFrames(samples, rate = SAMPLE_RATE, hop = HOP) {
  const n = Math.max(1, Math.round(rate * hop));
  const frames = Math.ceil(samples.length / n);
  const db = new Array(frames);
  for (let f = 0; f < frames; f++) {
    let sum = 0;
    const end = Math.min(samples.length, (f + 1) * n);
    for (let i = f * n; i < end; i++) sum += samples[i] * samples[i];
    // full-scale sine = -3 dBFS RMS; report RMS relative to full-scale square (dBFS)
    db[f] = Math.round(dbOf(sum / Math.max(1, end - f * n)) * 10) / 10;
  }
  return db;
}

/** Noise floor: 10th percentile of frame loudness (clamped to a sane range). */
export function noiseFloor(db) {
  if (!db.length) return -90;
  const sorted = db.filter((x) => x > -119).sort((a, b) => a - b);
  if (!sorted.length) return -90;
  return Math.max(-90, Math.min(-25, sorted[Math.floor(sorted.length * 0.1)]));
}

/**
 * Cheap pitch track (Hz, 0 = unvoiced) every 20 ms: normalised autocorrelation
 * on a 4:1 decimated signal, 70–400 Hz. Only frames above the speech
 * threshold are analysed so long files stay fast.
 */
export function pitchTrack(samples, rate = SAMPLE_RATE, db = rmsFrames(samples, rate), floor = noiseFloor(db)) {
  const dec = 4;
  const r = rate / dec;
  const x = new Float32Array(Math.floor(samples.length / dec));
  for (let i = 0; i < x.length; i++) {
    let s = 0;
    for (let k = 0; k < dec; k++) s += samples[i * dec + k];
    x[i] = s / dec;
  }
  const hop = Math.round(r * PITCH_HOP);
  const win = Math.round(r * 0.032);
  const lo = Math.floor(r / 400);
  const hi = Math.ceil(r / 70);
  const out = [];
  for (let start = 0; start + win + hi < x.length; start += hop) {
    const frame = Math.min(db.length - 1, Math.round((start * dec) / rate / HOP));
    if (db[frame] < floor + 15) {
      out.push(0);
      continue;
    }
    let e0 = 0;
    for (let i = 0; i < win; i++) e0 += x[start + i] * x[start + i];
    let best = 0;
    let lag = 0;
    for (let L = lo; L <= hi; L++) {
      let c = 0;
      let e1 = 0;
      for (let i = 0; i < win; i++) {
        c += x[start + i] * x[start + i + L];
        e1 += x[start + i + L] * x[start + i + L];
      }
      const v = c / Math.sqrt(e0 * e1 + 1e-12);
      if (v > best) [best, lag] = [v, L];
    }
    out.push(best > 0.55 && lag ? Math.round(r / lag) : 0);
  }
  return out;
}

/** Nearest zero crossing to t within ±maxMs, or null. */
export function nearestZeroCross(samples, rate, t, maxMs = 5) {
  if (!samples) return null;
  const c = Math.round(t * rate);
  const span = Math.round((maxMs / 1000) * rate);
  for (let d = 0; d <= span; d++)
    for (const i of [c - d, c + d])
      if (i > 0 && i < samples.length && (samples[i - 1] <= 0) !== (samples[i] <= 0)) return i / rate;
  return null;
}

/** Loudness (dBFS) of the frame at time t. */
export function energyAt(energy, t) {
  if (!energy?.db?.length) return -120;
  const f = Math.max(0, Math.min(energy.db.length - 1, Math.floor(t / energy.hop)));
  return energy.db[f];
}

// ---------------------------------------------------------------- word edges

/**
 * Whisper word edges drift 50–200 ms. Snap each start back to the nearest
 * energy onset (threshold = floor + 12 dB) within −120…+40 ms and each end to
 * the energy offset within −40…+150 ms. Offsets use a lower threshold
 * (floor + 6 dB) and a stop's release burst after a short closure is kept, so
 * sibilant and plosive tails ("this", "that") are not chopped.
 */
export function refineWords(words, energy) {
  const { db, hop, floor } = energy;
  if (!db?.length) return words;
  const on = floor + 12;
  const tail = floor + 6;
  const F = (t) => Math.max(0, Math.min(db.length - 1, Math.round(t / hop)));
  const out = words.map((w) => ({ ...w }));
  // pass 1: starts (onsets), so every end search below knows where the next word really begins
  for (let i = 0; i < out.length; i++) {
    const w = out[i];
    let best = null;
    for (let f = F(w.start - 0.12); f <= F(w.start + 0.04); f++)
      if (f > 0 && db[f] >= on && db[f - 1] < on && (best == null || Math.abs(f * hop - w.start) < Math.abs(best - w.start))) best = f * hop;
    if (best == null) {
      // already voiced at the start: walk back through the voiced run to its onset
      let f = F(w.start);
      const limit = F(w.start - 0.12);
      if (db[f] >= on) {
        while (f > limit && db[f - 1] >= on) f--;
        if (f > limit) best = f * hop;
      }
    }
    if (best != null) w.start = Math.max(i ? out[i - 1].start + hop : 0, Math.min(best, w.end - hop));
  }
  // pass 2: ends (offsets) with sibilant/plosive tails kept
  for (let i = 0; i < out.length; i++) {
    const w = out[i];
    const nextStart = i + 1 < out.length ? out[i + 1].start : Infinity;
    const limit = Math.min(F(w.end + 0.15), Number.isFinite(nextStart) ? F(nextStart) - 1 : db.length - 1);
    let f = F(w.end - 0.04);
    let end = null;
    for (; f <= limit; f++) {
      if (db[f] >= tail) continue;
      let quiet = 0;
      while (f + quiet <= limit && db[f + quiet] < tail && quiet < 3) quiet++;
      if (quiet >= 3 || f + quiet > limit) {
        end = f;
        break;
      }
    }
    // still sounding at the window's edge (a long "s"): the word runs to the window's end
    if (end == null && limit >= F(w.end) && db[limit] >= tail) end = limit + 1;
    if (end != null) {
      // plosive release: a short burst (≤ 100 ms) after a closure ≤ 120 ms that dies out
      // again ≥ 20 ms before the next word still belongs to this word
      let g = end;
      while (g <= limit && db[g] < tail && (g - end) * hop <= 0.12) g++;
      if (g <= limit && db[g] >= tail) {
        let b = g;
        while (b <= limit && db[b] >= tail) b++;
        if (b <= limit && db[b] < tail && (b - g) * hop <= 0.1 && b * hop <= nextStart - 0.02) end = b;
      }
      const t = end * hop + 0.01; // 10 ms hangover
      if (t >= w.end - 0.04 && t > w.start + hop) w.end = Math.min(t, w.end + 0.15, nextStart);
    }
    w.end = Math.max(w.end, w.start + hop);
  }
  for (let i = 0; i + 1 < out.length; i++) if (out[i].end > out[i + 1].start) out[i].end = Math.max(out[i].start + hop, out[i + 1].start);
  return out.map((w) => ({ ...w, start: +w.start.toFixed(3), end: +w.end.toFixed(3) }));
}

// ---------------------------------------------------------------- whisper

const helpCache = new Map();
/** The flags the bundled whisper build understands (parsed from --help once). */
export async function whisperFlags(bin) {
  if (!helpCache.has(bin))
    helpCache.set(
      bin,
      run(bin, ['--help']).then((r) => {
        const text = `${r.out}\n${r.err}`;
        const has = (re) => re.test(text);
        return {
          ok: /usage|options/i.test(text),
          ojf: has(/-ojf\b|--output-json-full/),
          sow: has(/-sow\b|--split-on-word/),
          ml: has(/-ml\b|--max-len/),
          dtw: has(/-dtw\b|--dtw/),
          np: has(/-np\b|--no-prints/),
          dl: has(/-dl\b|--detect-language/),
        };
      }),
    );
  return helpCache.get(bin);
}

/** whisper.cpp's DTW alignment preset for a ggml model file, or null. */
export function dtwPreset(model) {
  const m = /ggml-(tiny|base|small|medium|large-v3-turbo|large-v[123])(\.en)?/i.exec(basename(String(model)));
  if (!m) return null;
  return `${m[1].toLowerCase().replace('large-v3-turbo', 'large.v3.turbo').replace(/large-v/, 'large.v')}${m[2] ?? ''}`;
}

export function whisperArgs({ flags, model, wav, outBase, language = 'auto', threads, dtw = true }) {
  const args = ['-m', model, '-f', wav, '-l', language, '-t', String(threads), '-of', outBase];
  args.push(flags.ojf ? '-ojf' : '-oj');
  if (flags.ml) args.push('-ml', '1');
  if (flags.sow) args.push('-sow');
  if (flags.np) args.push('-np');
  const preset = dtw && flags.dtw ? dtwPreset(model) : null;
  if (preset) args.push('-dtw', preset);
  return args;
}

// control tokens and non-speech annotations ([BLANK_AUDIO], (music), *laughs*)
const special = (t) => /^\[_|^<\||^\[[^\]]*\]$|^\([^)]*\)$|^\*[^*]*\*$|^♪/.test(String(t ?? '').trim());

/**
 * whisper.cpp JSON (-ojf, -ml 1 -sow: one segment per word) → words.
 * conf = mean token probability; a DTW token time (t_dtw, 10 ms units) is
 * used as the start when it agrees with the segment within 300 ms.
 */
export function parseWhisperJson(json) {
  const words = [];
  for (const seg of json?.transcription ?? []) {
    const text = String(seg.text ?? '').replace(/\s+/g, ' ');
    const trimmed = text.trim();
    if (!trimmed || special(trimmed)) continue;
    let start = Number(seg.offsets?.from ?? 0) / 1000;
    const end = Number(seg.offsets?.to ?? 0) / 1000;
    const tokens = (seg.tokens ?? []).filter((t) => !special(t.text) && String(t.text ?? '').trim());
    const probs = tokens.map((t) => Number(t.p)).filter(Number.isFinite);
    const dtw = tokens.map((t) => Number(t.t_dtw)).find((v) => Number.isFinite(v) && v >= 0);
    if (dtw != null && Math.abs(dtw / 100 - start) < 0.3) start = Math.min(end, dtw / 100);
    const conf = probs.length ? probs.reduce((a, b) => a + b, 0) / probs.length : 0.5;
    // a punctuation-only segment belongs to the word before it
    if (/^[\p{P}\p{S}]+$/u.test(trimmed) && words.length) {
      words.at(-1).w += trimmed;
      continue;
    }
    // with -sow a segment can still hold several words; split time evenly by characters
    const parts = trimmed.split(' ');
    if (parts.length === 1) words.push({ w: trimmed, start, end: Math.max(end, start + 0.02), conf: +conf.toFixed(3) });
    else {
      const total = parts.reduce((a, p) => a + p.length, 0) || 1;
      let t = start;
      for (const p of parts) {
        const d = ((end - start) * p.length) / total;
        words.push({ w: p, start: t, end: t + Math.max(0.02, d), conf: +conf.toFixed(3) });
        t += d;
      }
    }
  }
  return { words, language: json?.result?.language ?? json?.params?.language ?? null };
}

// ---------------------------------------------------------------- language + fillers

export const norm = (w) =>
  String(w ?? '')
    .toLowerCase()
    .normalize('NFC')
    .replace(/[\u2018\u2019]/g, "'")
    .replace(/^[^\p{L}\p{N}']+|[^\p{L}\p{N}']+$/gu, '');

/** en, or hi (Devanagari or romanised Hinglish). */
export function detectLanguage(words, whisperLang) {
  const tokens = words.map((w) => norm(w.w)).filter(Boolean);
  const deva = tokens.filter((t) => /\p{Script=Devanagari}/u.test(t)).length;
  const markers = new Set(FILLERS.hi.markers);
  const roman = tokens.filter((t) => markers.has(t)).length;
  const ratio = tokens.length ? roman / tokens.length : 0;
  if (deva > tokens.length * 0.3 || whisperLang === 'hi') return { lang: 'hi', hinglish: deva <= tokens.length * 0.3, whisper: whisperLang ?? null };
  if (ratio >= 0.08 && roman >= 3) return { lang: 'hi', hinglish: true, whisper: whisperLang ?? null };
  return { lang: whisperLang && whisperLang !== 'auto' ? whisperLang : 'en', hinglish: false, whisper: whisperLang ?? null };
}

const SENTENCE_END = /[.?!।॥]["')\]]*$/;
const gapBefore = (words, i) => (i > 0 ? words[i].start - words[i - 1].end : Infinity);
const gapAfter = (words, i) => (i + 1 < words.length ? words[i + 1].start - words[i].end : Infinity);
const MODIFIER_HEAD = new Set(['a', 'an', 'the', 'this', 'that', 'what', 'which', 'some', 'any', 'every', 'no', 'one', 'same', 'different', 'all', 'these', 'those']);

/**
 * Marks filler words: w.filler = 'filler' (cut when the join is clean).
 * Single words and phrases from data/fillers.json; conditional entries only
 * when their rule holds (bounded by pauses, isolated or repeated, opener,
 * tag question, or "kind of"/"sort of" not modifying).
 */
export function tagFillers(words, lang = 'en') {
  const table = FILLERS[lang] ?? FILLERS.en;
  const extra = lang === 'hi' ? FILLERS.en : null; // Hinglish speakers use English fillers too
  const always = new Set([...table.always, ...(extra?.always ?? [])]);
  const cond = { ...(extra?.conditional ?? {}), ...table.conditional };
  const out = words.map((w) => ({ ...w, filler: undefined }));
  const toks = out.map((w) => norm(w.w));
  const sentenceStart = (i) => i === 0 || SENTENCE_END.test(out[i - 1].w) || gapBefore(out, i) > 0.5;
  const sentenceEnd = (i) => i === out.length - 1 || SENTENCE_END.test(out[i].w) || gapAfter(out, i) > 0.5;
  const phrases = [...new Set([...always, ...Object.keys(cond)])].map((p) => ({ p, parts: p.split(' ') })).sort((a, b) => b.parts.length - a.parts.length);
  for (let i = 0; i < out.length; i++) {
    if (out[i].filler) continue;
    for (const { p, parts } of phrases) {
      if (i + parts.length > out.length) continue;
      if (!parts.every((x, k) => toks[i + k] === x)) continue;
      const j = i + parts.length - 1;
      // a phrase whose inner words sit far apart is two separate words
      if (parts.length > 1 && out.slice(i, j).some((w, k) => out[i + k + 1].start - w.end > 0.35)) continue;
      const rule = always.has(p) ? 'always' : cond[p];
      const before = gapBefore(out, i);
      const after = gapAfter(out, j);
      const punctAfter = /[,?!.…—-]$/.test(out[j].w);
      let hit = false;
      if (rule === 'always') hit = true;
      else if (rule === 'bounded') hit = before >= 0.15 || after >= 0.15 || sentenceStart(i) || sentenceEnd(j) || punctAfter;
      else if (rule === 'isolated_or_repeated')
        hit = (before >= 0.12 && after >= 0.12) || toks[i + parts.length] === toks[i] || (i > 0 && toks[i - 1] === toks[i]) || (sentenceStart(i) && (after >= 0.12 || punctAfter));
      else if (rule === 'not_modifying') {
        const head = toks[i - 1];
        hit = !MODIFIER_HEAD.has(head) && (after >= 0.2 || sentenceEnd(j) || toks[j + 1] === 'like' || always.has(toks[j + 1]) || punctAfter);
      } else if (rule === 'opener') hit = sentenceStart(i) && !sentenceEnd(j);
      else if (rule === 'opener_pause') hit = sentenceStart(i) && !sentenceEnd(j) && (after >= 0.15 || punctAfter);
      else if (rule === 'tag') hit = i > 1 && (/[?,]$/.test(out[j].w) || /,$/.test(out[i - 1].w) || (sentenceEnd(j) && before >= 0.08));
      if (hit) {
        for (let k = i; k <= j; k++) out[k].filler = p;
        i = j;
        break;
      }
    }
  }
  return out;
}

// ---------------------------------------------------------------- structure

/** Sentences split on punctuation or a pause > 0.5 s; pauses between words. */
export function structure(words) {
  const sentences = [];
  let first = 0;
  for (let i = 0; i < words.length; i++) {
    const last = i === words.length - 1;
    if (last || SENTENCE_END.test(words[i].w) || words[i + 1].start - words[i].end > 0.5) {
      const ws = words.slice(first, i + 1);
      sentences.push({ i: sentences.length, w0: first, w1: i, start: ws[0].start, end: ws.at(-1).end, text: ws.map((w) => w.w).join(' ').replace(/\s+([,.?!])/g, '$1') });
      first = i + 1;
    }
  }
  const pauses = [];
  for (let i = 0; i + 1 < words.length; i++) {
    const d = words[i + 1].start - words[i].end;
    if (d > 0.005) pauses.push({ after: i, start: words[i].end, end: words[i + 1].start, dur: +d.toFixed(3) });
  }
  return { sentences, pauses };
}

/** Speech share of a clip → speech (> 40 %), broll (< 10 % or no words) or mixed. */
export function classifyClip(transcript, duration) {
  const d = duration || transcript?.duration || 0;
  const speech = (transcript?.words ?? []).reduce((a, w) => a + Math.max(0, w.end - w.start), 0);
  const ratio = d > 0 ? speech / d : 0;
  return { kind: ratio > 0.4 ? 'speech' : ratio < 0.1 || (transcript?.words?.length ?? 0) < 3 ? 'broll' : 'mixed', speech_ratio: +ratio.toFixed(3) };
}

/** Energy/pitch analysis that the planner and take scoring read. */
export function analyzeAudio(samples, rate = SAMPLE_RATE) {
  const db = rmsFrames(samples, rate);
  const floor = noiseFloor(db);
  return { energy: { hop: HOP, db, floor }, pitch: { hop: PITCH_HOP, hz: pitchTrack(samples, rate, db, floor) }, duration: samples.length / rate };
}

/** Assembles the Transcript object from whisper words and the audio analysis. */
export function buildTranscript({ words: raw, whisperLang, analysis, src, hash }) {
  const lang = detectLanguage(raw, whisperLang);
  const refined = refineWords(raw, analysis.energy);
  const words = tagFillers(refined, lang.lang);
  const { sentences, pauses } = structure(words);
  return { version: TRANSCRIPT_VERSION, src, hash, lang: lang.lang, hinglish: lang.hinglish, whisper_lang: lang.whisper, duration: analysis.duration, words, sentences, pauses, energy: analysis.energy, pitch: analysis.pitch };
}

/**
 * Transcribe one clip. Returns a Transcript ({words[], sentences[], pauses[],
 * lang, energy, pitch}) with the decoded samples attached (non-enumerable,
 * never cached) for zero-crossing checks. Cached by audio SHA-256 + model.
 */
export async function transcribe({ ffmpeg, whisper, model, input, src, workDir, cacheDir, signal, onProgress, language = 'auto' }) {
  mkdirSync(workDir, { recursive: true });
  const wav = join(workDir, `${String(src ?? 'clip').replace(/[^\w.-]/g, '_')}-16k.wav`);
  await extractSpeechWav(ffmpeg, input, wav, { signal });
  const buffer = readFileSync(wav);
  const hash = createHash('sha256').update(buffer).digest('hex');
  const key = `${hash.slice(0, 32)}-${basename(String(model ?? 'none')).replace(/[^\w.-]/g, '_')}-v${TRANSCRIPT_VERSION}-${language}`;
  const cached = cacheDir && join(cacheDir, 'transcripts', `${key}.json`);
  const { samples, rate } = wavSamples(buffer);
  const attach = (t, extra = {}) => Object.defineProperty({ ...t, src, ...extra }, 'samples', { value: samples, enumerable: false });
  if (cached && existsSync(cached)) {
    try {
      const t = JSON.parse(readFileSync(cached, 'utf8'));
      if (t.version === TRANSCRIPT_VERSION) return attach(t, { cached: true });
    } catch {
      /* re-run */
    }
  }
  if (!whisper || !existsSync(whisper) || !model || !existsSync(model)) throw new Error('whisper or its model is not installed');
  const flags = await whisperFlags(whisper);
  if (!flags.ok) throw new Error('whisper did not start');
  const threads = Math.max(workerThreads(), availableParallelism() >= 4 ? 2 : 1);
  const outBase = join(workDir, `${hash.slice(0, 16)}-whisper`);
  let json = null;
  let lastErr = '';
  for (const dtw of [true, false]) {
    rmSync(`${outBase}.json`, { force: true });
    const r = await run(whisper, whisperArgs({ flags, model, wav, outBase, language, threads, dtw }), { signal });
    if (signal?.aborted) throw new Error('cancelled');
    if (r.code === 0 && existsSync(`${outBase}.json`)) {
      try {
        json = JSON.parse(readFileSync(`${outBase}.json`, 'utf8'));
        break;
      } catch (e) {
        lastErr = e.message;
      }
    } else lastErr = String(r.err).trim().split('\n').slice(-2).join(' ');
    if (!flags.dtw) break;
  }
  if (!json) throw new Error(`whisper failed: ${lastErr.slice(0, 200)}`);
  onProgress?.(0.8);
  const { words, language: whisperLang } = parseWhisperJson(json);
  const analysis = analyzeAudio(samples, rate);
  const t = buildTranscript({ words, whisperLang, analysis, src, hash });
  if (cached) {
    mkdirSync(join(cacheDir, 'transcripts'), { recursive: true });
    writeFileSync(cached, JSON.stringify(t));
  }
  return attach(t);
}
