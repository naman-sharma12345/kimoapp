import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { synth, drift, line, RATE } from './fixtures/speech-synth.mjs';
import { analyzeAudio, refineWords, tagFillers, detectLanguage, parseWhisperJson, whisperArgs, dtwPreset, structure, classifyClip, extractSpeechWav, wavSamples, rmsFrames, buildTranscript, nearestZeroCross, transcribe } from '../transcript.mjs';
import { frameShift } from '../joins.mjs';
import { stereoSpeakers, channelLevels, visualSpeakers } from '../speakers.mjs';
import { command } from './bench/io.mjs';
import { toolPaths } from './bench/run.mjs';

const W = (text, step = 0.3) => text.split(' ').map((w, i) => ({ w, start: i * step, end: i * step + 0.22 }));
const fillers = (text, lang = 'en', step) => tagFillers(W(text, step), lang).filter((w) => w.filler).map((w) => w.w);

test('word edges snap to the audio and keep sibilant and plosive tails', () => {
  const { samples, words } = synth([
    { w: 'this', dur: 0.3, gap: 0.4, tail: { dur: 0.12, amp: 0.01 } },
    { w: 'that', dur: 0.3, gap: 0.4, tail: { dur: 0.1, closure: 0.06, amp: 0.05 } },
    ...line('plain words here.', 0.3),
  ]);
  const { energy } = analyzeAudio(samples);
  const refined = refineWords(drift(words, 0.08, -0.03), energy);
  refined.forEach((w, i) => {
    assert.ok(Math.abs(w.start - words[i].start) <= 0.015, `${w.w} start ${w.start} vs ${words[i].start}`);
    assert.ok(w.end >= words[i].trueEnd - 0.015 && w.end <= words[i].trueEnd + 0.03, `${w.w} end ${w.end} vs ${words[i].trueEnd}`);
  });
  assert.ok(refined.every((w, i) => i === 0 || w.start >= refined[i - 1].end), 'no overlaps');
});

test('fillers per language follow their rules', () => {
  assert.deepEqual(fillers('so um we go'), ['um']);
  assert.deepEqual(fillers('I like pizza a lot'), [], '"like" as a verb stays');
  assert.deepEqual(fillers('it was like like huge'), ['like', 'like']);
  assert.deepEqual(fillers('this kind of camera'), [], 'modifying "kind of" stays');
  assert.deepEqual(tagFillers([{ w: 'it', start: 0, end: 0.2 }, { w: 'is', start: 0.25, end: 0.4 }, { w: 'kind', start: 0.45, end: 0.6 }, { w: 'of,', start: 0.62, end: 0.75 }, { w: 'great', start: 1.1, end: 1.4 }], 'en').filter((w) => w.filler).map((w) => w.w), ['kind', 'of,']);
  assert.deepEqual(fillers('Basically the idea is simple.'), ['Basically']);
  assert.deepEqual(fillers('toh main ghar gaya', 'hi'), ['toh']);
  assert.deepEqual(fillers('accha chalo shuru karte hain', 'hi'), ['accha']);
  assert.deepEqual(fillers('yeh sahi hai na?', 'hi'), ['na?']);
  assert.deepEqual(fillers('मतलब, यह आसान है', 'hi'), ['मतलब,']);
});

test('language: English, Devanagari Hindi and romanised Hinglish', () => {
  assert.equal(detectLanguage(W('this is a normal english sentence about cameras'), 'en').lang, 'en');
  const hinglish = detectLanguage(W('bhai yeh camera bahut accha hai aur price bhi kam hai yaar'), 'en');
  assert.deepEqual([hinglish.lang, hinglish.hinglish], ['hi', true]);
  assert.deepEqual([detectLanguage(W('यह कैमरा बहुत अच्छा है'), 'hi').lang, detectLanguage(W('यह कैमरा बहुत अच्छा है'), 'hi').hinglish], ['hi', false]);
});

test('whisper JSON, flags and structure', () => {
  const json = {
    result: { language: 'en' },
    transcription: [
      { text: ' Hello', offsets: { from: 500, to: 900 }, tokens: [{ text: '[_BEG_]', p: 1 }, { text: ' Hello', p: 0.9, t_dtw: 52 }] },
      { text: ',', offsets: { from: 900, to: 910 }, tokens: [{ text: ',', p: 0.8 }] },
      { text: ' world.', offsets: { from: 1000, to: 1400 }, tokens: [{ text: ' world', p: 0.7 }, { text: '.', p: 0.9 }] },
      { text: ' [BLANK_AUDIO]', offsets: { from: 1400, to: 3000 }, tokens: [] },
    ],
  };
  const { words, language } = parseWhisperJson(json);
  assert.equal(language, 'en');
  assert.deepEqual(words.map((w) => [w.w, w.start]), [['Hello,', 0.52], ['world.', 1]]);
  assert.equal(words[1].conf, 0.8);
  assert.equal(dtwPreset('C:/x/ggml-small-q5_1.bin'), 'small');
  assert.equal(dtwPreset('ggml-large-v3-turbo.bin'), 'large.v3.turbo');
  const args = whisperArgs({ flags: { ojf: true, ml: true, sow: true, dtw: true, np: true }, model: 'm/ggml-small-q5_1.bin', wav: 'a.wav', outBase: 'o', threads: 2 });
  for (const f of ['-ojf', '-sow', '-np']) assert.ok(args.includes(f));
  assert.deepEqual(args.slice(args.indexOf('-ml'), args.indexOf('-ml') + 2), ['-ml', '1']);
  assert.deepEqual(args.slice(args.indexOf('-dtw'), args.indexOf('-dtw') + 2), ['-dtw', 'small']);
  assert.ok(!whisperArgs({ flags: { oj: true }, model: 'm', wav: 'a', outBase: 'o', threads: 1 }).includes('-dtw'), 'unsupported flags are left out');
  const s = structure([...W('one two three.'), ...W('four five', 0.3).map((w) => ({ ...w, start: w.start + 2, end: w.end + 2 }))]);
  assert.equal(s.sentences.length, 2);
  assert.ok(s.pauses.some((p) => p.dur > 1));
  assert.equal(classifyClip({ words: W('a b c d e f g h') }, 3).kind, 'speech');
  assert.equal(classifyClip({ words: [] }, 10).kind, 'broll');
});

test('16 kHz extract, energy and the transcript cache', async (t) => {
  const { ffmpeg } = toolPaths();
  try {
    await command(ffmpeg, ['-version']);
  } catch (e) {
    if (process.env.KIMO_BENCH_REQUIRE_FFMPEG) throw e;
    return t.skip('FFmpeg unavailable');
  }
  const dir = await mkdtemp(join(tmpdir(), 'kimo-transcript-'));
  try {
    // tone 0–1 s, silence 1–2 s, tone 2–3 s, in a video file with 48 kHz stereo audio
    const input = join(dir, 'tone.mkv');
    await command(ffmpeg, ['-v', 'error', '-y', '-f', 'lavfi', '-i', 'testsrc2=size=64x48:rate=25:duration=3', '-f', 'lavfi', '-i', "aevalsrc='0.4*sin(2*PI*220*t)*(lt(t,1)+gte(t,2))':s=48000:c=stereo:d=3", '-c:v', 'ffv1', '-c:a', 'pcm_s16le', input]);
    const wav = await extractSpeechWav(ffmpeg, input, join(dir, 'a.wav'));
    const { samples, rate } = wavSamples(await readFile(wav));
    assert.equal(rate, 16000);
    assert.ok(Math.abs(samples.length / rate - 3) < 0.05);
    const db = rmsFrames(samples);
    assert.ok(db[50] > -20 && db[150] < -60 && db[250] > -20, `${db[50]} ${db[150]} ${db[250]}`);
    assert.ok(nearestZeroCross(samples, rate, 0.5, 5) != null);
    // cache by audio hash: the second call never runs whisper (none is installed here)
    let runs = 0;
    const fake = async (opts) => {
      runs++;
      return transcribe(opts);
    };
    const cacheDir = join(dir, 'cache');
    const words = [{ w: 'tone', start: 0.05, end: 0.95, conf: 0.9 }, { w: 'again.', start: 2.05, end: 2.95, conf: 0.9 }];
    const tr = buildTranscript({ words, whisperLang: 'en', analysis: analyzeAudio(samples), src: 'f0', hash: 'x' });
    const { createHash } = await import('node:crypto');
    const { mkdirSync, writeFileSync } = await import('node:fs');
    const key = `${createHash('sha256').update(await readFile(wav)).digest('hex').slice(0, 32)}-ggml-small.bin-v3-auto`;
    mkdirSync(join(cacheDir, 'transcripts'), { recursive: true });
    writeFileSync(join(cacheDir, 'transcripts', `${key}.json`), JSON.stringify(tr));
    const hit = await fake({ ffmpeg, whisper: join(dir, 'missing-whisper'), model: 'ggml-small.bin', input, src: 'f0', workDir: join(dir, 'w'), cacheDir });
    assert.equal(hit.cached, true);
    assert.equal(hit.words.length, 2);
    assert.ok(hit.samples.length > 40000, 'samples attached for zero-crossing checks');
    assert.equal(runs, 1);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test('join shift, stereo and mouth-motion diarisation', () => {
  const w = 96;
  const h = 72;
  const img = (dy) => Uint8Array.from({ length: w * h }, (_, i) => {
    const x = i % w;
    const y = Math.floor(i / w) - dy;
    return (Math.sin(x / 3) * Math.cos(y / 4) + 1) * 100 + (Math.hypot(x - 48, y - 30) < 14 ? 50 : 0);
  });
  const still = frameShift(img(0), img(0), w, h);
  const moved = frameShift(img(0), img(4), w, h);
  assert.ok(still.shift < 0.005);
  assert.ok(moved.shift > 0.04 && moved.shift < 0.07, `${moved.shift}`);
  // stereo: left mic for S1, right mic for S2
  const words = Array.from({ length: 8 }, (_, i) => ({ start: i * 0.5, end: i * 0.5 + 0.4 }));
  const pcm = new Float32Array(2 * RATE * 4);
  words.forEach((wd, i) => {
    for (let s = Math.round(wd.start * RATE); s < Math.round(wd.end * RATE); s++) {
      pcm[2 * s] = (i < 4 ? 0.3 : 0.01) * Math.sin(s / 7);
      pcm[2 * s + 1] = (i < 4 ? 0.01 : 0.3) * Math.sin(s / 7);
    }
  });
  assert.deepEqual(stereoSpeakers(channelLevels(words, pcm)).labels, ['S1', 'S1', 'S1', 'S1', 'S2', 'S2', 'S2', 'S2']);
  const mono = pcm.map((v, i) => pcm[i - (i % 2)]);
  assert.equal(stereoSpeakers(channelLevels(words, mono)), null);
  // mouth motion: person 1 moves during sentence 0, person 2 during sentence 1
  const fps = 10;
  const motion = [Array.from({ length: 60 }, (_, f) => (f >= 5 && f < 25 ? 8 : 1)), Array.from({ length: 60 }, (_, f) => (f >= 35 && f < 55 ? 8 : 1))];
  const db = Array.from({ length: 600 }, (_, f) => ((f >= 50 && f < 250) || (f >= 350 && f < 550) ? -20 : -70));
  const ws = [{ w: 'a', start: 0.5, end: 2.5 }, { w: 'b', start: 3.5, end: 5.5 }];
  const v = visualSpeakers({ motion, fps, energy: { hop: 0.01, db, floor: -70 }, words: ws, sentences: [{ w0: 0, w1: 0, start: 0.5, end: 2.5 }, { w0: 1, w1: 1, start: 3.5, end: 5.5 }] });
  assert.deepEqual(v.labels, ['S1', 'S2']);
});
