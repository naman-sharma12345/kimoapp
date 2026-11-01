import { writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { run, measureLoudness, number, scriptOption } from './process.mjs';
import { analyzePcm } from './voice.mjs';

export async function masterAudio(
  ffmpeg,
  input,
  output,
  { target = -14, ...options } = {},
) {
  const measured = await measureLoudness(ffmpeg, input, options, target);
  const finite = [
    'input_i',
    'input_tp',
    'input_lra',
    'input_thresh',
    'target_offset',
  ].every((k) => Number.isFinite(Number(measured[k])));
  const normalize = finite
    ? `loudnorm=I=${target}:TP=-1:LRA=7:measured_I=${measured.input_i}:measured_TP=${measured.input_tp}:measured_LRA=${measured.input_lra}:measured_thresh=${measured.input_thresh}:offset=${measured.target_offset}:linear=true`
    : 'anull';
  // Oversampled safety margin protects true peaks through the later AAC encode.
  await run(
    ffmpeg,
    [
      '-i',
      input,
      '-af',
      `${normalize},aresample=192000,alimiter=limit=0.841395:level=false:latency=true,aresample=48000`,
      '-c:a',
      'pcm_s24le',
      output,
    ],
    { ...options, title: `master: two-pass ${target} LUFS / -1 dBTP` },
  );
  const actual = await measureLoudness(ffmpeg, output, options, target);
  const { stderr } = await run(
    ffmpeg,
    ['-i', output, '-af', 'astats=metadata=0:reset=0', '-f', 'null', '-'],
    { ...options, title: 'master: checking peaks, DC and clipping' },
  );
  const values = (name) =>
    [...stderr.matchAll(new RegExp(`${name}:\\s*(-?[\\d.]+)`, 'g'))].map((m) =>
      Number(m[1]),
    );
  const peak = Math.max(...values('Peak level dB')),
    dc = Math.max(0, ...values('DC offset').map(Math.abs));
  const { stdout } = await run(
    ffmpeg,
    ['-t', '30', '-i', output, '-ar', '24000', '-ac', '2', '-f', 'f32le', '-'],
    {
      ...options,
      binary: true,
      title: 'master: checking stereo compatibility (first 30 seconds)',
    },
  );
  const compatibility = analyzePcm(stdout),
    lufs = number(actual.input_i, null),
    tp = number(actual.input_tp, null),
    lra = number(actual.input_lra, null);
  const report = {
    target_lufs: target,
    lufs,
    true_peak_db: tp,
    lra,
    dc,
    peak_db: Number.isFinite(peak) ? peak : null,
    stereo_correlation: compatibility.correlation,
    correlation_window_s: Math.min(30, stdout.length / 8 / 24000),
    normalization: finite ? 'two-pass' : 'silence (normalization unavailable)',
    checks: {
      loudness: lufs != null && Math.abs(lufs - target) <= 0.5,
      true_peak: tp != null && tp <= -1,
      lra: lra != null && lra >= 4 && lra <= 9,
      no_clipping: peak < 0,
      dc: dc < 0.001,
      stereo:
        compatibility.correlation == null
          ? null
          : compatibility.correlation > 0,
    },
    limitations: [
      'Stereo correlation samples the first 30 seconds; it is not a whole-program phase audit.',
      'Short or constant material may have LRA below 4; this is reported rather than fabricated.',
    ],
  };
  return report;
}
/** Remix only retained stems; no planner, native finish_audio, or picture render. */
export async function remixFromStems({
  ffmpeg,
  dir,
  output,
  gains = { voice: 0, music: 0, sfx: 0 },
  target = -14,
  ...options
}) {
  const names = ['voice', 'music', 'sfx'],
    graph = names.map(
      (n, i) =>
        `[${i}:a]volume=${Number.isFinite(gains[n]) ? gains[n] : 0}dB[a${i}]`,
    );
  graph.push(
    '[a0][a1][a2]amix=inputs=3:normalize=0,highpass=f=20,alimiter=limit=0.95:level=false:latency=true[mix]',
  );
  const script = join(dir, 'remix.ffgraph');
  await writeFile(script, graph.join(';\n'));
  const bus = join(dir, 'bus.wav');
  await run(
    ffmpeg,
    [
      ...names.flatMap((n) => ['-i', join(dir, `${n}.wav`)]),
      await scriptOption(ffmpeg),
      script,
      '-map',
      '[mix]',
      '-c:a',
      'pcm_s24le',
      bus,
    ],
    { ...options, title: 'mixing voice, music and SFX stems' },
  );
  return masterAudio(ffmpeg, bus, output, { ...options, target });
}
