import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { existsSync } from 'node:fs';
import { command, filterPath, probeFile } from './bench/io.mjs';
import { compose, cameraRectsForClip } from '../compose.mjs';
import { rate, frameCount, fromKimoProject } from '../edl.mjs';
import { frameSourceMetrics, projectEdl } from './bench/analyze.mjs';
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

// Independent oracle: do not use the compositor's framePlan for expected IDs.
const oracleRate = (fps) => {
  const [n, d = 1] = String(fps).split('/').map(Number);
  return n / d;
};
const oracleId = (n, clip, fps) =>
  Math.round(
    (n / oracleRate(fps) - clip.at) * clip.speed * oracleRate(fps) +
      clip.in * oracleRate(fps),
  );

test(
  'pixel matcher masks captions, aligns float crops and still catches injected judder',
  { timeout: 90000 },
  async () => {
    const dir = await mkdtemp(join(tmpdir(), 'kimo-match-'));
    try {
      const source = await fixture(dir, 25);
      const project = {
        width: W,
        height: H,
        fps: 25,
        assets: {
          s: { path: source, width: W, height: H, fps: 25, duration: 1.6 },
        },
        tracks: [
          {
            id: 'V',
            clips: [
              {
                id: 'clip1',
                source: { type: 'media', asset: 's' },
                start: 0,
                duration: 1,
                in_point: 0,
                speed: 1,
                props: {
                  scale: {
                    base: 1,
                    expr: [
                      {
                        op: 'bezier',
                        from: 1,
                        to: 1.15,
                        t0: 0,
                        duration: 0,
                        combine: 'mul',
                      },
                    ],
                  },
                },
              },
            ],
          },
          {
            id: 'T',
            clips: [
              {
                id: 'clip2',
                source: {
                  type: 'text',
                  text: 'caption pixels',
                  font: 'DejaVu Sans',
                  size: 16,
                  color: [1, 1, 1],
                },
                start: 0,
                duration: 1,
                props: { y: { base: -45 } },
              },
            ],
          },
        ],
      };
      const output = join(dir, 'clean.mkv');
      await compose({
        edl: fromKimoProject(project),
        ffmpeg,
        ffprobe,
        output,
        dir: join(dir, 'work'),
        fontsDir: tools.env.KIMO_FONTS,
      });
      const events = projectEdl(project);
      assert.equal(
        events.find((e) => e.kind === 'cut').zoom,
        1.15,
        'constant native punch expressions are measurable',
      );
      const good = await frameSourceMetrics(
        ffmpeg,
        output,
        events,
        25,
        W,
        H,
        1,
      );
      assert.equal(good.repeated_frames, 0);
      assert.equal(good.skipped_frames, 0);
      assert.ok(good.frame_match_coverage >= 0.95, JSON.stringify(good));
      const bad = join(dir, 'judder.mkv');
      await command(ffmpeg, [
        '-v',
        'error',
        '-y',
        '-i',
        output,
        '-vf',
        'shuffleframes=0 0 2 3 4',
        '-an',
        '-c:v',
        'ffv1',
        '-level',
        '3',
        bad,
      ]);
      const faulty = await frameSourceMetrics(ffmpeg, bad, events, 25, W, H, 1);
      assert.ok(faulty.repeated_frames >= 4, JSON.stringify(faulty));
      assert.ok(faulty.skipped_frames >= 4, JSON.stringify(faulty));
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  },
);

test(
  'external audio assets resolve duration and gain without a source entry',
  { timeout: 30000 },
  async () => {
    const dir = await mkdtemp(join(tmpdir(), 'kimo-audio-asset-'));
    try {
      await command(ffmpeg, [
        '-v',
        'error',
        '-y',
        '-f',
        'lavfi',
        '-i',
        'sine=frequency=1000:sample_rate=48000:duration=1',
        '-c:a',
        'pcm_s16le',
        join(dir, 'tone.wav'),
      ]);
      const e = {
        edl_version: 1,
        canvas: { w: W, h: H, fps: 25 },
        sources: [],
        video: [],
        overlays: [],
        audio: [
          { track: 'SFX', clips: [{ asset: 'tone.wav', at: 0, gain_db: -6 }] },
        ],
      };
      const output = join(dir, 'sound.mkv');
      await compose({
        edl: e,
        ffmpeg,
        ffprobe,
        output,
        dir: join(dir, 'work'),
        assetRoot: dir,
      });
      const info = await probeFile(ffprobe, output);
      assert.ok(Math.abs(Number(info.format.duration) - 1) < 0.01);
      const { stdout } = await command(ffmpeg, [
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
      ]);
      assert.ok(Math.abs(stdout.readInt16LE(12012 * 2) / 32768) < 0.07);
      assert.ok(Math.abs(stdout.readInt16LE(12012 * 2) / 32768) > 0.04);
      assert.equal(
        e.audio[0].clips[0].dur,
        undefined,
        'caller EDL is not mutated',
      );
      e.audio[0].clips[0].asset = 'missing.wav';
      await assert.rejects(
        compose({ edl: e, ffmpeg, ffprobe, output, assetRoot: dir }),
        /EDL audio.*missing asset/,
      );
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  },
);

test(
  'image overlays retain alpha and exact on/off frames in both strategies',
  { timeout: 90000 },
  async () => {
    const dir = await mkdtemp(join(tmpdir(), 'kimo-alpha-'));
    try {
      const image = join(dir, 'graphic.png');
      const rgba = Buffer.alloc(W * H * 4);
      for (let y = 40; y < 88; y++)
        for (let x = 60; x < 132; x++) {
          const i = (y * W + x) * 4;
          rgba[i] = 255;
          rgba[i + 3] = 255;
        }
      const raw = join(dir, 'graphic.rgba');
      await writeFile(raw, rgba);
      await command(ffmpeg, [
        '-v',
        'error',
        '-y',
        '-f',
        'rawvideo',
        '-pix_fmt',
        'rgba',
        '-s',
        `${W}x${H}`,
        '-i',
        raw,
        '-frames:v',
        '1',
        image,
      ]);
      const e = {
        edl_version: 1,
        canvas: { w: W, h: H, fps: 25, bg: '#0000FF' },
        sources: [{ id: 'png', path: image, w: W, h: H, fps: 25 }],
        video: [],
        audio: [],
        overlays: [
          {
            id: 'graphic',
            kind: 'image',
            src: 'png',
            at: 0.2,
            dur: 0.4,
            props: {},
          },
        ],
      };
      for (const strategy of ['A', 'B']) {
        const output = join(dir, strategy + '.mkv');
        await compose({
          edl: e,
          ffmpeg,
          ffprobe,
          output,
          dir: join(dir, 'work'),
          strategy,
        });
        const { stdout } = await command(ffmpeg, [
          '-v',
          'error',
          '-i',
          output,
          '-pix_fmt',
          'rgb24',
          '-f',
          'rawvideo',
          'pipe:1',
        ]);
        const pixel = (frame, x, y) => [
          ...stdout.subarray(
            (frame * W * H + y * W + x) * 3,
            (frame * W * H + y * W + x) * 3 + 3,
          ),
        ];
        assert.ok(pixel(4, 96, 64)[2] > 230, strategy + ' before graphic');
        assert.ok(pixel(5, 96, 64)[0] > 230, strategy + ' first graphic frame');
        assert.ok(pixel(14, 96, 64)[0] > 230, strategy + ' last graphic frame');
        assert.ok(pixel(8, 8, 8)[2] > 230, strategy + ' transparent corner');
        assert.ok(
          pixel(8, 96, 64)[1] < 8,
          strategy + ' RGB image uses the BT.709 matrix, not just tags',
        );
        assert.ok(
          pixel(8, 8, 8)[0] < 8 && pixel(8, 8, 8)[1] < 8,
          strategy + ' background colour uses the BT.709 matrix',
        );
        const text = {
          id: 'label',
          kind: 'hook_title',
          at: 0.2,
          dur: 0.4,
          props: { text: 'X', size: 32, font: 'DejaVu Sans', x: 0.5, y: 0.5 },
        };
        for (const above of [false, true]) {
          const layered = structuredClone(e);
          layered.overlays = above
            ? [...layered.overlays, text]
            : [text, ...layered.overlays];
          const layeredOut = join(dir, `${strategy}-${above}.mkv`);
          await compose({
            edl: layered,
            ffmpeg,
            ffprobe,
            output: layeredOut,
            dir: join(dir, 'work'),
            strategy,
            fontsDir: tools.env.KIMO_FONTS,
          });
          const decoded = (
            await command(ffmpeg, [
              '-v',
              'error',
              '-i',
              layeredOut,
              '-pix_fmt',
              'rgb24',
              '-f',
              'rawvideo',
              'pipe:1',
            ])
          ).stdout;
          const green = decoded[(8 * W * H + 64 * W + 96) * 3 + 1];
          assert.ok(
            above
              ? green > pixel(8, 96, 64)[1] + 100
              : green === pixel(8, 96, 64)[1],
            `${strategy} preserves text/image layer order: ${above}, green=${green}`,
          );
        }
      }
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  },
);
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
      const direct = await decode(a),
        baked = await decode(b);
      let differences = 0,
        maxError = 0,
        first = -1;
      for (let i = 0; i < Math.max(direct.length, baked.length); i++)
        if (direct[i] !== baked[i]) {
          differences++;
          if (first < 0) first = i;
          maxError = Math.max(
            maxError,
            Math.abs((direct[i] ?? 0) - (baked[i] ?? 0)),
          );
        }
      assert.ok(
        direct.equals(baked),
        JSON.stringify({
          directBytes: direct.length,
          bakedBytes: baked.length,
          differences,
          maxError,
          first,
        }),
      );
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
          plan = { start: n, end: n + 1, indices: [oracleId(n, c, fps)] },
          r = cameraRectsForClip(c, e.sources[0], e.canvas, plan)[0];
        let id = 0;
        for (let b = 0; b < 16; b++) {
          const x = Math.round(((left + (b + 0.5) * block - r[0]) / r[2]) * W),
            y = Math.round(((top + 4 - r[1]) / r[3]) * H);
          if (data[n * size + (y * W + x) * 3] > 128) id |= 1 << b;
        }
        assert.equal(id, oracleId(n, c, fps), `delivery frame ${n}`);
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
        const expectedFrames = Math.ceil(oracleRate(fps) - 1e-7);
        assert.equal(decoded.length / size, expectedFrames);
        const info = await probeFile(ffprobe, output);
        assert.ok(
          Math.abs(oracleRate(info.video.r_frame_rate) - oracleRate(fps)) <
            1e-6,
          'CFR must preserve the exact source rate',
        );
        for (let n = 0; n < expectedFrames; n++) {
          const c = edl.video[0].clips.find(
            (c) =>
              n >= Math.ceil(c.at * rate(fps) - 1e-7) &&
              n <
                Math.ceil((c.at + (c.out - c.in) / c.speed) * rate(fps) - 1e-7),
          );
          const plan = { start: n, end: n + 1, indices: [oracleId(n, c, fps)] },
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
            oracleId(n, c, fps),
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

test(
  'native background geometry renders with exact bounds, alpha and frame timing',
  { timeout: 30000 },
  async () => {
    const dir = await mkdtemp(join(tmpdir(), 'kimo-shape-'));
    try {
      const e = {
        edl_version: 1,
        canvas: { w: W, h: H, fps: 25, bg: '#000000' },
        sources: [],
        video: [],
        audio: [],
        overlays: [
          {
            id: 'extent',
            kind: 'hook_title',
            at: 0,
            dur: 1,
            props: { text: '' },
          },
          {
            id: 'box',
            kind: 'callout',
            at: 0.2,
            dur: 0.4,
            props: {
              primitive: 'rect',
              width: 60,
              height: 24,
              corner_radius: 6,
              fill: [0, 1, 0],
              x: 0.5,
              y: 0.5,
              curves: { opacity: { base: 0.5 } },
            },
          },
        ],
      };
      const output = join(dir, 'shape.mkv');
      await compose({
        edl: e,
        ffmpeg,
        ffprobe,
        output,
        dir: join(dir, 'work'),
      });
      const { stdout } = await command(ffmpeg, [
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
      ]);
      const green = (frame, x, y) =>
        stdout[(frame * W * H + y * W + x) * 3 + 1];
      assert.ok(
        green(5, 96, 64) > 110 && green(5, 96, 64) < 140,
        `half-alpha center: ${green(5, 96, 64)}`,
      );
      assert.ok(
        green(4, 96, 64) < 5 && green(15, 96, 64) < 5,
        'exact on/off frames',
      );
      assert.ok(green(5, 66, 52) < 10, 'rounded corner');
      assert.ok(green(5, 64, 64) < 5, 'outside source-defined bounds');
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  },
);

test(
  'observed float-camera edge motion stays below half a normalized pixel of residual jitter',
  { timeout: 90000 },
  async (t) => {
    const dir = await mkdtemp(join(tmpdir(), 'kimo-camera-jitter-'));
    try {
      const w = 512,
        h = 288,
        raw = Buffer.alloc(w * h * 3);
      for (let y = 0; y < h; y++)
        raw.fill(255, (y * w + 128) * 3, (y * w + w) * 3);
      const input = join(dir, 'edge.rgb'),
        image = join(dir, 'edge.png');
      await writeFile(input, raw);
      await command(ffmpeg, [
        '-v',
        'error',
        '-y',
        '-f',
        'rawvideo',
        '-pix_fmt',
        'rgb24',
        '-s',
        w + 'x' + h,
        '-i',
        input,
        '-frames:v',
        '1',
        image,
      ]);
      const e = {
        edl_version: 1,
        canvas: { w, h, fps: 30 },
        sources: [{ id: 's', path: image, w, h, kind: 'image', fps: 30 }],
        video: [
          {
            track: 'V',
            clips: [
              {
                id: 'c',
                src: 's',
                in: 0,
                out: 1,
                at: 0,
                speed: 1,
                camera: [
                  { t: 0, x: 0.5, y: 0.5, zoom: 1, ease: 'cubic' },
                  { t: 1, x: 0.52, y: 0.5, zoom: 1.2, ease: 'cubic' },
                ],
              },
            ],
          },
        ],
        audio: [],
        overlays: [],
      };
      const output = join(dir, 'camera.mkv');
      await compose({
        edl: e,
        ffmpeg,
        ffprobe,
        output,
        dir: join(dir, 'work'),
      });
      const pixels = (
        await command(ffmpeg, [
          '-v',
          'error',
          '-i',
          output,
          '-an',
          '-pix_fmt',
          'gray',
          '-f',
          'rawvideo',
          'pipe:1',
        ])
      ).stdout;
      assert.equal(pixels.length, w * h * 30);
      const residual = [];
      for (let n = 0; n < 30; n++) {
        const row = pixels.subarray(
          n * w * h + (h / 2) * w,
          n * w * h + (h / 2 + 1) * w,
        );
        let edge;
        for (let x = 1; x < w; x++)
          if (row[x - 1] < 127.5 && row[x] >= 127.5) {
            edge = x - 1 + (127.5 - row[x - 1]) / (row[x] - row[x - 1]);
            break;
          }
        assert.ok(Number.isFinite(edge), 'visible edge');
        const u = n / 30,
          s = u * u * (3 - 2 * u),
          z = 1 + 0.2 * s,
          cx = w * (0.5 + 0.02 * s),
          crop = w / z;
        const expected = ((127.5 - (cx - crop / 2)) / crop) * w;
        residual.push(edge - expected);
      }
      const mean = residual.reduce((a, b) => a + b, 0) / residual.length;
      const rms =
        (Math.sqrt(
          residual.reduce((s, r) => s + (r - mean) ** 2, 0) / residual.length,
        ) *
          1080) /
        h;
      t.diagnostic(
        'Measured camera residual ' +
          rms.toFixed(4) +
          ' px at a 1080-pixel short side; static source, actual decoded pixels.',
      );
      assert.ok(rms < 0.5, 'float camera jitter ' + rms);
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  },
);
