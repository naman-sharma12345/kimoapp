import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm, readFile, writeFile, mkdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  getTemplate,
  TEMPLATE_IDS,
  selectTemplate,
} from '../planner/templates.mjs';
import { defaultPlan, planEdit, PlanCalls, EditBudget } from '../planner.mjs';
import { validatePlan } from '../planner/validate.mjs';
import {
  applyPlanPatches,
  localFollowup,
  affectedPasses,
} from '../planner/patch.mjs';
import { compilePlan, plannerContext } from '../planner/compile.mjs';
import { renderKeys } from '../planner/render.mjs';
import { criticResponse, reviewTimes } from '../critic.mjs';
import { undoPlanState } from '../creator-engine.mjs';
import { buildTranscript, analyzeAudio } from '../transcript.mjs';
import { runCreatorEdit } from '../creator-engine.mjs';
import { probe, youtubeMaster, canvasFps } from '../engine.mjs';
import { command } from './bench/io.mjs';
import { toolPaths } from './bench/run.mjs';
import { duration, frameCount } from '../edl.mjs';
const P = { width: 192, height: 128 },
  files = [
    {
      path: 'C:/synthetic/clip.mkv',
      kind: 'video',
      width: 192,
      height: 128,
      duration: 3,
      fps: 25,
      audio: true,
    },
  ];
const words = [
  { w: 'Useful', start: 0.2, end: 0.45 },
  { w: 'result.', start: 0.5, end: 0.8 },
  { w: 'Pricing', start: 1.8, end: 2 },
  { w: 'is', start: 2.1, end: 2.3 },
  { w: 'clear.', start: 2.4, end: 2.8 },
];
function fixture(id = 'youtube-talking') {
  const samples = Float32Array.from({ length: 48000 }, (_, i) =>
    words.some((w) => i / 16000 >= w.start && i / 16000 <= w.end)
      ? 0.25 * Math.sin(i * 0.1)
      : 0,
  );
  const transcript = buildTranscript({
    words,
    whisperLang: 'en',
    src: 'f0',
    hash: 'synthetic',
    analysis: analyzeAudio(samples),
  });
  const clips = [
    { src: 'f0', file: files[0], duration: 3, kind: 'speech', transcript },
  ];
  const context = plannerContext({
    template: getTemplate(id),
    files,
    clips,
    P,
  });
  return { context, plan: defaultPlan(context), clips, files, P, fps: 25 };
}
test('nine complete templates compile into validated EDLs with legacy aliases', () => {
  assert.equal(TEMPLATE_IDS.length, 9);
  assert.equal(selectTemplate('energetic', P).id, 'shorts-punchy');
  for (const id of TEMPLATE_IDS) {
    const f = fixture(id);
    assert.deepEqual(validatePlan(f.plan, f.context), { ok: true, errors: [] });
    const { edl } = compilePlan(f);
    assert.equal(edl.creator_template, id);
    assert.equal(edl.color_finish.look, f.context.template.color.look);
    assert.equal(
      edl.sound.music_envelope.under_db,
      f.context.template.audio.music_under_db,
    );
    assert.equal(edl.camera_report.energy, f.context.template.camera.energy);
  }
});

test('Windows transcript paths survive saved-EDL preview recompilation across five sources', () => {
  const f = fixture('documentary');
  f.context.template.duration.max_s = null;
  f.files = Array.from({ length: 5 }, (_, i) => ({
    ...files[0],
    path: `C:\\Users\\editor\\lesson clips\\पाठ ${i + 1}.mkv`,
  }));
  f.clips = f.files.map((file, i) => ({
    ...structuredClone(f.clips[0]),
    src: `f${i}`,
    file,
  }));
  f.context = plannerContext({
    template: f.context.template,
    files: f.files,
    clips: f.clips,
    P,
  });
  f.plan = defaultPlan(f.context);
  const before = JSON.stringify(f.clips);
  const original = compilePlan(f).edl;
  const normalizedFiles = original.sources.map((s) => ({
    path: s.path,
    kind: s.kind,
    width: s.w,
    height: s.h,
    duration: s.duration,
    fps: s.fps,
    audio: s.audio,
  }));
  const resumed = compilePlan({
    ...f,
    files: normalizedFiles,
    clips: original.creator_clips,
    previous: original,
  }).edl;
  assert.equal(
    JSON.stringify(f.clips),
    before,
    'Original transcript paths remain unchanged',
  );
  assert(frameCount(resumed) > 0);
  assert.equal(duration(resumed), duration(original));
  assert.deepEqual(
    resumed.video.map((t) => t.clips.map((c) => [c.src, c.at, c.in, c.out])),
    original.video.map((t) => t.clips.map((c) => [c.src, c.at, c.in, c.out])),
  );
  assert.equal(
    new Set(resumed.video.flatMap((t) => t.clips.map((c) => c.src))).size,
    5,
  );
  assert(
    plannerContext({
      ...f,
      files: normalizedFiles,
      template: f.context.template,
    }).clips.every((c) => c.type === 'speech'),
  );
});

test('missing selected media fails before emitting a nonexistent s0 source', () => {
  const f = fixture();
  assert.throws(
    () => compilePlan({ ...f, files: [{ ...files[0], path: 'C:/other.mkv' }] }),
    /selected clip is missing/,
  );
});
test('validator rejects invented fields, nonexistent anchors, numbers, empty story and invalid ranges', () => {
  const { plan, context } = fixture();
  for (const mutate of [
    (p) => (p.ffmpeg = 'rm'),
    (p) => p.story.order.push(99),
    (p) => p.graphics.push({ kind: 'stat', text: '9000' }),
    (p) =>
      p.camera.overrides.push({ range: [2, 1], framing: 'wide', why: 'bad' }),
    (p) =>
      (p.story.drop = context.sentences.map((s) => ({
        sentence: s.i,
        why: 'all',
      }))),
  ]) {
    const p = structuredClone(plan);
    mutate(p);
    assert.equal(validatePlan(p, context).ok, false);
  }
});
test('repair once, then deterministic fallback; proxy failures do not retry', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'creator-validation-'));
  try {
    const { plan, context } = fixture();
    let n = 0;
    const calls = new PlanCalls({
      cacheDir: dir,
      ask: async () => (++n === 1 ? { invalid: true } : plan),
    });
    assert.equal((await planEdit(context, calls)).source, 'repaired');
    assert.equal(n, 2);
    const bad = new PlanCalls({
      cacheDir: join(dir, 'bad'),
      ask: async () => ({ bad: true }),
    });
    assert.equal((await planEdit(context, bad)).source, 'fallback');
    assert.equal(bad.budget.text, 2);
    let attempts = 0;
    const unavailable = new PlanCalls({
      cacheDir: join(dir, 'error'),
      ask: async () => {
        attempts++;
        throw new Error('unavailable');
      },
    });
    assert.equal((await planEdit(context, unavailable)).source, 'fallback');
    assert.equal(attempts, 1);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});
test('call caps, timeout and durable reservations survive errors; cache replay is network free', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'creator-calls-'));
  let saved;
  try {
    const budget = new EditBudget();
    budget.reserve('plan', [{}], 'a');
    budget.reserve('critic', [{}], 'b');
    assert.throws(() => budget.reserve('critic', [{}], 'c'), /cap/);
    assert.equal(budget.vision, 2);
    const calls = new PlanCalls({
      cacheDir: dir,
      timeout: 15,
      onBudget: async (b) => {
        saved = structuredClone(b);
      },
      ask: async () => new Promise(() => {}),
    });
    await assert.rejects(calls.call('timeout', 'x'), /60 seconds/);
    assert.equal(saved.text, 1);
    assert.equal(saved.requests[0].status, 'failed/reserved');
    const recorded = new PlanCalls({
      cacheDir: dir,
      ask: async () => ({ ok: true }),
    });
    await recorded.call('fixture', 'record me');
    const replay = new PlanCalls({
      cacheDir: dir,
      replay: true,
      ask: async () => assert.fail('network used'),
    });
    assert.deepEqual(await replay.call('fixture', 'record me'), { ok: true });
    await assert.rejects(replay.call('fixture', 'missing'), /cache miss/);
    assert.equal(replay.budget.reserved_usd, 0);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});
test('follow-up patches are atomic and select only the affected render dependencies', () => {
  const f = fixture(),
    edl = compilePlan(f).edl,
    base = renderKeys(edl);
  for (const [text, pass] of [
    ['make captions smaller', 'overlay'],
    ['no music', 'audio'],
    ['more zooms', 'full'],
    ['cut the part about pricing', 'full'],
  ]) {
    const patches = localFollowup(text, f.plan, f.context);
    assert.equal(affectedPasses(patches), pass);
    const plan = applyPlanPatches(f.plan, patches, f.context);
    const next = renderKeys(compilePlan({ ...f, plan }).edl);
    if (pass === 'overlay') {
      assert.equal(next.base, base.base);
      assert.equal(next.audio, base.audio);
      assert.notEqual(next.picture, base.picture);
    }
    if (pass === 'audio') {
      assert.equal(next.base, base.base);
      assert.equal(next.picture, base.picture);
      assert.notEqual(next.audio, base.audio);
    }
  }
  assert.throws(
    () =>
      applyPlanPatches(
        f.plan,
        [{ op: 'replace', path: '/story/__proto__/x', value: 1 }],
        f.context,
      ),
    /editable/,
  );
  assert.throws(() =>
    applyPlanPatches(
      f.plan,
      [
        { op: 'replace', path: '/music/enabled', value: false },
        { op: 'replace', path: '/camera/energy', value: 99 },
      ],
      f.context,
    ),
  );
  assert.equal(f.plan.music.enabled, true);
});
test('critic patches are bounded and history undo preserves the previous plan', async () => {
  const f = fixture();
  assert.throws(
    () => criticResponse({ problems: Array(6).fill({}) }, f.plan, f.context),
    /five/,
  );
  const r = criticResponse(
    {
      problems: [
        {
          severity: 'high',
          at: 0.5,
          message: 'caption too large',
          patches: [
            { op: 'replace', path: '/captions/font_scale', value: 0.8 },
          ],
        },
      ],
    },
    f.plan,
    f.context,
  );
  assert.equal(r.pass, 'overlay');
  assert.equal(r.plan.captions.font_scale, 0.8);
  const edl = compilePlan(f).edl,
    times = reviewTimes(edl);
  assert.ok(times.length >= 12 && times.length <= 16);
  assert.equal(times[0], 0);
  const dir = await mkdtemp(join(tmpdir(), 'creator-undo-'));
  try {
    await writeFile(
      join(dir, 'plan-history.json'),
      JSON.stringify([{ edl }, { edl: { ...edl, creator_plan: r.plan } }]),
    );
    const undo = undoPlanState(dir);
    assert.deepEqual(undo.edl.creator_plan, f.plan);
    assert.equal(undo.history.length, 1);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});
test('all six golden IDs replay labelled synthetic planner fixtures with network disabled', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'creator-golden-replay-'));
  const golden = ['TH-1', 'TH-2', 'TUT-1', 'VLOG-1', 'POD-1', 'MUSIC-1'];
  try {
    for (const [i, id] of golden.entries()) {
      const f = fixture(
        [
          'shorts-punchy',
          'shorts-clean',
          'tutorial',
          'youtube-vlog',
          'podcast-clips',
          'music-montage',
        ][i],
      );
      f.context.note = `SYNTHETIC contract fixture for ${id}; not recorded footage or benchmark evidence.`;
      const record = new PlanCalls({
        cacheDir: join(dir, id),
        ask: async () => f.plan,
      });
      await planEdit(f.context, record);
      const replay = new PlanCalls({
        cacheDir: join(dir, id),
        replay: true,
        ask: async () => assert.fail('network fallback'),
      });
      const result = await planEdit(f.context, replay);
      assert.equal(result.source, 'model');
      assert.deepEqual(
        compilePlan({ ...f, plan: result.plan }).edl.creator_plan,
        f.plan,
      );
      assert.equal(replay.budget.text, 0);
    }
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});
test(
  'tiny real render: creator plan, critic frames, overlay-only edit, audio-only edit and undo',
  { timeout: 150000 },
  async () => {
    const dir = await mkdtemp(join(tmpdir(), 'creator-smoke-')),
      tools = toolPaths();
    let requests = 0;
    try {
      const input = join(dir, 'fixture.mkv');
      await command(tools.ffmpeg, [
        '-v',
        'error',
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
      const file = await probe(tools.ffprobe, input),
        samples = Float32Array.from(
          { length: 19200 },
          (_, i) => 0.1 * Math.sin(i * 0.1),
        );
      const transcript = buildTranscript({
        words: words.slice(0, 2),
        whisperLang: 'en',
        src: 'f0',
        hash: 'smoke',
        analysis: analyzeAudio(samples),
      });
      const ask = async (kind, text) => {
        requests++;
        if (kind === 'critic') return { problems: [] };
        const context = JSON.parse(
          text.split('INPUT_JSON\n')[1].split('\nSCHEMA_JSON')[0],
        );
        return defaultPlan(context);
      };
      const options = {
        files: [file],
        dir: join(dir, 'project'),
        preset: 'fixture',
        style: 'shorts-clean',
        mode: 'ai',
        env: { ...tools.env, KIMO_CACHE_DIR: join(dir, 'cache') },
        ffmpeg: tools.ffmpeg,
        ffprobe: tools.ffprobe,
        emit: () => {},
        transcribe: async () => transcript,
      };
      const deps = { ask, P, probe, youtubeMaster, canvasFps };
      const first = await runCreatorEdit(options, deps);
      assert.equal(first.creator.source, 'model');
      assert.equal(requests, 2);
      assert.equal(first.quality.final.acodec, 'aac');
      assert.equal(first.quality.final.arate, 48000);
      assert.equal(first.quality.final.achannels, 2);
      assert.ok(first.creator.transitions[0].sheet);
      assert.equal(
        first.creator.accepted,
        false,
        'missing pixel measurements do not pass acceptance',
      );
      const smaller = await runCreatorEdit(
        { ...options, mode: 'followup', note: 'make captions smaller' },
        deps,
      );
      assert.deepEqual(smaller.creator.passes, ['overlay']);
      assert.equal(requests, 2);
      assert.ok(smaller.beforeOutput);
      const quiet = await runCreatorEdit(
        { ...options, mode: 'followup', note: 'no music' },
        deps,
      );
      assert.deepEqual(quiet.creator.passes, ['audio']);
      assert.equal(requests, 2);
      const undo = undoPlanState(options.dir);
      const restored = await runCreatorEdit(
        { ...options, mode: 'manual', edl: undo.edl, creatorUndo: true },
        deps,
      );
      assert.equal(restored.creator.undoDepth, 1);
      assert.deepEqual(restored.creator.passes, ['audio']);
      assert.equal(requests, 2);
      const preview = await runCreatorEdit(
        { ...options, mode: 'manual', preview: true },
        deps,
      );
      assert.equal(preview.preview, true);
      assert(preview.duration > 0);
      assert(preview.output.endsWith('preview.mp4'));
      assert.equal(requests, 2, 'Saved preview makes no extra model requests');
      if (process.env.KIMO_PLANNER_SMOKE_EVIDENCE) {
        const { copyFile } = await import('node:fs/promises');
        await mkdir(process.env.KIMO_PLANNER_SMOKE_EVIDENCE, {
          recursive: true,
        });
        await copyFile(
          first.creator.transitions[0].sheet,
          join(process.env.KIMO_PLANNER_SMOKE_EVIDENCE, 'contact.jpg'),
        );
        await writeFile(
          join(process.env.KIMO_PLANNER_SMOKE_EVIDENCE, 'smoke.json'),
          JSON.stringify(
            {
              first: first.creator,
              smaller: smaller.creator,
              quiet: quiet.creator,
              restored: restored.creator,
              quality: first.quality,
            },
            null,
            2,
          ),
        );
      }
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
