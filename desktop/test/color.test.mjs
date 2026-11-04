import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { spawnSync } from 'node:child_process';
import { LOOK_IDS, loadLook } from '../color/looks.mjs';
import { luma, hue, fromChroma, deltaE2000 } from '../color/math.mjs';
import {
  transform,
  makeCorrection,
  writeLut,
  cubeText,
  primary,
} from '../color/lut.mjs';
import { frameStats, aggregateFrames, analyzeClip } from '../color/analyze.mjs';
import {
  colorFilters,
  finishSettings,
  finishFilters,
} from '../color/filters.mjs';
import { colorConfig, changeColor } from '../color/plan.mjs';
import { pictureTools } from '../picture-tools.mjs';
import { compose } from '../compose.mjs';
import { publicEdl, frameCount } from '../edl.mjs';
import { run } from '../audio/process.mjs';
import { youtubeMaster } from '../engine.mjs';
import { toolPaths } from './bench/run.mjs';
const tools = toolPaths(),
  ffmpeg = process.env.KIMO_FFMPEG ?? tools.ffmpeg,
  ffprobe = process.env.KIMO_FFPROBE ?? tools.ffprobe;
const available =
  spawnSync(ffmpeg, ['-version'], { windowsHide: true }).status === 0;
if (process.env.KIMO_BENCH_REQUIRE_FFMPEG === '1') assert.ok(available);

test('CIEDE2000 agrees with published independent Lab pairs', () => {
  for (const [a, b, want] of [
    [[50, 2.6772, -79.7751], [50, 0, -82.7485], 2.0425],
    [[50, 3.1571, -77.2803], [50, 0, -82.7485], 2.8615],
    [[50, 2.8361, -74.02], [50, 0, -82.7485], 3.4412],
    [[50, 0, 0], [50, -1, 2], 2.3669],
  ])
    assert.ok(Math.abs(deltaE2000(a, b) - want) < 0.0001);
});
test('all seven LUTs are identity at zero strength and preserve warm skin at full strength', () => {
  for (const look of LOOK_IDS) {
    assert.equal(loadLook(look).license, 'CC0-1.0');
    for (const rgb of [
      [0, 0, 0],
      [1, 1, 1],
      [0.1, 0.5, 0.9],
      [0.65, 0.43, 0.3],
    ])
      assert.deepEqual(transform(rgb, { look, strength: 0 }), rgb);
    for (const y of [0.22, 0.4, 0.6])
      for (const angle of [115, 119, 123, 127, 131]) {
        const a = (angle * Math.PI) / 180,
          rgb = fromChroma(y, [0.08 * Math.cos(a), 0.08 * Math.sin(a)]),
          out = transform(rgb, { look, strength: 1 });
        assert.ok(
          hue(out) >= 114.9 && hue(out) <= 131.1,
          `${look}: skin hue ${hue(out)}`,
        );
      }
  }
  const identity = cubeText({ look: 'clean', strength: 0 }, 2)
    .trim()
    .split('\n');
  assert.equal(identity[4], '0.00000000 0.00000000 0.00000000');
  assert.equal(identity.at(-1), '1.00000000 1.00000000 1.00000000');
});
test('analysis skips black/fades, limits skin to its region and detects a flat profile', () => {
  const W = 80,
    H = 40,
    b = Buffer.alloc(W * H * 3);
  for (let p = 0; p < W * H; p++) {
    b[p * 3] = 180;
    b[p * 3 + 1] = 125;
    b[p * 3 + 2] = 95;
  }
  assert.equal(frameStats(b, W, H).skin.count, 0);
  assert.ok(frameStats(b, W, H, { faceBox: [0, 0, 0.5, 1] }).skin.count > 0);
  assert.equal(
    aggregateFrames([frameStats(Buffer.alloc(W * H * 3), W, H)]).available,
    false,
  );
  const flat = Buffer.alloc(W * H * 3);
  for (let p = 0; p < W * H; p++)
    for (let k = 0; k < 3; k++) flat[p * 3 + k] = 90 + (p % 25);
  assert.equal(aggregateFrames([frameStats(flat, W, H)]).log_like, true);
});
test('levels use soft shoulders; shot matching improves comparable material with weaker b-roll shifts', () => {
  const stats = {
    available: true,
    p1: 0.04,
    p50: 0.42,
    p99: 0.88,
    grey: { count: 100, rgb: [0.42, 0.42, 0.42] },
    skin: { count: 100, rgb: [0.62, 0.42, 0.3] },
    mid: { count: 100, rgb: [0.48, 0.46, 0.42] },
    log_like: false,
  };
  const ref = { stats, correction: makeCorrection(stats) },
    other = { ...stats, skin: { count: 100, rgb: [0.66, 0.4, 0.28] } };
  const c = makeCorrection(other, ref),
    b = makeCorrection(other, ref, { broll: true });
  assert.ok(c.delta_e_after < c.delta_e_before);
  assert.ok(Math.abs(b.match.cr) <= Math.abs(c.match.cr));
  for (const look of LOOK_IDS) {
    let clipped = 0,
      total = 0;
    for (let r = 0; r <= 16; r++)
      for (let g = 0; g <= 16; g++)
        for (let b = 0; b <= 16; b++) {
          const out = transform([r / 16, g / 16, b / 16], {
            look,
            correction: c,
          });
          assert.ok(out.every(Number.isFinite));
          if (luma(out) <= 1 / 255 || luma(out) >= 254 / 255) clipped++;
          total++;
        }
    assert.ok(clipped / total < 0.005);
  }
});
test('finish respects scale, data caps and explicit UI settings; native grade is intercepted', async () => {
  assert.equal(
    finishSettings({ w: 3840, h: 2160 }, { w: 1920, h: 1080 }).sharpen,
    0,
  );
  assert.ok(
    finishSettings({ w: 800, h: 450 }, { w: 1280, h: 720 }).sharpen > 0,
  );
  assert.equal(loadLook('cinematic-teal-orange').cap, 0.6);
  assert.equal(colorConfig({ template: 'tutorial' }).look, 'clean');
  assert.throws(() => changeColor({}, { look: 'unknown', strength: 1 }));
  assert.throws(() => changeColor({}, { look: 'clean', strength: 2 }));
  const changed = changeColor(
    { sources: [], video: [], audio: [], overlays: [], canvas: {}, master: {} },
    { look: 'warm-creator', strength: 0.5, grain: true },
  );
  assert.equal(publicEdl(changed).color_finish.strength, 0.5);
  let native = 0;
  const api = pictureTools({
    mcp: {
      call() {
        native++;
      },
    },
    emit() {},
  });
  api.color = colorConfig();
  await api.call('auto_grade', { look: 'kimo', strength: 0.4 });
  assert.equal(native, 0);
  assert.equal(api.color.look, 'kimo');
});
test('untracked midtones stay conservative, known screens keep exposure and explicit primaries survive', () => {
  const s = {
    available: true,
    p1: 0.005,
    p50: 0.38,
    p99: 0.76,
    grey: { count: 0, rgb: [0, 0, 0] },
    skin: { count: 0, rgb: [0, 0, 0] },
    mid: { count: 1, rgb: [0.38, 0.38, 0.38] },
    log_like: false,
  };
  const c = makeCorrection(s);
  assert.ok(Math.abs(luma(primary([0.38, 0.38, 0.38], c)) - 0.38) < 0.06);
  const screen = makeCorrection({ ...s, screen: true });
  assert.deepEqual(primary([0.4, 0.5, 0.6], screen), [0.4, 0.5, 0.6]);
  const before = transform([0.3, 0.4, 0.5], { look: 'clean' }),
    after = transform([0.3, 0.4, 0.5], {
      look: 'clean',
      primaries: [{ kind: 'primaries', params: { gain_m: { base: 0.8 } } }],
    });
  assert.ok(luma(after) < luma(before) - 0.04);
});
test(
  'tiny colour chart: actual 33³ LUTs, all looks, Windows escaping, cached analysis and both compositor strategies',
  { skip: !available, timeout: 120000 },
  async (t) => {
    const dir = await mkdtemp(join(tmpdir(), "kimo-colour's smoke-")),
      input = join(dir, 'chart source.mkv'),
      w = 192,
      h = 128;
    t.diagnostic(`evidence: ${dir}`);
    await run(ffmpeg, [
      '-f',
      'lavfi',
      '-i',
      'testsrc2=size=192x128:rate=25:duration=0.4',
      '-vf',
      'drawbox=x=0:y=0:w=80:h=80:color=0xa46e50:t=fill',
      '-c:v',
      'ffv1',
      '-pix_fmt',
      'yuv444p',
      '-colorspace',
      'bt709',
      '-color_primaries',
      'bt709',
      '-color_trc',
      'bt709',
      '-color_range',
      'tv',
      input,
    ]);
    const source = {
      id: 's',
      path: input,
      w,
      h,
      fps: '25',
      duration: 0.4,
      kind: 'video',
      audio: false,
      pixel_format: 'yuv444p',
      color: { primaries: 'bt709', trc: 'bt709', space: 'bt709', range: 'tv' },
    };
    const clip = { id: 'c', src: 's', at: 0, in: 0, out: 0.36, speed: 1.5 };
    const analysis = await analyzeClip({
      ffmpeg,
      source,
      clip,
      cacheDir: join(dir, 'analysis'),
      count: 4,
      width: 192,
    });
    assert.ok(analysis.available);
    const second = await analyzeClip({
      ffmpeg,
      source,
      clip,
      cacheDir: join(dir, 'analysis'),
      count: 4,
      width: 192,
    });
    assert.equal(second.cached, true);
    const results = [];
    for (const look of LOOK_IDS) {
      const lut = await writeLut(join(dir, 'LUT files'), {
        look,
        correction: makeCorrection(analysis),
        strength: 1,
      });
      const { stdout } = await run(
        ffmpeg,
        [
          '-i',
          input,
          '-frames:v',
          '1',
          '-vf',
          colorFilters(source, { lut: lut.path }),
          '-pix_fmt',
          'rgb24',
          '-f',
          'rawvideo',
          '-',
        ],
        { binary: true },
      );
      const stats = frameStats(stdout, w, h, { faceBox: [0, 0, 0.4, 0.6] });
      results.push({
        look,
        clipped: stats.clipped_low_pct + stats.clipped_high_pct,
      });
      assert.ok(
        stats.skin.count > 0 &&
          hue(stats.skin.rgb) >= 114.9 &&
          hue(stats.skin.rgb) <= 131.5,
        `${look}: actual skin patch hue ${hue(stats.skin.rgb)}`,
      );
      assert.ok(
        stats.clipped_low_pct + stats.clipped_high_pct < 0.5,
        `${look}: clipping ${stats.clipped_low_pct + stats.clipped_high_pct}`,
      );
    }
    // Exercise optional spatial finish filters on a few frames, without any real footage render.
    const lut = await writeLut(join(dir, 'LUT files'), {
      look: 'moody-doc',
      strength: 1,
    });
    // Technical coverage for the new generic HDR→SDR branch, not HDR quality acceptance.
    await run(ffmpeg, [
      '-i',
      input,
      '-frames:v',
      '1',
      '-vf',
      colorFilters(
        {
          ...source,
          color: {
            primaries: 'bt2020',
            space: 'bt2020nc',
            trc: 'smpte2084',
            range: 'tv',
          },
        },
        { lut: lut.path },
      ),
      '-f',
      'null',
      '-',
    ]);
    const { stdout: finished } = await run(
      ffmpeg,
      [
        '-i',
        input,
        '-frames:v',
        '2',
        '-vf',
        [
          colorFilters(source, { lut: lut.path }),
          'format=yuva444p',
          ...finishFilters({ sharpen: 0.2, grain: true, vignette: true }),
        ].join(','),
        '-pix_fmt',
        'rgb24',
        '-f',
        'rawvideo',
        '-',
      ],
      { binary: true },
    );
    const finishedStats = frameStats(finished.subarray(0, w * h * 3), w, h);
    assert.ok(
      finishedStats.clipped_low_pct + finishedStats.clipped_high_pct < 0.5,
      `finished clipping ${finishedStats.clipped_low_pct + finishedStats.clipped_high_pct}`,
    );
    const edl = {
      edl_version: 1,
      canvas: { w: 128, h: 96, fps: '25' },
      sources: [source],
      video: [{ track: 'V1', clips: [clip] }],
      audio: [],
      overlays: [],
      master: {},
      color_finish: colorConfig(),
    };
    const outputs = [];
    for (const strategy of ['A', 'B']) {
      const output = join(dir, strategy + '.mkv');
      await compose({
        edl,
        ffmpeg,
        ffprobe,
        output,
        dir: join(dir, 'work'),
        cacheDir: join(dir, 'cache'),
        strategy,
      });
      const { stdout } = await run(
        ffmpeg,
        ['-i', output, '-an', '-pix_fmt', 'rgb24', '-f', 'rawvideo', '-'],
        { binary: true },
      );
      assert.equal(stdout.length, frameCount(edl) * 128 * 96 * 3);
      outputs.push(stdout);
    }
    let difference = 0;
    for (let i = 0; i < outputs[0].length; i++)
      difference += Math.abs(outputs[0][i] - outputs[1][i]);
    difference /= outputs[0].length;
    assert.ok(difference < 1.2, `A/B RGB difference ${difference}`);
    const delivery = join(dir, 'delivery.mp4');
    await youtubeMaster({
      ffmpeg,
      input: join(dir, 'A.mkv'),
      output: delivery,
      P: { width: 128, height: 96, mbps: 2 },
      m: { fps: 25, duration: 0.24 },
      encoder: 'libx264',
      audioMastered: true,
    });
    const metadata = JSON.parse(
      spawnSync(
        ffprobe,
        ['-v', 'error', '-show_streams', '-of', 'json', delivery],
        { encoding: 'utf8', windowsHide: true },
      ).stdout,
    ).streams.find((s) => s.codec_type === 'video');
    assert.equal(metadata.color_range, 'tv');
    assert.equal(metadata.color_space, 'bt709');
    assert.equal(metadata.color_primaries, 'bt709');
    assert.equal(metadata.color_transfer, 'bt709');
    const { stdout: encoded } = await run(
      ffmpeg,
      [
        '-i',
        delivery,
        '-frames:v',
        '1',
        '-pix_fmt',
        'rgb24',
        '-f',
        'rawvideo',
        '-',
      ],
      { binary: true },
    );
    let drift = 0;
    for (let y = 12; y < 40; y++)
      for (let x = 12; x < 40; x++)
        for (let k = 0; k < 3; k++)
          drift += Math.abs(
            encoded[(y * 128 + x) * 3 + k] - outputs[0][(y * 128 + x) * 3 + k],
          );
    drift /= 28 * 28 * 3;
    assert.ok(drift < 3, `delivery patch range drift ${drift}`);
    t.diagnostic(
      JSON.stringify({
        looks: results,
        compositor_mean_rgb_difference: difference,
        delivery_patch_rgb_drift: drift,
      }),
    );
  },
);
