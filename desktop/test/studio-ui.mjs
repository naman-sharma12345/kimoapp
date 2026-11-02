import { createServer } from 'node:http';
import { readFileSync, existsSync } from 'node:fs';
import { resolve, extname, sep, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { studioFixture } from './fixtures/creator.mjs';
import { studioHistory } from '../studio.mjs';
import { catalog } from '../studio-ipc.mjs';
import { publicEdl, toTimeline } from '../edl.mjs';
const root = fileURLToPath(new URL('../renderer/', import.meta.url)),
  mock = readFileSync(join(root, 'src/dev/mock-kimo.js'), 'utf8');
// Self-contained silent stem fixture; no vendor encoder or user audio required.
const silence = Buffer.alloc(44 + 48000 * 2 * 3);
silence.write('RIFF', 0);
silence.writeUInt32LE(silence.length - 8, 4);
silence.write('WAVEfmt ', 8);
silence.writeUInt32LE(16, 16);
silence.writeUInt16LE(1, 20);
silence.writeUInt16LE(1, 22);
silence.writeUInt32LE(48000, 24);
silence.writeUInt32LE(96000, 28);
silence.writeUInt16LE(2, 32);
silence.writeUInt16LE(16, 34);
silence.write('data', 36);
silence.writeUInt32LE(silence.length - 44, 40);
let edl = studioFixture(),
  history = null;
edl.video.push({
  track: 'BROLL',
  clips: [
    {
      id: 'broll-fixture',
      src: 's1',
      at: 2,
      in: 0,
      out: 1,
      speed: 1,
      fit: 'cover',
      camera: [{ t: 0, x: 0.5, y: 0.5, zoom: 1 }],
    },
  ],
});
const metrics = {
  first_speech_s: 0.2,
  dead_air_ratio: 0.02,
  filler_count: 0,
  repeat_takes: 0,
  median_shot_s: 2.5,
  max_static_s: 4,
  framing_variety: 3,
  jitter_px: null,
  repeated_frames: null,
  skipped_frames: null,
  frame_match_coverage: null,
  caption_min_word_s: 0.2,
  caption_safe: true,
  caption_face_overlap: null,
  lufs: -14,
  true_peak: -1.1,
  lra: 5,
  duck_depth_db: 18,
  sfx_count_per_min: 8,
  clip_delta_e: null,
  clipped_pct: null,
};
const creator = {
    template: 'shorts-punchy',
    score: 72.4,
    accepted: false,
    stop: 'pixel metrics unavailable',
    budget: { reserved_usd: 0 },
    transitions: [
      {
        problems: [
          {
            severity: 'medium',
            at: 1,
            message: 'caption size reduced',
            patches: [],
          },
        ],
      },
    ],
  },
  quality = {
    creator: {
      score: 72.4,
      metrics,
      groups: {
        hook: 1,
        dead_air: 1,
        filler: 1,
        cadence: 0.9,
        framing: 1,
        motion: 0,
        captions: 0.7,
        sound: 0.95,
        colour: 0,
      },
    },
  };
const baseline = structuredClone(edl);
const data = () => ({
  edl: publicEdl(edl),
  timeline: { ...toTimeline(edl), edl: publicEdl(edl) },
  creator,
  quality,
  studioHistory: {
    undo: history?.cursor ?? 0,
    redo: history ? history.entries.length - history.cursor - 1 : 0,
  },
  stems: { voice: 'voice.wav', music: 'music.wav', sfx: 'sfx.wav' },
  beforeOutput: 'before.mp4',
});
const patch = `
window.__studioCatalog=${JSON.stringify(catalog())};
window.__creatorFixture=${JSON.stringify(data())};
window.kimo.log=async()=>[];
window.__studioFrame='data:image/jpeg;base64,${readFileSync(join(root, 'src/creator-previews/poster.jpg')).toString('base64')}';
window.__studioBridge=async(id,patch)=>{const r=await fetch('/studio',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({id,patch})});const data=await r.json();if(!r.ok)throw new Error(data.error);window.__creatorFixture=data;return data;};
const originalLibrary=window.kimo.library;
window.kimo.library=async()=>{const list=await originalLibrary();for(const p of list)if(p.id==='p2')Object.assign(p,${JSON.stringify(data())});return list;};
`;
const server = createServer(async (req, res) => {
  const pathname = decodeURIComponent(
    new URL(req.url, 'http://localhost').pathname,
  );
  if (pathname === '/reset') {
    edl = structuredClone(baseline);
    history = null;
    res.end('reset');
    return;
  }
  if (pathname === '/studio' && req.method === 'POST') {
    try {
      let body = '';
      for await (const chunk of req) body += chunk;
      const { patch } = JSON.parse(body);
      if (patch.type === 'regenerate') {
        creator.transitions.push({
          problems: [
            { severity: 'low', message: `mock ${patch.part} regenerated` },
          ],
        });
      } else {
        const next = studioHistory(edl, history, patch);
        edl = next.edl;
        history = next.history;
      }
      res.setHeader('Content-Type', 'application/json');
      res.end(
        JSON.stringify({ ...data(), status: 'done', updated: Date.now() }),
      );
    } catch (error) {
      res.writeHead(400, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: error.message }));
    }
    return;
  }
  if (pathname === '/') {
    res.setHeader('Content-Type', 'text/html');
    res.end(
      readFileSync(join(root, 'index.html'), 'utf8')
        .replace(/<meta http-equiv="Content-Security-Policy"[^>]*>/, '')
        .replace(
          '</head>',
          () => `<script>${mock}</script><script>${patch}</script></head>`,
        ),
    );
    return;
  }
  if (pathname.startsWith('/media/') && pathname.endsWith('.wav')) {
    res.setHeader('Content-Type', 'audio/wav');
    res.end(silence);
    return;
  }
  if (pathname.startsWith('/media/') && /\.jpe?g$/i.test(pathname)) {
    res.setHeader('Content-Type', 'image/jpeg');
    res.end(readFileSync(join(root, 'src/creator-previews/poster.jpg')));
    return;
  }
  const file = pathname.startsWith('/media/')
    ? join(root, 'src/creator-previews/youtube-talking.webm')
    : resolve(root, '.' + pathname);
  if (!file.startsWith(resolve(root) + sep) || !existsSync(file)) {
    res.writeHead(404).end();
    return;
  }
  res.setHeader(
    'Content-Type',
    pathname.startsWith('/media/')
      ? 'video/webm'
      : ({
          '.js': 'text/javascript',
          '.css': 'text/css',
          '.webm': 'video/webm',
          '.webp': 'image/webp',
          '.woff2': 'font/woff2',
        }[extname(file)] ?? 'application/octet-stream'),
  );
  res.end(readFileSync(file));
});
server.listen(8770, '127.0.0.1', () =>
  console.log('Studio UI fixture http://127.0.0.1:8770'),
);
