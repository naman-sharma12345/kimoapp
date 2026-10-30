import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { runEdit, PRESETS, probe } from '../engine.mjs';
import { command } from './bench/io.mjs';
import { toolPaths } from './bench/run.mjs';
const tools = toolPaths();
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
      let saved;
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
          ffmpeg: tools.ffmpeg,
          ffprobe: tools.ffprobe,
          emit: (e) => events.push(e),
        });
        saved = result.projectFile;
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
      await rm(dir, { recursive: true, force: true });
    }
  },
);
