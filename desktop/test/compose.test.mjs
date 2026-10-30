import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { existsSync } from 'node:fs';
import { command, filterPath, probeFile } from './bench/io.mjs';
import { compose, cameraRectsForClip } from '../compose.mjs';
import { rate, frameCount, framePlan } from '../edl.mjs';
import { toolPaths } from './bench/run.mjs';
import { youtubeMaster, measure } from '../engine.mjs';
const tools = toolPaths(),
  ffmpeg = process.env.KIMO_FFMPEG || tools.ffmpeg,
  ffprobe = process.env.KIMO_FFPROBE || tools.ffprobe;
const W = 192,
  H = 128,
  block = 8,
  left = 32,
  top = 60;
async function fixture(dir, fps) {
  const font = [
    join(tools.env.KIMO_FONTS, 'DejaVuSans.ttf'),
    join(process.env.WINDIR ?? 'C:/Windows', 'Fonts/arial.ttf'),
    '/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf',
  ].find(existsSync);
  const raw = await command(ffmpeg, [
    '-v',
    'error',
    '-f',
    'lavfi',
    '-i',
    `testsrc2=size=${W}x${H}:rate=${fps}`,
    '-t',
    '1.6',
    '-vf',
    `drawtext=fontfile='${filterPath(font)}':text='%{n}':fontsize=12:x=4:y=4`,
    '-pix_fmt',
    'rgb24',
    '-f',
    'rawvideo',
    'pipe:1',
  ]);
  const data = raw.stdout,
    size = W * H * 3;
  for (let f = 0; f < data.length / size; f++)
    for (let b = 0; b < 16; b++)
      for (let y = top; y < top + 8; y++)
        for (let x = left + b * block; x < left + (b + 1) * block; x++)
          data.fill(
            (f >> b) & 1 ? 255 : 0,
            f * size + (y * W + x) * 3,
            f * size + (y * W + x) * 3 + 3,
          );
  const input = join(dir, 'barcode.rgb'),
    path = join(dir, 'source.mkv');
  await writeFile(input, data);
  await command(ffmpeg, [
    '-v',
    'error',
    '-y',
    '-f',
    'rawvideo',
    '-pixel_format',
    'rgb24',
    '-video_size',
    `${W}x${H}`,
    '-framerate',
    String(fps),
    '-i',
    input,
    '-c:v',
    'ffv1',
    path,
  ]);
  return path;
}
const edlFor = (path, fps) => ({
  edl_version: 1,
  canvas: { w: W, h: H, fps, bg: '#000000' },
  sources: [
    {
      id: 's',
      path,
      w: W,
      h: H,
      fps,
      duration: 1.6,
      audio: false,
      kind: 'video',
    },
  ],
  video: [
    {
      track: 'V1',
      clips: [
        {
          id: 'one',
          src: 's',
          in: 0.13,
          out: 0.53,
          at: 0,
          speed: 1,
          camera: [
            { t: 0, x: 0.5, y: 0.5, zoom: 1, ease: 'cubic' },
            { t: 0.35, x: 0.5, y: 0.5, zoom: 1.12, ease: 'cubic' },
          ],
        },
        { id: 'two', src: 's', in: 0.5, out: 1, at: 0.4, speed: 2 },
        { id: 'three', src: 's', in: 0.2, out: 0.375, at: 0.65, speed: 0.5 },
      ],
    },
  ],
  overlays: [],
  audio: [],
  master: { lufs: -14, true_peak: -1 },
});
test(
  'fallback layers match the direct graph through transparent gaps and quoted Windows paths',
  { timeout: 90000 },
  async () => {
    const dir = await mkdtemp(join(tmpdir(), "kimo O'Brien path-"));
    try {
      const source = await fixture(dir, 25),
        e = edlFor(source, 25);
      e.video[0].clips = [
        { id: 'base', src: 's', in: 0, out: 1, at: 0, speed: 1 },
      ];
      e.video.push({
        track: 'BROLL',
        clips: [
          { id: 'b1', src: 's', in: 0.8, out: 1, at: 0.2, speed: 1 },
          { id: 'b2', src: 's', in: 0.1, out: 0.3, at: 0.6, speed: 1 },
        ],
      });
      e.overlays = [
        {
          id: 'text',
          kind: 'hook_title',
          at: 0.1,
          dur: 0.5,
          props: {
            text: 'A {real} caption',
            font: 'DejaVu Sans',
            size: 12,
            x: 0.5,
            y: 0.15,
          },
        },
      ];
      const decode = async (p) =>
        (
          await command(ffmpeg, [
            '-v',
            'error',
            '-i',
            p,
            '-an',
            '-pix_fmt',
            'rgb24',
            '-f',
            'rawvideo',
            'pipe:1',
          ])
        ).stdout;
      const a = join(dir, 'a.mkv'),
        b = join(dir, 'b.mkv');
      await compose({
        edl: e,
        ffmpeg,
        ffprobe,
        output: a,
        dir: join(dir, 'a work'),
        fontsDir: tools.env.KIMO_FONTS,
      });
      await compose({
        edl: e,
        ffmpeg,
        ffprobe,
        output: b,
        dir: join(dir, 'b work'),
        strategy: 'B',
        fontsDir: tools.env.KIMO_FONTS,
      });
      assert.deepEqual(await decode(a), await decode(b));
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  },
);
test(
  'delivery encoding preserves fractional-rate barcode frames',
  { timeout: 90000 },
  async () => {
    const dir = await mkdtemp(join(tmpdir(), 'kimo-delivery-'));
    try {
      const fps = '30000/1001',
        source = await fixture(dir, fps),
        e = edlFor(source, fps),
        master = join(dir, 'master.mkv'),
        out = join(dir, 'upload.mp4');
      await compose({
        edl: e,
        ffmpeg,
        ffprobe,
        output: master,
        dir: join(dir, 'work'),
      });
      await youtubeMaster({
        ffmpeg,
        input: master,
        output: out,
        P: { width: W, height: H },
        m: await measure(ffmpeg, ffprobe, master),
        encoder: 'libx264',
      });
      const data = (
          await command(ffmpeg, [
            '-v',
            'error',
            '-i',
            out,
            '-an',
            '-pix_fmt',
            'rgb24',
            '-f',
            'rawvideo',
            'pipe:1',
          ])
        ).stdout,
        size = W * H * 3;
      assert.equal(data.length / size, frameCount(e));
      for (let n = 0; n < frameCount(e); n++) {
        const c = e.video[0].clips.find(
            (c) =>
              n >= Math.ceil(c.at * rate(fps) - 1e-7) &&
              n <
                Math.ceil((c.at + (c.out - c.in) / c.speed) * rate(fps) - 1e-7),
          ),
          plan = framePlan(c, e.sources[0], fps, n, n + 1),
          r = cameraRectsForClip(c, e.sources[0], e.canvas, plan)[0];
        let id = 0;
        for (let b = 0; b < 16; b++) {
          const x = Math.round(((left + (b + 0.5) * block - r[0]) / r[2]) * W),
            y = Math.round(((top + 4 - r[1]) / r[3]) * H);
          if (data[n * size + (y * W + x) * 3] > 128) id |= 1 << b;
        }
        assert.equal(id, plan.indices[0], `delivery frame ${n}`);
      }
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  },
);
for (const fps of ['24000/1001', 24, 25, '30000/1001', 30, 50, 60])
  test(
    `every barcode frame is exact at ${fps} fps across trims, 2x, 0.5x and camera keys`,
    { timeout: 90000 },
    async (t) => {
      try {
        await command(ffmpeg, ['-version']);
      } catch (e) {
        if (process.env.KIMO_BENCH_REQUIRE_FFMPEG) throw e;
        return t.skip('FFmpeg unavailable');
      }
      const dir = await mkdtemp(join(tmpdir(), 'kimo-frame-'));
      try {
        const path = await fixture(dir, fps),
          edl = edlFor(path, fps),
          output = join(dir, 'output.mkv'),
          ops = [];
        await compose({
          edl,
          ffmpeg,
          ffprobe,
          output,
          dir: join(dir, 'work'),
          emit: (o) => ops.push(o),
        });
        const decoded = (
            await command(ffmpeg, [
              '-v',
              'error',
              '-i',
              output,
              '-an',
              '-pix_fmt',
              'rgb24',
              '-f',
              'rawvideo',
              'pipe:1',
            ])
          ).stdout,
          size = W * H * 3;
        assert.equal(decoded.length / size, frameCount(edl));
        for (let n = 0; n < frameCount(edl); n++) {
          const c = edl.video[0].clips.find(
            (c) =>
              n >= Math.ceil(c.at * rate(fps) - 1e-7) &&
              n <
                Math.ceil((c.at + (c.out - c.in) / c.speed) * rate(fps) - 1e-7),
          );
          const plan = framePlan(c, edl.sources[0], fps, n, n + 1),
            r = cameraRectsForClip(c, edl.sources[0], edl.canvas, plan)[0];
          let number = 0;
          for (let b = 0; b < 16; b++) {
            const x = Math.round(
                ((left + (b + 0.5) * block - r[0]) / r[2]) * W,
              ),
              y = Math.round(((top + 4 - r[1]) / r[3]) * H);
            const pixel = decoded[n * size + (y * W + x) * 3];
            if (pixel > 128) number |= 1 << b;
          }
          assert.equal(
            number,
            plan.indices[0],
            `output frame ${n}, clip ${c.id}`,
          );
        }
        assert.ok(
          ops.some((o) => o.tool === 'compose' && o.phase === 'end' && o.ok),
        );
        assert.ok(
          ops.some((o) => o.phase === 'compose' && o.total === frameCount(edl)),
        );
        assert.ok(
          Math.abs((await probeFile(ffprobe, output)).fps - rate(fps)) < 0.001,
        );
      } finally {
        await rm(dir, { recursive: true, force: true });
      }
    },
  );
test(
  'bounded fallback retains the same frame count and a cancelled render stops',
  { timeout: 90000 },
  async () => {
    const dir = await mkdtemp(join(tmpdir(), 'kimo-fallback-'));
    try {
      const path = await fixture(dir, 25),
        e = edlFor(path, 25),
        r = await compose({
          edl: e,
          ffmpeg,
          ffprobe,
          output: join(dir, 'b.mkv'),
          dir: join(dir, 'work'),
          strategy: 'B',
        });
      assert.equal(r.strategy, 'B');
      assert.equal((await probeFile(ffprobe, r.output)).duration, 1);
      const controller = new AbortController();
      controller.abort();
      await assert.rejects(
        compose({
          edl: e,
          ffmpeg,
          output: join(dir, 'cancel.mkv'),
          signal: controller.signal,
        }),
        /cancelled/,
      );
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  },
);
test(
  '1 kHz cut boundaries have no samples above -40 dBFS at the seam',
  { timeout: 90000 },
  async () => {
    const dir = await mkdtemp(join(tmpdir(), 'kimo-audio-'));
    try {
      const path = await fixture(dir, 25),
        tone = join(dir, 'tone.wav');
      await command(ffmpeg, [
        '-v',
        'error',
        '-y',
        '-f',
        'lavfi',
        '-i',
        'sine=frequency=1000:sample_rate=48000:duration=1',
        '-c:a',
        'pcm_s24le',
        tone,
      ]);
      const e = edlFor(path, 25);
      e.sources.push({
        id: 'tone',
        path: tone,
        fps: 25,
        duration: 1,
        w: 0,
        h: 0,
        audio: true,
        kind: 'audio',
      });
      e.audio = [
        {
          track: 'VOICE',
          clips: [
            { id: 'a1', src: 'tone', in: 0, out: 0.5, at: 0, speed: 1 },
            { id: 'a2', src: 'tone', in: 0.003, out: 0.503, at: 0.5, speed: 1 },
          ],
        },
      ];
      const output = join(dir, 'sound.mkv');
      await compose({
        edl: e,
        ffmpeg,
        ffprobe,
        output,
        dir: join(dir, 'work'),
      });
      const pcm = (
        await command(ffmpeg, [
          '-v',
          'error',
          '-i',
          output,
          '-vn',
          '-ac',
          '1',
          '-f',
          's16le',
          'pipe:1',
        ])
      ).stdout;
      for (let s = 23998; s <= 24002; s++)
        assert.ok(
          Math.abs(pcm.readInt16LE(s * 2) / 32768) < 0.01,
          `sample ${s} clicks`,
        );
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  },
);
