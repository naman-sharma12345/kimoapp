import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { runEdit, PRESETS, probe } from '../engine.mjs';
import { command } from './bench/io.mjs';
import { toolPaths } from './bench/run.mjs';
import { applyEdits } from '../edl.mjs';
// Phase 7 lockdown: AI calls need an owner token or the user's own key; the
// upstream is mocked here, so a run-time test token stands in for the sign-in.
process.env.KIMO_DESKTOP_TOKEN = 'kd1.test.test';
const tools = toolPaths();
test('legacy picture rendering cannot be enabled from a normal app call', async () => {
  const previous = process.env.KIMO_BENCH_LEGACY;
  delete process.env.KIMO_BENCH_LEGACY;
  try {
    await assert.rejects(
      runEdit({ legacy_kimo_render: true }),
      /restricted to explicit benchmark/,
    );
  } finally {
    if (previous != null) process.env.KIMO_BENCH_LEGACY = previous;
  }
});
test(
  'all runEdit modes use the app compositor and persist an editable EDL',
  { timeout: 180000 },
  async () => {
    const dir = await mkdtemp(join(tmpdir(), 'kimo-pipeline-'));
    const original = globalThis.fetch;
    let aiCalls = 0;
    globalThis.fetch = async (_url, init) => {
      aiCalls++;
      const body = JSON.parse(init.body);
      return Response.json({
        record:
          body.kind === 'build'
            ? { done: true, calls: [{ tool: 'lint_edit', args: {} }] }
            : { verdict: 'clean', calls: [], faults: [] },
      });
    };
    PRESETS.fixture = {
      width: 192,
      height: 128,
      mbps: 2,
      label: 'synthetic fixture',
    };
    try {
      const input = join(dir, 'source.mkv');
      await command(tools.ffmpeg, [
        '-v',
        'error',
        '-y',
        '-f',
        'lavfi',
        '-i',
        'testsrc2=size=192x128:rate=25:duration=1',
        '-f',
        'lavfi',
        '-i',
        'sine=frequency=1000:sample_rate=48000:duration=1',
        '-c:v',
        'ffv1',
        '-c:a',
        'pcm_s16le',
        '-shortest',
        input,
      ]);
      const file = await probe(tools.ffprobe, input);
      let saved, savedEdl;
      for (const mode of ['captions', 'ai', 'manual', 'followup', 'sam']) {
        const runDir = join(dir, mode),
          log = join(dir, mode + '-tools.jsonl'),
          events = [];
        const result = await runEdit({
          bin: [
            process.execPath,
            fileURLToPath(new URL('./fixtures/planner.mjs', import.meta.url)),
          ],
          env: { ...tools.env, KIMO_TEST_SOURCE: input, KIMO_TEST_LOG: log },
          dir: runDir,
          files: [file],
          preset: 'fixture',
          mode,
          projectFile: saved,
          edl:
            mode === 'manual'
              ? applyEdits(JSON.parse(await readFile(savedEdl, 'utf8')), [
                  {
                    tool: 'trim_clip',
                    args: { clip_id: 'clip1', duration: 0.8 },
                  },
                ])
              : undefined,
          ffmpeg: tools.ffmpeg,
          ffprobe: tools.ffprobe,
          emit: (e) => events.push(e),
        });
        saved = result.projectFile;
        savedEdl = result.edlFile;
        if (mode === 'manual')
          assert.equal(
            result.edl.video[0].clips[0].out,
            0.8,
            'manual EDL is the render source of truth',
          );
        assert.equal(result.edl.edl_version, 1, mode);
        assert.ok(result.timeline.edl, mode);
        assert.ok(
          events.some((e) => e.tool === 'compose' && e.phase === 'end' && e.ok),
          mode,
        );
        const calls = (await readFile(log, 'utf8'))
          .trim()
          .split('\n')
          .map(JSON.parse);
        assert.ok(
          !calls.some((c) =>
            ['export', 'render_frame', 'contact_sheet', 'lint_edit'].includes(
              c.name,
            ),
          ),
          mode + ' touched the engine picture renderer',
        );
        assert.equal(
          JSON.parse(await readFile(result.edlFile)).video[0].clips[0].src,
          's1',
        );
      }
      assert.ok(
        aiCalls > 0,
        'fixture exercises the real AI branches with local responses',
      );
    } finally {
      globalThis.fetch = original;
      delete PRESETS.fixture;
      await rm(dir, { recursive: true, force: true, maxRetries: 10, retryDelay: 250 });
    }
  },
);
test(
  'the transcript cut plan becomes the composed EDL (captions offline, AI cold open)',
  { timeout: 180000 },
  async () => {
    const { analyzeAudio, buildTranscript, extractSpeechWav, wavSamples } = await import('../transcript.mjs');
    const dir = await mkdtemp(join(tmpdir(), 'kimo-cutplan-'));
    const original = globalThis.fetch;
    const asked = [];
    globalThis.fetch = async (_url, init) => {
      const body = JSON.parse(init.body);
      asked.push(body.text.slice(0, 40));
      if (body.text.startsWith('JUDGMENT TASK'))
        return Response.json({ record: { done: true, calls: [], judgment: { hook: { sentence: 1, trim_words: [0, 0], hook_text: 'again' }, order: [1, 0] } } });
      return Response.json({
        record: body.kind === 'build' ? { done: true, calls: [{ tool: 'auto_rough_cut', args: {} }, { tool: 'lint_edit', args: {} }] } : { verdict: 'clean', calls: [], faults: [] },
      });
    };
    PRESETS.fixture = { width: 192, height: 128, mbps: 2, label: 'synthetic fixture' };
    try {
      // speech-like tone bursts at the word times, silence elsewhere
      const input = join(dir, 'talk.mkv');
      await command(tools.ffmpeg, ['-v', 'error', '-y', '-f', 'lavfi', '-i', 'testsrc2=size=192x128:rate=25:duration=3', '-f', 'lavfi', '-i', "aevalsrc='0.3*sin(2*PI*180*t)*(between(t,0.2,0.8)+between(t,0.85,1.2)+between(t,2.2,2.8))':s=48000:d=3", '-c:v', 'ffv1', '-c:a', 'pcm_s16le', '-shortest', input]);
      const file = await probe(tools.ffprobe, input);
      const words = [
        { w: 'hello', start: 0.25, end: 0.75, conf: 0.9 },
        { w: 'world.', start: 0.88, end: 1.15, conf: 0.9 },
        { w: 'again.', start: 2.25, end: 2.75, conf: 0.9 },
      ];
      const transcribe = async ({ ffmpeg, input: path, src, workDir }) => {
        const { mkdirSync } = await import('node:fs');
        mkdirSync(workDir, { recursive: true });
        const { samples } = wavSamples(await readFile(await extractSpeechWav(ffmpeg, path, join(workDir, 'a.wav'))));
        return Object.defineProperty(buildTranscript({ words, whisperLang: 'en', analysis: analyzeAudio(samples), src, hash: 'fixture' }), 'samples', { value: samples });
      };
      for (const mode of ['captions', 'ai']) {
        const events = [];
        const log = join(dir, `${mode}-tools.jsonl`);
        const result = await runEdit({
          bin: [process.execPath, fileURLToPath(new URL('./fixtures/planner.mjs', import.meta.url))],
          env: { ...tools.env, KIMO_TEST_SOURCE: input, KIMO_TEST_LOG: log, KIMO_TEST_REAL_CLIPS: '1', KIMO_TEST_DURATION: '3', KIMO_CACHE_DIR: join(dir, 'cache') },
          dir: join(dir, mode),
          files: [file],
          preset: 'fixture',
          mode,
          transcribe,
          ffmpeg: tools.ffmpeg,
          ffprobe: tools.ffprobe,
          emit: (e) => events.push(e),
        });
        const edl = JSON.parse(await readFile(result.edlFile, 'utf8'));
        const aroll = edl.video.find((t) => t.clips.some((c) => c.id.startsWith('cut')));
        assert.ok(aroll, `${mode}: A-roll track in the EDL`);
        assert.equal(aroll.clips.length, 2, mode);
        assert.ok(edl.cut_plan?.keep?.length === 2, `${mode}: cut plan rides on the EDL`);
        // Phase 4: the A-roll camera comes from the app's camera director, never kimo's punch tools
        assert.ok(aroll.clips.every((c) => c.camera_by === 'director' && c.camera?.length), `${mode}: director camera keys`);
        assert.ok(edl.camera_plan && edl.camera_report?.shots >= 2, `${mode}: camera plan and report ride on the EDL`);
        assert.notEqual(aroll.clips[0].camera_framing[0], aroll.clips[1].camera_framing[0], `${mode}: framing changes at the jump cut`);
        assert.ok(result.cutPlan.summary.pauses >= 1, mode);
        assert.ok(result.duration < 2.3, `${mode}: ${result.duration}`);
        const ended = (tool) => {
          const start = events.find((e) => e.t === 'op' && e.tool === tool && e.phase === 'start');
          return events.find((e) => e.t === 'op' && e.phase === 'end' && (start ? e.id === start.id : e.tool === tool));
        };
        for (const tool of ['transcribe', 'cut_plan', 'apply_cut', 'camera_probe', 'camera_director', 'explain', 'compose']) assert.ok(ended(tool)?.ok, `${mode}: ${tool} op`);
        assert.ok(existsSync(join(dir, mode, 'ATTRIBUTIONS.txt')) || !edl.explain, `${mode}: credits beside the export`);
        assert.match(ended('cut_plan').result, /^removed \d+ pauses? \([\d.]+ s\)/);
        const calls = (await readFile(log, 'utf8')).trim().split('\n').map(JSON.parse);
        assert.ok(!calls.some((c) => c.name === 'auto_rough_cut'), `${mode}: the planner may not re-cut`);
        // Phase 5: kimo's own captions from the cut plan's words (no second whisper, no engine captions)
        const caps = edl.overlays.filter((o) => o.props?.engine === 'kimo-captions');
        assert.ok(caps.length >= 1 && edl.captions?.style, `${mode}: kimo caption chunks on the EDL`);
        assert.ok(caps.flatMap((o) => o.props.words.map((w) => w.w.toLowerCase().replace(/[^a-z]/g, ''))).sort().join(' ') === 'again hello world', `${mode}: caption words`);
        assert.ok(!calls.some((c) => c.name === 'auto_captions'), `${mode}: the engine's own captions are not used`);
        assert.ok(ended('captions')?.ok, `${mode}: captions op`);
        // Phase 6: the graphics plan rides on the EDL, restraint-checked
        assert.ok(edl.graphics?.version === 1 && edl.graphics.report.overlaps === 0, `${mode}: graphics plan on the EDL`);
        assert.ok(!calls.some((c) => c.name === 'place_broll'), `${mode}: b-roll is the app's`);
        if (mode === 'captions') {
          // Studio caption edit: re-renders the text pass over the cached base composite
          const edited = applyEdits(edl, [{ tool: 'edit_caption', args: { clip_id: caps[0].id, text: 'hi there' } }]);
          assert.equal(edited.overlays.find((o) => o.id === caps[0].id).props.text, 'hi there');
          const manualEvents = [];
          const again = await runEdit({
            bin: [process.execPath, fileURLToPath(new URL('./fixtures/planner.mjs', import.meta.url))],
            env: { ...tools.env, KIMO_TEST_SOURCE: input, KIMO_TEST_LOG: log, KIMO_TEST_REAL_CLIPS: '1', KIMO_TEST_DURATION: '3', KIMO_CACHE_DIR: join(dir, 'cache') },
            dir: join(dir, mode),
            files: [file],
            preset: 'fixture',
            mode: 'manual',
            projectFile: result.projectFile,
            edl: edited,
            ops: [{ tool: 'edit_caption', args: { clip_id: caps[0].id, text: 'hi there' } }],
            ffmpeg: tools.ffmpeg,
            ffprobe: tools.ffprobe,
            emit: (e) => manualEvents.push(e),
          });
          assert.ok(manualEvents.some((e) => e.t === 'op' && e.tool === 'caption_pass' && e.phase === 'end' && e.ok), 'caption edit reused the cached base composite');
          const saved = JSON.parse(await readFile(again.edlFile, 'utf8'));
          assert.equal(saved.overlays.find((o) => o.id === caps[0].id).props.text, 'hi there');
        }
        if (mode === 'captions') {
          // offline: no AI call at all; the forced punch frames the jump cut
          assert.equal(asked.length, 0);
          assert.equal(aroll.clips[0].in, 0.2);
          assert.ok(aroll.clips[1].camera[0].zoom >= 1.1 && aroll.clips[1].camera[0].y < 0.5, JSON.stringify(aroll.clips[1].camera[0]));
        } else {
          assert.ok(asked[0].startsWith('JUDGMENT TASK'));
          assert.equal(result.cutPlan.hook.text, 'again');
          assert.ok(aroll.clips[0].in > 2, 'cold open: the hook line plays first');
        }
      }
    } finally {
      globalThis.fetch = original;
      delete PRESETS.fixture;
      await rm(dir, { recursive: true, force: true, maxRetries: 10, retryDelay: 250 });
    }
  },
);
