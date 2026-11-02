// Small bundled UI assets only: nine 3-second, 12 fps previews; not a benchmark.
import { readFile, writeFile, mkdir, stat, rm } from 'node:fs/promises';
import { join, resolve, dirname } from 'node:path';
import { tmpdir } from 'node:os';
import { TEMPLATE_IDS, getTemplate } from '../../../planner/templates.mjs';
import { fromKimoProject } from '../../../edl.mjs';
import { directCamera } from '../../../camera.mjs';
import { applyCaptions } from '../../../captions.mjs';
import { compose } from '../../../compose.mjs';
import { run } from '../../../audio/process.mjs';
import { probe } from '../../../engine.mjs';
import { toolPaths } from '../run.mjs';
import { hashFile } from '../io.mjs';
const tools = toolPaths(),
  root = process.env.LOCALAPPDATA + '/kimo/bench';
// An explicit output override avoids platform URL pathname/drive-letter ambiguity.
const { fileURLToPath } = await import('node:url'),
  out = fileURLToPath(
    new URL('../../../renderer/src/creator-previews/', import.meta.url),
  );
const work = join(tmpdir(), 'kimo-phase11-preview-assets');
await mkdir(work, { recursive: true });
await mkdir(out, { recursive: true });
const source = join(root, 'raw-dataset-candidates/propublica-uncut.webm'),
  sourceHash = await hashFile(source);
if (
  sourceHash !==
  'cf880aa9a077c7e96ec521439834895ba656969ad3cb05ba0830b1bf5b0b74ed'
)
  throw new Error('Preview source differs from frozen raw-v2 provenance');
const f = await probe(tools.ffprobe, source);
const captionOnly = process.argv.includes('--caption-only');
const manifest = captionOnly
  ? JSON.parse(
      await readFile(
        fileURLToPath(
          new URL('../../../data/creator-previews.json', import.meta.url),
        ),
        'utf8',
      ),
    ).clips.filter((c) => !c.id.startsWith('caption-'))
  : [];
for (const id of captionOnly
  ? ['caption-mrbeast', 'caption-boxed-highlight']
  : TEMPLATE_IDS) {
  const t = getTemplate(id.startsWith('caption-') ? 'youtube-talking' : id);
  if (id.startsWith('caption-')) {
    t.label = 'caption preview';
    t.captions.style = id.slice(8);
  }
  const words = t.label.split(/\s+/).map((w, i) => ({
      w,
      start: 70 + 0.25 + i * 0.55,
      end: 70 + 0.9 + i * 0.55,
    })),
    vertical = t.platform === 'vertical',
    canvas = { w: vertical ? 180 : 320, h: vertical ? 320 : 180 },
    picture = join(work, id + '.mkv'),
    video = join(out, id + '.webm');
  const edl = fromKimoProject(
    {
      width: canvas.w,
      height: canvas.h,
      fps: 12,
      assets: {
        s1: {
          path: source,
          width: f.width,
          height: f.height,
          duration: f.duration,
          fps: f.fps,
        },
      },
      tracks: [
        {
          id: 'v1',
          clips: [
            {
              id: 'preview',
              source: { type: 'media', asset: 's1' },
              start: 0,
              duration: 3,
              in_point: 70,
              props: {},
              audio: { mute: true },
            },
          ],
        },
      ],
    },
    [f],
  );
  edl.canvas.fps = 12;
  edl.audio = [];
  edl.sound = { enabled: false };
  const ctx = {
    words: { [source.replaceAll('\\', '/')]: words },
    energy: t.camera.energy,
    maxStatic: t.camera.max_static_s,
    heads: {
      [source.replaceAll('\\', '/')]: {
        static: {
          cx: 0.62,
          eyes: 0.36,
          top: 0.07,
          chin: 0.71,
          gaze: 0,
          source: 'preview framing',
        },
      },
    },
  };
  edl.camera_plan = ctx;
  directCamera(edl, ctx);
  applyCaptions(
    edl,
    { enabled: t.captions.enabled, style: t.captions.style },
    ctx,
  );
  await compose({
    edl,
    ffmpeg: tools.ffmpeg,
    ffprobe: tools.ffprobe,
    output: picture,
    dir: join(work, id),
    fontsDir: tools.env.KIMO_FONTS,
    emit: () => {},
  });
  await run(tools.ffmpeg, [
    '-i',
    picture,
    '-an',
    '-c:v',
    'libvpx-vp9',
    '-crf',
    '38',
    '-b:v',
    '0',
    '-cpu-used',
    '6',
    '-row-mt',
    '1',
    '-t',
    '3',
    video,
  ]);
  const bytes = (await stat(video)).size;
  if (bytes > 400000) throw new Error(`${id} exceeds 400 KB`);
  manifest.push({
    id,
    bytes,
    duration: 3,
    fps: 12,
    width: canvas.w,
    height: canvas.h,
    caption_style: t.captions.style,
    source:
      'Verified raw-v2 ProPublica source at 70–73 s; template-name overlay, not dialogue transcription',
  });
  console.log(id, bytes);
}
await writeFile(
  fileURLToPath(
    new URL('../../../data/creator-previews.json', import.meta.url),
  ),
  JSON.stringify(
    {
      source:
        'ProPublica, Unedited: ProPublica Interviews President Biden, September 2023',
      url: 'https://commons.wikimedia.org/wiki/File:Unedited-_ProPublica_Interviews_President_Biden,_September_2023.webm',
      license: 'CC BY 3.0',
      license_url: 'https://creativecommons.org/licenses/by/3.0/',
      source_sha256: sourceHash,
      changes:
        'Three-second excerpts at 70–73 s, cropped, manually framed, template-name labels, silent VP9 loops. Labels are not dialogue. No endorsement. Preview demonstrates framing/caption defaults, not full template editing quality.',
      clips: manifest,
    },
    null,
    2,
  ),
);
await run(tools.ffmpeg, [
  '-i',
  join(out, 'youtube-talking.webm'),
  '-frames:v',
  '1',
  join(out, 'poster.jpg'),
]);
// Keep only the nine small bundled loops; source/prepared media are untouched.
if (dirname(resolve(work)) !== resolve(tmpdir()))
  throw new Error('Preview workspace escaped temporary directory');
await rm(work, { recursive: true, force: true });
