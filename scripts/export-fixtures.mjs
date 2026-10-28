import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync } from 'node:fs';
const root = 'packages/mock-server/fixtures/';
const manifest = JSON.parse(readFileSync(root + 'manifest.json', 'utf8'));
for (const orientation of ['horizontal', 'vertical']) {
  for (const resolution of ['1080p', '720p']) {
    for (const format of ['mp4', 'webm']) {
      if (resolution === '1080p' && format === 'mp4') continue;
      const name = `delivery-${orientation}-${resolution}.${format}`;
      const input =
        orientation === 'vertical'
          ? 'delivery-vertical.mp4'
          : 'delivery-final.mp4';
      const size =
        resolution === '720p'
          ? orientation === 'vertical'
            ? '720:1280'
            : '1280:720'
          : orientation === 'vertical'
            ? '1080:1920'
            : '1920:1080';
      execFileSync('ffmpeg', [
        '-y',
        '-loglevel',
        'error',
        '-i',
        root + input,
        '-vf',
        `scale=${size}`,
        '-threads',
        '2',
        ...(format === 'webm'
          ? [
              '-c:v',
              'libvpx-vp9',
              '-deadline',
              'realtime',
              '-cpu-used',
              '8',
              '-crf',
              '40',
              '-b:v',
              '0',
              '-c:a',
              'libopus',
            ]
          : [
              '-c:v',
              'libx264',
              '-preset',
              'ultrafast',
              '-crf',
              '28',
              '-c:a',
              'aac',
              '-movflags',
              '+faststart',
            ]),
        root + name,
      ]);
      const sha256 = createHash('sha256')
        .update(readFileSync(root + name))
        .digest('hex');
      const entry = {
        name,
        url: `https://raw.githubusercontent.com/naman-sharma12345/kimoapp/main/packages/mock-server/fixtures/${name}`,
        sha256,
        license: 'CC0-1.0',
        derivedFrom: input,
      };
      const existing = manifest.findIndex((item) => item.name === name);
      if (existing >= 0) manifest[existing] = entry;
      else manifest.push(entry);
    }
  }
}
writeFileSync(root + 'manifest.json', JSON.stringify(manifest, null, 2) + '\n');
