import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  mkdtemp,
  mkdir,
  writeFile,
  readFile,
  readdir,
  rm,
} from 'node:fs/promises';
import { runInNewContext } from 'node:vm';
import { tmpdir, getPriority, constants } from 'node:os';
import { join } from 'node:path';
import { once } from 'node:events';
import {
  workerThreads,
  backgroundEnv,
  ffmpegArgs,
  spawnBackground,
  acquireExclusive,
} from '../../resources.cjs';
import { command } from './io.mjs';

test('analysis output is bounded and cancellation stops its worker', async () => {
  await assert.rejects(
    command(
      process.execPath,
      ['-e', 'process.stdout.write("x".repeat(10000));setTimeout(()=>{},5000)'],
      { maxBytes: 64 },
    ),
    /exceeded/,
  );
  const controller = new AbortController();
  const pending = command(process.execPath, ['-e', 'setTimeout(()=>{},5000)'], {
    signal: controller.signal,
  });
  controller.abort();
  await assert.rejects(pending, /abort/i);
});

test('desktop queue claims its slot before asynchronous engine loading', async () => {
  const source = await readFile(
    new URL('../../main.cjs', import.meta.url),
    'utf8',
  );
  const queue = source.slice(
    source.indexOf('let running = null;'),
    source.indexOf('function newProject('),
  );
  let loaded,
    loadCalls = 0,
    active = 0,
    maximum = 0,
    complete;
  const engineReady = new Promise((r) => {
    loaded = r;
  });
  const done = new Promise((r) => {
    complete = r;
  });
  const library = [1, 2].map((id) => ({
    id,
    status: 'queued',
    mode: 'captions',
    note: '',
    files: [],
  }));
  const engine = {
    runEdit: async () => {
      active++;
      maximum = Math.max(maximum, active);
      await new Promise((r) => setTimeout(r, 10));
      active--;
      return { output: 'test.mp4', duration: 1 };
    },
  };
  const context = {
    library,
    AbortController,
    loadEngine: () => {
      loadCalls++;
      return engineReady;
    },
    update: () => {
      if (library.every((p) => p.status === 'done')) complete();
    },
    projectDir: () => '.',
    paths: () => ({}),
    engineEnv: () => ({}),
    settings: () => ({}),
    saveSettings: () => {},
    send: () => {},
    log: () => {},
    LIVE_ONLY: new Set(),
    fs: { statSync: () => ({ size: 1000 }) },
  };
  runInNewContext(queue + '\nthis.runQueue=pump;', context);
  const first = context.runQueue();
  await context.runQueue();
  assert.equal(loadCalls, 1);
  loaded(engine);
  await first;
  await done;
  assert.equal(maximum, 1);
  assert.equal(library.filter((p) => p.status === 'done').length, 2);
});

test('worker pools reserve CPU headroom and respect smaller limits', () => {
  assert.equal(workerThreads({}, 1), 1);
  assert.equal(workerThreads({}, 2), 1);
  assert.equal(workerThreads({}, 4), 1);
  assert.equal(workerThreads({ KIMO_WORKER_THREADS: '32' }, 16), 2);
  assert.equal(workerThreads({ KIMO_WORKER_THREADS: '1' }, 16), 1);
  const env = backgroundEnv({
    KIMO_WORKER_THREADS: '1',
    RAYON_NUM_THREADS: '64',
    OPENBLAS_NUM_THREADS: '0',
    PATH: 'preserved',
  });
  assert.equal(env.RAYON_NUM_THREADS, '1');
  assert.equal(env.OPENBLAS_NUM_THREADS, '1');
  assert.equal(env.PATH, 'preserved');
});
test('all FFmpeg inputs, output and filters are bounded without altering quality flags', () => {
  const args = ffmpegArgs(
    'C:/bundled/ffmpeg.exe',
    [
      '-y',
      '-threads',
      '32',
      '-i',
      'a.mp4',
      '-i',
      'b.mp4',
      '-c:v',
      'libx264',
      '-preset',
      'slow',
      '-b:v',
      '12M',
      '-c:a',
      'aac',
      'out.mp4',
    ],
    { KIMO_WORKER_THREADS: '1' },
  );
  assert.deepEqual(args.slice(0, 4), [
    '-filter_threads',
    '1',
    '-filter_complex_threads',
    '1',
  ]);
  assert.equal(args.includes('32'), false);
  for (let i = 0; i < args.length; i++)
    if (args[i] === '-i')
      assert.deepEqual(args.slice(i - 2, i), ['-threads', '1']);
  assert.deepEqual(args.slice(-3), ['-threads', '1', 'out.mp4']);
  assert.ok(args.includes('12M'));
  assert.ok(args.includes('slow'));
  assert.ok(args.includes('aac'));
  assert.deepEqual(ffmpegArgs('ffprobe', ['-show_streams', 'in.mp4']), [
    '-show_streams',
    'in.mp4',
  ]);
});
test('actual worker process has background scheduling priority', async () => {
  const child = spawnBackground(
    process.execPath,
    ['-e', 'setTimeout(()=>{},500)'],
    { stdio: 'ignore' },
  );
  try {
    assert.ok(
      getPriority(child.pid) >= constants.priority.PRIORITY_BELOW_NORMAL,
    );
  } finally {
    child.kill();
    await once(child, 'close');
  }
});
test('exclusive jobs reject overlap, release safely and recover a killed owner', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'kimo-resource-test-'));
  try {
    const release = acquireExclusive('unit', dir);
    assert.throws(() => acquireExclusive('unit', dir), /already running/);
    const child = spawnBackground(
      process.execPath,
      [
        '--input-type=module',
        '-e',
        `import r from ${JSON.stringify(new URL('../../resources.cjs', import.meta.url).href)};try{r.acquireExclusive('unit',process.argv[1]);process.exitCode=2}catch{process.exitCode=0}`,
        dir,
      ],
      { stdio: 'ignore' },
    );
    assert.equal((await once(child, 'close'))[0], 0);
    release();
    release();
    const second = acquireExclusive('unit', dir);
    second();
    const lock = join(dir, 'kimo-unit.lock');
    await mkdir(lock);
    await writeFile(
      join(lock, '2147483647-00000000-0000-0000-0000-000000000000.json'),
      '{}',
    );
    const recovered = acquireExclusive('unit', dir);
    recovered();
    assert.deepEqual(await readdir(dir), []);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});
