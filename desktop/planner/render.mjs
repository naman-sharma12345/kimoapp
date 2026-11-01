import { existsSync, statSync } from 'node:fs';
import { mkdir, readFile, writeFile, rename } from 'node:fs/promises';
import { join } from 'node:path';
import { createHash } from 'node:crypto';
import { compose } from '../compose.mjs';
import { duration } from '../edl.mjs';
import { mixSound } from '../audio/mix.mjs';
import { run } from '../audio/process.mjs';
export const digest = (value) =>
  createHash('sha256').update(JSON.stringify(value)).digest('hex');
export async function atomicJson(path, value) {
  await writeFile(path + '.partial', JSON.stringify(value, null, 2));
  await rename(path + '.partial', path);
}
/** Content-derived dependencies prevent a requested cheap pass from reusing stale picture. */
export function renderKeys(edl) {
  const sources = edl.sources.map((s) => {
      let fingerprint = null;
      try {
        const stat = statSync(s.path);
        fingerprint = [stat.size, stat.mtimeMs];
      } catch {}
      return { ...s, fingerprint };
    }),
    base = {
      canvas: edl.canvas,
      sources: sources.filter((s) => s.kind !== 'audio'),
      video: edl.video,
      color: edl.color_finish,
    };
  return {
    base: digest(base),
    picture: digest([base, edl.overlays]),
    audio: digest([
      sources,
      edl.audio,
      edl.sound
        ? { ...edl.sound, report: undefined, stem_dir: undefined }
        : null,
      edl.camera_plan?.words,
    ]),
  };
}
export async function renderPlan({
  edl,
  ffmpeg,
  ffprobe,
  dir,
  signal,
  emit = () => {},
  fontsDir,
  cacheDir,
}) {
  await mkdir(dir, { recursive: true });
  const manifestPath = join(dir, 'creator-passes.json');
  const previous = existsSync(manifestPath)
      ? JSON.parse(await readFile(manifestPath, 'utf8'))
      : {},
    keys = renderKeys(edl),
    seconds = duration(edl);
  const base = join(dir, 'creator-base.mkv'),
    picture = join(dir, 'creator-picture.mkv'),
    master = join(dir, 'creator-master.mkv'),
    stems = join(dir, 'creator-audio');
  const passes = [];
  const render = async (model, path, name) => {
    passes.push(name);
    await compose({
      edl: model,
      ffmpeg,
      ffprobe,
      dir: join(dir, `.${name}`),
      output: path + '.partial.mkv',
      signal,
      emit,
      fontsDir,
      cacheDir,
    });
    await rename(path + '.partial.mkv', path);
  };
  if (previous.base !== keys.base || !existsSync(base)) {
    const model = structuredClone(edl);
    model.overlays = [];
    model.audio = [];
    model.sound = { enabled: false };
    await render(model, base, 'base');
    edl.color_report =
      model.color_report ??
      (existsSync(join(dir, 'color', 'report.json'))
        ? JSON.parse(await readFile(join(dir, 'color', 'report.json'), 'utf8'))
        : edl.color_report);
  }
  if (
    previous.picture !== keys.picture ||
    passes.includes('base') ||
    !existsSync(picture)
  ) {
    const model = structuredClone(edl);
    model.sources.push({
      id: 'creator-baked-base',
      path: base,
      kind: 'video',
      fps: edl.canvas.fps,
      w: edl.canvas.w,
      h: edl.canvas.h,
      duration: seconds,
      audio: false,
    });
    model.video = [
      {
        track: 'creator-base',
        clips: [
          {
            id: 'creator-base-picture',
            src: 'creator-baked-base',
            at: 0,
            in: 0,
            out: seconds,
            speed: 1,
            _baked: true,
          },
        ],
      },
    ];
    model.audio = [];
    model.sound = { enabled: false };
    await render(model, picture, 'overlay');
  }
  if (previous.audio !== keys.audio || !existsSync(join(stems, 'master.wav'))) {
    passes.push('audio');
    await mixSound(edl, {
      ffmpeg,
      dir: stems,
      duration: seconds,
      signal,
      emit,
    });
  } else if (existsSync(join(stems, 'report.json')) && edl.sound)
    edl.sound.report = JSON.parse(
      await readFile(join(stems, 'report.json'), 'utf8'),
    );
  if (passes.length || !existsSync(master)) {
    await run(
      ffmpeg,
      [
        '-y',
        '-i',
        picture,
        '-i',
        join(stems, 'master.wav'),
        '-map',
        '0:v:0',
        '-map',
        '1:a:0',
        '-c:v',
        'copy',
        '-c:a',
        'pcm_s24le',
        '-t',
        String(seconds),
        master + '.partial.mkv',
      ],
      { signal, title: 'creator: muxing cached picture and sound' },
    );
    await rename(master + '.partial.mkv', master);
  }
  if (edl.color_report) {
    await mkdir(join(dir, 'color'), { recursive: true });
    await atomicJson(join(dir, 'color', 'report.json'), edl.color_report);
  }
  await atomicJson(manifestPath, keys);
  emit({
    t: 'say',
    kind: 'creator',
    text: passes.length
      ? `rendered ${passes.join(' + ')} · other passes reused`
      : 'picture and sound unchanged · reused cached master',
  });
  return { master, passes, seconds };
}
