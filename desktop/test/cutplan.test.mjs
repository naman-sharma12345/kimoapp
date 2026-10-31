import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { synth, drift, line } from './fixtures/speech-synth.mjs';
import { analyzeAudio, buildTranscript } from '../transcript.mjs';
import { analyzeClips, buildCutPlan, refineJoins, planMetrics, findStutters, fillerCuts, similarity, isRestartOf, lemma, templateFor, TEMPLATES, sentenceList } from '../cutplan.mjs';
import { validateJudgment, judge, judgmentPrompt, HOOK_RULES } from '../judgment.mjs';
import { frameRange, plannerBrief } from '../cutstage.mjs';

// Known script: a 1.0 s dead-air gap, a bounded "um", a stutter ("the the"),
// a flubbed take with "uh" followed by its clean retake, and a sign-off.
const SCRIPT = [
  ...line('This is the first line.', 1.0),
  ...line('I want to tell you about', 0.15),
  { w: 'um', dur: 0.2, gap: 0.15 },
  ...line('the the camera.', 0.8),
  ...line('The camera costs', 0.15),
  { w: 'uh,', dur: 0.2, gap: 0.15 },
  ...line('three hundred dollars.', 0.7),
  ...line('The camera costs three hundred dollars.', 0.5),
  ...line('Thanks for watching.', 0.05),
];
const PUNCHY = { ...TEMPLATES.punchy, shorts: false };

function fixture(script = SCRIPT, opts) {
  const { samples, words, duration } = synth(script, opts);
  const t = buildTranscript({ words: drift(words), whisperLang: 'en', analysis: analyzeAudio(samples), src: 'f0' });
  return { clips: [{ src: 'f0', duration, kind: 'speech', transcript: t }], truth: words };
}

test('cut plan removes dead air, the filler, the stutter and the flubbed take', () => {
  const { clips } = fixture();
  const plan = refineJoins(buildCutPlan({ clips, template: PUNCHY }), []);
  const kept = plan.keep.map((k) => k.text).join(' | ');
  assert.equal(kept, 'This is the first line. | I want to tell you about | the camera. | The camera costs three hundred dollars. | Thanks for watching.');
  const reasons = plan.removed.map((r) => r.reason);
  for (const r of ['silence', 'filler', 'stutter', 'retake']) assert.ok(reasons.includes(r), `missing ${r}: ${reasons}`);
  // the known gaps: the 1.0 s pause between sentence 1 and 2 is closed to 2 × pad
  const words = clips[0].transcript.words;
  const k0 = plan.keep[0];
  const k1 = plan.keep[1];
  assert.ok(Math.abs(k0.out - words[4].end - PUNCHY.pad) < 0.012, `pad after: ${k0.out - words[4].end}`);
  assert.ok(Math.abs(words[5].start - k1.in - PUNCHY.pad) < 0.012, `pad before: ${words[5].start - k1.in}`);
  assert.ok(plan.keep.every((k) => k.out > k.in));
  // no pause longer than max_pause survives inside a kept segment
  for (const k of plan.keep) for (let i = k.words[0] + 1; i <= k.words[1]; i++) assert.ok(words[i].start - words[i - 1].end <= PUNCHY.max_pause + 1e-6);
  assert.match(plan.summary.text, /^removed \d+ pauses \([\d.]+ s\), 1 filler, 1 retake, 1 stutter/);
  const m = planMetrics(plan, clips);
  assert.deepEqual({ dead: m.dead_air_ratio < 0.03, fillers: m.filler_count, repeats: m.repeat_takes, first: m.first_speech_s < 0.4 }, { dead: true, fillers: 0, repeats: 0, first: true });
  assert.ok(plan.summary.after_s < plan.summary.before_s * 0.6);
  // jump cuts on one source are marked for cover
  assert.equal(plan.needs_cover.length, plan.keep.length - 1);
});

test('template pause and pad follow the canvas and style', () => {
  assert.equal(templateFor({ width: 1080, height: 1920 }, 'auto').max_pause, 0.12);
  assert.equal(templateFor({ width: 1920, height: 1080 }, 'energetic').max_pause, 0.2);
  assert.equal(templateFor({ width: 1920, height: 1080 }, 'documentary').max_pause, 0.35);
  // calm keeps a 0.3 s gap inside speech that punchy closes
  const script = [...line('one two three', 0.3), ...line('four five six.', 0.05)];
  const calm = buildCutPlan({ clips: fixture(script).clips, template: { ...TEMPLATES.calm, shorts: false } });
  const punchy = buildCutPlan({ clips: fixture(script).clips, template: PUNCHY });
  assert.equal(calm.keep.length, 1);
  assert.equal(punchy.keep.length, 2);
});

test('fillers are cut only on clean joins; coarticulated ones are flagged and kept', () => {
  const quiet = { db: new Array(400).fill(-80), hop: 0.01, floor: -80 };
  const loud = { db: new Array(400).fill(-20), hop: 0.01, floor: -80 };
  const w = (x, s, e, filler) => ({ w: x, start: s, end: e, filler });
  const bounded = [w('so', 0, 0.3), w('um', 0.45, 0.6, 'um'), w('yes', 0.75, 1)];
  assert.equal(fillerCuts(bounded, { energy: quiet }).cut.length, 1);
  assert.equal(fillerCuts(bounded, { energy: loud }).flagged[0].why, 'no clean join');
  const glued = [w('so', 0, 0.3), w('um', 0.31, 0.45, 'um'), w('yes', 0.46, 0.7)];
  assert.equal(fillerCuts(glued, { energy: quiet }).flagged[0].why, 'coarticulated');
});

test('stutters, restarts and take similarity', () => {
  const W = (text, t0 = 0, step = 0.25) => text.split(' ').map((x, i) => ({ w: x, start: t0 + i * step, end: t0 + i * step + 0.2 }));
  assert.deepEqual([...findStutters(W('the the camera'))], [0]);
  assert.deepEqual([...findStutters(W('I think I think we should'))].sort(), [0, 1]);
  assert.deepEqual([...findStutters(W('bec- because it works'))], [0]);
  assert.deepEqual([...findStutters(W('very very good'))], [], 'emphatic repeats stay');
  assert.deepEqual([...findStutters([...W('the'), ...W('the', 2)])], [], 'outside 1.2 s is not a stutter');
  assert.ok(similarity('the camera cost three hundred dollar'.split(' '), 'the camera cost three hundred dollar'.split(' ')) === 1);
  assert.ok(similarity('so the main thing is speed'.split(' '), 'so the main thing is price'.split(' ')) >= 0.75);
  assert.ok(similarity('i love this camera'.split(' '), 'we went to the beach today'.split(' ')) < 0.3);
  assert.ok(isRestartOf(['so', 'the', 'main'], ['so', 'the', 'main', 'thing', 'is']));
  assert.equal(lemma('Takes'), 'take');
});

test('a duplicate line recorded twice keeps only the better take', () => {
  // known duplicate segment: the same sentence twice, the first with a stutter and a filler
  const script = [...line('Welcome to the lab.', 0.6), ...line('Today we build a a', 0.15), { w: 'um', dur: 0.2, gap: 0.15 }, ...line('robot arm.', 0.9), ...line('Today we build a robot arm.', 0.6), ...line('Let us start.', 0.05)];
  const { clips } = fixture(script);
  const analysis = analyzeClips(clips, PUNCHY);
  assert.equal(analysis.takes.length, 1);
  const plan = buildCutPlan({ clips, template: PUNCHY, analysis });
  const text = plan.keep.map((k) => k.text).join(' ');
  assert.equal((text.match(/Today we build/g) ?? []).length, 1);
  assert.ok(plan.keep.some((k) => k.text === 'Today we build a robot arm.'));
  assert.equal(planMetrics(plan, clips).repeat_takes, 0);
});

test('LLM judgment: validated, cold-open hook applied, invalid answers fall back', async () => {
  const { clips } = fixture();
  const analysis = analyzeClips(clips, PUNCHY);
  assert.ok(judgmentPrompt({ sentences: sentenceList(analysis), note: '', template: 'punchy', shorts: false, speechSeconds: 10 }).includes(HOOK_RULES));
  const ok = validateJudgment({ judgment: { hook: { sentence: 3, trim_words: [3, 5], hook_text: 'Three hundred dollars for this camera?' }, order: [0, 1, 3, 4], best_take: { g1: 3 }, emphasis: [{ sentence: 3, word: 'three', kind: 'number' }, { sentence: 3, word: 'zebra' }] } }, analysis);
  assert.ok(ok.ok, ok.errors.join());
  assert.equal(ok.judgment.hook.hook_text.split(' ').length, 6);
  assert.equal(ok.judgment.emphasis.length, 1);
  const plan = refineJoins(buildCutPlan({ clips, template: PUNCHY, analysis, judgment: ok.judgment }), []);
  assert.equal(plan.keep[0].reason, 'hook');
  assert.equal(plan.keep[0].text, 'three hundred dollars.');
  assert.equal(plan.keep[0].at, 0);
  // the original occurrence is close behind a ≥ 50 % excerpt → cut, not repeated
  assert.equal(plan.keep.filter((k) => /hundred dollars/.test(k.text)).length, 1);
  assert.match(plan.summary.text, /cold-open hook/);
  for (const bad of [{ judgment: { order: [99] } }, { judgment: { hook: { sentence: 0, trim_words: [3, 1] } } }, 'nonsense', { calls: [], done: true }])
    assert.equal(validateJudgment(bad, analysis).ok, false, JSON.stringify(bad));
  // one cached call: the second run never asks
  const dir = await mkdtemp(join(tmpdir(), 'kimo-judge-'));
  try {
    let asked = 0;
    const args = { analysis, sentences: sentenceList(analysis), note: 'tight', template: 'punchy', shorts: false, speechSeconds: 10, cacheDir: dir, ask: async () => (asked++, { judgment: { order: [0, 1, 3, 4], drop: [{ sentence: 4, why: 'sign-off' }] } }) };
    assert.ok((await judge(args)).judgment);
    const again = await judge(args);
    assert.equal(again.cached, true);
    assert.equal(asked, 1);
    const failed = await judge({ ...args, note: 'other', ask: async () => { throw new Error('offline'); } });
    assert.equal(failed.judgment, null);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test('shorts drop a greeting opener and keep within the length target', () => {
  const script = [...line('Hey guys welcome back.', 0.5), ...line('This trick saves an hour every day.', 0.4), ...line('Here is how it works.', 0.05)];
  const plan = buildCutPlan({ clips: fixture(script).clips, template: { ...TEMPLATES.shorts, shorts: true } });
  assert.ok(!plan.keep.some((k) => /guys/.test(k.text)));
  const vocab = ['apples', 'rivers', 'engines', 'gardens', 'pixels', 'violins', 'tigers', 'castles', 'rockets', 'mangoes', 'oceans', 'lanterns'];
  const long = vocab.map((v, i) => line(`${v} ${vocab[(i + 3) % 12]} matter ${vocab[(i + 7) % 12]} today.`, 0.3)).flat();
  const short = buildCutPlan({ clips: fixture(long).clips, template: { ...TEMPLATES.shorts, shorts: true }, target: 12 });
  assert.ok(short.summary.after_s <= 13.5, `${short.summary.after_s}`);
  assert.ok(short.summary.length_drop > 0);
});

test('micro-jumps merge across a short silence or get a forced framing change', () => {
  const script = [...line('one two three', 0.3), ...line('four five six', 0.6), ...line('seven eight nine.', 0.05)];
  const { clips } = fixture(script);
  const plan = buildCutPlan({ clips, template: PUNCHY });
  assert.equal(plan.needs_cover.length, 2);
  refineJoins(plan, [{ shift: 0.005 }, { shift: 0.01 }], { punch: 1.15 });
  // first gap (0.3 s, 0.2 s removed) merges; second (0.6 s, 0.5 s removed) is forced to a punch
  assert.equal(plan.keep.length, 2);
  assert.equal(plan.keep[1].zoom, 1.15);
  assert.equal(plan.needs_cover[0].kind, 'micro_jump');
  assert.equal(plan.needs_cover[0].framed, 1.15);
  assert.equal(plan.summary.micro_merged, 1);
  // ordinary jumps stay marked for Phase 4/6 cover unless frameAll (captions-only) frames them
  const p2 = refineJoins(buildCutPlan({ clips, template: PUNCHY }), [{ shift: 0.08 }, { shift: 0.08 }], { frameAll: true, punch: 1.12 });
  assert.deepEqual(p2.keep.map((k) => k.zoom), [1, 1.12, 1]);
});

test('frame-exact ranges and the planner brief', () => {
  const r = frameRange(1.234, 2.001, 25, 25);
  assert.equal(r.in, 1.2);
  assert.equal(r.frames, 21);
  assert.equal(r.dur, 0.84);
  const { clips } = fixture();
  const plan = refineJoins(buildCutPlan({ clips, template: PUNCHY }), []);
  plan.keep.forEach((k, i) => (k.clip_id = `c${i}`));
  const brief = plannerBrief(plan, { trackId: 'V1' }).join('\n');
  assert.match(brief, /ALREADY CUT/);
  assert.match(brief, /c0 @0\.00/);
  assert.match(brief, /do NOT call auto_rough_cut/);
});

test('joins review: a beep lands just before every cut', async () => {
  const { beepBeforeCuts, cutTimes, RATE } = await import('./bench/joins-wav.mjs');
  const cuts = cutTimes({ keep: [{ at: 0, in: 0, out: 1 }, { at: 1, in: 2, out: 3 }, { at: 2, in: 4, out: 5 }] });
  assert.deepEqual(cuts.map((c) => c.at), [1, 2]);
  const out = beepBeforeCuts(new Float32Array(RATE * 3), cuts);
  const energy = (a, b) => out.slice(Math.round(a * RATE), Math.round(b * RATE)).reduce((s, v) => s + v * v, 0);
  assert.ok(energy(0.79, 0.85) > 1 && energy(0.86, 1.05) === 0 && energy(1.79, 1.85) > 1);
});

test('tutorial: result-preview montage cold open, teaser kept, screen segments marked for punch-in', () => {
  const script = [...line('So first let me open the app.', 0.4), ...line('Stick around till the end for the best one.', 0.4), ...line('Step one is the mask.', 0.4), ...line('And here is the finished glowing logo.', 0.4), ...line('Step two adds the glow.', 0.05)];
  const { clips } = fixture(script);
  clips[0].screen = true;
  const analysis = analyzeClips(clips, PUNCHY);
  assert.equal(analysis.sentences[1].teaser, true);
  const prompt = judgmentPrompt({ sentences: sentenceList(analysis), note: '', template: 'punchy tutorial', shorts: false, speechSeconds: 10, tutorial: true });
  assert.match(prompt, /montage of the end results/);
  assert.match(prompt, /teaser Stick around/);
  const v = validateJudgment({ judgment: { preview: [{ sentence: 3, trim_words: [3, 6] }], hook: { sentence: 1, trim_words: [0, 8], hook_text: 'best one at the end' }, order: [2, 4], drop: [{ sentence: 0, why: 'setup chatter' }] } }, analysis);
  assert.ok(v.ok, v.errors.join());
  const plan = refineJoins(buildCutPlan({ clips, template: PUNCHY, analysis, judgment: v.judgment }), []);
  assert.deepEqual(plan.keep.map((k) => k.reason).slice(0, 2), ['preview', 'hook']);
  assert.equal(plan.keep[0].text, 'the finished glowing logo.');
  assert.ok(!plan.keep.some((k) => /open the app/.test(k.text)));
  assert.match(plan.summary.text, /1-shot result preview/);
  assert.equal(plan.screen_punch.length, plan.keep.length);
  assert.equal(plan.screen_punch[1].at, plan.keep[1].at);
});
