import { run, loudnessJson, number, db, tempo } from './process.mjs';

const median = (xs) =>
  xs.length ? [...xs].sort((a, b) => a - b)[Math.floor(xs.length / 2)] : null;
/** Radix-2 FFT: bounded 1024-point windows for centroid and sibilance. */
export function spectrum(samples) {
  const n = 1024,
    re = new Float64Array(n),
    im = new Float64Array(n);
  for (let i = 0; i < Math.min(n, samples.length); i++)
    re[i] = samples[i] * (0.5 - 0.5 * Math.cos((2 * Math.PI * i) / (n - 1)));
  for (let i = 1, j = 0; i < n; i++) {
    let bit = n >> 1;
    for (; j & bit; bit >>= 1) j ^= bit;
    j ^= bit;
    if (i < j) [re[i], re[j]] = [re[j], re[i]];
  }
  for (let len = 2; len <= n; len *= 2)
    for (let i = 0; i < n; i += len)
      for (let j = 0; j < len / 2; j++) {
        const a = (-2 * Math.PI * j) / len,
          k = i + j,
          l = k + len / 2;
        const r = re[l] * Math.cos(a) - im[l] * Math.sin(a),
          q = re[l] * Math.sin(a) + im[l] * Math.cos(a);
        re[l] = re[k] - r;
        im[l] = im[k] - q;
        re[k] += r;
        im[k] += q;
      }
  return Float64Array.from(
    { length: n / 2 },
    (_, k) => re[k] ** 2 + im[k] ** 2,
  );
}
export function pitch(samples, rate = 24000) {
  const mean = samples.reduce((a, v) => a + v, 0) / Math.max(1, samples.length);
  samples = Float32Array.from(samples, (v) => v - mean);
  let best = 0,
    lag = 0;
  const values = [];
  for (let l = Math.floor(rate / 350); l <= Math.ceil(rate / 70); l++) {
    let ab = 0,
      aa = 0,
      bb = 0;
    for (let i = 0; i < samples.length - l; i++) {
      ab += samples[i] * samples[i + l];
      aa += samples[i] ** 2;
      bb += samples[i + l] ** 2;
    }
    const c = ab / Math.sqrt(aa * bb || 1);
    values.push({ l, c });
    if (c > best) {
      best = c;
      lag = l;
    }
  }
  const first = values.find(
    (v, i) =>
      v.c > 0.75 &&
      v.c >= best * 0.98 &&
      v.c >= (values[i - 1]?.c ?? 0) &&
      v.c >= (values[i + 1]?.c ?? 0),
  );
  return best > 0.75 ? rate / (first?.l ?? lag) : null;
}
export function analyzePcm(buffer, sampleRate = 24000) {
  const n = Math.floor(buffer.length / 8),
    mono = new Float32Array(n);
  let left = 0,
    right = 0,
    cross = 0,
    dc = 0;
  for (let i = 0; i < n; i++) {
    const l = buffer.readFloatLE(i * 8),
      r = buffer.readFloatLE(i * 8 + 4);
    left += l * l;
    right += r * r;
    cross += l * r;
  }
  const correlation =
    left * right > 1e-15 ? cross / Math.sqrt(left * right) : null;
  const channel =
    (correlation != null && correlation < 0) ||
    Math.min(left, right) < Math.max(left, right) * 0.05
      ? left >= right
        ? 'left'
        : 'right'
      : 'average';
  for (let i = 0; i < n; i++) {
    const l = buffer.readFloatLE(i * 8),
      r = buffer.readFloatLE(i * 8 + 4);
    mono[i] = channel === 'left' ? l : channel === 'right' ? r : (l + r) / 2;
    dc += mono[i];
  }
  const frames = [],
    window = Math.round(sampleRate * 0.03);
  for (let i = 0; i + window <= n; i += window) {
    let sum = 0;
    for (let j = i; j < i + window; j++) sum += mono[j] ** 2;
    frames.push({ at: i / sampleRate, rms: Math.sqrt(sum / window), i });
  }
  const rms = frames.map((f) => f.rms).sort((a, b) => a - b),
    speech = rms[Math.floor(rms.length * 0.85)] ?? 0;
  // A continuous half second, not isolated low-amplitude samples from a syllable.
  let quiet = { rms: Infinity, at: 0 },
    roomLength = Math.round(sampleRate * 0.5);
  for (let i = 0; i + roomLength <= n; i += window) {
    let sum = 0;
    for (let j = i; j < i + roomLength; j++) sum += mono[j] ** 2;
    const value = Math.sqrt(sum / roomLength);
    if (value < quiet.rms) quiet = { rms: value, at: i / sampleRate };
  }
  const snr = db(speech / Math.max(quiet.rms, 1e-10));
  const pitches = [],
    centroids = [],
    sibilance = [],
    mud = [];
  const stride = Math.max(1, Math.ceil(frames.length / 80));
  for (let i = 0; i < frames.length; i += stride) {
    const f = frames[i];
    if (f.rms < speech * 0.2) continue;
    const p = pitch(mono.subarray(f.i, f.i + window), sampleRate);
    if (p) pitches.push(p);
    const s = spectrum(mono.subarray(f.i, f.i + 1024));
    let total = 0,
      weighted = 0,
      hiss = 0,
      box = 0;
    s.forEach((v, k) => {
      const hz = (k * sampleRate) / 1024;
      total += v;
      weighted += v * hz;
      if (hz >= 5000 && hz <= 8000) hiss += v;
      if (hz >= 200 && hz <= 400) box += v;
    });
    if (total) {
      centroids.push(weighted / total);
      sibilance.push(hiss / total);
      mud.push(box / total);
    }
  }
  // Conservatively reject room tone when there is voiced periodic content or insufficient separation.
  const room = mono.subarray(
    Math.round(quiet.at * sampleRate),
    Math.round(quiet.at * sampleRate) + roomLength,
  );
  const voicedRoom = [0, 0.15, 0.3].some((t) =>
    pitch(
      room.subarray(
        Math.round(t * sampleRate),
        Math.round(t * sampleRate) + window,
      ),
      sampleRate,
    ),
  );
  return {
    pitch_hz: median(pitches),
    highpass_hz: (median(pitches) ?? 130) >= 165 ? 100 : 80,
    noise_floor_db: Math.max(-80, Math.min(-20, db(quiet.rms))),
    snr_db: Number.isFinite(snr) ? snr : null,
    centroid_hz: median(centroids),
    sibilance: median(sibilance) ?? 0,
    boxiness: median(mud) ?? 0,
    channel,
    correlation,
    dc: dc / Math.max(1, n),
    room_tone:
      Number.isFinite(quiet.rms) && snr > 12 && !voicedRoom
        ? { at: quiet.at, dur: 0.5 }
        : null,
  };
}
export async function analyzeVoice(
  ffmpeg,
  path,
  { from = 0, length = 30, ...options } = {},
) {
  const { stdout } = await run(
    ffmpeg,
    [
      '-ss',
      String(from),
      '-t',
      String(Math.min(30, length)),
      '-i',
      path,
      '-vn',
      '-ar',
      '24000',
      '-ac',
      '2',
      '-f',
      'f32le',
      '-',
    ],
    {
      ...options,
      binary: true,
      title: 'voice: pitch, room tone and spectral analysis',
    },
  );
  return analyzePcm(stdout);
}
const denoisers = new Map();
export async function supportsAnlmdn(ffmpeg, options = {}) {
  if (!denoisers.has(ffmpeg))
    denoisers.set(
      ffmpeg,
      (async () => {
        try {
          await run(
            ffmpeg,
            [
              '-f',
              'lavfi',
              '-i',
              'anoisesrc=d=0.15:r=48000:a=0.01',
              '-af',
              'aformat=channel_layouts=stereo,anlmdn=s=0.0001:p=0.002:r=0.006',
              '-f',
              'null',
              '-',
            ],
            { ...options, title: 'voice: checking strong-hiss filter support' },
          );
          return true;
        } catch (error) {
          if (options.signal?.aborted) {
            denoisers.delete(ffmpeg);
            throw error;
          }
          return false;
        }
      })(),
    );
  return denoisers.get(ffmpeg);
}
export function voiceFilters(analysis, { studio = false, anlmdn = true } = {}) {
  const a = analysis,
    channel =
      a.channel === 'left'
        ? 'c0'
        : a.channel === 'right'
          ? 'c1'
          : '0.5*c0+0.5*c1';
  const chain = [
    'aresample=48000',
    'aformat=channel_layouts=stereo',
    `pan=stereo|c0=${channel}|c1=${channel}`,
    `highpass=f=${a.highpass_hz}`,
    `afftdn=nr=10:nf=${Math.max(-80, Math.min(-20, a.noise_floor_db ?? -40))}:tn=1`,
  ];
  if (a.centroid_hz > 3500 && a.noise_floor_db > -45)
    chain.push(
      anlmdn ? 'anlmdn=s=0.0001:p=0.002:r=0.006' : 'afftdn=nr=6:nf=-40:tn=1',
    );
  if (a.snr_db != null && a.snr_db < 20)
    chain.push(
      'agate=threshold=0.02:ratio=2:range=0.2511886:attack=10:release=180',
    );
  if (a.sibilance > 0.12) chain.push('deesser=i=0.4:m=0.5:f=0.5');
  if (a.boxiness > 0.3) chain.push('equalizer=f=300:t=q:w=1:g=-2.5');
  chain.push(
    'equalizer=f=3500:t=q:w=1:g=2',
    'highshelf=f=10000:g=1.5',
    'acompressor=threshold=0.1:ratio=3:attack=8:release=120:makeup=1',
    'acompressor=threshold=0.18:ratio=2:attack=15:release=160:makeup=1',
  );
  if (studio)
    chain.push('aexciter=amount=0.5:blend=0.1', 'aecho=0.96:1:35:0.03981');
  return chain;
}
export async function processVoice(ffmpeg, source, clip, output, options = {}) {
  const length =
    clip.out != null ? clip.out - (clip.in ?? 0) : clip.dur * (clip.speed ?? 1);
  const analysis = await analyzeVoice(ffmpeg, source, {
    ...options,
    from: clip.in ?? 0,
    length,
  });
  const strong = analysis.centroid_hz > 3500 && analysis.noise_floor_db > -45;
  const anlmdn = !strong || (await supportsAnlmdn(ffmpeg, options));
  if (!anlmdn)
    options.emit?.({
      t: 'op',
      phase: 'end',
      tool: 'audio_warning',
      ok: true,
      warning: true,
      title:
        'This FFmpeg build cannot run anlmdn safely; strong hiss uses an additional gentle FFT denoiser.',
      at: Date.now(),
    });
  const filter = [
    ...tempo(clip.speed),
    ...voiceFilters(analysis, { ...options, anlmdn }),
  ].join(',');
  const input = [
    '-ss',
    String(clip.in ?? 0),
    '-t',
    String(length),
    '-i',
    source,
    '-vn',
  ];
  const first = await run(
    ffmpeg,
    [
      ...input,
      '-af',
      `${filter},loudnorm=I=-16:TP=-2:LRA=7:print_format=json`,
      '-f',
      'null',
      '-',
    ],
    { ...options, title: 'voice: measuring clip level' },
  );
  const m = loudnessJson(first.stderr);
  const finite = [
    'input_i',
    'input_tp',
    'input_lra',
    'input_thresh',
    'target_offset',
  ].every((k) => Number.isFinite(Number(m[k])));
  const normalize = finite
    ? `loudnorm=I=-16:TP=-2:LRA=7:measured_I=${m.input_i}:measured_TP=${m.input_tp}:measured_LRA=${m.input_lra}:measured_thresh=${m.input_thresh}:offset=${m.target_offset}:linear=true`
    : 'anull';
  await run(
    ffmpeg,
    [
      ...input,
      '-af',
      `${filter},${normalize},aresample=48000,apad,atrim=duration=${clip.dur}`,
      '-ac',
      '2',
      '-c:a',
      'pcm_s24le',
      output,
    ],
    {
      ...options,
      title: 'voice: cleaning, de-essing and leveling to -16 LUFS',
    },
  );
  return {
    ...analysis,
    strong_hiss_filter: strong
      ? anlmdn
        ? 'anlmdn'
        : 'afftdn fallback (capability check failed)'
      : null,
    target_lufs: -16,
    input_lufs: number(m.input_i, null),
    predicted_lufs: number(m.output_i, null),
    room_source: source,
    room_source_in: (clip.in ?? 0) + (analysis.room_tone?.at ?? 0),
  };
}
