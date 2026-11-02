import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { studioFixture } from './fixtures/creator.mjs';
import {
  applyStudioPatch,
  studioHistory,
  cleanCreatorOptions,
  applyStoredStudio,
} from '../studio.mjs';
import { studioTracks, visibleStudioEdl } from '../studio-model.mjs';
import { registerStudioIpc, mediaAllowed } from '../studio-ipc.mjs';
import { validate, publicEdl } from '../edl.mjs';
import { renderKeys } from '../planner/render.mjs';
import { runCreatorEdit } from '../creator-engine.mjs';
import { defaultPlan } from '../planner.mjs';
import { probe, youtubeMaster, canvasFps } from '../engine.mjs';
import { command } from './bench/io.mjs';
import { toolPaths } from './bench/run.mjs';
import { readFile } from 'node:fs/promises';
import { stat } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { measureLoudness } from '../audio/process.mjs';
test('manual captions follow source content when regenerated IDs change, and warn when it disappears', () => {
  const original = studioFixture(),
    cap = original.overlays.find((o) => o.kind === 'caption_word_group'),
    edited = applyStudioPatch(original, {
      type: 'caption',
      clip_id: cap.id,
      text: 'Corrected wording',
    }),
    next = structuredClone(original),
    captions = next.overlays.filter((o) => o.kind === 'caption_word_group');
  [captions[0].id, captions[1].id] = [captions[1].id, captions[0].id];
  const restored = applyStoredStudio(next, edited);
  assert.equal(
    restored.overlays.find((o) => o.id === captions[0].id).props.text,
    'Corrected wording',
  );
  assert.notEqual(
    restored.overlays.find((o) => o.id === cap.id).props.text,
    'Corrected wording',
  );
  const missing = structuredClone(original);
  missing.overlays = missing.overlays.filter((o) => o.id !== cap.id);
  applyStoredStudio(missing, edited);
  assert.equal(missing.studio.warnings.length, 1);
  assert.ok(
    !missing.overlays.some((o) => o.props?.text === 'Corrected wording'),
  );
  assert.throws(() =>
    applyStudioPatch(original, {
      type: 'caption',
      clip_id: cap.id,
      text: 'x',
      _anchor: {},
    }),
  );
});
test('restoring a pause uses adjacent source frames and shifts caption words and the music bed', () => {
  const edl = studioFixture(),
    removed = edl.cut_plan.removed[1],
    before = edl.video[0].clips[0],
    after = edl.video[0].clips[1],
    cap = edl.overlays.find((o) => o.kind === 'caption_word_group'),
    changed = applyStudioPatch(edl, { type: 'restore', index: 1 }),
    restored = changed.video[0].clips.find((c) => c.id.startsWith('restored-')),
    delta = after.in - before.out,
    nextCap = changed.overlays.find((o) => o.id === cap.id);
  assert.equal(restored.in, before.out);
  assert.equal(restored.out, after.in);
  assert.ok(
    Math.abs(
      changed.video[0].clips.find((c) => c.id === after.id).at -
        after.at -
        delta,
    ) < 0.00001,
  );
  assert.ok(
    Math.abs(nextCap.props.words[1].start - cap.props.words[1].start - delta) <
      0.00001,
  );
  assert.ok(Math.abs(nextCap.dur - cap.dur - delta) < 0.00001);
  assert.ok(
    Math.abs(
      changed.audio.find((t) => t.role === 'MUSIC').clips[0].dur -
        edl.audio.find((t) => t.role === 'MUSIC').clips[0].dur -
        delta,
    ) < 0.00001,
  );
  assert.ok(
    !changed.cut_plan.removed.some(
      (r) => r.in === removed.in && r.out === removed.out,
    ),
  );
  const reordered = structuredClone(edl);
  reordered.video[0].clips[1].at = 4;
  assert.throws(
    () => applyStudioPatch(reordered, { type: 'restore', index: 1 }),
    /no longer adjacent/,
  );
});
test('media access accepts canonical asset paths and rejects sibling and traversal paths', () => {
  const dir = resolve('test-projects'),
    projects = [{ id: 'one', files: [{ path: resolve('raw', 'clip.mp4') }] }],
    projectDir = (id) => join(dir, id);
  assert.equal(
    mediaAllowed(
      join(projectDir('one'), 'stems', 'voice.wav'),
      projects,
      projectDir,
    ),
    true,
  );
  assert.equal(
    mediaAllowed(
      resolve('raw', 'clip.mp4').replaceAll('\\', '/'),
      projects,
      projectDir,
    ),
    true,
  );
  assert.equal(
    mediaAllowed(join(dir, 'one-sibling', 'private.wav'), projects, projectDir),
    false,
  );
  assert.equal(
    mediaAllowed(
      join(projectDir('one'), '..', 'private.wav'),
      projects,
      projectDir,
    ),
    false,
  );
});
test('every Studio patch type round-trips through the IPC registration used by main', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'kimo-studio-ipc-'));
  try {
    let edl = studioFixture();
    const path = join(dir, 'edit.edl.json');
    await writeFile(path, JSON.stringify(edl));
    const p = { id: 'p1', edlFile: path, status: 'done' },
      handlers = new Map();
    let pumped = 0;
    let parentWindow;
    registerStudioIpc({
      ipcMain: { handle: (key, fn) => handlers.set(key, fn) },
      library: [p],
      projectDir: () => dir,
      update: () => {},
      pump: () => pumped++,
      getWindow: () => parentWindow,
      dialog: {
        showOpenDialog: async (parent) => {
          assert.equal(parent, parentWindow);
          return { filePaths: ['picked.wav'] };
        },
      },
      probe: async () => ({ kind: 'audio', path: 'picked.wav' }),
    });
    parentWindow = { id: 'window-created-after-handler-registration' };
    assert.equal(
      (await handlers.get('studio:pick-music')()).path,
      'picked.wav',
    );
    assert.equal((await handlers.get('studio:catalog')()).templates.length, 9);
    const caption = edl.overlays.find((o) => o.kind === 'caption_word_group'),
      clip = edl.video[0].clips[0];
    const commands = [
      { type: 'edit', energy: 4, pause: 0.2 },
      {
        type: 'captions',
        style: 'ali-abdaal',
        size: 0.8,
        position: 'top',
        accent: 'cream',
      },
      { type: 'music', track: 'warm-notebook', enabled: true },
      { type: 'levels', voice: -1, music: -4, sfx: -6 },
      { type: 'track', track: 'SFX', muted: true, solo: false, hidden: false },
      { type: 'camera', clip_id: clip.id, index: 0, framing: 'medium' },
      { type: 'caption', clip_id: caption.id, text: 'A clear idea' },
      { type: 'caption', clip_id: caption.id, word: 0, accent: true },
      { type: 'caption', clip_id: caption.id, style: 'mkbhd' },
      { type: 'look', look: 'clean', strength: 0.5 },
      { type: 'block', clip_id: caption.id, action: 'duplicate' },
      { type: 'block', clip_id: caption.id, action: 'move', at: 0.2 },
      { type: 'restore', index: 0 },
      { type: 'template', id: 'youtube-talking' },
    ];
    for (const patch of commands) {
      p.status = 'done';
      await handlers.get('studio:patch')(null, { id: 'p1', patch });
      assert.ok(p.job?.edl, patch.type);
      edl = p.job.edl;
      assert.equal(validate(edl).edl_version, 1);
      assert.equal(p.edl.edl_version, 1);
      await writeFile(path, JSON.stringify(edl));
      await writeFile(
        join(dir, 'studio-history.json'),
        JSON.stringify(p.job.studioHistory),
      );
    }
    p.status = 'done';
    await handlers.get('studio:patch')(null, {
      id: 'p1',
      patch: { type: 'undo' },
    });
    assert.ok(
      p.job.studioHistory.cursor < p.job.studioHistory.entries.length - 1,
    );
    await writeFile(
      join(dir, 'studio-history.json'),
      JSON.stringify(p.job.studioHistory),
    );
    await writeFile(path, JSON.stringify(p.job.edl));
    p.status = 'done';
    await handlers.get('studio:patch')(null, {
      id: 'p1',
      patch: { type: 'redo' },
    });
    assert.equal(
      p.job.studioHistory.cursor,
      p.job.studioHistory.entries.length - 1,
    );
    assert.equal(pumped, commands.length + 2);
    p.status = 'done';
    await handlers.get('studio:patch')(null, {
      id: 'p1',
      patch: { type: 'regenerate', part: 'new hook' },
    });
    assert.equal(p.job.needsAi, true);
    assert.equal(p.job.studioAppend, true);
    assert.equal(p.job.mode, 'followup');
    assert.ok(p.job.studioHistory.entries.length > 1);
    p.status = 'done';
    await handlers.get('studio:patch')(null, {
      id: 'p1',
      patch: { type: 'regenerate', part: 'new b-roll picks' },
    });
    assert.match(p.job.note, /new b-roll picks/);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});
test('Studio rejects unknown fields, unsafe ranges and invalid operations atomically', () => {
  const edl = studioFixture(),
    before = JSON.stringify(edl),
    c = edl.video[0].clips[0];
  for (const p of [
    { type: 'edit', energy: 8 },
    { type: 'edit', pause: -1 },
    { type: 'captions', style: 'unknown' },
    { type: 'captions', accent: 'purple' },
    { type: 'levels', voice: 99, music: 0, sfx: 0 },
    { type: 'track', track: '__proto__', hidden: true },
    { type: 'camera', clip_id: c.id, index: 0, time: 999 },
    { type: 'music', track: 'https://external.invalid/a' },
    { type: 'template', id: 'unknown' },
    { type: 'block', clip_id: c.id, action: 'duplicate' },
    { type: 'edit', energy: 3, command: 'ffmpeg' },
  ])
    assert.throws(() => applyStudioPatch(edl, p));
  assert.equal(JSON.stringify(edl), before);
  assert.throws(() => cleanCreatorOptions({ length: 13 }));
});
test('seven tracks, masks, caption edits and stem gains select minimal dependencies', () => {
  const edl = studioFixture(),
    base = renderKeys(edl);
  assert.deepEqual(
    studioTracks(publicEdl(edl)).map((t) => t.id),
    ['V1', 'BROLL', 'GFX', 'CAP', 'VOICE', 'MUSIC', 'SFX'],
  );
  const cap = edl.overlays.find((o) => o.kind === 'caption_word_group');
  const caption = renderKeys(
    applyStudioPatch(edl, {
      type: 'caption',
      clip_id: cap.id,
      word: 0,
      accent: true,
    }),
  );
  assert.equal(caption.base, base.base);
  assert.notEqual(caption.picture, base.picture);
  assert.equal(caption.audio, base.audio);
  const gain = renderKeys(
    applyStudioPatch(edl, { type: 'levels', voice: -1, music: -4, sfx: -6 }),
  );
  assert.equal(gain.picture, base.picture);
  assert.equal(gain.stems, base.stems);
  assert.notEqual(gain.audio, base.audio);
  const hidden = applyStudioPatch(edl, {
    type: 'track',
    track: 'CAP',
    hidden: true,
  });
  assert.ok(
    !visibleStudioEdl(hidden).overlays.some(
      (o) => o.kind === 'caption_word_group',
    ),
  );
  const first = studioHistory(edl, null, { type: 'edit', energy: 4 }),
    undo = studioHistory(first.edl, first.history, { type: 'undo' }),
    redo = studioHistory(undo.edl, undo.history, { type: 'redo' });
  assert.deepEqual(redo.edl, first.edl);
});
test(
  'actual tiny edit streams a base frame and remixes stems while preserving encoded picture',
  { timeout: 120000 },
  async () => {
    const dir = await mkdtemp(join(tmpdir(), 'studio-remix-')),
      tools = toolPaths(),
      events = [];
    try {
      const input = join(dir, 'tiny.mkv');
      await command(tools.ffmpeg, [
        '-f',
        'lavfi',
        '-i',
        'testsrc2=size=192x128:rate=25:duration=1.2',
        '-f',
        'lavfi',
        '-i',
        'sine=frequency=180:sample_rate=48000:duration=1.2',
        '-c:v',
        'ffv1',
        '-c:a',
        'pcm_s16le',
        input,
      ]);
      const f = await probe(tools.ffprobe, input),
        deps = {
          P: { width: 192, height: 128 },
          probe,
          youtubeMaster,
          canvasFps,
          ask: async (kind, text) =>
            kind === 'critic'
              ? { problems: [] }
              : defaultPlan(
                  JSON.parse(
                    text.split('INPUT_JSON\n')[1].split('\nSCHEMA_JSON')[0],
                  ),
                ),
        },
        options = {
          files: [f],
          dir: join(dir, 'project'),
          style: 'youtube-talking',
          mode: 'ai',
          env: { KIMO_FONTS: tools.env.KIMO_FONTS },
          ffmpeg: tools.ffmpeg,
          ffprobe: tools.ffprobe,
          emit: (e) => events.push(e),
        };
      const first = await runCreatorEdit(options, deps);
      assert.ok(
        events.some(
          (e) =>
            e.t === 'preview' &&
            e.after === 'base composite' &&
            e.image.startsWith('data:image/jpeg;base64,'),
        ),
        'actual compositor preview, not a fabricated progress frame',
      );
      const videoHash = async (path) =>
        (
          await command(tools.ffmpeg, [
            '-v',
            'error',
            '-i',
            path,
            '-map',
            '0:v:0',
            '-c',
            'copy',
            '-f',
            'hash',
            '-hash',
            'sha256',
            '-',
          ])
        ).stdout.toString();
      const original = await videoHash(first.output);
      const edl = JSON.parse(await readFile(first.edlFile, 'utf8')),
        changed = applyStudioPatch(edl, {
          type: 'levels',
          voice: -2,
          music: -5,
          sfx: -7,
        }),
        result = await runCreatorEdit(
          { ...options, mode: 'manual', edl: changed },
          deps,
        );
      assert.deepEqual(result.creator.passes, ['remix']);
      assert.equal(
        await videoHash(result.output),
        original,
        'audio update copies the encoded video exactly',
      );
      assert.equal(result.quality.final.acodec, 'aac');
      assert.ok(result.stems.voice.endsWith('voice.wav'));
      const actualAac = await measureLoudness(tools.ffmpeg, result.output);
      assert.equal(
        result.quality.final.truePeak,
        Number(actualAac.input_tp),
        'quality reports encoded AAC, not the preceding WAV',
      );
      const checkpointPath = join(options.dir, 'checkpoint.json'),
        checkpoint = JSON.parse(await readFile(checkpointPath, 'utf8'));
      checkpoint.stage = 'compiled';
      await writeFile(checkpointPath, JSON.stringify(checkpoint));
      await writeFile(
        join(options.dir, `creator-budget-${checkpoint.edit}.json`),
        JSON.stringify({
          text: 3,
          vision: 2,
          reserved_usd: 0.09,
          requests: [],
        }),
      );
      const resumed = await runCreatorEdit(options, {
        ...deps,
        ask: async () => {
          throw Error('resume must not reset its spent request allowance');
        },
      });
      assert.equal(resumed.creator.source, 'resumed');
      assert.equal(resumed.creator.budget.reserved_usd, 0.09);
      assert.equal(resumed.creator.budget.text, 3);
      assert.deepEqual(resumed.creator.passes, []);
      // A crash after planning but before compilation must keep the SAME edit
      // allowance and reuse the finished transcript/plan, not an older EDL.
      const staged = {
        ...checkpoint,
        stage: 'plan',
        edl: undefined,
        stage_data: {
          clips: checkpoint.edl.creator_clips,
          context: checkpoint.edl.creator_context,
          plan: checkpoint.edl.creator_plan,
          heads: checkpoint.edl.camera_plan?.heads,
          screens: checkpoint.edl.camera_plan?.screenRegions,
        },
      };
      await writeFile(checkpointPath, JSON.stringify(staged));
      const earlyResume = await runCreatorEdit(options, {
        ...deps,
        transcribe: async () => {
          throw Error('finished transcript must be reused');
        },
        ask: async () => {
          throw Error('finished plan must be reused');
        },
      });
      assert.equal(earlyResume.creator.source, 'resumed');
      assert.equal(earlyResume.creator.budget.reserved_usd, 0.09);
      assert.equal(earlyResume.creator.budget.text, 3);
      assert.equal(
        JSON.parse(await readFile(checkpointPath, 'utf8')).edit,
        checkpoint.edit,
      );
      const full = JSON.parse(await readFile(resumed.edlFile, 'utf8'));
      full.canvas.w = 960;
      full.canvas.h = 640;
      const draft = await runCreatorEdit(
        { ...options, mode: 'manual', edl: full, preview: true },
        { ...deps, P: { width: 960, height: 640 } },
      );
      assert.equal(draft.preview, true);
      assert.equal(draft.quality.final.width, 810);
      assert.equal(draft.quality.final.height, 540);
      assert.equal(
        JSON.parse(await readFile(draft.edlFile, 'utf8')).canvas.w,
        960,
        'preview keeps full-resolution edit decisions',
      );
      assert.ok(draft.stems.voice.includes('preview'));
    } finally {
      await rm(dir, {
        recursive: true,
        force: true,
        maxRetries: 10,
        retryDelay: 200,
      });
    }
  },
);
test('bundled template loops retain verified provenance and stay within the three-second / 400 KB contract', async () => {
  const data = JSON.parse(
      await readFile(
        new URL('../data/creator-previews.json', import.meta.url),
        'utf8',
      ),
    ),
    tools = toolPaths();
  assert.equal(
    data.source_sha256,
    'cf880aa9a077c7e96ec521439834895ba656969ad3cb05ba0830b1bf5b0b74ed',
  );
  assert.equal(data.license, 'CC BY 3.0');
  assert.equal(
    data.clips.filter((c) => !c.id.startsWith('caption-')).length,
    9,
  );
  for (const c of data.clips) {
    const path = fileURLToPath(
        new URL(
          `../renderer/src/creator-previews/${c.id}.webm`,
          import.meta.url,
        ),
      ),
      s = await stat(path),
      m = await probe(tools.ffprobe, path);
    assert.equal(s.size, c.bytes);
    assert.ok(s.size <= 400000);
    assert.equal(m.duration, 3);
    assert.equal(m.fps, 12);
  }
});
