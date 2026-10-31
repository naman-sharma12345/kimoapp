// Phase 7 explainers: cue detection (en + hi/Hinglish), beat validation,
// deterministic family renders at four aspects, sync to the spoken word,
// layout/collision, the visual director (mocked AI, cache), asset sources
// (mocked network) and the EDL wiring.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { graphicJob, themeFor, softFrame } from '../graphics/renderer.mjs';
import { beatTiming, firstVisibleFrame, LEAD_FRAMES } from '../explain/timing.mjs';
import { reveal, entryFrames } from '../explain/families/common.mjs';

const W = (text, step = 0.4, t0 = 0) => text.split(' ').map((w, i) => ({ w, start: +(t0 + i * step).toFixed(3), end: +(t0 + i * step + step * 0.85).toFixed(3) }));

test('sync: an item is visible on its entry frame, not one frame later', () => {
  const fps = 30;
  assert.ok(reveal(1, 1, fps) > 0, 'visible on the entry frame');
  assert.equal(reveal(1 - 1 / fps, 1, fps), 0, 'hidden on the frame before');
  assert.equal(entryFrames(1 + 6 / fps, 1, fps), 7);
  assert.equal(reveal(1 + 6 / fps, 1, fps), 1, 'fully in after 7 frames');
});

test('sync: each item first shows within ±1 frame of onset − 2 frames (rendered)', () => {
  const fps = 30;
  const canvas = { w: 960, h: 540 };
  const words = W('there are three reasons first no users second too slow third ran out of money', 0.37, 0.53);
  const beat = { start_word_idx: 0, say_word_idx: 2, end_word_idx: 15, items: [{ text: 'No users', say_word_idx: 4 }, { text: 'Too slow', say_word_idx: 7 }, { text: 'Ran out of money', say_word_idx: 10 }] };
  const tm = beatTiming(beat, words, { fps, total: 20 });
  const job = graphicJob({ kind: 'ex_list', props: { mode: 'side', title: '3 reasons', items: beat.items.map((it, i) => ({ text: it.text, t: tm.items[i] })) }, canvas, fps, dur: tm.dur, theme: themeFor('auto') });
  for (const [i, it] of beat.items.entries()) {
    const target = Math.round(words[it.say_word_idx].start * fps) - LEAD_FRAMES; // absolute frame
    const f = firstVisibleFrame(tm.items[i], fps) + tm.startFrame;
    assert.ok(Math.abs(f - target) <= 1, `item ${i}: first frame ${f} vs target ${target}`);
    // the rendered pixels change exactly on that frame and not on the one before
    const local = f - tm.startFrame;
    const before = softFrame(job, local - 1);
    const at = softFrame(job, local);
    const prev = softFrame(job, local - 2);
    assert.notDeepEqual(at, before, `item ${i} drawn on its entry frame`);
    if (local - 2 >= 6) assert.deepEqual(before, prev, `nothing new on the frame before item ${i}`);
  }
});

test('pip: the speaker is composited in a rounded bubble over a full-screen visual (real FFmpeg)', { timeout: 120000 }, async (t) => {
  const { spawnSync } = await import('node:child_process');
  const { mkdtemp, rm } = await import('node:fs/promises');
  const { tmpdir } = await import('node:os');
  const { join } = await import('node:path');
  const { compose } = await import('../compose.mjs');
  const { toolPaths } = await import('./bench/run.mjs');
  const { pipRect, panelRect } = await import('../explain/panel.mjs');
  const tools = toolPaths();
  if (spawnSync(tools.ffmpeg, ['-version']).status !== 0) return t.skip('FFmpeg not available');
  const dir = await mkdtemp(join(tmpdir(), 'kimo-pip-'));
  try {
    const src = join(dir, 'talk.mkv');
    spawnSync(tools.ffmpeg, ['-v', 'error', '-y', '-f', 'lavfi', '-i', 'color=c=0xd02020:s=640x360:r=30:d=1', '-c:v', 'ffv1', src]);
    const canvas = { w: 640, h: 360 };
    const rect = pipRect(canvas);
    const short = Math.min(canvas.w, canvas.h);
    const edl = {
      edl_version: 1,
      canvas: { ...canvas, fps: 30 },
      sources: [{ id: 's', path: src.replaceAll('\\', '/'), kind: 'video' }],
      video: [{ track: 'V1', clips: [{ id: 'c1', src: 's', in: 0, out: 1, at: 0, speed: 1, fit: 'cover' }] }],
      audio: [],
      overlays: [
        { id: 'x1', kind: 'graphic', at: 0, dur: 1, track: 'graphics', props: { element: 'ex_question', mode: 'full', panel: panelRect(canvas, 'full'), question: 'Why?', theme: 'kimo' } },
        { id: 'p1', kind: 'pip', src: 's', at: 0, dur: 1, track: 'graphics', props: { in: 0, pip: { ...rect, zoom: 1.2 }, mask: { shape: 'rect', x: (rect.x + rect.w / 2) / canvas.w, y: (rect.y + rect.h / 2) / canvas.h, w: rect.w / canvas.w, h: rect.h / canvas.h, radius: rect.radius / short, feather: 1 / short } } },
      ],
      master: { lufs: -14, true_peak: -1 },
    };
    const output = join(dir, 'out.mkv');
    await compose({ edl, ffmpeg: tools.ffmpeg, ffprobe: tools.ffprobe, output, dir: join(dir, 'c'), emit: () => {} });
    const raw = spawnSync(tools.ffmpeg, ['-v', 'error', '-i', output, '-vf', 'select=eq(n\\,20),format=rgb24', '-frames:v', '1', '-f', 'rawvideo', 'pipe:1'], { maxBuffer: 1 << 24 }).stdout;
    const at = (x, y) => [...raw.subarray((y * canvas.w + x) * 3, (y * canvas.w + x) * 3 + 3)];
    const inside = at(Math.round(rect.x + rect.w / 2), Math.round(rect.y + rect.h / 2));
    const outside = at(40, 40);
    const corner = at(rect.x + 1, rect.y + 1);
    assert.ok(inside[0] > 150 && inside[1] < 90, `speaker in the bubble ${inside}`);
    assert.ok(outside[0] < 90, `full-screen visual outside the bubble ${outside}`);
    assert.ok(corner[0] < 120, `rounded corner masked ${corner}`);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test('layout: modes keep the face clear (reframed), full ≤ 25 %, pip for long beats, graphics yield', async () => {
  const L = await import('../explain/layout.mjs');
  const wide = { w: 1920, h: 1080 };
  const tall = { w: 1080, h: 1920 };
  const geomW = { W: 1920, H: 1080, cw: 1920, ch: 1080 };
  const geomT = { W: 1920, H: 1080, cw: 607.5, ch: 1080 };
  const head = { cx: 0.5, top: 0.2, chin: 0.5 };
  for (const [canvas, geom] of [[wide, geomW], [tall, geomT]]) {
    const state = { x: 0.5, y: 0.5, zoom: 1 };
    const face = L.projectFace(head, geom, state, canvas);
    for (const kind of ['list', 'compare', 'stat', 'definition', 'quote', 'meme', 'photo']) {
      const r = L.placeBeat({ kind, items: [{}, {}] }, { canvas, dur: 3.5, fullLeft: 0, samples: [{ face, head, geom, state }] });
      assert.ok(r.mode, `${kind} placed on ${canvas.w}x${canvas.h}`);
      if (r.mode === 'pip' || r.mode === 'full') continue;
      const f = r.reframe ? L.projectFace(head, geom, r.reframe, canvas) : face;
      assert.equal(L.faceOverlap(r.panel, f), 0, `${kind} ${r.mode} clear of the face`);
    }
  }
  // full only for complex beats and within the 25 % budget
  assert.equal(L.modeOrder({ kind: 'map', items: [{}] }, { canvas: wide, dur: 4, fullLeft: 10 })[0], 'full');
  assert.ok(!L.modeOrder({ kind: 'map', items: [{}] }, { canvas: wide, dur: 4, fullLeft: 2 }).includes('full'));
  assert.ok(!L.modeOrder({ kind: 'list', items: [{}, {}] }, { canvas: wide, dur: 4, fullLeft: 100 }).includes('full'));
  assert.equal(L.modeOrder({ kind: 'list', items: [{}, {}] }, { canvas: tall, dur: 7, template: 'explainer' })[0], 'pip');
  // decorative graphics move or wait, the hook title blocks
  const ov = [
    { id: 'h', kind: 'graphic', at: 0.15, dur: 2, props: { element: 'hook_title' } },
    { id: 's', kind: 'graphic', at: 5.2, dur: 1.5, props: { element: 'stat' } },
    { id: 'k', kind: 'graphic', at: 9, dur: 1.3, props: { element: 'sticker' } },
  ];
  const r = L.resolveGraphics(ov, [{ id: 'b1', at: 1, end: 4 }, { id: 'b2', at: 6, end: 9.2 }], { total: 30 });
  assert.deepEqual(r.blocked, ['b1']);
  assert.ok(r.removed.includes('s'));
  assert.ok(r.moved.includes('k') && ov.find((o) => o.id === 'k').at >= 9.6 - 1e-9);
});

test('sources: keyless search is licence-filtered, cached (2nd run: 0 network), capped; screenshots only public URLs', async () => {
  const { mkdtemp, rm } = await import('node:fs/promises');
  const { tmpdir } = await import('node:os');
  const { join } = await import('node:path');
  const { AssetCache, attributionsText, creditLine } = await import('../explain/assets.mjs');
  const wm = await import('../explain/sources/wikimedia.mjs');
  const ov = await import('../explain/sources/openverse.mjs');
  const { publicUrl } = await import('../explain/sources/screenshot.mjs');
  const dir = await mkdtemp(join(tmpdir(), 'kimo-assets-'));
  let calls = 0;
  const page = (title, license, artist) => ({ title: `File:${title}.jpg`, index: 1, imageinfo: [{ mime: 'image/jpeg', url: `https://upload.example/${title}.jpg`, thumburl: `https://upload.example/t/${title}.jpg`, thumbwidth: 1024, thumbheight: 768, descriptionurl: `https://commons.example/${title}`, extmetadata: { License: { value: license }, Artist: { value: `<a>${artist}</a>` } } }] });
  const fake = async (url) => {
    calls++;
    if (url.includes('openverse')) return { ok: true, json: async () => ({ results: [{ url: 'https://x.example/a.jpg', license: 'by', license_version: '2.0', creator: 'Ann', title: 'A', filetype: 'jpg' }, { url: 'https://x.example/b.jpg', license: 'by-nc', creator: 'B' }, { url: 'https://x.example/c.jpg', license: 'cc0', mature: true }] }) };
    return { ok: true, json: async () => ({ query: { pages: [page('Taj', 'cc-by-sa-4.0', 'X'), page('Taj2', 'cc-by-4.0', 'Yann'), page('Taj3', 'cc0', 'Z')] } }) };
  };
  try {
    const cache = new AssetCache(dir, { fetch: fake, maxSearches: 3 });
    const a = await wm.search('Taj Mahal', { cache });
    assert.deepEqual(a.map((x) => x.license), ['by', 'cc0'], 'no share-alike');
    assert.equal(a[0].creator, 'Yann');
    const b = await ov.search('Taj Mahal', { cache });
    assert.deepEqual(b.map((x) => x.creator), ['Ann'], 'no NC, no mature');
    assert.equal(creditLine(b[0]), 'Ann, CC BY 2.0 (Openverse)');
    assert.match(attributionsText([b[0]]), /Ann, CC BY 2\.0/);
    const n = calls;
    const again = new AssetCache(dir, { fetch: fake });
    await wm.search('Taj Mahal', { cache: again });
    await ov.search('Taj Mahal', { cache: again });
    assert.equal(calls, n, 'second run is served from the cache');
    assert.equal(again.stats.network, 0);
    await wm.search('q1', { cache });
    assert.deepEqual(await wm.search('q2', { cache }), [], 'per-video search cap');
    assert.equal(cache.stats.refused, 1);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
  assert.equal(publicUrl('github.com/naman/kimo'), 'https://github.com/naman/kimo');
  for (const bad of ['http://localhost:3000', 'https://192.168.1.4/x', 'file:///etc/passwd', 'https://10.0.0.1', 'intranet']) assert.equal(publicUrl(bad), null, bad);
});

test('sfx: synthesised kit (own, CC0), ≥ 0.5 s apart, gags win over ticks, levels under voice', async (t) => {
  const { planSfx, sfxFile, LEVELS, gagName } = await import('../explain/sfx.mjs');
  const cues = planSfx([{ at: 1, kind: 'tick' }, { at: 1.2, kind: 'tick' }, { at: 2, kind: 'tick' }, { at: 2.1, kind: 'record_scratch' }, { at: 5, kind: 'whoosh' }, { at: 7, kind: 'laugh' }]);
  assert.deepEqual(cues.map((c) => [c.at, c.name]), [[1, 'tick'], [2.1, 'record_scratch'], [5, 'whoosh'], [7, 'boing']]);
  assert.ok(cues.every((c) => c.gain_db <= -6));
  assert.equal(gagName('ooh'), 'ding');
  assert.ok(LEVELS.tick <= -8);
  const { spawnSync } = await import('node:child_process');
  const { toolPaths } = await import('./bench/run.mjs');
  const { mkdtemp, rm } = await import('node:fs/promises');
  const { tmpdir } = await import('node:os');
  const { join } = await import('node:path');
  const ffmpeg = toolPaths().ffmpeg;
  if (spawnSync(ffmpeg, ['-version']).status !== 0) return t.skip('FFmpeg not available');
  const dir = await mkdtemp(join(tmpdir(), 'kimo-sfx-'));
  try {
    for (const n of ['tick', 'whoosh', 'record_scratch']) {
      const f = sfxFile(n, { ffmpeg, dir });
      const r = spawnSync(ffmpeg, ['-i', f, '-af', 'volumedetect', '-f', 'null', '-'], { encoding: 'utf8' });
      const peak = Number(/max_volume: (-?[\d.]+)/.exec(r.stderr)?.[1]);
      assert.ok(peak < -3 && peak > -40, `${n} peak ${peak}`);
    }
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test('director: model decides (mocked), taste rules hold, two-pass pick, toggles, cache → 0 calls on re-run', { timeout: 60000 }, async () => {
  const { mkdtemp, rm } = await import('node:fs/promises');
  const { tmpdir } = await import('node:os');
  const { join } = await import('node:path');
  const { spawnSync } = await import('node:child_process');
  const { direct, directorSummary } = await import('../explain/director.mjs');
  const { AssetCache } = await import('../explain/assets.mjs');
  const { toolPaths } = await import('./bench/run.mjs');
  const ffmpeg = toolPaths().ffmpeg;
  const dir = await mkdtemp(join(tmpdir(), 'kimo-director-'));
  const jpg = join(dir, 'pic.jpg');
  spawnSync(ffmpeg, ['-v', 'error', '-y', '-f', 'lavfi', '-i', 'testsrc2=s=320x200:d=1', '-frames:v', '1', jpg]);
  const jpeg = (await import('node:fs')).readFileSync(jpg);
  let net = 0;
  const fake = async (url) => {
    net++;
    if (url.includes('wikimedia') || url.includes('openverse')) return { ok: true, json: async () => ({ results: [{ url: 'https://img.example/taj.jpg', license: 'by', license_version: '2.0', creator: 'Ann', title: 'Taj Mahal', filetype: 'jpg' }], query: { pages: [] } }) };
    return { ok: true, arrayBuffer: async () => jpeg };
  };
  const joke = W('so I tried to edit the whole video in one night and I failed so badly lol it was a total disaster then I visited the Taj Mahal in Agra and it was beautiful', 0.4, 0.5);
  const sad = W('my grandfather passed away last year and the funeral was the hardest day of my life we lost my best friend too', 0.4, 0.5);
  const calls = [];
  const ask = async (kind, text, images = []) => {
    calls.push(kind);
    if (kind === 'explain' && text.includes('grandfather')) return { beats: [{ id: 'b1', kind: 'meme', say_word_idx: 3, start_word_idx: 3, end_word_idx: 6, importance: 0.9, meme: { format: 'this_is_fine', top: 'me', bottom: 'fine' } }] };
    if (kind === 'explain')
      return {
        beats: [
          { id: 'b1', kind: 'meme', why: 'the fail lands here', say_word_idx: 13, start_word_idx: 11, end_word_idx: 15, importance: 0.9, meme: { format: 'expectation_reality', top: 'one night edit', bottom: 'total disaster' } },
          { id: 'b2', kind: 'photo', why: 'a named landmark: real photo', say_word_idx: 24, start_word_idx: 23, end_word_idx: 30, importance: 0.8, caption: 'Taj Mahal', asset_query: { source: 'wikimedia', q: 'Taj Mahal' } },
          { id: 'b3', kind: 'stat', value: 99, unit: '%', label: 'invented', say_word_idx: 26, importance: 0.9 },
        ],
      };
    if (kind === 'pick') {
      assert.ok(images.length >= 1 && images.every((im) => /^data:image\/jpeg;base64,/.test(im.url) && /^b2 #\d$/.test(im.label)));
      return { picks: [{ beat: 'b2', pick: 1, why: 'clear landmark' }] };
    }
    return {};
  };
  try {
    const canvas = { w: 1080, h: 1920 };
    const run = () => direct({ words: joke, canvas, template: 'explainer', ask, ffmpeg, assetCache: new AssetCache(join(dir, 'cache'), { fetch: fake }) });
    const r1 = await run();
    const kinds = r1.beats.map((b) => b.kind);
    assert.ok(kinds.includes('meme'), `a joke gets a humour asset (${kinds})`);
    assert.ok(kinds.includes('photo'), 'a named landmark gets a real photo, not an icon');
    assert.ok(!kinds.includes('stat') && r1.dropped.some((d) => /invented number/.test(d.why)), 'invented numbers rejected');
    const photo = r1.beats.find((b) => b.kind === 'photo');
    assert.equal(photo.asset.credit, 'Ann, CC BY 2.0 (Openverse)');
    assert.ok(photo.asset.path.endsWith('.png'));
    assert.deepEqual(calls, ['explain', 'pick']);
    assert.match(directorSummary(r1.beats, r1.report), /explainer: 2 visuals: meme, photo/);
    // second render: everything from the cache (0 AI calls, 0 network)
    const n = net;
    const r2 = await run();
    assert.deepEqual(calls, ['explain', 'pick'], 'no new AI call');
    assert.equal(net, n, 'no new network call');
    assert.equal(r2.report.network, 0);
    assert.deepEqual(r2.beats.map((b) => b.kind), kinds);
    // serious content: no humour assets
    const r3 = await direct({ words: sad, canvas, template: 'youtube', ask, ffmpeg, assetCache: new AssetCache(join(dir, 'cache'), { fetch: fake }) });
    assert.equal(r3.beats.filter((b) => ['meme', 'reaction_gif', 'sound_gag'].includes(b.kind)).length, 0);
    // toggles off → none of that kind
    const r4 = await direct({ words: joke, canvas, template: 'explainer', ask, ffmpeg, toggles: { memes: false, images: false }, cacheDir: join(dir, 'ai2'), assetCache: new AssetCache(join(dir, 'cache'), { fetch: fake }) });
    assert.ok(!r4.beats.some((b) => ['meme', 'photo'].includes(b.kind)));
    // no AI: deterministic cues only, never fetched pictures
    const r5 = await direct({ words: W('there are three reasons first no users second too slow third ran out of money and 40 percent of startups fail', 0.4, 0.5), canvas, template: 'explainer', ffmpeg, assetCache: new AssetCache(join(dir, 'cache'), { fetch: fake }) });
    assert.equal(r5.report.mode, 'cues');
    assert.ok(r5.beats.some((b) => b.kind === 'list'));
    assert.equal(r5.report.network, 0);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test('plan: beats become EDL overlays on time, off the face, with camera room, SFX, caption no-accent and a valid EDL', { timeout: 60000 }, async () => {
  const { mkdtemp, rm } = await import('node:fs/promises');
  const { tmpdir } = await import('node:os');
  const { join } = await import('node:path');
  const { direct } = await import('../explain/director.mjs');
  const { AssetCache } = await import('../explain/assets.mjs');
  const { anchorBeats, applyExplain, countFaceOverlaps } = await import('../explain/plan.mjs');
  const { validate } = await import('../edl.mjs');
  const { applyCaptions } = await import('../captions.mjs');
  const { toolPaths } = await import('./bench/run.mjs');
  const dir = await mkdtemp(join(tmpdir(), 'kimo-explain-plan-'));
  try {
    const text = 'okay so here is the thing there are three reasons it failed first no users second too slow and third we ran out of money and honestly 40 percent of startups fail exactly here so think about that for a moment before you build anything new';
    const words = W(text, 0.38, 0.6);
    for (const canvas of [{ w: 1920, h: 1080 }, { w: 1080, h: 1920 }]) {
      const path = 'C:/v/talk.mp4';
      const edl = {
        edl_version: 1,
        canvas: { ...canvas, fps: 30 },
        sources: [{ id: 'a', path, kind: 'video', fps: 30, w: 1920, h: 1080, duration: 30, audio: true }],
        video: [{ track: 'V1', clips: [{ id: 'c1', src: 'a', in: 0, out: 9, at: 0, speed: 1, fit: 'cover' }, { id: 'c2', src: 'a', in: 9, out: 20, at: 9, speed: 1, fit: 'cover' }] }],
        audio: [],
        overlays: [{ id: 'gfx-stat-1', kind: 'graphic', at: 15.5, dur: 1.7, track: 'graphics', props: { element: 'stat', value: '40%', label: 'fail' } }],
        master: { lufs: -14, true_peak: -1 },
      };
      const ctx = { words: { [path]: words }, heads: { [path]: { static: { cx: 0.5, top: 0.18, chin: 0.48, eyes: 0.31, gaze: 0, source: 'sam' } } } };
      const d = await direct({ words, canvas, template: 'explainer', ffmpeg: toolPaths().ffmpeg, assetCache: new AssetCache(join(dir, 'cache')) });
      assert.ok(d.beats.some((b) => b.kind === 'list'), `cues give a list (${d.beats.map((b) => b.kind)})`);
      applyExplain(edl, { enabled: true, beats: anchorBeats(d.beats, words), template: 'explainer', ffmpeg: toolPaths().ffmpeg, sfxDir: join(dir, 'sfx'), tone: d.cues.tone }, ctx);
      validate(edl);
      const ex = edl.overlays.filter((o) => o.props?.explain_plan && o.kind === 'graphic' && o.props.element !== 'ex_pip');
      assert.ok(ex.length >= 2, `${ex.length} explainer overlays`);
      const list = ex.find((o) => o.props.element === 'ex_list');
      // items enter 2 frames before their words (±1 frame)
      for (const [k, it] of list.props.items.entries()) {
        const spoken = words[d.beats.find((b) => b.kind === 'list').items[k].say_word_idx].start;
        const f = Math.round((list.at + it.t) * 30);
        assert.ok(Math.abs(f - (Math.round(spoken * 30) - 2)) <= 1, `item ${k} frame ${f}`);
      }
      // never two explainers at once
      const sorted = [...ex].sort((a, b) => a.at - b.at);
      for (let i = 1; i < sorted.length; i++) assert.ok(sorted[i].at >= sorted[i - 1].at + sorted[i - 1].dur - 1e-6, 'no overlap');
      assert.equal(countFaceOverlaps(edl, ctx, ex), 0, 'never over the face');
      assert.equal(edl.explain.metrics.explain_face_overlap, 0);
      // the Phase 6 number pop under the explainer moved or waited
      assert.ok(!edl.overlays.some((o) => o.id === 'gfx-stat-1' && ex.some((x) => o.at < x.at + x.dur && x.at < o.at + o.dur)));
      // side/top beats make room: camera keys written on the talking track
      if (ex.some((o) => ['side', 'top'].includes(o.props.mode))) assert.ok(edl.video[0].clips.some((c) => /explain/.test(c.camera_by ?? '')));
      assert.ok(edl.audio.some((t) => t.role === 'SFX' && t.clips.length > 0), 'item ticks on the SFX bus');
      assert.ok(edl.explain.no_accent.length > 0);
      applyCaptions(edl, { enabled: true, style: 'kimo' }, ctx);
      validate(edl);
      // re-applying is idempotent (snapshots run many times)
      const n = edl.overlays.filter((o) => o.props?.explain_plan).length;
      applyExplain(edl, { enabled: true, beats: anchorBeats(d.beats, words), template: 'explainer', ffmpeg: toolPaths().ffmpeg, sfxDir: join(dir, 'sfx') }, ctx);
      assert.equal(edl.overlays.filter((o) => o.props?.explain_plan).length, n);
    }
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});
