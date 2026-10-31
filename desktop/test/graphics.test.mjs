// Phase 6 graphics + b-roll: element layouts at four aspects inside the safe
// areas, deterministic frames, the soft canvas, restraint rules, planning,
// captions yielding, b-roll placement rules, and a real FFmpeg composite.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { ELEMENTS, ELEMENT_KINDS } from '../graphics/elements/index.mjs';
import { graphicJob, themeFor, softFrame, layoutGraphic, renderGraphicVideo, measureText } from '../graphics/renderer.mjs';
import { safeArea, aspectOf, partialPolyline, polylineLength } from '../graphics/kit.mjs';
import { createSoftCanvas, coverage, parseColour } from '../graphics/raster.mjs';
import { FontBook } from '../graphics/glyphs.mjs';
import { EASINGS, graphicEase } from '../graphics/easing.mjs';
import { EASINGS as CAMERA_EASINGS } from '../camera.mjs';
import { parseStat, formatStat } from '../graphics/elements/stat-pop.mjs';
import { enforceRestraint, graphicsAudit, applyGraphics, densityLimit, allowedIn, graphicToolCall, deriveHookText, findIntroductions, findStats } from '../graphics/plan.mjs';
import { planBroll, applyBroll, outputSentences, overlapScore, BROLL_GAIN_DB } from '../broll.mjs';
import { graphicBoxes, applyCaptions, captionStyle } from '../captions.mjs';
import { drawChunk } from '../caption-render.mjs';
import { AssDocument } from '../ass.mjs';
import { validate } from '../edl.mjs';
import { compose } from '../compose.mjs';
import { toolPaths } from './bench/run.mjs';

const ASPECTS = { '9:16': { w: 1080, h: 1920 }, '1:1': { w: 1080, h: 1080 }, '4:5': { w: 1080, h: 1350 }, '16:9': { w: 1920, h: 1080 } };
const SAMPLE = {
  hook_title: { text: 'I tried every AI video editor', effect: 'pop' },
  lower_third: { name: 'Naman Sharma', role: 'Founder of kimo' },
  stat: { value: '$3.5M', label: 'views' },
  callout: { kind: 'arrow', target: { x: 0.55, y: 0.5, w: 0.12, h: 0.06 }, label: 'Export' },
  screen_zoom: {},
  progress: {},
  chapter: { title: 'Why the old way breaks', index: 2 },
  sticker: { emoji: 'rocket' },
  text_behind: { text: 'KIMO' },
  cta: { text: 'Subscribe', line: 'new tutorials every week' },
};
const props = (kind, c) => (kind === 'callout' ? { ...SAMPLE.callout, target: { x: c.w * 0.55, y: c.h * 0.5, w: c.w * 0.12, h: c.h * 0.06 } } : SAMPLE[kind]);
const md5 = (b) => createHash('md5').update(b).digest('hex');

test('every element lays out at 9:16, 1:1, 4:5 and 16:9 inside the safe area (edge elements stay on the canvas)', () => {
  assert.equal(ELEMENT_KINDS.length, 10);
  for (const theme of ['kimo', 'energetic', 'documentary']) {
    const th = themeFor(theme);
    for (const [name, c] of Object.entries(ASPECTS)) {
      assert.equal(aspectOf(c), name);
      const safe = safeArea(c);
      for (const kind of ELEMENT_KINDS) {
        const laid = layoutGraphic(kind, props(kind, c), c, th);
        if (kind === 'cta' && name !== '16:9') {
          assert.equal(laid, null, `cta refuses ${name}`);
          continue;
        }
        assert.ok(laid, `${theme} ${kind} ${name}`);
        const { box, safeBox, edge } = laid;
        assert.ok(box.x >= 0 && box.y >= 0 && box.x + box.w <= c.w && box.y + box.h <= c.h && box.w % 2 === 0 && box.h % 2 === 0, `${kind} ${name} pixel box ${JSON.stringify(box)}`);
        if (edge) continue; // progress bar, screen card: by design at the edge
        const tol = 1;
        assert.ok(safeBox.x >= safe.x0 - tol && safeBox.y >= safe.y0 - tol && safeBox.x + safeBox.w <= safe.x1 + tol && safeBox.y + safeBox.h <= safe.y1 + tol, `${theme} ${kind} ${name} outside the safe area: ${JSON.stringify(safeBox)} vs ${JSON.stringify(safe)}`);
      }
    }
  }
  // the chapter card's full-screen variant is an edge element, its text stays safe
  const full = layoutGraphic('chapter', { title: 'Part two', variant: 'full' }, ASPECTS['16:9'], themeFor('documentary'));
  assert.ok(full.edge && full.box.w === 1920 && full.safeBox.x > 96);
});

test('rendering is deterministic: frame 37 twice gives identical bytes for every element', () => {
  const th = themeFor('kimo');
  const c = { w: 540, h: 960 };
  for (const kind of ELEMENT_KINDS) {
    const canvas = kind === 'cta' ? { w: 960, h: 540 } : c;
    const job = graphicJob({ kind, props: props(kind, canvas), canvas, fps: 30, dur: kind === 'cta' ? 5 : 2.4, theme: th });
    const a = softFrame(job, 37);
    const b = softFrame(job, 37);
    assert.equal(a.length, job.box.w * job.box.h * 4);
    assert.equal(md5(a), md5(b), kind);
  }
  // and something is drawn mid-animation (alpha present) for the drawn elements
  const job = graphicJob({ kind: 'hook_title', props: SAMPLE.hook_title, canvas: c, fps: 30, dur: 2.4, theme: th });
  const f = softFrame(job, 37);
  let lit = 0;
  for (let i = 3; i < f.length; i += 4) if (f[i] > 200) lit++;
  assert.ok(lit > 500, `hook title pixels: ${lit}`);
});

test('soft canvas: exact rect coverage, glyph outlines, clip, gradients and easing shared with the camera', () => {
  const cov = coverage([[10.5, 10, 20.5, 10, 20.5, 14, 10.5, 14]], 40, 40);
  const sum = cov.a.reduce((a, b) => a + b, 0);
  assert.ok(Math.abs(sum - 40) < 1e-3, `area ${sum}`);
  assert.deepEqual(parseColour('#FF5A2480').map((v) => +v.toFixed(3)), [1, 0.353, 0.141, 0.502]);
  const book = new FontBook();
  const canvas = createSoftCanvas(200, 80, book);
  const ctx = canvas.getContext('2d');
  ctx.font = '900 48px Geist';
  ctx.fillStyle = '#ffffff';
  ctx.fillText('Hi', 10, 60);
  const w = ctx.measureText('Hi').width;
  assert.ok(Math.abs(w - measureText('Hi', { family: 'Geist', weight: 900 }, 48)) < 1e-6);
  let lit = 0;
  const d = ctx.getImageData().data;
  for (let i = 3; i < d.length; i += 4) if (d[i] > 128) lit++;
  assert.ok(lit > 200, `glyph pixels ${lit}`);
  ctx.save();
  ctx.beginPath();
  ctx.rect(0, 0, 100, 80);
  ctx.clip();
  ctx.fillStyle = '#ff0000';
  ctx.fillRect(0, 0, 200, 80);
  ctx.restore();
  const px = (x, y) => [...ctx.getImageData(x, y, 1, 1).data];
  assert.deepEqual(px(50, 5), [255, 0, 0, 255]);
  assert.deepEqual(px(150, 5), [0, 0, 0, 0]);
  // the camera and the graphics share one easing module
  assert.equal(CAMERA_EASINGS, EASINGS);
  assert.ok(graphicEase('back_out')(0.6) > 1, 'graphics may overshoot');
  const pts = [[0, 0], [10, 0], [10, 10]];
  assert.equal(polylineLength(partialPolyline(pts, 0.5)), 10);
});

test('number pops parse and count up; stats come from spoken numbers', () => {
  assert.deepEqual(parseStat('50%'), { prefix: '', value: 50, decimals: 0, commas: false, suffix: '%' });
  assert.equal(formatStat(parseStat('$3.5M'), 1.75), '$1.8M');
  assert.equal(formatStat(parseStat('1,000'), 1000), '1,000');
  assert.equal(parseStat('hello'), null);
  const words = ['it', 'grew', 'fifty', 'percent', 'in', 'three', 'months'].map((w, i) => ({ w, start: i * 0.3, end: i * 0.3 + 0.25 }));
  const s = findStats(words);
  assert.equal(s[0].value, '50%');
});

test('restraint: one graphic at a time, 0.4 s apart, density per template', () => {
  const c = (kind, at, dur, source = 'default') => ({ kind, at, dur, source, end: at + dur });
  const { accepted, dropped } = enforceRestraint([c('stat', 1, 1.7), c('hook_title', 0.15, 2.4), c('sticker', 3, 1.3), c('lower_third', 5, 3.4), c('progress', 0, 30)], { limit: 10, total: 30, fps: 30 });
  const active = accepted.filter((x) => x.kind !== 'progress').sort((a, b) => a.at - b.at);
  for (let i = 1; i < active.length; i++) assert.ok(active[i].at >= active[i - 1].end + 0.4 - 1e-6, `gap ${JSON.stringify(active)}`);
  assert.ok(accepted.some((x) => x.kind === 'hook_title') && accepted.some((x) => x.kind === 'progress'));
  assert.ok(dropped.some((d) => d.kind === 'stat'), 'the stat under the hook is held back');
  // density: YouTube 4/min, documentary 2/min, shorts 10/min (proportional under a minute)
  assert.equal(densityLimit('auto', { w: 1920, h: 1080 }), 4);
  assert.equal(densityLimit('documentary', { w: 1920, h: 1080 }), 2);
  assert.equal(densityLimit('energetic', { w: 1080, h: 1920 }), 10);
  assert.equal(allowedIn(10, 30), 5);
  const many = Array.from({ length: 12 }, (_, i) => c('sticker', i * 5, 1));
  const r = enforceRestraint(many, { limit: 2, total: 60, fps: 30 });
  assert.equal(r.accepted.length, 2);
  const audit = graphicsAudit(r.accepted.map((x, i) => ({ id: `g${i}`, kind: 'graphic', at: x.at, dur: x.dur, props: { element: x.kind } })), { limit: 2, total: 60 });
  assert.equal(audit.overlaps, 0);
  assert.ok(audit.peak_per_window <= 2);
});

function talkEdl({ canvas = { w: 1080, h: 1920, fps: 30 }, words, length = 20 }) {
  return {
    edl_version: 1,
    canvas,
    sources: [{ id: 'a', path: 'C:/v/talk.mp4', kind: 'video', fps: 30, w: 1920, h: 1080, duration: length, audio: true }],
    video: [{ track: 'V1', clips: [{ id: 'clip1', src: 'a', in: 0, out: length, at: 0, speed: 1, fit: 'cover' }] }],
    audio: [],
    overlays: [],
    master: { lufs: -14, true_peak: -1 },
    cut_plan: { keep: [{ clip_id: 'clip1' }], needs_cover: [] },
    _words: words,
  };
}
const said = (text, t0 = 0.05, step = 0.32) => text.split(' ').map((w, i) => ({ w, start: +(t0 + i * step).toFixed(3), end: +(t0 + i * step + 0.26).toFixed(3) }));

test('planning: hook title, lower third on an introduction, a number pop, captions yield and lose the doubled accent', () => {
  const words = said("Hi I'm Naman. I make videos about tools that help creators edit faster every single day. this tool saved me fifty percent of my editing time. imagine the city at night with every light on.");
  const edl = talkEdl({ words });
  const ctx = { words: { 'C:/v/talk.mp4': words } };
  applyGraphics(edl, { template: 'energetic', note: 'Naman, founder of kimo' }, ctx);
  validate(edl);
  const g = edl.overlays.filter((o) => o.kind === 'graphic');
  const kinds = g.map((o) => o.props.element);
  assert.ok(kinds.includes('progress'), kinds.join());
  assert.ok(kinds.includes('lower_third') || kinds.includes('hook_title'), kinds.join());
  assert.equal(edl.graphics.report.overlaps, 0);
  const lt = findIntroductions(words, 'Naman, founder of kimo');
  assert.equal(lt[0].name, 'Naman');
  assert.equal(lt[0].role, 'founder of kimo');
  assert.equal(deriveHookText(said('this tool saved me fifty percent.')), 'this tool saved me fifty percent');
  assert.equal(deriveHookText(said('hey guys welcome back.')), null);
  // captions treat kit graphics as blockers (except the progress bar)
  const boxes = graphicBoxes(edl);
  assert.ok(boxes.some((b) => g.some((o) => o.id === b.id && o.props.element !== 'progress')));
  assert.ok(!boxes.some((b) => b.kind === 'progress'));
  // a stat on a 16:9 YouTube edit: the caption keeps the number without the accent
  const wide = talkEdl({ canvas: { w: 1920, h: 1080, fps: 30 }, words });
  applyGraphics(wide, { template: 'auto' }, ctx);
  const stat = wide.overlays.find((o) => o.props?.element === 'stat');
  assert.ok(stat, 'number pop on 16:9');
  assert.ok(wide.graphics.no_accent.length >= 1);
  applyCaptions(wide, { style: 'kimo' }, ctx);
  const capWords = wide.overlays.filter((o) => o.kind === 'caption_word_group').flatMap((o) => o.props.words);
  const num = capWords.find((w) => /50/.test(w.w));
  assert.ok(num && !num.accent, 'no double accent on the popped number');
});

test('planner tools: graphic/hook_title/callout/screen_zoom/broll calls are validated and applied', () => {
  const st = {};
  assert.equal(graphicToolCall(st, 'graphic', { kind: 'nope' }).ok, false);
  assert.ok(graphicToolCall(st, 'graphic', { kind: 'number', at: 6, props: { value: '10x', label: 'faster' } }).ok);
  assert.ok(graphicToolCall(st, 'graphic', { kind: 'progress', remove: true }).ok);
  assert.ok(graphicToolCall(st, 'hook_title', { text: 'Stop editing like this' }).ok);
  assert.ok(graphicToolCall(st, 'callout', { at: 9, box: [0.4, 0.4, 0.1, 0.05], kind: 'circle', label: 'here' }).ok);
  assert.ok(graphicToolCall(st, 'broll_auto', { density: 0 }).ok);
  assert.equal(st.brollDensity, 0);
  const words = said('one two three four five six seven eight nine ten eleven twelve thirteen fourteen fifteen sixteen seventeen eighteen nineteen twenty twenty one twenty two twenty three twenty four twenty five twenty six twenty seven twenty eight twenty nine thirty', 0.05, 0.6);
  const edl = talkEdl({ words });
  applyGraphics(edl, { template: 'energetic', state: st }, { words: { 'C:/v/talk.mp4': words } });
  const g = edl.overlays.filter((o) => o.kind === 'graphic');
  assert.equal(g.find((o) => o.props.element === 'hook_title')?.props.text, 'Stop editing like this');
  assert.ok(g.some((o) => o.props.element === 'stat' && o.props.value === '10x'));
  assert.ok(g.some((o) => o.props.element === 'callout' && o.props.source === 'planner'));
  assert.ok(!g.some((o) => o.props.element === 'progress'), 'removed by the planner');
});

test('b-roll: needs_cover first, J-cut 7 frames in, 1.2-3.5 s, never the hook, ≥ 4 s apart, ≤ 40 %, -24 dB with its own push', () => {
  const text = 'so here is the thing. imagine the city at night with every light on and people everywhere. back in the day we edited by hand for hours. it was slow and painful and nobody enjoyed it at all. now the machine does the boring part for you. imagine what you could make with that time. that is the whole point of this video today.';
  const words = said(text, 0.05, 0.3);
  const edl = talkEdl({ canvas: { w: 1920, h: 1080, fps: 30 }, words, length: 24 });
  edl.cut_plan.needs_cover = [{ join: 1, at: 9.1, kind: 'jump' }];
  const clips = [{ path: 'C:/v/city-night.mp4', duration: 8, description: 'a city at night, lights, traffic' }, { path: 'C:/v/desk.mp4', duration: 6 }];
  const ctx = { words: { 'C:/v/talk.mp4': words } };
  const plan = planBroll(edl, { ctx, clips, density: 0.5 });
  assert.ok(plan.inserts.length >= 2, JSON.stringify(plan));
  const frame = 1 / 30;
  for (const s of plan.inserts) {
    assert.ok(s.at >= 1.5 - 1e-6, 'never the hook');
    assert.ok(s.dur >= 1.2 - 1e-6 && s.dur <= 3.5 + 1e-6, `dur ${s.dur}`);
  }
  for (let i = 1; i < plan.inserts.length; i++) assert.ok(plan.inserts[i].at - (plan.inserts[i - 1].at + plan.inserts[i - 1].dur) >= 4 - 1e-6);
  assert.ok(plan.stats.share <= 0.4 + 1e-6);
  assert.equal(plan.inserts.find((s) => s.reason === 'needs_cover')?.reason, 'needs_cover');
  const cover = plan.inserts.find((s) => s.reason === 'needs_cover');
  assert.ok(cover.at < 9.1 && cover.at + cover.dur > 9.1, 'the jump cut is covered');
  const abs = plan.inserts.find((s) => s.reason !== 'needs_cover');
  const sentence = outputSentences(words).find((x) => x.i === abs.sentence);
  assert.ok(Math.abs(abs.at - (Math.ceil((sentence.start + 7 * frame) / frame - 1e-6) * frame)) < 1e-3, 'J-cut: picture 7 frames after the sentence starts');
  assert.ok(overlapScore('the city at night', clips[0]) > 0.3);
  applyBroll(edl, plan.inserts, { files: clips.map((c) => ({ path: c.path, audio: true, duration: c.duration, fps: 30, width: 1920, height: 1080 })) });
  validate(edl);
  const bt = edl.video.find((t) => t.track === 'BROLL');
  assert.ok(bt && edl.video.indexOf(bt) === 1, 'b-roll above the A-roll');
  assert.ok(bt.clips.every((c) => c.camera?.length === 2 && Math.max(...c.camera.map((k) => k.zoom)) <= 1.06 + 1e-9));
  const ba = edl.audio.find((t) => t.track === 'BROLL');
  assert.ok(ba && ba.clips.every((c) => c.gain_db === BROLL_GAIN_DB && c.linked));
  // density 0 turns automatic b-roll off
  assert.equal(planBroll(talkEdl({ words, length: 24 }), { ctx, clips, density: 0 }).inserts.length, 0);
});

test('MrBeast captions rotate per word without moving the line', () => {
  const doc = new AssDocument({ w: 1080, h: 1920 });
  const words = [{ w: 'BIG', at: 0, until: 0.3 }, { w: 'MONEY', at: 0.3, until: 0.8 }];
  drawChunk(doc, { id: 'cap001', at: 0, dur: 0.8, props: { style: 'mrbeast', words, lines: [2], place: { cx: 540, cy: 1200, scale: 1 }, index: 3 } }, { w: 1080, h: 1920 }, 30);
  const text = doc.toString();
  const rotations = [...text.matchAll(/\\frz(-?[\d.]+)/g)].map((m) => +m[1]);
  const positions = [...text.matchAll(/\\pos\(([\d.]+),([\d.]+)\)/g)].map((m) => [+m[1], +m[2]]);
  assert.ok(new Set(rotations).size >= 2, `per-word rotation ${rotations}`);
  assert.ok(rotations.every((r) => Math.abs(r) <= 3 + 1e-9));
  assert.ok(new Set(positions.map((p) => p[0])).size >= 2 && new Set(positions.map((p) => p[1])).size === 1, 'words sit on one line at their own x');
  void captionStyle;
});

test('a graphic overlay renders through real FFmpeg (transparent clip at its box, cached)', { timeout: 120000 }, async (t) => {
  const tools = toolPaths();
  if (spawnSync(tools.ffmpeg, ['-version']).status !== 0) {
    if (process.env.KIMO_BENCH_REQUIRE_FFMPEG === '1') assert.fail('FFmpeg required');
    return t.skip('FFmpeg not available');
  }
  const dir = await mkdtemp(join(tmpdir(), 'kimo-gfx-'));
  try {
    const src = join(dir, 'bg.mkv');
    spawnSync(tools.ffmpeg, ['-v', 'error', '-y', '-f', 'lavfi', '-i', 'color=c=0x204060:s=320x568:r=30:d=1.5', '-c:v', 'ffv1', src]);
    const edl = {
      edl_version: 1,
      canvas: { w: 320, h: 568, fps: 30 },
      sources: [{ id: 's', path: src.replaceAll('\\', '/'), kind: 'video' }],
      video: [{ track: 'V1', clips: [{ id: 'c1', src: 's', in: 0, out: 1.5, at: 0, speed: 1, fit: 'cover' }] }],
      audio: [],
      overlays: [{ id: 'g1', kind: 'graphic', at: 0, dur: 1.5, track: 'graphics', props: { element: 'progress', theme: 'kimo' } }],
      master: { lufs: -14, true_peak: -1 },
    };
    const output = join(dir, 'out.mkv');
    const ops = [];
    await compose({ edl, ffmpeg: tools.ffmpeg, ffprobe: tools.ffprobe, output, dir: join(dir, 'c'), emit: (e) => ops.push(e) });
    assert.ok(existsSync(output));
    // last frame: the accent progress bar spans the top rows, the background stays below
    const raw = spawnSync(tools.ffmpeg, ['-v', 'error', '-i', output, '-vf', 'select=eq(n\\,44),format=rgb24', '-frames:v', '1', '-f', 'rawvideo', 'pipe:1'], { maxBuffer: 1 << 24 }).stdout;
    const at = (x, y) => [...raw.subarray((y * 320 + x) * 3, (y * 320 + x) * 3 + 3)];
    const top = at(300, 1);
    const below = at(300, 40);
    assert.ok(top[0] > 200 && top[1] < 150, `accent bar ${top}`);
    assert.ok(below[2] > below[0], `background ${below}`);
    const start = ops.find((o) => o.tool === 'graphics' && o.phase === 'start');
    assert.ok(ops.some((o) => o.phase === 'end' && o.id === start?.id && o.ok));
    // the same job is a cache hit
    const job = graphicJob({ kind: 'progress', props: {}, canvas: { w: 320, h: 568 }, fps: 30, dur: 1.5, theme: themeFor('kimo') });
    const r = await renderGraphicVideo({ job, ffmpeg: tools.ffmpeg, dir: join(dir, 'c', 'graphics') });
    assert.equal(r.cached, true);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});
void ELEMENTS;
