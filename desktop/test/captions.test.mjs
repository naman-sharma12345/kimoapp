import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, writeFile, rm, mkdir, copyFile } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { spawnSync } from 'node:child_process';
import { AssDocument, escapeText, fieldText, tag, assTime, colour } from '../ass.mjs';
import { filterPath, checkFonts, bundledFontsDir, fontFiles, BUNDLED_FONTS, bundledMetrics, textWidth } from '../fonts.mjs';
import {
  captionStyles,
  captionStyle,
  normalizeWords,
  chunkWords,
  timeChunks,
  accentChunks,
  placeChunks,
  outputWords,
  captionOverlays,
  applyCaptions,
  pickCaptionStyle,
  pickHookStyle,
  blockBox,
  safeArea,
  breakCost,
} from '../captions.mjs';
import { editCaptionChunk, captionBounds } from '../caption-edits.mjs';
import { drawCaptions } from '../caption-render.mjs';
import { applyEdits, publicEdl } from '../edl.mjs';
import { toolPaths } from './bench/run.mjs';

const ffmpeg = toolPaths().ffmpeg;
const hasFfmpeg = spawnSync(ffmpeg, ['-hide_banner', '-version'], { encoding: 'utf8' }).status === 0;
const requireFfmpeg = process.env.KIMO_BENCH_REQUIRE_FFMPEG === '1';

/** Words at ~3 words/s with a pause after punctuation. */
function words(text, t0 = 0.2, rate = 0.3) {
  let t = t0;
  return text.split(/\s+/).map((w) => {
    const d = rate * 0.8;
    const r = { w, start: +t.toFixed(3), end: +(t + d).toFixed(3) };
    t += rate + (/[.,!?]$/.test(w) ? 0.3 : 0);
    return r;
  });
}
const shortsCanvas = { w: 1080, h: 1920, fps: 30 };
const wideCanvas = { w: 1920, h: 1080, fps: 30 };
const texts = (chunks) => chunks.map((c) => c.words.map((w) => w.w).join(' '));

test('styles: the eight creator styles plus title effects load as data; kimo is the default', () => {
  const all = captionStyles();
  for (const id of ['hormozi', 'mrbeast', 'ali-abdaal', 'mkbhd', 'karaoke', 'boxed-highlight', 'doc-subtitle', 'kimo', 'echo-slide', 'gold-sweep', 'decay']) assert.ok(all.has(id), id);
  for (const s of all.values()) {
    assert.ok(BUNDLED_FONTS[s.font.file], `${s.id}: font ${s.font.file} is bundled`);
    assert.ok(!s.font_devanagari || BUNDLED_FONTS[s.font_devanagari.file], `${s.id}: Devanagari face bundled`);
  }
  assert.equal(pickCaptionStyle({}), 'kimo');
  assert.equal(pickCaptionStyle({ template: { captions: { style: 'impact' } } }), 'hormozi');
  assert.equal(pickCaptionStyle({ template: { captions: { style: 'clean', lines: 2 } }, canvas: wideCanvas }), 'doc-subtitle');
  assert.equal(pickCaptionStyle({ note: 'mrbeast style captions please' }), 'mrbeast');
  assert.equal(pickCaptionStyle({ requested: 'karaoke', note: 'hormozi captions' }), 'karaoke');
  assert.equal(pickHookStyle({ style: 'energetic' }), 'echo-slide');
  assert.equal(pickHookStyle({ note: 'gold shiny title' }), 'gold-sweep');
});

test('normalise: spoken numbers become digits with units kept, punctuation stripped in shorts styles, casing per style', () => {
  const hormozi = captionStyle('hormozi');
  const n = normalizeWords(words('this made three million views. fifty percent of one thing, really?'), hormozi);
  assert.deepEqual(n.map((w) => w.w), ['THIS', 'MADE', '3', 'MILLION', 'VIEWS', '50%', 'OF', 'ONE', 'THING', 'REALLY?']);
  assert.ok(n.find((w) => w.w === '3').number);
  const doc = normalizeWords(words('i use the iphone daily.'), captionStyle('doc-subtitle'), { hints: ['iPhone'] });
  assert.deepEqual(doc.map((w) => w.w), ['I', 'use', 'the', 'iPhone', 'daily.']);
  const ali = normalizeWords(words('so here it is. and then'), captionStyle('ali-abdaal'));
  assert.equal(ali[0].w, 'So');
  assert.equal(ali.at(-2).w, 'And');
  // Devanagari words use the Devanagari face; romanised Hinglish stays Latin
  const hi = normalizeWords(words('yeh trick सच में kaam karti hai'), captionStyle('kimo'));
  assert.deepEqual(hi.map((w) => w.lang), ['latin', 'latin', 'hi', 'hi', 'latin', 'latin', 'latin']);
});

test('grouping: punctuation and pauses first, no "the | thing", no 1-letter line end, numbers stay with units', () => {
  const style = captionStyle('hormozi');
  const layout = style.layout.shorts;
  const n = normalizeWords(words('we got three million views in the first week. so I think a lot of it was luck'), style);
  const chunks = chunkWords(n, layout);
  const t = texts(chunks);
  // one word over the limit only where every split would break "in the | first"
  assert.ok(t.every((c) => c.split(' ').length <= layout.max_words + 1), JSON.stringify(t));
  assert.ok(t.filter((c) => c.split(' ').length > layout.max_words).length <= 1, JSON.stringify(t));
  assert.ok(t.includes('3 MILLION'), JSON.stringify(t));
  for (const c of chunks) {
    const last = c.words.at(-1).w;
    assert.ok(!['THE', 'A', 'OF', 'IN'].includes(last) || c === chunks.at(-1), `chunk ends on a determiner/preposition: ${JSON.stringify(t)}`);
    assert.ok(last.length > 1 || c === chunks.at(-1), `1-letter word at line end: ${JSON.stringify(t)}`);
  }
  // the sentence end is a hard break
  const iWeek = chunks.findIndex((c) => c.words.some((w) => w.w === 'WEEK'));
  assert.equal(chunks[iWeek].words.at(-1).w, 'WEEK');
  // a pause > 0.15 s outweighs a syntactic break
  const p = normalizeWords([{ w: 'look', start: 0, end: 0.2 }, { w: 'at', start: 0.22, end: 0.3 }, { w: 'this', start: 0.32, end: 0.5 }, { w: 'okay', start: 1.0, end: 1.2 }, { w: 'so', start: 1.22, end: 1.3 }], captionStyle('kimo'));
  assert.equal(chunkWords(p, captionStyle('kimo').layout.shorts)[0].words.at(-1).w, 'THIS');
  assert.ok(breakCost(normalizeWords(words('3 million'), style), 0) >= 50, 'never break 3 | MILLION');
  // 16:9 subtitles: ≤ 42 characters per line, ≤ 2 lines, balanced
  const docStyle = captionStyle('doc-subtitle');
  const long = normalizeWords(words('this is a much longer documentary sentence that has to be broken into two balanced lines for reading comfort.'), docStyle);
  for (const c of chunkWords(long, docStyle.layout.wide)) {
    assert.ok(c.lines.length <= 2);
    let k = 0;
    for (const nWords of c.lines) {
      const line = c.words.slice(k, k + nWords).map((w) => w.w).join(' ');
      assert.ok(line.length <= 42, line);
      k += nWords;
    }
  }
});

test('timing: one-frame lead, highlights end at the next onset, minimum durations, never overlapping', () => {
  const style = captionStyle('kimo');
  const layout = style.layout.shorts;
  const fps = 30;
  const n = normalizeWords(words('one two three four five six seven eight nine ten eleven twelve', 0.5, 0.2), { ...style, numbers: 'keep' });
  const chunks = timeChunks(chunkWords(n, layout), { fps, layout });
  for (const [i, c] of chunks.entries()) {
    assert.ok(Math.abs(c.start - (Math.round((c.words[0].start - 1 / fps) * fps) / fps)) < 1e-6 || c.start >= chunks[i - 1]?.end - 1e-6, 'starts one frame before the first onset');
    assert.ok(c.end - c.start >= layout.min_dur - 1e-6 || chunks[i + 1]?.start - c.end < 1e-6, `min duration ${c.end - c.start}`);
    if (chunks[i + 1]) assert.ok(c.end <= chunks[i + 1].start + 1e-9, 'no overlap');
    for (const [k, w] of c.words.entries()) {
      assert.ok(Math.abs(w.at * fps - Math.round(w.at * fps)) < 1e-6, 'frame grid');
      assert.equal(w.until, k + 1 < c.words.length ? c.words[k + 1].at : c.end);
    }
  }
  // a lone short chunk lingers into the following silence up to the minimum
  const lone = timeChunks(chunkWords(normalizeWords([{ w: 'yes', start: 1, end: 1.1 }], style), layout), { fps, layout });
  assert.ok(lone[0].end - lone[0].start >= 0.3 - 1e-6);
  // 16:9 read speed ≤ 17 cps where silence allows
  const doc = captionStyle('doc-subtitle');
  const fast = timeChunks(chunkWords(normalizeWords(words('extraordinarily complicated vocabulary everywhere.', 0, 0.15), doc), doc.layout.wide), { fps, layout: doc.layout.wide, maxCps: 17 });
  const cps = fast[0].words.map((w) => w.w).join(' ').length / (fast[0].end - fast[0].start);
  assert.ok(cps <= 17.5, `cps ${cps}`);
});

test('accent: at most one word per chunk, emphasis and numbers first, share within the style ratio', () => {
  const style = captionStyle('hormozi');
  const layout = style.layout.shorts;
  const n = normalizeWords(words('the secret to growing is posting every single day for two hundred days straight and never quitting at all'), style);
  const chunks = accentChunks(timeChunks(chunkWords(n, layout), { fps: 30, layout }), style, { emphasis: [{ word: 'secret' }] });
  for (const c of chunks) assert.ok(c.words.filter((w) => w.accent).length <= 1);
  const accented = chunks.filter((c) => c.words.some((w) => w.accent));
  assert.ok(accented.some((c) => c.words.some((w) => w.accent && w.w === 'SECRET')));
  assert.ok(accented.some((c) => c.words.some((w) => w.accent && w.w === '200')));
  const share = accented.length / chunks.length;
  assert.ok(share >= 0.2 - 1e-9 && share <= 0.35 + 1 / chunks.length, `share ${share}`);
});

test('placement: inside the shorts safe area, below the chin, never over the mouth, yields to hook titles', () => {
  const style = captionStyle('hormozi');
  const canvas = shortsCanvas;
  const face = { x0: 380, x1: 700, y0: 400, y1: 900, mouthY0: 720 };
  const built = captionOverlays(words('this is how I grew my channel to a million subscribers'), { style: 'hormozi', canvas, fps: 30, faceAt: () => face });
  const safe = safeArea(canvas);
  for (const o of built.overlays) {
    const b = blockBox(style, { words: o.props.words, lines: o.props.lines, place: o.props.place }, canvas, o.props.place.cy, o.props.place.cx);
    assert.ok(b.y0 >= safe.y0 - 1 && b.y1 <= safe.y1 + 1 && b.x1 <= safe.x1 + 1, 'safe area');
    assert.ok(b.y0 >= face.y1, `below the chin (${b.y0} vs ${face.y1})`);
    assert.ok(!o.props.place.mouth);
  }
  assert.equal(built.stats.caption_safe, true);
  assert.ok(built.stats.caption_face_overlap < 0.02);
  // a face low in frame: captions move up instead of covering the mouth
  const low = { x0: 300, x1: 780, y0: 900, y1: 1500, mouthY0: 1290 };
  const up = captionOverlays(words('hello there friends'), { style: 'kimo', canvas, fps: 30, faceAt: () => low });
  for (const o of up.overlays) assert.ok(o.props.place.cy < low.y0, `moved above the face: ${o.props.place.cy}`);
  // a hook title where the caption wants to sit: the caption moves; when nowhere fits it hides for the title
  const edl = { canvas: { ...canvas, fps: 30 }, video: [], sources: [], overlays: [{ id: 'hook', kind: 'hook_title', at: 0, dur: 2, props: { text: 'BIG HOOK HERE', x: 0.5, y: 0.64, size: 120 } }] };
  const ws = normalizeWords(words('one two'), style);
  const placed = placeChunks(timeChunks(chunkWords(ws, style.layout.shorts), { fps: 30, layout: style.layout.shorts }), style, { edl, faceAt: () => null });
  assert.notEqual(placed[0].place.at, 'middle');
  const full = { ...edl, overlays: [0.2, 0.45, 0.64, 0.75].map((y, i) => ({ id: `g${i}`, kind: 'callout', at: 0, dur: 5, props: { primitive: 'rect', width: 1080, height: 420, x: 0.5, y } })) };
  const hidden = placeChunks(timeChunks(chunkWords(ws, style.layout.shorts), { fps: 30, layout: style.layout.shorts }), style, { edl: full, faceAt: () => null });
  assert.ok(hidden.every((c) => c.hidden === 'graphic'));
});

test('words follow the cut: source times map through A-roll in/out/at/speed; cut words never show', () => {
  const edl = {
    canvas: { w: 1080, h: 1920, fps: 30 },
    sources: [{ id: 's', path: 'C:\\clips\\talk.mp4', kind: 'video', w: 1920, h: 1080 }],
    video: [{ track: 'A', clips: [{ id: 'c1', src: 's', in: 1, out: 2, at: 0 }, { id: 'c2', src: 's', in: 4, out: 6, at: 1, speed: 2 }] }],
    audio: [],
    overlays: [],
  };
  const ctx = { words: { 'C:/clips/talk.mp4': [{ w: 'cut', start: 0.2, end: 0.5 }, { w: 'keep', start: 1.2, end: 1.5 }, { w: 'gone', start: 2.5, end: 2.8 }, { w: 'fast', start: 4.4, end: 4.8 }, { w: 'um', start: 5, end: 5.2 }] }, emphasis: [{ path: 'C:/clips/talk.mp4', t: 4.4, kind: 'number' }] };
  const out = outputWords(edl, ctx);
  assert.deepEqual(out.map((w) => w.w), ['keep', 'fast']);
  assert.ok(Math.abs(out[0].start - 0.2) < 1e-9);
  assert.ok(Math.abs(out[1].start - 1.2) < 1e-9, 'speed 2: (4.4 - 4) / 2 + 1');
  assert.equal(out[1].emphasis, 'number');
  applyCaptions(edl, { style: 'kimo' }, ctx);
  assert.ok(edl.overlays.length >= 1 && edl.overlays.every((o) => o.kind === 'caption_word_group'));
  assert.equal(edl.captions.style, 'kimo');
  assert.ok(publicEdl({ ...edl, edl_version: 1, master: {} }).captions.bounds.includes(0.2));
});

test('ASS builder: braces, backslashes, newlines and commas are escaped; tags validate their numbers', () => {
  assert.equal(escapeText('a {b} c'), 'a \\{b\\} c');
  assert.equal(escapeText('C:\\new\\Name'), 'C:\\\u2060new\\\u2060Name');
  assert.equal(escapeText('two\nlines'), 'two\\Nlines');
  assert.equal(escapeText('hello, world'), 'hello, world', 'commas are fine in the Text field');
  assert.equal(fieldText('My, Style{x}'), 'My Style x');
  assert.equal(assTime(3723.456), '1:02:03.45');
  assert.equal(colour('#FF5A24'), '&H245AFF&');
  assert.throws(() => tag.pos(NaN, 1));
  assert.throws(() => colour('orange'));
  const doc = new AssDocument({ w: 1080, h: 1920 });
  doc.style({ name: 'cap, one', font: 'Geist, Black', size: 80 });
  doc.event({ start: 0, end: 1, style: 'cap one', parts: [{ tags: [tag.pos(540, 900), tag.t(0, 80, tag.fsc(108))] }, { text: '{evil}\\N, ok' }] });
  const text = doc.toString();
  assert.match(text, /Style: cap one,Geist Black,80,/);
  assert.match(text, /Dialogue: 0,0:00:00\.00,0:00:01\.00,cap one,,0,0,0,,\{\\pos\(540,900\)\\t\(0,80,\\fscx108\\fscy108\)\}\\\{evil\\\}\\\u2060N, ok/);
  assert.throws(() => doc.event({ start: 0, end: 1, style: 'nope', parts: [] }));
  assert.throws(() => doc.event({ start: 0, end: 1, parts: [{ tags: ['\\pos(1,1)}{\\b1'] }, { tags: ['pos(1,1)'] }] }));
});

test('Windows filter paths: drive colon, backslashes and quotes are escaped for the filtergraph', () => {
  assert.equal(filterPath('C:\\Users\\Naman\\AppData\\Local\\kimo\\fonts'), "'C\\:/Users/Naman/AppData/Local/kimo/fonts'");
  assert.equal(filterPath("C:\\Users\\Naman's PC\\a,b;c\\fonts"), "'C\\:/Users/Naman\\'\\''s PC/a,b;c/fonts'");
  assert.equal(filterPath('/tmp/plain dir/x.ass'), "'/tmp/plain dir/x.ass'");
});

test('real libass: every style renders with the bundled faces through an escaped fontsdir (no fallback)', { skip: !hasFfmpeg && !requireFfmpeg }, async () => {
  assert.ok(hasFfmpeg, 'FFmpeg is required on CI');
  // an awkward directory: spaces, quote, comma, brackets (and the drive letter on Windows)
  const root = await mkdtemp(join(tmpdir(), "kimo caps 'q', [x] "));
  try {
    const fonts = join(root, 'fonts dir');
    await mkdir(fonts);
    for (const f of fontFiles(bundledFontsDir())) await copyFile(join(bundledFontsDir(), f), join(fonts, f));
    const doc = new AssDocument({ w: 1080, h: 1920 });
    let t = 0;
    const edl = { canvas: shortsCanvas, overlays: [], captions: null };
    for (const s of captionStyles().values()) {
      const built = captionOverlays([...words('Ten million views, honestly', t + 0.1), ...words('यह सच है', t + 1.4)], { style: s.id, canvas: shortsCanvas, fps: 30, faceAt: () => null });
      built.overlays.forEach((o, i) => edl.overlays.push({ ...o, id: `${s.id}-${i}` }));
      t += 2.5;
    }
    drawCaptions(doc, edl, 30);
    const ass = join(root, 'all, styles.ass');
    await writeFile(ass, doc.toString());
    const r = await checkFonts({ ffmpeg, ass, fontsDir: fonts, size: '270x480', duration: t, fps: 8 });
    assert.ok(r.code === 0, r.log);
    assert.deepEqual(r.foreign, [], `fallback faces: ${JSON.stringify(r.foreign)}`);
    assert.deepEqual(r.missing, []);
    const used = new Set(r.selected.map((s) => s.postscript));
    for (const ps of ['Montserrat-Black', 'Montserrat-ExtraBold', 'Geist-Black', 'Geist-SemiBold', 'Geist-Bold', 'Bangers-Regular', 'NotoSansDevanagari-Black', 'NotoSansDevanagari-Bold']) assert.ok(used.has(ps), `${ps} selected (got ${[...used].join(', ')})`);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test('font metrics: advance widths match libass layout closely enough for boxes and slides', () => {
  const m = bundledMetrics('Geist-Black.ttf');
  const w = textWidth(m, 'HELLO WORLD', 100);
  // measured with libass 0.17 (ink 545 px; advances include side bearings)
  assert.ok(w > 540 && w < 565, `width ${w}`);
});

test('Studio edits on caption chunks: moves and trims snap to word boundaries, text edits keep timing', () => {
  const edl = {
    edl_version: 1,
    canvas: { w: 1080, h: 1920, fps: 30 },
    sources: [{ id: 's', path: '/a.mp4', kind: 'video' }],
    video: [{ track: 'A', clips: [{ id: 'c', src: 's', in: 0, out: 6, at: 0 }] }],
    audio: [],
    overlays: [],
    master: {},
  };
  applyCaptions(edl, { style: 'hormozi' }, { words: { '/a.mp4': words('alpha beta. gamma delta. epsilon zeta.', 0.3, 0.4) } });
  const caps = edl.overlays;
  assert.ok(caps.length >= 3);
  const bounds = captionBounds(edl);
  // move the second chunk a little: it lands on a word boundary and stays between its neighbours
  const second = caps[1];
  const moved = applyEdits(edl, [{ tool: 'move_clip', args: { clip_id: second.id, start: second.at + 0.07 } }]);
  const m2 = moved.overlays.find((o) => o.id === second.id);
  const lead = m2.props.words[0].at - m2.at;
  assert.ok(bounds.some((b) => Math.abs(b - (m2.at + lead)) < 0.04) || Math.abs(m2.at - second.at) < 0.04, `snapped: ${m2.at}`);
  assert.ok(m2.at >= caps[0].at + caps[0].dur - 1e-6 && m2.at + m2.dur <= caps[2].at + 1e-6, 'no overlap');
  assert.ok(m2.props.edited);
  // trim: end snaps; words past the end drop
  const trimmed = applyEdits(edl, [{ tool: 'trim_clip', args: { clip_id: caps[0].id, duration: 0.45 } }]);
  const t0 = trimmed.overlays.find((o) => o.id === caps[0].id);
  assert.ok(t0.props.words.length >= 1 && t0.props.words.every((w) => w.at < t0.at + t0.dur));
  // text edit with the same word count keeps the word timings
  const before = caps[0].props.words.map((w) => w.at);
  const renamed = applyEdits(edl, [{ tool: 'edit_caption', args: { clip_id: caps[0].id, text: caps[0].props.words.map((_, i) => `w${i}`).join(' ') } }]);
  assert.deepEqual(renamed.overlays.find((o) => o.id === caps[0].id).props.words.map((w) => w.at), before);
  // a different word count spreads the new words over the chunk
  const spread = editCaptionChunk(structuredClone(edl), structuredClone(caps[0]), { tool: 'edit_caption', args: { text: 'one two three four' } });
  assert.equal(spread.props.words.length, 4);
  assert.ok(spread.props.words.every((w, i, a) => !i || w.at >= a[i - 1].at));
  // edited chunks survive a rebuild (follow-up)
  const rebuilt = structuredClone(renamed);
  applyCaptions(rebuilt, { style: 'hormozi' }, { words: { '/a.mp4': words('alpha beta. gamma delta. epsilon zeta.', 0.3, 0.4) } });
  assert.ok(rebuilt.overlays.some((o) => o.props.text.startsWith('w0')));
});

test('compose: auto-contrast boxes a shadow-only caption on a bright background; edits reuse the cached base', { skip: !hasFfmpeg && !requireFfmpeg, timeout: 120000 }, async () => {
  const { compose } = await import('../compose.mjs');
  const root = await mkdtemp(join(tmpdir(), 'kimo-contrast-'));
  try {
    const clip = join(root, 'white.mkv');
    const r = spawnSync(ffmpeg, ['-v', 'error', '-y', '-f', 'lavfi', '-i', 'color=c=0xF4F4F4:s=320x180:r=30:d=1', '-c:v', 'ffv1', clip]);
    assert.equal(r.status, 0);
    const canvas = { w: 320, h: 180, fps: 30 };
    const built = captionOverlays(words('bright and clear', 0.05, 0.25), { style: 'mkbhd', canvas, fps: 30, total: 1, faceAt: () => null });
    const edl = { edl_version: 1, canvas, sources: [{ id: 's', path: clip, kind: 'video' }], video: [{ track: 'A', clips: [{ id: 'c', src: 's', in: 0, out: 1, at: 0 }] }], audio: [], overlays: built.overlays, master: {} };
    const events = [];
    const cacheDir = join(root, 'cache');
    await compose({ edl, ffmpeg, ffprobe: toolPaths().ffprobe, output: join(root, 'out.mkv'), dir: join(root, 'work'), cacheDir, emit: (e) => events.push(e) });
    const end = events.find((e) => e.tool === 'compose' && e.phase === 'end');
    assert.ok(end.ok && /contrast box/.test(end.result), end.result);
    const edited = applyEdits(edl, [{ tool: 'edit_caption', args: { clip_id: built.overlays[0].id, text: 'still clear' } }]);
    const again = [];
    await compose({ edl: edited, ffmpeg, ffprobe: toolPaths().ffprobe, output: join(root, 'out2.mkv'), dir: join(root, 'work'), cacheDir, emit: (e) => again.push(e) });
    assert.ok(again.some((e) => e.tool === 'caption_pass' && e.phase === 'end'), 'base composite reused');
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
