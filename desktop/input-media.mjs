import { stat, mkdir, rename } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { createHash } from 'node:crypto';
import { run } from './audio/process.mjs';

export const STANDARD_RATES = [
  24000 / 1001,
  24,
  25,
  30000 / 1001,
  30,
  50,
  60000 / 1001,
  60,
];
export function standardRate(fps) {
  return STANDARD_RATES.reduce(
    (a, b) => (Math.abs(b - fps) < Math.abs(a - fps) ? b : a),
    30,
  );
}
export function inputPolicy(file) {
  if (file.duration > 10800)
    throw new Error(
      'This file is longer than 3 hours. Trim it to 3 hours or less before importing.',
    );
  const hdr = ['smpte2084', 'arib-std-b67'].includes(file.color?.trc),
    rotation = (((file.rotation ?? 0) % 360) + 360) % 360,
    odd = file.width % 2 !== 0 || file.height % 2 !== 0;
  return {
    hdr,
    rotation,
    odd,
    vfr: !!file.vfr,
    needed:
      hdr ||
      !!rotation ||
      odd ||
      !!file.vfr ||
      /10|12/.test(file.pix_fmt ?? ''),
    fps: standardRate(file.fps || 30),
  };
}
/** Normalize once, under the project. Original asset metadata is retained for credits. */
export async function prepareInputs(
  files,
  { dir, ffmpeg, ffprobe, probe, signal, emit = () => {} },
) {
  const results = [];
  await mkdir(join(dir, 'inputs'), { recursive: true });
  for (const file of files) {
    const policy = inputPolicy(file);
    if (file.kind !== 'video' || !policy.needed) {
      results.push(file);
      continue;
    }
    const info = await stat(file.path),
      key = createHash('sha256')
        .update(JSON.stringify([file.path, info.size, info.mtimeMs, policy, 2]))
        .digest('hex'),
      path = join(dir, 'inputs', key + '.mp4');
    if (!existsSync(path)) {
      const vf = [
        ...(policy.hdr
          ? [
              'zscale=t=linear:npl=100,format=gbrpf32le,zscale=p=bt709,tonemap=tonemap=hable:desat=0,zscale=t=bt709:m=bt709:r=tv',
            ]
          : []),
        `fps=${policy.fps}`,
        'scale=ceil(iw/2)*2:ceil(ih/2)*2:flags=lanczos',
        'setsar=1',
        'format=yuv420p',
      ];
      await run(
        ffmpeg,
        [
          '-i',
          file.path,
          '-map',
          '0:v:0',
          '-map',
          '0:a?',
          '-vf',
          vf.join(','),
          '-c:v',
          'libx264',
          '-preset',
          'veryfast',
          '-crf',
          '16',
          '-fps_mode',
          'cfr',
          '-c:a',
          'aac',
          '-b:a',
          '384k',
          '-ar',
          '48000',
          '-ac',
          '2',
          '-metadata:s:v:0',
          'rotate=0',
          '-color_primaries',
          'bt709',
          '-color_trc',
          'bt709',
          '-colorspace',
          'bt709',
          path + '.partial.mp4',
        ],
        {
          signal,
          emit,
          title: `prepare input · CFR${policy.rotation ? ' · rotation baked' : ''}${policy.hdr ? ' · HDR → SDR hable' : ''}`,
          duration: file.duration,
        },
      );
      await rename(path + '.partial.mp4', path);
    }
    const normalized = await probe(ffprobe, path);
    if (!normalized || normalized.rotation || normalized.vfr)
      throw new Error('Normalized input failed CFR/rotation validation');
    results.push({
      ...normalized,
      original: { path: file.path, rotation: file.rotation, color: file.color },
      normalized: true,
    });
  }
  return results;
}
