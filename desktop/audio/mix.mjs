import { mkdir, readFile, writeFile, rename } from 'node:fs/promises';
import { existsSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { createHash } from 'node:crypto';
import {
  run,
  measureLoudness,
  number,
  db,
  tempo,
  scriptOption,
} from './process.mjs';
import { processVoice } from './voice.mjs';
import {
  fitMusic,
  detectBeats,
  speechIntervals,
  duckEnvelope,
  envelopeExpression,
} from './music.mjs';
import { sfxGain } from './sfx.mjs';
import { remixFromStems } from './master.mjs';

const signature = (p) => {
  const s = statSync(p);
  return [p, s.size, s.mtimeMs];
};
const key = (v) =>
  createHash('sha256').update(JSON.stringify(v)).digest('hex').slice(0, 24);
function clipVolume(clip) {
  const curve = clip.native_audio?.volume;
  if (!curve) return `volume=${Number(clip.gain_db) || 0}dB`;
  const finite = (v, fallback) =>
    Number.isFinite(Number(v)) ? Number(v) : fallback;
  const keys = (curve.keys ?? [])
    .filter((k) => Number.isFinite(k.t) && Number.isFinite(k.v))
    .sort((a, b) => a.t - b.t);
  let expr = String(finite(keys.at(-1)?.v, finite(curve.base, 1)));
  for (let i = keys.length - 2; i >= 0; i--) {
    const a = keys[i],
      b = keys[i + 1];
    if (b.t > a.t)
      expr = `if(lt(t,${b.t}),${a.v}+(t-${a.t})*${(b.v - a.v) / (b.t - a.t)},${expr})`;
  }
  if (keys.length)
    expr = `if(lt(t,${keys[0].t}),${finite(curve.base, keys[0].v)},${expr})`;
  return `volume='${expr}':eval=frame`;
}
async function graphFile(
  ffmpeg,
  dir,
  name,
  args,
  filters,
  label,
  output,
  options,
) {
  const script = join(dir, `${name}.ffgraph`);
  await writeFile(script, filters.join(';\n'));
  await run(
    ffmpeg,
    [
      ...args,
      await scriptOption(ffmpeg),
      script,
      '-map',
      label,
      '-ac',
      '2',
      '-ar',
      '48000',
      '-c:a',
      'pcm_s24le',
      output,
    ],
    { ...options, title: `sound design: ${name}` },
  );
}
async function stem(ffmpeg, dir, name, entries, duration, options) {
  const args = [],
    filters = [],
    labels = [];
  for (const [i, e] of entries.entries()) {
    args.push('-i', e.path);
    const chain = [
      'aresample=48000',
      'aformat=channel_layouts=stereo',
      ...(e.filters ?? []),
      `atrim=duration=${e.dur}`,
      'asetpts=PTS-STARTPTS',
      `afade=t=in:d=${Math.min(e.fade_in ?? 0.008, e.dur / 3)}`,
      `afade=t=out:st=${Math.max(0, e.dur - (e.fade_out ?? 0.015))}:d=${Math.min(e.fade_out ?? 0.015, e.dur / 3)}`,
      `adelay=${Math.round(e.at * 48000)}S:all=1`,
    ];
    filters.push(`[${i}:a]${chain.join(',')}[a${i}]`);
    labels.push(`[a${i}]`);
  }
  if (!entries.length) {
    args.push('-f', 'lavfi', '-i', 'anullsrc=r=48000:cl=stereo');
    filters.push(`[0:a]atrim=duration=${duration}[out]`);
  } else
    filters.push(
      `${labels.join('')}amix=inputs=${labels.length}:normalize=0,apad,atrim=end_sample=${Math.round(duration * 48000)}[out]`,
    );
  const output = join(dir, `${name}.wav`);
  await graphFile(ffmpeg, dir, name, args, filters, '[out]', output, options);
  return output;
}
async function fitTrack(ffmpeg, path, meta, clip, output, options) {
  const duration = clip.dur,
    fit = fitMusic(meta, duration),
    count = Math.max(1, Math.ceil(duration / fit.period));
  if (count > 200)
    throw new Error('Music loop count exceeds the audio graph limit');
  const args = ['-i', path],
    filters = [];
  const overlap = Math.min(
    fit.crossfade,
    Math.max(0, (meta.duration ?? Infinity) - fit.start - fit.period),
  );
  if (count === 1)
    filters.push(
      `[0:a]atrim=start=${fit.start}:duration=${duration},asetpts=PTS-STARTPTS[loop]`,
    );
  else {
    filters.push(
      `[0:a]asplit=${count}${Array.from({ length: count }, (_, i) => `[s${i}]`).join('')}`,
    );
    for (let i = 0; i < count; i++)
      filters.push(
        `[s${i}]atrim=start=${fit.start}:duration=${fit.period + overlap},asetpts=PTS-STARTPTS[l${i}]`,
      );
    let previous = 'l0';
    for (let i = 1; i < count; i++) {
      const out = i === count - 1 ? 'loop' : `x${i}`;
      filters.push(
        `[${previous}][l${i}]${overlap > 0 ? `acrossfade=d=${overlap}:c1=qsin:c2=qsin` : 'concat=n=2:v=0:a=1'}[${out}]`,
      );
      previous = out;
    }
  }
  filters.push(
    `[loop]apad,atrim=duration=${duration},afade=t=out:st=${Math.max(0, duration - fit.fade)}:d=${fit.fade},loudnorm=I=-16:TP=-2:LRA=7,aresample=48000[out]`,
  );
  await graphFile(
    ffmpeg,
    join(output, '..'),
    'music-fit',
    args,
    filters,
    '[out]',
    output,
    options,
  );
  return fit;
}
async function localRms(ffmpeg, path, at, options) {
  const { stdout } = await run(
    ffmpeg,
    [
      '-ss',
      String(Math.max(0, at - 0.04)),
      '-t',
      '0.24',
      '-i',
      path,
      '-ar',
      '12000',
      '-ac',
      '1',
      '-f',
      'f32le',
      '-',
    ],
    { ...options, binary: true, title: 'SFX: checking the local voice level' },
  );
  let sum = 0;
  for (let i = 0; i + 4 <= stdout.length; i += 4)
    sum += stdout.readFloatLE(i) ** 2;
  return db(Math.sqrt(sum / Math.max(1, stdout.length / 4)));
}
/** App-owned audio pipeline. Stems and measurements survive the compose scratch directory. */
export async function mixSound(
  edl,
  { ffmpeg, dir, duration, signal, emit = () => {} },
) {
  await mkdir(join(dir, 'cache'), { recursive: true });
  const options = { signal, emit, duration },
    voice = [],
    music = [],
    sfx = [],
    analyses = [],
    fits = [];
  const source = (c) =>
    edl.sources.find((s) => s.id === c.src)?.path ?? c.asset;
  for (const track of edl.audio)
    for (const c0 of track.clips) {
      const c = { ...c0, dur: c0.dur ?? (c0.out - c0.in) / (c0.speed ?? 1) };
      if (!(c.dur > 0) || c.at >= duration) continue;
      const path = source(c);
      if (!path) continue;
      if (edl.sources.find((s) => s.id === c.src)?.audio === false) continue;
      const role = track.role ?? 'SFX';
      if (role === 'VOICE') {
        const studio = Boolean(edl.sound.studio),
          hash = key([8, signature(path), c.in, c.out, c.speed, c.dur, studio]);
        const cleaned = join(dir, 'cache', `${hash}.wav`),
          report = join(dir, 'cache', `${hash}.json`);
        let analysis;
        if (existsSync(cleaned) && existsSync(report))
          analysis = JSON.parse(await readFile(report, 'utf8'));
        else {
          analysis = await processVoice(ffmpeg, path, c, cleaned, {
            ...options,
            studio,
          });
          await writeFile(report, JSON.stringify(analysis));
        }
        const ws =
          edl.camera_plan?.words?.[path.replaceAll('\\', '/')] ??
          edl.camera_plan?.words?.[c.src];
        // With no trustworthy word boundaries, omit room fills. Low-energy
        // unvoiced consonants alone are not proof that a region is speech-free.
        if (
          !ws?.length ||
          ws.some(
            (w) =>
              Number(w.start) < analysis.room_source_in + 0.5 &&
              Number(w.end) > analysis.room_source_in,
          )
        )
          analysis = { ...analysis, room_tone: null };
        analyses.push({ clip: c.id, ...analysis });
        voice.push({
          path: cleaned,
          at: c.at,
          dur: c.dur,
          fade_in: c.fade_in,
          fade_out: c.fade_out,
          filters: [clipVolume(c)],
        });
      } else if (role === 'MUSIC') {
        const musicPath = join(
          dir,
          'cache',
          `${key([8, signature(path), c.in, c.out, c.dur, c.sound_music])}-music.wav`,
        );
        let metadata = c.sound_music;
        const metadataPath = musicPath + '.json';
        if (!metadata && existsSync(metadataPath))
          metadata = JSON.parse(await readFile(metadataPath, 'utf8'));
        if (!metadata) {
          metadata = await detectBeats(ffmpeg, path, options);
          metadata.duration = c.out ?? c.dur;
          metadata.loop_start = Math.min(
            (c.out ?? c.dur) - 0.05,
            (c.in ?? 0) + metadata.beat_offset,
          );
          const bar = 240 / metadata.bpm;
          metadata.loop_end = Math.max(
            metadata.loop_start + 0.05,
            (c.out ?? c.dur) -
              Math.min(bar, ((c.out ?? c.dur) - (c.in ?? 0)) * 0.1),
          );
          await writeFile(metadataPath, JSON.stringify(metadata));
        }
        const cached = existsSync(musicPath);
        if (!cached) {
          const partial = musicPath + '.partial.wav';
          await fitTrack(ffmpeg, path, metadata, c, partial, options);
          await rename(partial, musicPath);
        }
        fits.push({
          clip: c.id,
          at: c.at,
          bpm: metadata.bpm,
          beat_offset: metadata.beat_offset ?? 0,
          estimated: Boolean(metadata.estimated),
          cached,
          ...fitMusic(metadata, c.dur),
        });
        music.push({
          path: musicPath,
          at: c.at,
          dur: c.dur,
          filters: [clipVolume(c)],
        });
      } else
        sfx.push({
          clip: c,
          path,
          at: c.at,
          dur: c.dur,
          filters: [
            `atrim=start=${c.in ?? 0}`,
            ...tempo(c.speed),
            `volume=${Number(c.gain_db) || 0}dB`,
          ],
        });
    }
  // Fill only tiny editorial gaps, only from a verified unvoiced half-second.
  const ordered = voice
    .map((v, i) => ({ ...v, analysis: analyses[i] }))
    .sort((a, b) => a.at - b.at);
  let roomGaps = 0;
  for (let i = 1; i < ordered.length; i++) {
    const previous = ordered[i - 1],
      end = previous.at + previous.dur,
      gap = ordered[i].at - end,
      a = previous.analysis;
    if (gap < 0.003 - 1e-6 || gap > 0.04 + 1e-6 || !a.room_tone) continue;
    voice.push({
      path: a.room_source,
      at: end,
      dur: gap,
      fade_in: 0.001,
      fade_out: 0.001,
      filters: [
        `atrim=start=${a.room_source_in}:duration=0.5`,
        'asetpts=PTS-STARTPTS',
        'aloop=loop=-1:size=24000',
        `highpass=f=${a.highpass_hz}`,
      ],
    });
    roomGaps++;
  }
  const voicePath = await stem(ffmpeg, dir, 'voice', voice, duration, options);
  const musicRaw = await stem(
    ffmpeg,
    dir,
    'music-raw',
    music,
    duration,
    options,
  );
  const spans = speechIntervals(edl),
    envelope = duckEnvelope(spans, duration, { hook: edl.sound.hook });
  // Parallel sidechain keeps the requested word envelope audible: full sidechain
  // alone can add >20 dB reduction to its -16 dB speech envelope.
  const graph = [
    `[0:a]asplit=2[dry][wet]`,
    `[wet][1:a]sidechaincompress=threshold=0.02:ratio=8:attack=40:release=400:makeup=1:link=maximum[sc]`,
    `[dry]volume=0.72[d]`,
    `[sc]volume=0.28[w]`,
    `[d][w]amix=inputs=2:normalize=0,volume='${envelopeExpression(envelope)}':eval=frame,apad,atrim=end_sample=${Math.round(duration * 48000)}[out]`,
  ];
  // One second slack avoids EOF buffering truncation in older bundled FFmpeg builds.
  graph[0] = '[0:a]apad=pad_dur=1,asplit=2[dry][wet]';
  graph[1] =
    '[1:a]apad=pad_dur=1[v];[wet][v]sidechaincompress=threshold=0.02:ratio=8:attack=40:release=400:makeup=1:link=maximum[sc]';
  await graphFile(
    ffmpeg,
    dir,
    'music-duck',
    ['-i', musicRaw, '-i', voicePath],
    graph,
    '[out]',
    join(dir, 'music.wav'),
    options,
  );
  for (const e of sfx) {
    const rms = await localRms(ffmpeg, voicePath, e.at, options);
    const onset = spans.some(([a]) => Math.abs(a - e.at) < 0.12);
    // Imported/legacy effects get measured too; a guessed peak is not a safety cap.
    let peak = e.clip.sound_sfx?.peak_db;
    if (!Number.isFinite(peak)) {
      const m = await measureLoudness(ffmpeg, e.path, options);
      peak = number(m.input_tp, 0);
    }
    const gain = sfxGain({ peak_db: peak }, rms > -65 ? rms : null, { onset });
    e.filters.push(`volume=${gain}dB`);
    const pan = e.clip.sound_sfx?.pan ?? 0;
    if (pan)
      e.filters.push(
        `pan=stereo|c0=${Math.cos(((pan + 1) * Math.PI) / 4)}*c0|c1=${Math.sin(((pan + 1) * Math.PI) / 4)}*c1`,
      );
    e.relative_gain_db = gain;
  }
  await stem(ffmpeg, dir, 'sfx', sfx, duration, options);
  const output = join(dir, 'master.wav'),
    master = await remixFromStems({
      ffmpeg,
      dir,
      output,
      target: edl.sound.target_lufs ?? -14,
      ...options,
    });
  const report = {
    version: 8,
    voice: analyses,
    music_fits: fits,
    word_envelope: envelope,
    room_tone_gaps: roomGaps,
    sfx: sfx.map((e) => ({
      clip: e.clip.id,
      at: e.at,
      relative_gain_db: e.relative_gain_db,
    })),
    master,
    stems: ['voice.wav', 'music.wav', 'sfx.wav'],
  };
  await writeFile(join(dir, 'report.json'), JSON.stringify(report, null, 2));
  edl.sound.report = report;
  for (const [name, ok] of Object.entries(master.checks))
    if (ok === false)
      emit({
        t: 'op',
        tool: 'audio_check',
        phase: 'end',
        ok: true,
        warning: true,
        title: `audio ${name}: outside target; see audio/report.json`,
        at: Date.now(),
      });
  return output;
}
