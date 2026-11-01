import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, stat, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import {
  fitMusic,
  beatGrid,
  duckEnvelope,
  speechIntervals,
} from '../audio/music.mjs';
import { planSfx, sfxGain } from '../audio/sfx.mjs';
import {
  planSound,
  libraries,
  snapCuts,
  retainUserMusic,
} from '../audio/plan.mjs';
import {
  pitch,
  analyzePcm,
  voiceFilters,
  supportsAnlmdn,
} from '../audio/voice.mjs';
import { addUserMusic } from '../audio/import.mjs';
import { mixSound } from '../audio/mix.mjs';
import { remixFromStems } from '../audio/master.mjs';
import { run } from '../audio/process.mjs';
import { publicEdl, toTimeline, validate } from '../edl.mjs';
import { pictureTools } from '../picture-tools.mjs';

const root = fileURLToPath(new URL('../', import.meta.url));
const installed =
  process.env.LOCALAPPDATA &&
  join(
    process.env.LOCALAPPDATA,
    'Programs/kimo/resources/vendor/ffmpeg/ffmpeg.exe',
  );
const ffmpeg =
  process.env.KIMO_FFMPEG ??
  (installed && existsSync(installed) ? installed : 'ffmpeg');
const available =
  spawnSync(ffmpeg, ['-version'], { windowsHide: true }).status === 0;
if (process.env.KIMO_BENCH_REQUIRE_FFMPEG === '1')
  assert.ok(available, 'FFmpeg is required for audio smoke tests');
const fixture = () => ({
  edl_version: 1,
  canvas: { w: 160, h: 90, fps: '30' },
  sources: [{ id: 's', path: 'source.wav', audio: true, duration: 10 }],
  video: [
    {
      track: 'V1',
      clips: [{ id: 'v', src: 's', at: 0, in: 0, out: 6, speed: 1 }],
    },
  ],
  audio: [
    {
      track: 'A1',
      role: 'VOICE',
      clips: [
        {
          id: 'a',
          src: 's',
          linked: 'v',
          at: 0,
          in: 0,
          out: 6,
          dur: 6,
          speed: 1,
        },
      ],
    },
  ],
  overlays: [],
  master: {},
});

test('bundled CC0 scores and SFX meet counts, license, duration and size limits', async () => {
  const l = libraries();
  assert.equal(l.music.length, 8);
  assert.equal(l.sfx.length, 40);
  for (const [items, limit] of [
    [l.music, 40 * 1024 ** 2],
    [l.sfx, 6 * 1024 ** 2],
  ]) {
    let size = 0;
    for (const a of items) {
      assert.equal(a.license, 'CC0-1.0');
      assert.match(a.source, /https:\/\//);
      size += (await stat(join(root, a.path))).size;
      if (a.bpm) {
        assert.ok(a.duration >= 120 && a.duration <= 180);
        assert.ok(a.loop_end > a.loop_start);
      }
    }
    assert.ok(size < limit);
  }
});
test('music fits bars, fades to exact picture end and word envelope swells in pauses', () => {
  const fit = fitMusic(
    { bpm: 120, loop_start: 0, loop_end: 16, duration: 17 },
    21,
  );
  assert.equal(fit.period, 16);
  assert.equal(fit.duration, 21);
  assert.equal(fit.fade, 1.5);
  assert.equal(beatGrid({ bpm: 120 }, 5).filter((b) => b.downbeat).length, 3);
  const env = duckEnvelope(
    [
      [1, 2],
      [4, 5],
    ],
    6,
  );
  assert.ok(env.some((p) => p.db === -16));
  assert.ok(env.some((p) => p.t === 2.3 && p.db === -9));
  const edl = fixture();
  delete edl.audio[0].clips[0].dur;
  assert.deepEqual(speechIntervals(edl), [[0, 6]]);
  edl.camera_plan = {
    words: {
      'source.wav': [
        { start: 0.8, end: 1.1 },
        { start: 3, end: 3.5 },
      ],
    },
  };
  assert.deepEqual(speechIntervals(edl), [
    [0.8, 1.1],
    [3, 3.5],
  ]);
});
test('SFX are deterministic, rotate variants, lead visuals and exclude caption words', () => {
  const events = Array.from({ length: 12 }, (_, i) => ({
    id: `e${i}`,
    at: i * 8 + 1,
    kind: 'graphic',
  }));
  events.push({ id: 'caption', at: 4, kind: 'caption_word', caption: true });
  const opts = { fps: 30, duration: 100, template: 'clean' },
    a = planSfx(events, libraries().sfx, opts);
  assert.deepEqual(a, planSfx(events, libraries().sfx, opts));
  assert.equal(a.length, 12);
  assert.ok(Math.abs(a[0].at - (1 - 2 / 30)) < 1e-6);
  for (let i = 1; i < a.length; i++) assert.notEqual(a[i].id, a[i - 1].id);
  assert.ok(sfxGain({ peak_db: -3 }, -20) <= -24);
});
test('plans stay idempotent, retain user music, expose MUSIC import lane and podcast target', () => {
  const edl = fixture();
  planSound(edl, { template: 'podcast' });
  validate(edl);
  assert.equal(edl.sound.target_lufs, -16);
  const n = edl.audio.length;
  planSound(edl, { template: 'podcast' });
  assert.equal(edl.audio.length, n);
  const imported = addUserMusic(edl, {
    path: 'my song.opus',
    audio: true,
    duration: 3,
  });
  assert.equal(imported.audio.filter((t) => t.role === 'MUSIC').length, 1);
  assert.equal(imported.audio.find((t) => t.role === 'MUSIC').clips[0].dur, 6);
  const p = publicEdl(imported);
  assert.ok(toTimeline(p).tracks_bottom_to_top.some((t) => t.role === 'MUSIC'));
  planSound(imported, { template: 'podcast' });
  assert.equal(
    imported.sound.music_id,
    imported.audio.find((t) => t.role === 'MUSIC').clips[0].src,
  );
  assert.equal(
    imported.audio.find((t) => t.role === 'MUSIC').track,
    'user-music',
  );
  const followup = retainUserMusic(fixture(), imported);
  validate(followup);
  assert.equal(
    followup.audio.find((t) => t.role === 'MUSIC').track,
    'user-music',
  );
  assert.equal(
    planSound(fixture(), { note: 'no music' }).audio.find(
      (t) => t.role === 'MUSIC',
    ).clips.length,
    0,
  );
});
test('beat snapping preserves source handles and skips speech, native final mixer is intercepted', async () => {
  const e = fixture();
  e.video[0].clips = [
    { id: 'v1', src: 's', at: 0, in: 0, out: 3.04 },
    { id: 'v2', src: 's', at: 3.04, in: 3.04, out: 6 },
  ];
  e.audio = [];
  assert.equal(
    snapCuts(e, [{ t: 3, downbeat: true }], { musicLed: true }).length,
    1,
  );
  assert.equal(e.video[0].clips[1].at, 3);
  let native = 0;
  const api = pictureTools({
    mcp: {
      call() {
        native++;
      },
    },
    emit() {},
  });
  assert.ok(api.handles.has('finish_audio'));
  await api.call('finish_audio', {});
  assert.equal(native, 0);
});
test('pitch/phase guard and adaptive filters select cleanup without canceling voice', () => {
  const values = Float32Array.from({ length: 720 }, (_, i) =>
    Math.sin((2 * Math.PI * 140 * i) / 24000),
  );
  assert.ok(Math.abs(pitch(values) - 140) < 2);
  const b = Buffer.alloc(24000 * 8);
  for (let i = 0; i < 24000; i++) {
    const s = Math.sin((2 * Math.PI * 200 * i) / 24000) * 0.1;
    b.writeFloatLE(s, i * 8);
    b.writeFloatLE(-s, i * 8 + 4);
  }
  assert.equal(analyzePcm(b).channel, 'left');
  const chain = voiceFilters(
    {
      channel: 'average',
      highpass_hz: 100,
      noise_floor_db: -40,
      snr_db: 15,
      sibilance: 0.2,
      boxiness: 0.5,
      centroid_hz: 4000,
    },
    { studio: true },
  ).join(',');
  for (const f of [
    'agate',
    'deesser',
    'anlmdn',
    'aexciter',
    'aecho',
    'ratio=3',
    'ratio=2',
  ])
    assert.ok(chain.includes(f));
});
test(
  'six-second audio-only smoke: cleanup, looped user music, SFX, stems, master and cache',
  { skip: !available, timeout: 120000 },
  async (t) => {
    const dir = await mkdtemp(join(tmpdir(), 'kimo-audio-smoke-'));
    t.diagnostic(`artifacts: ${dir}`);
    const raw = join(dir, 'voice source.wav');
    const anlmdn = await supportsAnlmdn(ffmpeg);
    t.diagnostic(`anlmdn supported by this FFmpeg: ${anlmdn}`);
    const adaptive = voiceFilters(
      {
        channel: 'average',
        highpass_hz: 100,
        noise_floor_db: -40,
        snr_db: 15,
        sibilance: 0.2,
        boxiness: 0.5,
        centroid_hz: 4000,
      },
      { studio: true, anlmdn },
    );
    await run(ffmpeg, [
      '-f',
      'lavfi',
      '-i',
      'anoisesrc=d=0.5:r=48000:a=0.01',
      '-af',
      adaptive.join(','),
      '-f',
      'null',
      '-',
    ]);
    await run(ffmpeg, [
      '-f',
      'lavfi',
      '-i',
      'aevalsrc=0.0015*random(0)+if(between(t\\,0.7\\,2.3)+between(t\\,3.3\\,5.5)\\,0.11*sin(2*PI*140*t)+0.035*sin(2*PI*280*t)+0.014*sin(2*PI*6000*t)\\,0):s=48000:d=6',
      '-ac',
      '2',
      '-c:a',
      'pcm_s24le',
      raw,
    ]);
    const edl = fixture();
    edl.sources[0].path = raw;
    edl.sources[0].duration = 6;
    edl.sources.push({
      id: 'silent',
      path: 'not-an-audio-stream.mp4',
      audio: false,
      duration: 6,
    });
    edl.audio.push({
      track: 'silent',
      role: 'VOICE',
      clips: [{ id: 'silent-a', src: 'silent', at: 0, in: 0, out: 6, dur: 6 }],
    });
    edl.audio[0].clips[0].dur = 3;
    edl.audio[0].clips[0].out = 3;
    edl.audio[0].clips.push({
      id: 'a2',
      src: 's',
      at: 3.02,
      in: 3,
      out: 5.98,
      dur: 2.98,
      speed: 1,
    });
    edl.camera_plan = {
      words: {
        [raw.replaceAll('\\', '/')]: [
          { start: 0.7, end: 2.3 },
          { start: 3.3, end: 5.5 },
        ],
      },
    };
    const shortMusic = join(dir, 'short music.wav');
    await run(ffmpeg, [
      '-f',
      'lavfi',
      '-i',
      'sine=f=440:r=48000:d=2',
      '-ac',
      '2',
      shortMusic,
    ]);
    const added = addUserMusic(edl, {
      path: shortMusic,
      audio: true,
      duration: 2,
    });
    added.sound.speech = [
      [0.7, 2.3],
      [3.3, 5.5],
    ];
    const s = libraries().sfx.find((s) => s.kind === 'whoosh');
    added.audio.push({
      track: 'fx',
      role: 'SFX',
      clips: [
        {
          id: 'fx1',
          asset: join(root, s.path),
          at: 1,
          in: 0,
          out: s.duration,
          dur: s.duration,
          sound_sfx: { peak_db: s.peak_db, pan: 0.75 },
        },
      ],
    });
    const soundDir = join(dir, 'audio');
    const output = await mixSound(added, {
      ffmpeg,
      dir: soundDir,
      duration: 6,
    });
    assert.ok(existsSync(output));
    const report = JSON.parse(
      await readFile(join(soundDir, 'report.json'), 'utf8'),
    );
    t.diagnostic(JSON.stringify(report.master));
    assert.equal(report.room_tone_gaps, 1);
    assert.ok(report.master.checks.loudness);
    assert.ok(report.master.checks.true_peak);
    assert.ok(report.master.checks.no_clipping);
    assert.ok(report.master.checks.dc);
    assert.ok(report.master.checks.stereo);
    for (const name of ['voice', 'music', 'sfx'])
      assert.ok(
        (await stat(join(soundDir, `${name}.wav`))).size > 48000 * 6 * 4,
      );
    const rms = async (path, at) => {
      const { stdout } = await run(
        ffmpeg,
        [
          '-ss',
          String(at),
          '-t',
          '0.2',
          '-i',
          path,
          '-ac',
          '1',
          '-ar',
          '12000',
          '-f',
          'f32le',
          '-',
        ],
        { binary: true },
      );
      let sum = 0;
      for (let i = 0; i < stdout.length; i += 4)
        sum += stdout.readFloatLE(i) ** 2;
      return Math.sqrt(sum / (stdout.length / 4));
    };
    const inputSnr =
      20 * Math.log10((await rms(raw, 1)) / (await rms(raw, 0.2)));
    const voice = join(soundDir, 'voice.wav'),
      outputSnr =
        20 * Math.log10((await rms(voice, 1)) / (await rms(voice, 0.2)));
    t.diagnostic(
      `synthetic SNR: input ${inputSnr.toFixed(2)} dB; processed ${outputSnr.toFixed(2)} dB`,
    );
    assert.ok(outputSnr > inputSnr + 2);
    const spectralRatio = async (path) => {
      const { stdout } = await run(
        ffmpeg,
        [
          '-ss',
          '1',
          '-t',
          '0.2',
          '-i',
          path,
          '-ac',
          '1',
          '-ar',
          '24000',
          '-f',
          'f32le',
          '-',
        ],
        { binary: true },
      );
      const component = (hz) => {
        let re = 0,
          im = 0;
        for (let i = 0; i < stdout.length / 4; i++) {
          const a = (2 * Math.PI * hz * i) / 24000,
            v = stdout.readFloatLE(i * 4);
          re += v * Math.cos(a);
          im += v * Math.sin(a);
        }
        return Math.hypot(re, im);
      };
      return component(6000) / component(140);
    };
    const trebleChange =
      20 *
      Math.log10((await spectralRatio(voice)) / (await spectralRatio(raw)));
    t.diagnostic(
      `synthetic 6 kHz / 140 Hz change: ${trebleChange.toFixed(2)} dB`,
    );
    assert.ok(
      trebleChange > -10,
      'cleanup must not excessively dull the synthetic treble component',
    );
    // A cached second pass must retain the exact processed voice file.
    const cacheFile = (await import('node:fs/promises')).readdir;
    const cached = (await cacheFile(join(soundDir, 'cache'))).find((p) =>
      p.endsWith('.json'),
    );
    const before = (await stat(join(soundDir, 'cache', cached))).mtimeMs;
    await mixSound(added, { ffmpeg, dir: soundDir, duration: 6 });
    assert.equal((await stat(join(soundDir, 'cache', cached))).mtimeMs, before);
    const podcast = await remixFromStems({
      ffmpeg,
      dir: soundDir,
      output: join(soundDir, 'podcast.wav'),
      target: -16,
    });
    t.diagnostic(`podcast remix: ${podcast.lufs} LUFS`);
    assert.ok(podcast.checks.loudness);
    assert.equal(podcast.target_lufs, -16);
  },
);
