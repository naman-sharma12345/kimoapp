// kimo desktop engine: drives the real kimo v6 engine (kimo-mcp over stdio)
// on the user's own PC. Only the edit prompt and a few sampled frames go to the
// kimo AI proxy (api.getkimo.tech); SAM effects also send a downscaled copy of
// the clip segment they process (see sam.mjs).
import { spawnBackground as spawn, execFileBackground as execFile, acquireExclusive } from './resources.cjs';
import { existsSync, mkdirSync, statSync, readFileSync, renameSync, writeFileSync, unlinkSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { randomUUID } from 'node:crypto';
import { samEffect, SAM_EFFECTS, motionJitter, cachedPersonTracks, segmentImage } from './sam.mjs';
import { colorConfig } from './color/plan.mjs';
import { prepareInputs } from './input-media.mjs';
import { effectiveRate } from './vfr-rate.mjs';
import { criticalGates } from './quality-gates.mjs';
import { CAMERA_TOOLS, CAMERA_TOOL_TEXT, cameraToolCall, cameraInputsFromCut, energyFor, maxStaticFor } from './camera.mjs';
import { headTrack, screenRegions } from './camera-probe.mjs';
import { videoEncoderArgs, encodeWithFallback } from './encoding.mjs';
import { pictureTools } from './picture-tools.mjs';
import { pickCaptionStyle, pickHookStyle, noteHints, captionStyles, captionStyle as captionStyleOf, CAPTION_ENGINE } from './captions.mjs';
import { toKimoProject, toTimeline, publicEdl } from './edl.mjs';
import { planCut, applyCutPlan, plannerBrief, loadSavedPlan, storablePlan } from './cutstage.mjs';
import { aiHeaders, proxyError, hasAiAccess } from './kimo-auth.mjs';
import { GRAPHIC_TOOLS, GRAPHIC_TOOL_TEXT, graphicToolCall } from './graphics/plan.mjs';
import { describeClips, matchSentences, outputSentences } from './broll.mjs';
import { outputWords } from './captions.mjs';
import { direct, directorSummary } from './explain/director.mjs';
import { anchorBeats } from './explain/plan.mjs';
import { EXPLAIN_TOOLS, EXPLAIN_TOOL_TEXT, explainToolCall, notePatches, placeUserBeats } from './explain/tools.mjs';
import { AssetCache, defaultAssetCache, attributionsText } from './explain/assets.mjs';
import { score as libraryScore } from './explain/sources/library.mjs';
import { createHash } from 'node:crypto';
import { runCreatorEdit } from './creator-engine.mjs';
import { templateStyles,selectTemplate } from './planner/templates.mjs';

export const AI_URL =
  process.env.KIMO_AI_URL || 'https://api.getkimo.tech/v1/desktop/ai';
const MAX_ROUNDS = 7;
const PODCAST_NOTE = /podcast|interview|two (people|speakers|hosts)|conversation|guest/i;
const MAX_PASSES = 3;
const CALL_TIMEOUT_MS = 30 * 60_000; // long 4K renders are fine locally

/** The kimo-mcp tools the model may drive (export/render_frame stay ours). */
export const ENGINE_TOOLS = [
  'project_set', 'import_media', 'auto_rough_cut', 'cut_to_beat', 'auto_grade',
  'add_title', 'add_text', 'add_glow_text', 'auto_captions', 'caption_from_words',
  'edit_caption', 'finish_audio', 'lint_edit', 'timeline_summary', 'add_track',
  'add_clip', 'trim_clip', 'move_clip', 'delete_clip', 'set_property', 'set_audio',
  'auto_reframe', 'stabilize', 'undo',
];
// Phase 6: b-roll placement and titles/lower thirds are the app's (broll.mjs,
// graphics/); kimo's place_broll is no longer offered.
// Phase 4: the picture's punch-ins/zooms come from the app's camera director
// (camera.mjs); kimo's add_punch_ins / add_smart_punch are no longer offered.

/** SAM 3.1 tools the planner may call; each renders a new media file and imports it. */
export const SAM_TOOLS = ['sam_reframe', 'sam_text_behind', 'sam_background', 'sam_redact'];
const SAM_TOOL_TEXT = `sam_reframe(file*:string, prompt:string, punch_ins:array) — Meta SAM 3.1 tracks the subject (default "person"; or a noun like "dog") and renders the clip at the canvas aspect with a smoothed crop that follows it; punch_ins [{start,end,zoom 1.1-1.5}] zoom in centred on the subject (true = automatic). returns a NEW asset_id: add_clip it instead of the original (fit cover). use it instead of auto_reframe when the canvas aspect differs from the footage and the subject moves.
sam_text_behind(file*:string, text*:string, prompt:string, text_start:number, text_end:number, color:string) — big title placed BEHIND the subject (SAM matte), reframed to the canvas. 1-2 words. returns a NEW asset_id to add_clip instead of the original.
sam_background(file*:string, mode*(blur|color|image), color:string(#rrggbb), image:string(path), prompt:string) — keeps the subject sharp and blurs/replaces the background. returns a NEW asset_id.
sam_redact(file*:string, prompt*:string) — blurs every matching object (e.g. "face", "license plate", "logo"). returns a NEW asset_id.
sam_* tools are slow-ish (upload + track): call each at most once per file, before captions, and only when the note or the footage calls for it. file = one of the file paths above.`;

/** Export presets: canvas + delivery bitrate for the optional GPU encode. */
export const PRESETS = {
  youtube: { label: 'YouTube 16:9 · 1080p', width: 1920, height: 1080, mbps: 12 },
  youtube4k: { label: 'YouTube 16:9 · 4K', width: 3840, height: 2160, mbps: 45 },
  shorts: { label: 'Shorts / Reels / TikTok 9:16', width: 1080, height: 1920, mbps: 10 },
  square: { label: 'Square 1:1', width: 1080, height: 1080, mbps: 8 },
  portrait: { label: 'Feed 4:5', width: 1080, height: 1350, mbps: 8 },
};

export class Mcp {
  constructor(bin, dir, env) {
    this.next = 1;
    this.pending = new Map();
    this.buffer = '';
    const [command, ...args] = Array.isArray(bin) ? bin : [bin];
    this.child = spawn(command, args, {
      cwd: dir,
      env: { ...process.env, ...env, HOME: dir, TMPDIR: dir, TEMP: dir, TMP: dir },
      windowsHide: true,
      stdio: ['pipe', 'pipe', 'pipe'],
    });
    this.stderr = '';
    this.child.stderr.on('data', (d) => {
      this.stderr = (this.stderr + d.toString('utf8')).slice(-4000);
    });
    this.child.stdout.on('data', (data) => {
      this.buffer += data.toString('utf8');
      let index;
      while ((index = this.buffer.indexOf('\n')) >= 0) {
        const line = this.buffer.slice(0, index);
        this.buffer = this.buffer.slice(index + 1);
        let msg;
        try {
          msg = JSON.parse(line);
        } catch {
          continue;
        }
        const waiter = msg.id != null && this.pending.get(msg.id);
        if (waiter) {
          this.pending.delete(msg.id);
          waiter(msg);
        }
      }
    });
    const stop = (why) => {
      for (const waiter of this.pending.values()) waiter({ error: { message: why } });
      this.pending.clear();
      this.dead = true;
    };
    this.child.on('error', (e) => stop(`kimo engine failed to start: ${e.message}`));
    this.child.on('exit', (code) => stop(`kimo engine stopped (code ${code})`));
  }
  request(method, params, timeout = CALL_TIMEOUT_MS) {
    if (this.dead) return Promise.resolve({ error: { message: 'kimo engine stopped' } });
    const id = this.next++;
    return new Promise((done) => {
      const timer = setTimeout(() => {
        this.pending.delete(id);
        done({ error: { message: `tool timed out after ${timeout / 1000}s` } });
      }, timeout);
      this.pending.set(id, (msg) => {
        clearTimeout(timer);
        done(msg);
      });
      this.child.stdin.write(JSON.stringify({ jsonrpc: '2.0', id, method, params }) + '\n');
    });
  }
  async start() {
    const init = await this.request('initialize', {
      protocolVersion: '2024-11-05',
      capabilities: {},
      clientInfo: { name: 'kimo-desktop', version: '0.2' },
    }, 60_000);
    if (init.error) throw new Error(`${init.error.message} ${this.stderr}`.trim());
    const list = await this.request('tools/list', { mode: 'director' }, 60_000);
    return { server: init.result?.serverInfo, tools: list.result?.tools ?? [] };
  }
  async call(name, args) {
    const reply = await this.request('tools/call', { name, arguments: args });
    if (reply.error)
      return { isError: true, content: [{ type: 'text', text: String(reply.error.message).slice(0, 2000) }] };
    return reply.result ?? { content: [] };
  }
  kill() {
    // kimo-mcp may run helpers (FFmpeg, whisper); on Windows kill the whole tree
    // so nothing is left behind when an edit ends or is stopped
    if (process.platform === 'win32' && this.child.pid && !this.dead)
      try {
        execFile('taskkill', ['/pid', String(this.child.pid), '/T', '/F'], { windowsHide: true }, () => undefined);
      } catch {
        /* fall through */
      }
    try {
      this.child.kill('SIGKILL');
    } catch {
      /* gone */
    }
  }
}

export function resultText(result, max = 700) {
  let text = (result?.content ?? [])
    .map((item) => (item.type === 'text' ? String(item.text ?? '') : ''))
    .join(' ')
    .replace(/\s+/g, ' ')
    .trim();
  const hint = result?.structuredContent?.hint;
  if (typeof hint === 'string' && hint) text = `${text} (hint: ${hint})`;
  return text.length > max ? `${text.slice(0, max)}…` : text;
}
/** The JSON object a tool returned (structuredContent or JSON text). */
export function resultJson(result) {
  if (result?.structuredContent && typeof result.structuredContent === 'object')
    return result.structuredContent;
  for (const item of result?.content ?? [])
    if (item.type === 'text')
      try {
        return JSON.parse(item.text);
      } catch {
        /* not json */
      }
  return {};
}
function resultImage(result) {
  const item = (result?.content ?? []).find((i) => i.type === 'image' && typeof i.data === 'string');
  return item ? `data:${item.mimeType || 'image/jpeg'};base64,${item.data}` : null;
}
function compactTools(tools) {
  return tools
    .filter((tool) => ENGINE_TOOLS.includes(String(tool?.name)))
    .map((tool) => {
      const props = tool.inputSchema?.properties ?? {};
      const req = tool.inputSchema?.required ?? [];
      const params = Object.entries(props)
        .map(([k, v]) => `${k}${req.includes(k) ? '*' : ''}:${v.type ?? 'any'}${v.enum ? `(${v.enum.join('|')})` : ''}`)
        .join(', ');
      return `${tool.name}(${params}) — ${String(tool.description ?? '').slice(0, 220)}`;
    })
    .join('\n');
}
function parseCalls(raw) {
  return (Array.isArray(raw) ? raw : [])
    .map((item) => ({
      name: String(item?.tool ?? item?.name ?? ''),
      args: item?.args && typeof item.args === 'object' && !Array.isArray(item.args) ? item.args : {},
      why: typeof item?.why === 'string' ? item.why.slice(0, 160) : undefined,
    }))
    .filter((c) => ENGINE_TOOLS.includes(c.name) || SAM_TOOLS.includes(c.name) || CAMERA_TOOLS.includes(c.name) || GRAPHIC_TOOLS.includes(c.name) || EXPLAIN_TOOLS.includes(c.name))
    .slice(0, 8);
}
function argsLine(args) {
  const text = JSON.stringify(args).replace(/"([a-z_]+)":/g, '$1:');
  return text.length > 110 ? `${text.slice(0, 110)}…` : text;
}

export async function ai(kind, text, images = [], signal) {
  for (let attempt = 0; attempt < 3; attempt++) {
    // throws AiLockedError (a clear message, no network call) without a sign-in or own key
    const auth = await aiHeaders();
    let response;
    try {
      response = await fetch(AI_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...auth },
        body: JSON.stringify({
          kind,
          text: text.slice(0, 60_000),
          // The proxy caps labels at 80 characters; long clips list more digits.
          images: images.map((image) => ({ ...image, label: image.label.slice(0, 80) })),
        }),
        signal: AbortSignal.any([signal, AbortSignal.timeout(200_000)].filter(Boolean)),
      });
    } catch (e) {
      if (signal?.aborted) throw new Error('cancelled');
      if (attempt === 2) throw new Error(`can't reach kimo AI (${e.message}); check your internet`);
      continue;
    }
    if (response.ok) return (await response.json()).record ?? {};
    const error = await proxyError(response, 'kimo AI');
    if (response.status < 500 || attempt === 2) throw error;
    await new Promise((r) => setTimeout(r, 3000 * (attempt + 1)));
  }
  return {};
}

/** A single proxy attempt: no hidden retries outside the edit's durable ledger. */
export async function creatorAsk(kind,text,images,signal){
  if(text.length>60000)throw new Error('Creator prompt exceeds the proxy limit');
  const auth=await aiHeaders();
  // The existing visual endpoint accepts arbitrary JSON. Its generic visual
  // system role supports our versioned task contract without changing the API.
  const response=await fetch(AI_URL,{method:'POST',headers:{'Content-Type':'application/json',...auth},body:JSON.stringify({kind:kind==='critic'?'review':'pick',text,images:images.map(image=>({label:image.label.slice(0,80),url:image.url??`data:${image.mime??'image/jpeg'};base64,${image.data}`}))}),signal});
  if(!response.ok)throw await proxyError(response,'kimo AI');
  return (await response.json()).record??{};
}

/** Detects a working hardware H.264 encoder (NVENC, QSV, AMF), else null. */
export async function detectGpu(ffmpeg) {
  for (const enc of ['h264_nvenc', 'h264_qsv', 'h264_amf']) {
    const ok = await new Promise((done) =>
      execFile(ffmpeg, ['-hide_banner', '-loglevel', 'error', '-f', 'lavfi', '-i', 'color=black:s=256x256:d=0.2', '-c:v', enc, '-f', 'null', '-'],
        { windowsHide: true, timeout: 20_000 }, (err) => done(!err)));
    if (ok) return enc;
  }
  return null;
}

/** GPU (or CPU) delivery encode of the kimo master at the preset bitrate. */
export function deliveryEncode({ ffmpeg, input, output, encoder, mbps, onProgress, duration, signal }) {
  const v = encoder
    ? ['-c:v', encoder, '-b:v', `${mbps}M`, '-maxrate', `${Math.round(mbps * 1.5)}M`, '-bufsize', `${mbps * 2}M`]
    : ['-c:v', 'libx264', '-preset', 'medium', '-b:v', `${mbps}M`, '-maxrate', `${Math.round(mbps * 1.5)}M`, '-bufsize', `${mbps * 2}M`];
  return new Promise((done, fail) => {
    const child = spawn(ffmpeg, ['-nostdin', '-hide_banner', '-y', '-i', input, ...v, '-pix_fmt', 'yuv420p', '-c:a', 'copy', '-movflags', '+faststart', '-progress', 'pipe:1', '-nostats', output], { windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] });
    signal?.addEventListener('abort', () => child.kill('SIGKILL'));
    child.stdout.on('data', (d) => {
      const m = /out_time_us=(\d+)/.exec(d.toString());
      if (m && duration) onProgress?.(Math.min(1, Number(m[1]) / 1e6 / duration));
    });
    let err = '';
    child.stderr.on('data', (d) => (err = (err + d).slice(-1500)));
    child.on('exit', (code) => (code === 0 ? done(output) : fail(new Error(`encode failed: ${err.split('\n').slice(-3).join(' ')}`))));
  });
}

// ---------- style presets: each one steers the edit plan ----------
export const STYLES = {
  auto: {
    label: 'Auto (kimo picks)',
    guide: 'pick the treatment that best fits the footage and the note.',
    captions: { style: 'pop', max_words_per_line: 3 },
    title: 'hook_box',
    punch: 1.15,
  },
  energetic: {
    label: 'Energetic (MrBeast-style)',
    guide: 'high-energy youtube pacing: zero dead air (max_pause 0.2), a bold hook_box title in the first 2.5 s, snap punches on every jump cut (the camera director does them at energy 5), impact or pop captions 1-3 words per line with keyword colours, punchy grade (auto_grade strength 0.9), loud clean mix.',
    captions: { style: 'impact', max_words_per_line: 2, keywords: true, highlight: true },
    title: 'hook_box',
    punch: 1.22,
    max_pause: 0.2,
  },
  documentary: {
    label: 'Documentary',
    guide: 'measured documentary feel: keep natural breaths (max_pause 0.45), a cinematic or lower_third title, clean captions 2 lines, gentle grade (strength 0.6), slow breathing pushes on long shots instead of hard punches (camera director, energy 2), music low under speech (-20 dB).',
    captions: { style: 'clean', max_words_per_line: 6, lines: 2 },
    title: 'cinematic',
    punch: 1.08,
    max_pause: 0.45,
  },
  podcast: {
    label: 'Podcast clip',
    guide: 'podcast highlight clip: open on the most quotable line, remove silences and fillers (max_pause 0.25), speaker framing on whoever talks (camera director), karaoke or boxed captions with keyword colours, a lower_third with the topic, grade 0.75.',
    captions: { style: 'karaoke', max_words_per_line: 4, keywords: true, highlight: true },
    title: 'lower_third',
    punch: 1.12,
    max_pause: 0.25,
  },
  cinematic: {
    label: 'Cinematic',
    guide: 'cinematic: deliberate pacing, an elegant or cinematic title, minimal clean captions, rich grade (strength 0.85, target_luma 0.38), slow push-ins (camera director, energy 1), music swells under speech at -16 dB.',
    captions: { style: 'clean', max_words_per_line: 5, lines: 1 },
    title: 'cinematic',
    punch: 1.1,
    max_pause: 0.4,
  },
  explainer: {
    label: 'Explainer (visuals while you talk)',
    guide: 'explainer: the screen shows what the speaker says while they say it (the app\'s visual director adds lists, stats, charts, maps, diagrams, real photos at a high density, pip / side layouts preferred). keep dead air out (max_pause 0.3), clean ali-abdaal captions, a clean look (grade 0.7), calm framing (camera energy 3), music low (-20 dB, tech).',
    captions: { style: 'clean', max_words_per_line: 5, lines: 2, caption_id: 'ali-abdaal' },
    title: 'lower_third',
    punch: 1.1,
    max_pause: 0.3,
    explain: { density: 'rich', layout: 'pip' },
  },
  tutorial: {
    label: 'Tutorial / explainer',
    guide: 'tutorial: clarity first, cut dead air (max_pause 0.3) but keep every step, boxed or clean captions 2 lines for legibility, a lower_third naming the topic, punch in on the clicked region of screen recordings (camera director), neutral grade 0.7.',
    captions: { style: 'boxed', max_words_per_line: 5, lines: 2 },
    title: 'lower_third',
    punch: 1.1,
    max_pause: 0.3,
  },
};
// New projects expose the complete templates; historic names remain valid aliases.
export const CREATOR_STYLES = templateStyles();
for(const [id,value] of Object.entries(CREATOR_STYLES)){const t=selectTemplate(id);STYLES[id]={...STYLES[t.legacy_style],...value,captions:{style:t.captions.style,max_words_per_line:t.captions.max_words},punch:t.camera.punch,max_pause:t.cut.max_pause};}

/** What a top YouTube editor does, as rules the model follows with kimo's tools. */
function expertGuide(P, S, files, cut) {
  const template=selectTemplate(Object.keys(STYLES).find(k=>STYLES[k]===S),P);
  return `Creator template: ${JSON.stringify(template)}. The app owns picture, sound and colour. Preserve the existing cut plan and use only the named legacy tools when continuing an older project.`;
}

/** YouTube's recommended upload bitrate (Mbps, SDR) for a canvas and frame rate. */
export function recommendedMbps(width, height, fps = 30) {
  const px = Math.max(width, height);
  const hi = fps > 30 ? 1.5 : 1;
  if (px >= 3840) return Math.round(45 * hi);
  if (px >= 2560) return Math.round(16 * hi);
  if (px >= 1920) return Math.round(10 * hi);
  return Math.round(8 * hi);
}

const runTool = (bin, args, onLine, signal) =>
  new Promise((done) => {
    const child = spawn(bin, /ffmpeg(\.exe)?$/i.test(bin) ? ['-nostdin', ...args] : args, { windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'], signal });
    let out = '';
    let err = '';
    child.stdout.on('data', (d) => {
      out += d;
      onLine?.(d.toString());
    });
    child.stderr.on('data', (d) => (err = (err + d).slice(-200_000)));
    child.on('error', (e) => done({ code: -1, out, err: String(e.message) }));
    child.on('exit', (code) => done({ code, out, err }));
  });

/**
 * Measures a render the way an upload check would: streams, bitrate,
 * integrated loudness (EBU R128) + true peak, black frames and silences.
 */
export async function measure(ffmpeg, ffprobe, path) {
  const pr = await runTool(ffprobe, ['-v', 'error', '-show_streams', '-show_format', '-of', 'json', path]);
  let j = {};
  try {
    j = JSON.parse(pr.out);
  } catch {
    /* unreadable */
  }
  const v = j.streams?.find((s) => s.codec_type === 'video') ?? {};
  const a = j.streams?.find((s) => s.codec_type === 'audio');
  const [fn, fd] = String(v.r_frame_rate || '30/1').split('/').map(Number);
  const m = {
    width: v.width, height: v.height, fps: fd ? +(fn / fd).toFixed(3) : fn,
    vcodec: v.codec_name, profile: v.profile, pix_fmt: v.pix_fmt,
    duration: Number(j.format?.duration) || 0,
    bytes: Number(j.format?.size) || 0,
    mbps: +((Number(v.bit_rate) || Number(j.format?.bit_rate) || 0) / 1e6).toFixed(2),
    acodec: a?.codec_name, arate: Number(a?.sample_rate) || 0, achannels: a?.channels,
    akbps: a ? Math.round((Number(a.bit_rate) || 0) / 1000) : 0,
    black: [], silences: [],
  };
  const filter = a
    ? '[0:v]blackdetect=d=0.2:pix_th=0.10[v];[0:a]silencedetect=n=-45dB:d=0.7,loudnorm=I=-14:TP=-1.5:LRA=11:print_format=json[a]'
    : '[0:v]blackdetect=d=0.2:pix_th=0.10[v]';
  const r = await runTool(ffmpeg, ['-hide_banner', '-nostats', '-i', path, '-filter_complex', filter, '-map', '[v]', ...(a ? ['-map', '[a]'] : []), '-f', 'null', '-']);
  for (const x of r.err.matchAll(/black_start:([\d.]+) black_end:([\d.]+)/g)) m.black.push([+x[1], +x[2]]);
  let open = null;
  for (const x of r.err.matchAll(/silence_(start|end): (-?[\d.]+)/g)) {
    if (x[1] === 'start') open = Math.max(0, +x[2]);
    else if (open != null) m.silences.push([open, +x[2]]), (open = null);
  }
  if (open != null) m.silences.push([open, m.duration]);
  // camera smoothness: residual frame-to-frame shake and judder (repeated frames)
  if (v.width) {
    const mo = await motionJitter(ffmpeg, path).catch(() => null);
    if (mo) Object.assign(m, { jitter: mo.jitter, jitterP95: mo.p95, dupFrames: mo.dup, frames: mo.frames });
  }
  const ln = /\{\s*"input_i"[\s\S]*?\}/.exec(r.err);
  if (ln)
    try {
      const L = JSON.parse(ln[0]);
      m.lufs = +Number(L.input_i).toFixed(1);
      m.truePeak = +Number(L.input_tp).toFixed(1);
      m.lra = +Number(L.input_lra).toFixed(1);
      m.loudnorm = L;
    } catch {
      /* no loudness */
    }
  return m;
}

/** Pass/fail checks for a measured render against the preset and YouTube specs. */
/** Shake limit for the measured camera-smoothness check (px per frame at 1080 px). */
export const JITTER_MAX = 2;

/** Most common source frame rate, snapped to a standard rate (the canvas runs at it so nothing is duplicated). */
export function canvasFps(files) {
  const std = [23.976, 24, 25, 29.97, 30, 50, 59.94, 60];
  const counts = new Map();
  for (const f of files ?? []) {
    if (f?.kind !== 'video' || !(f.fps >= 23) || f.fps > 61) continue;
    const s = std.reduce((b, x) => (Math.abs(x - f.fps) < Math.abs(b - f.fps) ? x : b));
    counts.set(s, (counts.get(s) ?? 0) + (f.duration || 1));
  }
  let best = 30;
  let w = 0;
  for (const [k, v] of counts) if (v > w) [best, w] = [k, v];
  return best;
}

export function qualityChecks(m, P, { final = false, sourceAudio = false, targetLufs = -14, creator, gateContext } = {}) {
  const rec = recommendedMbps(P.width, P.height, m.fps);
  const c = [];
  const add = (id, label, ok, value, want, warn = false) => c.push({ id, label, ok, value, want, warn });
  add('res', 'resolution', m.width === P.width && m.height === P.height, `${m.width}×${m.height}`, `${P.width}×${P.height}`);
  add('fps', 'frame rate', m.fps >= 23.9, `${m.fps} fps`, '≥ 24 fps');
  add('codec', 'video codec', m.vcodec === 'h264' && m.pix_fmt === 'yuv420p', `${m.vcodec} ${m.profile ?? ''} ${m.pix_fmt ?? ''}`.trim(), 'H.264 yuv420p');
  if (final) {
    // Encoded at YouTube's recommended rate; very clean/simple footage can land
    // under it because x264 won't pad bits it doesn't need (a warning, not a fault).
    const hit = m.mbps >= rec * 0.9;
    add('bitrate', 'video bitrate', hit, `${m.mbps} Mbps${hit ? '' : ' (simple footage needed less)'}`, `${rec} Mbps target (YouTube)`, !hit);
    if (m.acodec) add('audio', 'audio', m.acodec === 'aac' && m.arate === 48000 && m.achannels === 2, `${m.acodec} ${m.arate / 1000} kHz ${m.achannels}ch ${m.akbps} kbps`, 'AAC-LC 48 kHz stereo (384 kbps target)');
  }
  if (sourceAudio) add('sound', 'sound', Boolean(m.acodec), m.acodec ? 'present' : 'missing', 'source sound kept');
  if (m.lufs != null) {
    add('lufs', 'loudness', Math.abs(m.lufs - targetLufs) <= 1, `${m.lufs} LUFS`, `${targetLufs} ± 1 LUFS`);
    add('tp', 'true peak', m.truePeak <= -1, `${m.truePeak} dBTP`, '≤ -1 dBTP');
  } else if (!m.acodec) add('lufs', 'loudness', true, 'no audio', '-', true);
  if (m.jitter != null) {
    // px/frame against a 1080 px short side; a tripod or gimbal shot measures < 0.5
    const dupMax = Math.max(2, Math.round((m.frames || 0) * 0.01));
    const ok = m.jitter <= JITTER_MAX && m.dupFrames <= dupMax;
    add('motion', 'camera smoothness', ok, `${m.jitter} px/frame shake${m.dupFrames ? ` · ${m.dupFrames} repeated frames` : ''}`, `≤ ${JITTER_MAX} px/frame, no judder`, ok && m.jitter > JITTER_MAX / 2);
  }
  const black = m.black.filter(([s, e]) => e - s >= 0.2);
  add('black', 'black frames', !black.length, black.length ? black.map(([s, e]) => `${s.toFixed(1)}-${e.toFixed(1)} s`).join(', ') : 'none', 'none');
  const hookGap = m.silences.find(([s, e]) => s < 2.5 && e - s >= 0.7);
  add('hook', 'hook (first 2.5 s)', !hookGap, hookGap ? `dead air ${hookGap[0].toFixed(1)}-${hookGap[1].toFixed(1)} s` : 'starts on sound', 'no dead air');
  const gaps = m.silences.filter(([s, e]) => s >= 2.5 && e - s >= 1.5 && e < m.duration - 0.3);
  add('pacing', 'pacing', !gaps.length, gaps.length ? `${gaps.length} pause${gaps.length > 1 ? 's' : ''} ≥ 1.5 s` : 'tight', 'no long pauses', true);
  if(creator)c.push(...criticalGates(creator.metrics??creator,gateContext).checks);
  return c;
}

/**
 * YouTube upload master: H.264 High, closed GOP of half the frame rate,
 * 2 B-frames, BT.709, YouTube's recommended bitrate, AAC-LC 384 kbps 48 kHz,
 * faststart, and loudness pulled to -14 LUFS / -1.5 dBTP when it is off.
 */
export async function youtubeMaster({
  ffmpeg,
  input,
  output,
  P,
  m,
  signal,
  onProgress,
  encoder = null,
  preview = false,
  onFallback,
  audioMastered = false,
}) {
  if (signal?.aborted) throw new Error('cancelled');
  const fps = m.fps || 30;
  const rec = recommendedMbps(P.width, P.height, fps);
  const gop = Math.max(1, Math.round(fps / 2));
  const L = m.loudnorm;
  const fix = !audioMastered && L && [L.input_i,L.input_tp,L.input_lra,L.input_thresh,L.target_offset].every(v=>Number.isFinite(Number(v))) && (Math.abs(m.lufs + 14) > 0.5 || m.truePeak > -1.5);
  const af = fix
    ? [
        '-af',
        `loudnorm=I=-14:TP=-1.5:LRA=11:measured_I=${L.input_i}:measured_TP=${L.input_tp}:measured_LRA=${L.input_lra}:measured_thresh=${L.input_thresh}:offset=${L.target_offset}:linear=true,aresample=48000`,
      ]
    : [];
  const attempt = ({ encoder: selected, hardwareDecode }) => {
    const args = [
      '-hide_banner',
      '-y',
      ...(hardwareDecode
        ? ['-hwaccel', 'cuda', '-hwaccel_output_format', 'cuda']
        : []),
      '-i',
      input,
      ...af,
      ...videoEncoderArgs(selected, m.duration).map((v,i,a)=>a[i-1]==='-preset'&&selected==='libx264'?(preview?'ultrafast':'medium'):v),
      '-b:v',
      `${rec}M`,
      '-maxrate',
      `${Math.round(rec * 1.5)}M`,
      '-bufsize',
      `${rec * 2}M`,
      '-profile:v',
      'high',
      '-level:v',
      Math.max(P.width, P.height) >= 3840 ? (fps > 30 ? '5.2' : '5.1') : '4.2',
      ...(hardwareDecode
        ? ['-vf', 'scale_cuda=format=nv12', '-pix_fmt', 'cuda']
        : ['-pix_fmt', 'yuv420p']),
      '-g',
      String(gop),
      '-keyint_min',
      String(gop),
      '-sc_threshold',
      '0',
      '-bf',
      '2',
      '-flags',
      '+cgop',
      '-fps_mode',
      'passthrough',
      '-color_range',
      'tv',
      '-colorspace',
      'bt709',
      '-color_primaries',
      'bt709',
      '-color_trc',
      'bt709',
      ...(m.acodec
        ? ['-c:a', 'aac', '-b:a', '384k', '-ar', '48000', '-ac', '2']
        : []),
      '-movflags',
      '+faststart',
      '-progress',
      'pipe:1',
      '-nostats',
      output,
    ];
    const t0 = Date.now();
    return new Promise((done, fail) => {
      const child = spawn(ffmpeg, ['-nostdin', ...args], {
        windowsHide: true,
        stdio: ['ignore', 'pipe', 'pipe'],
      });
      const abort = () => child.kill('SIGKILL');
      signal?.addEventListener('abort', abort, { once: true });
      const cleanup = () => signal?.removeEventListener('abort', abort);
      child.on('error', (error) => {
        cleanup();
        fail(error);
      });
      child.stdout.on('data', (d) => {
        const x = /out_time_us=(\d+)/.exec(d.toString());
        if (x && m.duration) {
          const f = Math.min(1, Number(x[1]) / 1e6 / m.duration);
          const el = (Date.now() - t0) / 1000;
          onProgress?.(f, f > 0.02 ? Math.max(0, el / f - el) : null);
        }
      });
      let err = '';
      child.stderr.on('data', (d) => (err = (err + d).slice(-16000)));
      child.on('exit', (code) => {
        cleanup();
        code === 0
          ? done({ output, loudnessFixed: Boolean(fix), mbps: rec })
          : fail(
              new Error(
                `master encode failed: ${
                  err
                    .split(/\r?\n/)
                    .filter((line) =>
                      /error|failed|unsupported|invalid|impossible|requires|incompatible/i.test(
                        line,
                      ),
                    )
                    .join(' ')
                    .slice(-2000) || err.slice(-1000)
                }`,
              ),
            );
      });
    });
  };
  return encodeWithFallback({
    preferred: encoder,
    measured: m,
    attempt,
    signal,
    onFallback,
  });
}

const VISUAL = new Set([
  'auto_rough_cut', 'cut_to_beat', 'add_clip', 'trim_clip', 'move_clip', 'delete_clip', 'set_property',
  'add_title', 'add_text', 'add_glow_text', 'auto_captions', 'caption_from_words', 'edit_caption',
  'auto_grade', 'auto_reframe', 'stabilize', 'place_broll', 'undo', ...CAMERA_TOOLS,
]);
const STRUCTURE = new Set([...VISUAL, 'add_track', 'import_media', 'project_set', 'load_project']);
/** Ops the timeline editor may send (validated before they reach kimo). */
export const MANUAL_TOOLS = ['move_clip', 'trim_clip', 'delete_clip', 'edit_caption', 'set_property'];
const NO_CAPTIONS = /\b(no|without|skip|remove|drop|turn off)\s+(the\s+|any\s+)?(captions|subtitles)\b/i;
/** Caption styles the app offers (id → name), for the UI picker. */
export const CAPTION_STYLES = () => Object.fromEntries([...captionStyles().values()].filter((s) => s.kind === 'caption').map((s) => [s.id, s.name]));

function validChapters(raw, duration) {
  const list = (Array.isArray(raw) ? raw : [])
    .map((c) => ({ t: Math.max(0, Number(c?.t ?? c?.time) || 0), title: String(c?.title ?? '').slice(0, 80).trim() }))
    .filter((c) => c.title)
    .sort((a, b) => a.t - b.t);
  if (list.length < 3 || list[0].t !== 0) return [];
  for (let i = 1; i < list.length; i++) if (list[i].t - list[i - 1].t < 10) return [];
  if (duration && duration - list.at(-1).t < 10) return [];
  return list;
}
const stamp = (s) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`;

/**
 * One edit, start to finish, streamed live.
 * mode 'ai': the AI writes the edit script and drives kimo tools; every tool
 *   call, AI step, timeline change and preview frame is emitted as it happens.
 * mode 'followup': loads the saved project and applies a chat request on top.
 * mode 'manual': loads the saved project and applies timeline-editor ops.
 * mode 'captions': fully offline (no AI).
 * Then: kimo export (CRF 16) → measured QA (loudness, true peak, black
 * frames, dead air) + AI frame review on 16 sampled frames + 2 full-size
 * frames → fixes, up to 3 passes → YouTube upload master → final measure,
 * thumbnail and YouTube title/description/chapters.
 * emit(event): {t:'op'|'say'|'think'|'status'|'progress'|'frame'|'preview'|'timeline'|'quality'|'youtube', ...}
 */
export async function runEdit({ bin, env, dir, files, note, preset, style, mode, signal, emit, ffmpeg, ffprobe, projectFile, edlFile, edl: suppliedEdl, legacy_kimo_render = false, ops, speed, sam, transcribe, captionStyle, explain: explainOpts, creatorUndo,creatorOptions,studioHistory,studioAppend,preview=false }) {
  if (legacy_kimo_render && process.env.KIMO_BENCH_LEGACY !== '1') throw new Error('Legacy picture rendering is restricted to explicit benchmark A/B runs');
  mkdirSync(dir, { recursive: true });
  if (signal?.aborted) throw new Error('cancelled');
  const normalize=async()=>{if(!legacy_kimo_render&&['ai','captions','sam'].includes(mode))files=await prepareInputs(files,{dir,ffmpeg,ffprobe,probe,signal,emit});};
  const P = PRESETS[preset] ?? PRESETS.shorts;
  const S = STYLES[style] ?? STYLES.auto;
  const creatorEdl=suppliedEdl??(existsSync(edlFile??join(projectFile?dirname(projectFile):dir,'edit.edl.json'))?JSON.parse(readFileSync(edlFile??join(projectFile?dirname(projectFile):dir,'edit.edl.json'),'utf8')):null);
  if(!legacy_kimo_render&&mode==='followup'&&!creatorEdl?.creator_plan)throw new Error('re-run this older edit once to enable plan-based follow-ups');
  if(!legacy_kimo_render&&(mode==='ai'||(['followup','manual'].includes(mode)&&creatorEdl?.creator_plan))){
    const releaseCreator=acquireExclusive('render');
    try{await normalize();return await runCreatorEdit({bin,env,dir,files,note,preset,style,mode,signal,emit,ffmpeg,ffprobe,projectFile,edlFile,edl:creatorEdl,ops,transcribe,captionStyle,explain:explainOpts,creatorUndo,creatorOptions,studioHistory,studioAppend,preview},{ask:creatorAsk,P,probe,youtubeMaster,canvasFps});}
    finally{releaseCreator();}
  }
  const release = acquireExclusive('render');
  try{await normalize();}catch(error){release();throw error;}
  let mcp;
  try { mcp = new Mcp(bin, dir, env); } catch (e) { release(); throw e; }
  signal?.addEventListener('abort', () => mcp.kill());
  const history = [];
  const out = join(dir, legacy_kimo_render ? 'master.mp4' : 'master.mkv');
  const finalOut = join(dir, 'final.mp4');
  const saved = join(dir, 'project.kimo.json');
  const savedEdl = join(dir, 'edit.edl.json');
  const appEdl = suppliedEdl ?? (edlFile && existsSync(edlFile) ? JSON.parse(readFileSync(edlFile,'utf8')) : null);
  const pictures = pictureTools({mcp,dir,files,mode,suppliedEdl,ffmpeg,ffprobe,out,savedEdl,signal,emit,fontsDir:env?.KIMO_FONTS,runTool});
  pictures.sound={enabled:true,template:style,note,previous:appEdl};
  pictures.color=colorConfig({template:style,note,previous:appEdl?.color_finish});
  let duration;
  let timeline = null;
  let msPerSec = speed || 2500; // export ms per second of 1080p timeline, learned per PC
  const checks = [];
  let youtube = null;
  let reviewImages = [];
  let cut = null; // Phase 3 transcript cut plan, when one was applied
  const imported = new Set();
  const jsonCall = async (name, args) => resultJson((await silent(name, args)) ?? {});
  const runCut = async (askAi) => {
    try {
      return await planCut({ files, P, style, styleInfo: S, note, mode, env, dir, ffmpeg, signal, emit, askAi, transcribe });
    } catch (error) {
      if (signal?.aborted) throw error;
      emit({ t: 'think', text: `transcript cut skipped (${error.message}); cutting the old way` });
      return null;
    }
  };
  /** Lays the plan on the timeline as one live op; returns the clip ids. */
  const layCut = async (assets, laneMode) => {
    const id = randomUUID().slice(0, 8);
    const t0 = Date.now();
    emit({ t: 'op', id, phase: 'start', tool: 'apply_cut', title: `apply_cut ${cut.plan.keep.length} segments → A-roll track`, why: 'the transcript cut becomes the timeline the compositor renders', at: t0 });
    const r = await applyCutPlan({ plan: cut.plan, clips: cut.clips, assets: cut.clips.map((c) => assets.find((a) => a.path === c.file.path)), call: jsonCall, P, fps: canvasFps(files), mode: laneMode });
    pictures.cutPlan = { track: r.track, keep: cut.plan.keep.map((k) => ({ clip_id: k.clip_id, src_path: cut.clips.find((c) => c.src === k.src)?.file.path, in: k.in, out: k.out, at: k.at, reason: k.reason, zoom: k.zoom, speaker: k.speaker, sentences: k.sentences })), needs_cover: cut.plan.needs_cover, screen_punch: cut.plan.keep.filter((k) => cut.clips.find((c) => c.src === k.src)?.screen).map((k) => ({ clip_id: k.clip_id, at: k.at, kind: 'screen_punch' })), hook: cut.plan.hook, judgment: cut.plan.judgment, summary: cut.plan.summary, metrics: cut.plan.metrics, broll: cut.plan.broll };
    writeFileSync(join(dir, 'cutplan.json'), JSON.stringify(storablePlan(cut.plan), null, 1));
    history.push(`apply_cut => ${cut.plan.summary.text}; A-roll track ${r.track} with ${r.clipIds.length} clips`);
    emit({ t: 'op', id, phase: 'end', ok: r.clipIds.length > 0, ms: Date.now() - t0, result: `${r.clipIds.length} clips · ${r.duration.toFixed(2)} s on ${r.track}` });
    await refreshTimeline();
    return r;
  };
  const allowedCall = (c) => {
    if (!cut) return true;
    if (['auto_rough_cut', 'cut_to_beat', 'project_set'].includes(c.name)) return false;
    if (c.name === 'import_media' && imported.has(String(c.args.path ?? '').replaceAll('\\', '/'))) return false;
    return true;
  };
  const silent = async (name, args) => {
    const r = !legacy_kimo_render && pictures.handles.has(name) ? await pictures.call(name,args) : await mcp.call(name, args);
    return r?.isError ? null : r;
  };
  const refreshTimeline = async () => {
    const r = await silent('timeline_summary', {});
    if (!r) return;
    timeline = resultJson(r);
    if(legacy_kimo_render)emit({ t: 'timeline', timeline });
    else try{emit({t:'timeline',timeline:await pictures.timeline()});}catch(error){if(signal?.aborted)throw error;}
  };
  const previewAt = async (name, args) => {
    const d = Number(timeline?.duration) || 0;
    if (!d) return;
    let at = Math.min(d * 0.33, 4);
    if (['add_title', 'add_text', 'add_glow_text'].includes(name) && args.start != null) at = Number(args.start) + Math.min(1, (Number(args.duration) || 2) / 2);
    else if (name === 'auto_captions' || name === 'caption_from_words' || name === 'edit_caption') {
      const caps = (timeline.tracks_bottom_to_top ?? []).flatMap((t) => t.clips).filter((c) => /^text:/.test(c.src ?? ''));
      const pick = name === 'edit_caption' ? caps.find((c) => c.id === args.clip_id) : caps[Math.min(1, caps.length - 1)];
      if (pick) at = pick.start + Math.min(0.3, (pick.end - pick.start) / 2);
    } else if (['trim_clip', 'move_clip', 'set_property', 'auto_reframe', 'stabilize'].includes(name) && args.clip_id) {
      const c = (timeline.tracks_bottom_to_top ?? []).flatMap((t) => t.clips).find((x) => x.id === args.clip_id);
      if (c) at = c.start + Math.min(0.8, (c.end - c.start) / 2);
    }
    at = Math.max(0, Math.min(d - 0.05, at));
    const r = await silent('render_frame', { time: at, path: join(dir, 'live.jpg'), inline: 'always', inline_format: 'jpeg', inline_quality: 72, max_inline_px: 640 });
    const image = resultImage(r);
    if (image) emit({ t: 'preview', time: at, image, after: name });
  };
  const call = async (name, args, why) => {
    if (signal?.aborted) throw new Error('cancelled');
    const id = randomUUID().slice(0, 8);
    emit({ t: 'op', id, phase: 'start', tool: name, title: `${name} ${argsLine(args)}`, why, at: Date.now() });
    const t0 = Date.now();
    let ticker;
    if (name === 'export' && legacy_kimo_render) {
      const px = (P.width * P.height) / (1920 * 1080);
      const est = Math.max(1500, (Number(timeline?.duration) || 10) * msPerSec * px);
      const target = args.path;
      ticker = setInterval(() => {
        const el = Date.now() - t0;
        let bytes = 0;
        try {
          bytes = statSync(target).size;
        } catch {
          /* not yet */
        }
        const f = Math.min(0.97, el / est);
        emit({ t: 'progress', phase: 'render', label: 'rendering with kimo', f, eta: Math.max(1, (est - el) / 1000), bytes, estimated: true });
      }, 500);
    }
    const result = await (CAMERA_TOOLS.includes(name) ? cameraTool(name, args) : GRAPHIC_TOOLS.includes(name) ? graphicsTool(name, args) : EXPLAIN_TOOLS.includes(name) ? explainTool(name, args) : SAM_TOOLS.includes(name) ? samTool(name, args) : !legacy_kimo_render && pictures.handles.has(name) ? pictures.call(name,args) : mcp.call(name, args)).finally(() => clearInterval(ticker));
    const failed = Boolean(result?.isError);
    const text = resultText(result);
    history.push(`${name}(${JSON.stringify(args).slice(0, 400)}) => ${failed ? 'ERROR ' : ''}${text}`);
    const ms = Date.now() - t0;
    emit({ t: 'op', id, phase: 'end', ok: !failed, ms, result: failed ? undefined : text.slice(0, 160), error: failed ? text.slice(0, 240) : undefined });
    if (name === 'export' && !failed) {
      const d = Number(resultJson(result).duration ?? /duration"?\s*[:=]\s*([\d.]+)/.exec(text)?.[1]);
      if (d) {
        duration = d;
        const px = (P.width * P.height) / (1920 * 1080);
        msPerSec = Math.round(ms / d / px);
      }
      emit({ t: 'progress', phase: 'render', label: 'rendered', f: 1, eta: 0 });
    }
    if (!failed && STRUCTURE.has(name)) await refreshTimeline();
    if (!failed && VISUAL.has(name)) await previewAt(name, args);
    if (name === 'render_frame' && !failed) {
      const image = resultImage(result);
      if (image) emit({ t: 'frame', time: args.time, image });
    }
    return result;
  };
  // ---------- Phase 4 camera director: inputs measured once on this PC, keys written on every snapshot ----------
  const norm = (p) => String(p ?? '').replaceAll('\\', '/');
  const cameraCtx = () => (pictures.camera ??= { ctx: { energy: energyFor(style, { w: P.width, h: P.height }), maxStatic: maxStaticFor({ w: P.width, h: P.height }), overrides: {} } }).ctx;
  const cameraTool = async (name, args) => {
    const ctx = cameraCtx();
    const r = cameraToolCall((ctx.overrides ??= {}), name, args);
    return { ...(r.ok ? {} : { isError: true }), content: [{ type: 'text', text: r.text }] };
  };
  const prepareCamera = async () => {
    if (legacy_kimo_render) return;
    const saved = appEdl?.camera_plan ?? null;
    const canvas = { w: P.width, h: P.height };
    const skip = new Set((cut?.clips ?? []).filter((c) => c.kind === 'broll' || c.screen).map((c) => norm(c.file.path)));
    const talking = files.filter((f) => f.kind === 'video' && !skip.has(norm(f.path)));
    const opId = randomUUID().slice(0, 8);
    const t0 = Date.now();
    emit({ t: 'op', id: opId, phase: 'start', tool: 'camera_probe', title: `camera · where the subject is in ${talking.length} clip${talking.length === 1 ? '' : 's'} (on this PC)`, why: 'framing, head placement and look room follow the person, not the frame centre', at: t0 });
    try {
      const cacheDir = env?.KIMO_CACHE_DIR || join(dir, 'cache');
      const inputs = cut ? cameraInputsFromCut(cut.plan, cut.clips) : { words: saved?.words ?? {}, emphasis: saved?.emphasis ?? [], chapters: saved?.chapters ?? [] };
      const heads = { ...(saved?.heads ?? {}) };
      for (const f of talking) {
        const key = norm(f.path);
        if (heads[key] !== undefined) continue;
        const samTracks = cachedPersonTracks(join(dir, 'sam'), f.path, f.duration);
        heads[key] = await headTrack({ ffmpeg, file: f, samTracks, cacheDir, signal }).catch((e) => {
          if (signal?.aborted) throw e;
          return null;
        });
      }
      let screens = saved?.screenRegions ?? {};
      if (cut) {
        const screenPaths = new Set(cut.clips.filter((c) => c.screen).map((c) => norm(c.file.path)));
        const ranges = (pictures.cutPlan?.keep ?? []).filter((k) => k.clip_id && screenPaths.has(norm(k.src_path))).map((k) => {
          const f = files.find((x) => norm(x.path) === norm(k.src_path));
          return { clip_id: k.clip_id, path: k.src_path, in: k.in, out: k.out, width: f?.width, height: f?.height };
        });
        if (ranges.length) screens = await screenRegions({ ffmpeg, clips: ranges, cacheDir, signal });
      }
      pictures.camera = { ctx: { energy: energyFor(style, canvas), maxStatic: maxStaticFor(canvas), podcast: style === 'podcast' || PODCAST_NOTE.test(note ?? ''), ...inputs, heads, screenRegions: screens, overrides: pictures.camera?.ctx?.overrides ?? saved?.overrides ?? {} } };
      const found = Object.values(heads).filter(Boolean);
      emit({ t: 'op', id: opId, phase: 'end', ok: true, ms: Date.now() - t0, result: `energy ${pictures.camera.ctx.energy} · ${found.length}/${talking.length} subject tracks (${[...new Set(found.map((h) => h.source))].join(', ') || 'frame centre'})${Object.keys(screens).length ? ` · ${Object.values(screens).flat().length} screen regions` : ''}${inputs.emphasis.length ? ` · ${inputs.emphasis.length} emphasis words` : ''}` });
    } catch (error) {
      if (signal?.aborted) throw error;
      emit({ t: 'op', id: opId, phase: 'end', ok: false, ms: Date.now() - t0, error: String(error.message).slice(0, 200) });
      cameraCtx();
    }
  };
  // ---------- Phase 6 graphics + b-roll: the app's motion-graphics kit and b-roll placement ----------
  const NO_GRAPHICS = /\b(no|without|skip|remove|drop|turn off)\s+(the\s+|any\s+)?(graphics|titles|overlays)\b/i;
  const graphicsConfig = () => (pictures.graphics ??= { enabled: true, template: style || 'auto', note, hookStyle: null, state: {}, targets: {}, samLayers: [] });
  /** The graphics kit on: template defaults + planner tools are applied on every picture snapshot. */
  const startGraphics = (saved = appEdl) => {
    if (legacy_kimo_render) return;
    const g = saved?.graphics;
    const off = NO_GRAPHICS.test(note ?? '') && mode !== 'manual';
    pictures.graphics = {
      enabled: !off,
      template: g?.template ?? (style || 'auto'),
      note: mode === 'followup' ? [saved?.graphics?.note, note].filter(Boolean).join('\n') : note,
      hookStyle: pictures.captions?.hook_style ?? g?.hook_style ?? pickHookStyle({ style, note }),
      state: g?.planner ? { calls: g.planner.calls ?? [], ...(g.planner.hookText ? { hookText: g.planner.hookText } : {}), ...(saved?.broll ? { brollDensity: saved.broll.density, broll: saved.broll.planner ?? [] } : {}) } : {},
      targets: g?.targets ?? {},
      samLayers: g?.sam_layers ?? [],
    };
    if (!pictures.broll && saved?.broll?.clips?.length) pictures.broll = { clips: saved.broll.clips, matches: saved.broll.matches ?? [], density: saved.broll.density ?? 0.5, note };
  };
  /** B-roll inputs: one cached vision description per non-speech clip and one batched sentence match (AI modes only). */
  const startBroll = async (withAi) => {
    if (legacy_kimo_render || !cut) return;
    const clips = cut.clips.filter((c) => c.kind === 'broll' && c.file?.kind === 'video').map((c) => ({ path: c.file.path, duration: c.duration ?? c.file.duration }));
    if (!clips.length) return;
    const id = randomUUID().slice(0, 8);
    const t0 = Date.now();
    emit({ t: 'op', id, phase: 'start', tool: 'broll', title: `b-roll · ${clips.length} clip${clips.length === 1 ? '' : 's'} of your own footage${withAi ? ' · describing and matching' : ' (offline: names + jump cuts)'}`, why: 'cover jump cuts and abstract lines with your own non-speech shots', at: t0 });
    try {
      const cacheDir = env?.KIMO_CACHE_DIR || join(dir, 'cache');
      const desc = await describeClips({ clips, ffmpeg, cacheDir, signal, ask: withAi ? (text, images) => ai('review', text, images, signal) : null });
      for (const c of clips) c.description = desc.get(norm(c.path)) ?? null;
      const snap = await pictures.snapshot();
      const sentences = outputSentences(outputWords(snap, pictures.camera?.ctx ?? {}));
      const matches = await matchSentences({ sentences, clips, cacheDir, signal, ask: withAi ? (text) => ai('build', text, [], signal) : null });
      pictures.broll = { clips, matches: [...matches], density: 0.5, note };
      graphicsConfig();
      emit({ t: 'op', id, phase: 'end', ok: true, ms: Date.now() - t0, result: `${desc.size}/${clips.length} described · ${matches.size} sentence match${matches.size === 1 ? '' : 'es'}` });
    } catch (error) {
      if (signal?.aborted) throw error;
      emit({ t: 'op', id, phase: 'end', ok: false, ms: Date.now() - t0, error: String(error.message).slice(0, 200) });
    }
  };
  /** A callout's target from a prompt: SAM on the composed frame (one image call, cached by frame + prompt). */
  const resolveTarget = async (at, prompt) => {
    const png = join(dir, `callout-${Math.round(at * 1000)}.png`);
    const r = await pictures.call('render_frame', { time: at, path: png, inline: 'never' });
    if (r?.isError || !existsSync(png)) return null;
    const url = await jpeg(png, 1280);
    if (!url) return null;
    const cacheDir = join(env?.KIMO_CACHE_DIR || join(dir, 'cache'), 'sam-targets');
    mkdirSync(cacheDir, { recursive: true });
    const key = createHash('sha256').update(url + '\n' + prompt.toLowerCase()).digest('hex').slice(0, 24);
    const file = join(cacheDir, `${key}.json`);
    if (existsSync(file)) return JSON.parse(readFileSync(file, 'utf8')).box;
    const jpgPath = png.replace(/\.png$/, '.jpg');
    const size = await probe(ffprobe, jpgPath).catch(() => null);
    const W = size?.width || P.width;
    const H = size?.height || P.height;
    const tracks = await segmentImage({ image: url, prompt, width: W, height: H, signal });
    const o = tracks.objects.get(tracks.main) ?? [...tracks.objects.values()][0];
    const b = o?.frames.get(0)?.box ?? [...(o?.frames.values() ?? [])][0]?.box;
    const box = b ? { x: (b.left / W) * P.width, y: (b.top / H) * P.height, w: ((b.right - b.left) / W) * P.width, h: ((b.bottom - b.top) / H) * P.height } : null;
    writeFileSync(file, JSON.stringify({ box }));
    return box;
  };
  const graphicsTool = async (name, args) => {
    const g = graphicsConfig();
    const r = graphicToolCall(g.state, name, args);
    if (!r.ok) return { isError: true, content: [{ type: 'text', text: r.text }] };
    let text = r.text;
    try {
      if (name === 'callout' && args.target_prompt && !Array.isArray(args.box)) {
        const box = await resolveTarget(Number(args.at), String(args.target_prompt).slice(0, 80));
        if (box) g.targets[g.state.calls.length - 1] = box;
        text = JSON.stringify({ ok: true, target: box ? 'found' : 'not found; the active screen region is used' });
      }
      if (name === 'graphic' && String(args.kind).toLowerCase() === 'text_behind' && !args.remove) {
        // the existing SAM matte render, exposed as an EDL element over that moment
        const snap = await pictures.snapshot();
        const track = snap.video.find((t) => t.clips.some((c) => (snap.cut_plan?.keep ?? []).some((k) => k.clip_id === c.id))) ?? snap.video[0];
        const at = Number(args.at) || 0;
        const dur = Math.max(1, Math.min(4, Number(args.dur) || 2.5));
        const clip = track?.clips.find((c) => at >= c.at && at < c.at + (c.out - c.in) / (c.speed ?? 1));
        const src = clip && snap.sources.find((x) => x.id === clip.src);
        const file = src && files.find((f) => norm(f.path) === norm(src.path));
        if (!file) return { isError: true, content: [{ type: 'text', text: 'text_behind needs the talking-head clip under that time' }] };
        const srcT = clip.in + (at - clip.at) * (clip.speed ?? 1);
        const out = await runSam(file, { effect: 'text_behind', text: String(args.props?.text ?? args.text ?? '').slice(0, 24), start: srcT, duration: dur * (clip.speed ?? 1), text_start: 0, text_end: dur * (clip.speed ?? 1) });
        g.samLayers.push({ path: out.output, at, dur, in: 0, text: args.props?.text ?? args.text, duration: out.duration, w: out.width, h: out.height, fps: out.fps });
        text = JSON.stringify({ ok: true, text_behind: 'rendered behind the subject with SAM; composed as an EDL element' });
      }
    } catch (error) {
      if (signal?.aborted) throw error;
      text = JSON.stringify({ ok: false, note: String(error.message).slice(0, 160) });
    }
    await refreshTimeline();
    return { content: [{ type: 'text', text }] };
  };
  // ---------- Phase 7 explainers: the visual director shows what is said while it is said ----------
  const NO_EXPLAIN = /\b(no|without|turn off|skip)\s+(the\s+|any\s+)?(explainers?|explainer visuals)\b/i;
  let explainRuns = 0;
  /** Starts (or re-runs) the visual director; withAi uses the locked proxy when signed in or with an own key. */
  const startExplain = async (withAi, { fromTool = false, saved: given = null } = {}) => {
    if (legacy_kimo_render) return;
    const ctx = pictures.camera?.ctx;
    if (!Object.values(ctx?.words ?? {}).some((w) => w?.length)) return;
    const saved = pictures.explain ?? given ?? appEdl?.explain?.config ?? null;
    const opt = explainOpts ?? {};
    const state = structuredClone(saved?.state ?? {});
    const patches = fromTool ? { changes: [], redirect: true } : notePatches(state, mode === 'followup' || mode === 'manual' ? note : `${note ?? ''}`);
    const off = opt.enabled === false || (NO_EXPLAIN.test(note ?? '') && mode !== 'manual') || state.density === 'off';
    const cacheDir = env?.KIMO_CACHE_DIR || join(dir, 'cache');
    const base = { template: style || 'auto', theme: state.theme ?? null, layoutHint: state.layoutHint ?? S.explain?.layout ?? null, state, ffmpeg, sfxDir: join(cacheDir, 'sfx'), sfx: !/\bno (sfx|sound effects|sounds)\b/i.test(note ?? '') };
    if (off) {
      pictures.explain = { ...base, enabled: false, beats: [] };
      return;
    }
    // follow-ups and timeline re-renders keep the saved plan unless the note changes it
    const reuse = saved?.beats && !patches.redirect && !(state.userBeats?.length > (saved.state?.userBeats?.length ?? 0)) && (mode === 'followup' || mode === 'manual');
    if (reuse || (mode === 'manual' && saved?.beats)) {
      pictures.explain = { ...saved, ...base, enabled: true };
      return;
    }
    if (mode === 'manual') return;
    const ai0 = withAi && hasAiAccess() && explainRuns < 3;
    explainRuns++;
    const id = randomUUID().slice(0, 8);
    const t0 = Date.now();
    emit({ t: 'op', id, phase: 'start', tool: 'explain', title: `explainer · visual director${ai0 ? ' (AI, cached)' : ' (speech cues, on this PC)'}${patches.changes.length ? ` · ${patches.changes.join(', ')}` : ''}`, why: 'what you say is shown on screen as you say it: lists, numbers, maps, diagrams, real images, memes', at: t0 });
    try {
      const snap = await pictures.snapshot();
      const words = outputWords(snap, ctx);
      if (!words.length) throw new Error('no transcript words');
      const total = snap.video.flatMap((t) => t.clips).reduce((m, c) => Math.max(m, c.at + (c.out - c.in) / (c.speed ?? 1)), 0);
      const projectAssets = [...new Set(files.map((f) => join(dirname(f.path), 'assets')))];
      const appData = process.env.APPDATA ? join(process.env.APPDATA, 'kimo') : join(cacheDir, '..');
      const keep = new Set((pictures.cutPlan?.screen_punch ?? []).map((x) => x.clip_id));
      const screens = snap.video.flatMap((t, ti) => t.clips.map((c) => ({ t0: c.at, t1: c.at + (c.out - c.in) / (c.speed ?? 1), what: keep.has(c.id) ? 'screen recording' : ti === 0 ? 'talking head' : 'b-roll' })));
      const density = state.density ?? opt.density ?? S.explain?.density ?? 'normal';
      const toggles = { ...(opt.toggles ?? {}), ...(state.toggles ?? {}) };
      const result = await direct({
        words, canvas: { w: P.width, h: P.height }, template: style || 'auto', note, toggles, density, offline: Boolean(opt.offline), audience: opt.audience, total,
        screens, libraryDirs: [join(dir, 'assets'), ...projectAssets, process.env.KIMO_MY_ASSETS || join(appData, 'My assets')],
        userBeats: placeUserBeats(state.userBeats ?? [], words).beats, removed: state.removed, focus: state.focus, regenerate: state.regenerate, allowMemes: state.allowMemes,
        ask: ai0 ? (kind, text, images) => ai(kind, text, images, signal) : null,
        cacheDir: join(cacheDir, 'explain-ai'), assetCache: new AssetCache(env?.KIMO_ASSET_CACHE || defaultAssetCache()), ffmpeg, signal, emit,
      });
      let beats = anchorBeats(result.beats, words);
      if (state.regenerate && saved?.beats?.length) {
        const r = state.regenerate;
        const inside = (b) => b._anchor?.say != null && b._anchor.say >= r.from && b._anchor.say < r.to;
        beats = [...saved.beats.filter((b) => !inside(b)), ...beats.filter(inside)];
      }
      // b-roll beats: the user's own non-speech clips through the Phase 6 b-roll planner
      for (const b of result.beats.filter((x) => x.kind === 'broll')) {
        const q = b.asset_query?.q ?? b.caption ?? '';
        const clip = (pictures.broll?.clips ?? []).map((c) => ({ c, s: libraryScore(q, { name: c.path.split(/[\\/]/).pop(), caption: c.description ?? '' }) })).sort((a, z) => z.s - a.s)[0];
        if (clip?.s >= 0.5) ((graphicsConfig().state.broll ??= [])).push({ at: words[b.say_word_idx].start, dur: 2.5, clip: clip.c.path, in: 0 });
      }
      pictures.explain = { ...base, enabled: true, beats, tone: result.cues?.tone ?? null, toggles, density, report: result.report, dropped: result.dropped.slice(0, 60) };
      emit({ t: 'op', id, phase: 'end', ok: true, ms: Date.now() - t0, result: directorSummary(result.beats, result.report) });
      history.push(`explainer => ${directorSummary(result.beats, result.report)}`);
    } catch (error) {
      if (signal?.aborted) throw error;
      emit({ t: 'op', id, phase: 'end', ok: false, ms: Date.now() - t0, error: String(error.message).slice(0, 200) });
    }
  };
  const explainTool = async (name, args) => {
    pictures.explain ??= { enabled: true, beats: [], state: {} };
    const st = (pictures.explain.state ??= {});
    const r = explainToolCall(st, name, args);
    if (!r.ok) return { isError: true, content: [{ type: 'text', text: r.text }] };
    await startExplain(true, { fromTool: true });
    await refreshTimeline();
    const placed = (await pictures.snapshot()).explain?.placed ?? [];
    return { content: [{ type: 'text', text: JSON.stringify({ ...JSON.parse(r.text), visuals: placed.map((p) => `${p.id} ${p.kind} @${p.at}s ${p.mode}`).slice(0, 20) }) }] };
  };
  // ---------- Phase 5 captions: kimo's own caption engine from the Phase 3 transcript words ----------
  /**
   * Captions from the cut plan's word timestamps (whisper already ran once for the cut),
   * re-timed onto the output, styled, placed and rendered by libass in the final text pass.
   * Returns false when no transcript words exist (the caller falls back to the engine's captions).
   */
  const startCaptions = async () => {
    if (legacy_kimo_render) return false;
    const ctx = pictures.camera?.ctx;
    if (!Object.values(ctx?.words ?? {}).some((w) => w?.length)) return false;
    const saved = appEdl?.captions;
    const locked = Boolean(captionStyle && captionStyle !== 'auto');
    const canvas = { w: P.width, h: P.height };
    const off = mode === 'followup' && NO_CAPTIONS.test(note ?? '');
    const chosen = saved?.style && !locked && mode === 'followup' && !/caption|subtitle/i.test(note ?? '') ? saved.style : pickCaptionStyle({ requested: captionStyle, note, template: S, canvas });
    const id = randomUUID().slice(0, 8);
    const t0 = Date.now();
    emit({ t: 'op', id, phase: 'start', tool: 'captions', title: off ? 'captions · removing them' : `captions · ${captionStyleOf(chosen).name} · word-timed from the transcript (on this PC)`, why: 'word-by-word captions with a keyword accent, inside the safe area and off the face', at: t0 });
    pictures.enableCaptions({
      enabled: !off,
      style: chosen,
      locked,
      note,
      hook_style: saved?.hook_style ?? pickHookStyle({ style, note }),
      hints: noteHints(note),
      keep: (appEdl?.overlays ?? []).filter((o) => o.props?.engine === CAPTION_ENGINE && o.props.edited),
    });
    await refreshTimeline();
    const s = pictures.captionReport ?? {};
    emit({ t: 'op', id, phase: 'end', ok: true, ms: Date.now() - t0, result: off ? 'captions off' : `${s.chunks ?? 0} chunks · ${Math.round((s.accent_share ?? 0) * 100)}% with a keyword · min ${s.caption_min_word_s ?? '?'} s per word${s.caption_safe === false ? ' · some outside the safe area' : ''}${s.hidden ? ` · ${s.hidden} yield to graphics` : ''}` });
    history.push(`captions => ${off ? 'off' : `${chosen}, ${s.chunks ?? 0} chunks`}`);
    return true;
  };
  // ---------- SAM 3.1: every step is a live op with progress + a preview ----------
  const samStep = async (tool, title, fn, summary) => {
    const id = randomUUID().slice(0, 8);
    emit({ t: 'op', id, phase: 'start', tool, title: `${tool} ${title}`, at: Date.now() });
    const t0 = Date.now();
    try {
      const r = await fn((f) => emit({ t: 'progress', phase: 'sam', label: 'SAM 3.1 tracking', f }));
      const text = summary ? summary(r) : '';
      history.push(`${tool} ${title} => ${text}`);
      emit({ t: 'op', id, phase: 'end', ok: true, ms: Date.now() - t0, result: text.slice(0, 160) });
      return r;
    } catch (err) {
      emit({ t: 'op', id, phase: 'end', ok: false, ms: Date.now() - t0, error: String(err.message).slice(0, 240) });
      throw err;
    }
  };
  const framePreview = async (path, at, after) => {
    const jpg = join(dir, 'sam-live.jpg');
    await runTool(ffmpeg, ['-hide_banner', '-loglevel', 'error', '-y', '-ss', String(at), '-i', path, '-frames:v', '1', '-vf', 'scale=-2:640', '-q:v', '5', jpg]);
    try {
      emit({ t: 'preview', time: at, image: `data:image/jpeg;base64,${readFileSync(jpg).toString('base64')}`, after });
    } catch {
      /* no preview */
    }
  };
  const runSam = async (file, opts) => {
    const r = await samEffect({ ffmpeg, ffprobe, input: file.path, dir: join(dir, 'sam'), opts: { size: [P.width, P.height], ...opts }, fontsDir: env?.KIMO_FONTS, signal, step: samStep });
    await framePreview(r.output, Math.min(r.duration * 0.45, 3), `sam_${r.effect}`);
    return r;
  };
  const samTool = async (name, args) => {
    const file = files.find((f) => f.path === args.file) ?? files.find((f) => f.kind === 'video' && String(args.file ?? '').endsWith(f.path.split(/[\\/]/).pop()));
    if (!file || file.kind !== 'video') return { isError: true, content: [{ type: 'text', text: 'file must be one of the video file paths listed' }] };
    const opts = name === 'sam_reframe' ? { effect: 'reframe', prompt: args.prompt, punch: args.punch_ins }
      : name === 'sam_text_behind' ? { effect: 'text_behind', prompt: args.prompt, text: args.text, text_start: args.text_start, text_end: args.text_end, color: args.color }
        : name === 'sam_background' ? { effect: args.mode === 'color' ? 'bg_color' : args.mode === 'image' ? 'bg_image' : 'bg_blur', prompt: args.prompt, color: args.color, image: args.image }
          : { effect: 'redact', prompt: args.prompt || 'face' };
    try {
      const r = await runSam(file, opts);
      const imp = resultJson(await mcp.call('import_media', { path: r.output }));
      return { content: [{ type: 'text', text: JSON.stringify({ asset_id: imp.asset_id, path: r.output, duration: r.duration, width: r.width, height: r.height, effect: r.effect, tracked: r.tracks, note: 'add_clip this asset (fit cover) in place of the original clip' }) }] };
    } catch (err) {
      if (signal?.aborted) throw err;
      return { isError: true, content: [{ type: 'text', text: `SAM: ${err.message}` }] };
    }
  };
  const jpeg = async (png, w) => {
    const target = png.replace(/\.png$/, '.jpg');
    // the AI proxy takes images up to 400k chars: step quality down until it fits
    for (const [q, scale] of [[4, w], [7, w], [9, w ? Math.round(w * 0.75) : 960]]) {
      await runTool(ffmpeg, ['-hide_banner', '-loglevel', 'error', '-y', '-i', png, ...(scale ? ['-vf', `scale=${scale}:-2`] : []), '-q:v', String(q), target]);
      try {
        const url = `data:image/jpeg;base64,${readFileSync(target).toString('base64')}`;
        if (url.length < 390_000) return url;
      } catch {
        return null;
      }
    }
    return null;
  };
  /**
   * SAM-only edits: kimo only finishes the audio, so the picture is taken frame for frame from
   * the SAM render (kimo's own re-render repeats ~5 of every 32 frames, which reads as judder).
   */
  const samPassthrough = async () => {
    if(!legacy_kimo_render)return;
    const stage = mode === 'sam' && files.length === 1 && files[0].sam ? files[0].path : null;
    if (!stage || !existsSync(stage)) return;
    const tmp = join(dir, 'master-av.mp4');
    const id = randomUUID().slice(0, 8);
    emit({ t: 'op', id, phase: 'start', tool: 'frame_exact', title: 'frame_exact picture from the SAM render + kimo\'s finished audio', at: Date.now() });
    const t0 = Date.now();
    const r = await runTool(ffmpeg, ['-nostdin', '-hide_banner', '-loglevel', 'error', '-y', '-i', stage, '-i', out, '-map', '0:v:0', '-map', '1:a:0?', '-c', 'copy', '-shortest', '-movflags', '+faststart', tmp]);
    const ok = r.code === 0 && existsSync(tmp) && statSync(tmp).size > 1000;
    if (ok) renameSync(tmp, out);
    emit({ t: 'op', id, phase: 'end', ok, ms: Date.now() - t0, ...(ok ? { result: 'every frame kept (no repeats)' } : { error: String(r.err || 'remux failed').slice(-200) }) });
  };
  /** Export + measure + sample frames for the review. */
  const check = async (pass) => {
    emit({ t: 'status', text: legacy_kimo_render ? `rendering with the real kimo engine (pass ${pass})` : `compositing exact source frames (pass ${pass})` });
    await call('export', { path: out, crf: 16 });
    if (!existsSync(out)) throw new Error(`export failed: ${history.at(-1)?.slice(-300)}`);
    await samPassthrough();
    emit({ t: 'status', text: 'measuring loudness, true peak, black frames and dead air' });
    let m = await measure(ffmpeg, ffprobe, out);
    if (!m.acodec && files.some((f) => f.audio)) {
      emit({ t: 'think', text: 'the render lost the source sound; restoring it and rendering again' });
      const mediaClips = (timeline?.tracks_bottom_to_top ?? []).flatMap((t) => t.clips).filter((c) => c.in != null && !/^text:/.test(c.src ?? ''));
      for (const c of mediaClips.slice(0, 60)) await silent('set_audio', { clip_id: c.id, mute: false });
      await call('finish_audio', { target_lufs: -14, keep_ambience: true, compress_strength: 1 }, 'keep the original sound');
      await call('export', { path: out, crf: 16 });
      m = await measure(ffmpeg, ffprobe, out);
    }
    const qc = qualityChecks(m, P, { sourceAudio: files.some((f) => f.audio), targetLufs:pictures.lastEdl?.sound?.target_lufs??-14 });
    checks.push({ pass, m, qc });
    emit({ t: 'quality', pass, stage: 'render', m: { ...m, loudnorm: undefined }, checks: qc });
    reviewImages = [];
    const d = duration ?? m.duration ?? 1;
    const T = (f) => +Math.max(0, Math.min(d - 0.05, f * d)).toFixed(2);
    emit({ t: 'status', text: 'sampling 16 frames + 2 full-size frames for the frame check' });
    for (const [k, list] of [['a', [0.02, 0.1, 0.18, 0.3, 0.42, 0.55, 0.68, 0.8]], ['b', [0.06, 0.14, 0.24, 0.36, 0.48, 0.62, 0.74, 0.9]]]) {
      const png = join(dir, `sheet_${k}.png`);
      const r = await call('contact_sheet', { times: list.map(T), cols: 4, tile_px: 320, labels: 'time', path: png });
      if (r && !r.isError && existsSync(png)) {
        const url = await jpeg(png);
        if (url) reviewImages.push({ label: `contact sheet ${k}: 8 frames at ${list.map(T).join(', ')} s (time drawn on each)`, url });
      }
    }
    for (const t of [Math.min(1.2, d * 0.1), T(0.5)]) {
      const png = join(dir, `full_${Math.round(t * 100)}.png`);
      const r = await call('render_frame', { time: t, path: png, inline: 'never' });
      if (r && !r.isError && existsSync(png)) {
        const url = await jpeg(png, P.width >= P.height ? 960 : 540);
        if (url) {
          reviewImages.push({ label: `full frame at ${t.toFixed(2)} s (check caption legibility + safe area)`, url });
          emit({ t: 'frame', time: t, image: url });
        }
      }
    }
    return m;
  };
  const buildRounds = async (rounds, context) => {
    let done = false;
    for (let round = 0; round < rounds && !done; round++) {
      emit({ t: 'think', text: round ? `planning round ${round + 1}: reading ${history.length} tool results` : mode === 'followup' ? 'reading your request against the current edit' : 'writing the edit script' });
      const answer = await ai('build', [...context, `round ${round + 1} of ${rounds}. history so far:\n${history.slice(-40).join('\n') || '(nothing yet)'}`].join('\n\n'), [], signal);
      const script = typeof answer.script === 'string' ? answer.script.trim() : '';
      if (script && round === 0) emit({ t: 'say', kind: 'script', text: script.slice(0, 2500) });
      if (typeof answer.say === 'string' && answer.say.trim()) emit({ t: 'think', text: answer.say.trim().slice(0, 400) });
      const planned = parseCalls(answer.calls);
      if (planned.length) emit({ t: 'think', text: `next: ${planned.map((c) => c.name).join(' → ')}` });
      for (const c of planned) {
        if (!allowedCall(c)) {
          emit({ t: 'think', text: `skipping ${c.name}: the transcript cut already did that` });
          continue;
        }
        if (c.name === 'project_set') Object.assign(c.args, { width: P.width, height: P.height, fps: canvasFps(files) });
        // kimo can file speech it doesn't classify as dialogue under "ambience" and mute it;
        // keep the sound unless the edit laid real b-roll over the talking track
        if (c.name === 'finish_audio' && c.args.keep_ambience == null && !history.some((h) => h.startsWith('place_broll'))) c.args.keep_ambience = true;
        await call(c.name, c.args, c.why);
      }
      done = answer.done === true || !planned.length;
    }
  };
  try {
    emit({ t: 'status', text: 'starting the kimo engine' });
    const { tools } = await mcp.start();
    const toolText = compactTools(tools);
    // manual SAM effect chosen in the app: render it first, then edit that file
    if (sam?.effect && SAM_EFFECTS.includes(sam.effect) && mode !== 'followup' && mode !== 'manual') {
      const target = files.find((f) => f.kind === 'video');
      if (!target) throw new Error('SAM effects need a video file');
      emit({ t: 'status', text: `SAM 3.1: ${sam.effect.replace('_', ' ')} on "${sam.prompt || 'person'}"` });
      const r = await runSam(target, sam);
      files = files.map((f) => (f === target ? { ...f, path: r.output, duration: r.duration, width: r.width, height: r.height, fps: r.fps, sam: { effect: r.effect, source: target.path } } : f));
      emit({ t: 'say', text: `SAM 3.1 ${r.effect.replace('_', ' ')} done · ${r.width}x${r.height} · tracked "${r.prompt}" on ${r.tracks.seen}/${r.tracks.frames} frames` });
    }
    const fileLines = files.map((f) => `- ${f.path} (${f.kind}${f.duration ? `, ${Number(f.duration).toFixed(1)} s` : ''})`).join('\n');
    const loaded = (mode === 'followup' || mode === 'manual') && projectFile && existsSync(projectFile);
    if ((mode === 'followup' || mode === 'manual') && !loaded) throw new Error('this edit has no saved project yet; re-run it first');
    if (loaded) {
      let plannerFile=projectFile;
      if(appEdl&&!legacy_kimo_render){plannerFile=join(dir,'resume.kimo.json');writeFileSync(plannerFile,JSON.stringify(toKimoProject(appEdl)));}
      await call('load_project', { path: plannerFile });
    }


    if (mode === 'captions' || mode === 'sam') {
      // the canvas runs at the footage's own rate: a 24 fps clip on a 30 fps canvas repeats every 4th frame (judder)
      await call('project_set', { width: P.width, height: P.height, fps: canvasFps(files) });
      const assets = [];
      for (const f of files) {
        const r = await call('import_media', { path: f.path });
        const j = resultJson(r);
        if (j.asset_id) assets.push({ id: j.asset_id, duration: Number(j.duration) || 0, fps: Number(j.fps) || 0, kind: f.kind, path: f.path });
      }
      if (!assets.length) throw new Error('none of the files could be imported');
      let clipIds = [];
      // captions-only: the deterministic transcript cut runs offline (no AI call)
      if (mode === 'captions') {
        emit({ t: 'status', text: 'transcribing on this PC and cutting dead air, fillers and retakes' });
        cut = await runCut(null);
        if (cut) clipIds = (await layCut(assets, 'captions')).clipIds;
      }
      if (!cut) {
      const track = resultJson(await call('add_track', {})).track_id;
      let at = 0;
      for (const a of assets.filter((x) => x.kind !== 'audio' && x.duration > 0)) {
        const j = resultJson(await call('add_clip', { track_id: track, source_type: 'media', asset_id: a.id, start: at, duration: a.duration, in_point: 0, fit: 'cover' }));
        if (j.clip_id) clipIds.push(j.clip_id);
        at += a.duration;
      }
      }
      await prepareCamera();
      if (mode === 'captions') {
        // offline: b-roll from file names at jump cuts, graphics from the template (no AI)
        await startBroll(false);
        startGraphics();
        await startExplain(false);
      }
      await refreshTimeline();
      if (mode === 'sam') {
        await call('finish_audio', { target_lufs: -14, keep_ambience: true, compress_strength: 1 });
        await check(1);
      } else {
      emit({ t: 'status', text: 'captions from the transcript, on this PC' });
      if (!(await startCaptions())) await call('auto_captions', { ...(clipIds.length ? { clip_ids: clipIds } : {}), style: S.captions.style, max_words_per_line: S.captions.max_words_per_line, keywords: true });
      await call('finish_audio', { target_lufs: -14, keep_ambience: true, compress_strength: 1 });
      await check(1);
      }
    } else if (mode === 'manual') {
      if (!suppliedEdl && appEdl?.camera_plan) pictures.camera = { ctx: appEdl.camera_plan };
      // engine-op timeline edits rebuild the picture from the planner project: keep the saved captions (and their edits)
      const capEdl = appEdl ?? (existsSync(savedEdl) ? (() => { try { return JSON.parse(readFileSync(savedEdl, 'utf8')); } catch { return null; } })() : null);
      if (!suppliedEdl && capEdl?.captions) {
        if (!pictures.camera && capEdl.camera_plan) pictures.camera = { ctx: capEdl.camera_plan };
        pictures.enableCaptions({ style: capEdl.captions.style, hook_style: capEdl.captions.hook_style, hints: capEdl.captions.hints ?? [], keep: capEdl.overlays.filter((o) => o.props?.engine === CAPTION_ENGINE && o.props.edited) });
      }
      // and the saved graphics plan / b-roll (planner graphics calls, matched clips)
      if (!suppliedEdl && capEdl?.graphics) {
        if (!pictures.camera && capEdl.camera_plan) pictures.camera = { ctx: capEdl.camera_plan };
        startGraphics(capEdl);
      }
      if (!suppliedEdl && capEdl?.explain?.config) await startExplain(false, { saved: capEdl.explain.config });
      if(!suppliedEdl)for (const o of ops ?? []) if (MANUAL_TOOLS.includes(o.tool)) await call(o.tool, o.args ?? {}, 'your timeline edit');
      await check(1);
    } else {
      let brief = [];
      if (mode === 'followup') {
        const saved = loadSavedPlan(projectFile);
        if (saved?.keep?.some((k) => k.clip_id)) brief = plannerBrief(saved);
      } else {
        // the transcript decides the cut; the AI only makes the judgment calls (one cached call)
        emit({ t: 'status', text: 'transcribing on this PC and planning the cut from the words' });
        cut = await runCut((text) => ai('build', text, [], signal));
        if (cut) {
          await call('project_set', { width: P.width, height: P.height, fps: canvasFps(files) }, 'canvas at the footage\'s own rate');
          const assets = [];
          for (const f of files) {
            const j = resultJson(await call('import_media', { path: f.path }));
            if (j.asset_id) {
              assets.push({ id: j.asset_id, duration: Number(j.duration) || f.duration || 0, kind: f.kind, path: f.path });
              imported.add(f.path.replaceAll('\\', '/'));
            }
          }
          const laid = await layCut(assets, 'ai');
          const broll = cut.clips.filter((c) => c.kind === 'broll').map((c) => ({ ...assets.find((a) => a.path === c.file.path), path: c.file.path, duration: c.duration })).filter((b) => b.id).map((b) => ({ asset_id: b.id, path: b.path, duration: b.duration }));
          brief = [
            `already done (do not repeat): project_set ${P.width}x${P.height}, import_media for every file (asset ids: ${assets.map((a) => `${a.id} = ${a.path.split(/[\\/]/).pop()}`).join(', ')}).`,
            ...plannerBrief(cut.plan, { trackId: laid.track, broll }),
          ];
        }
      }
      await prepareCamera();
      if (mode !== 'followup') await startBroll(true);
      startGraphics();
      await startExplain(true);
      const captionsOn = !NO_CAPTIONS.test(note ?? '') || (mode === 'followup' && appEdl?.captions) ? await startCaptions() : false;
      const captionBrief = captionsOn && pictures.captions?.enabled
        ? `captions: ALREADY DONE by the app's caption engine (style "${pictures.captions.style}", word-timed from the transcript, keyword accent, placed below the chin inside the safe area, yields to hook titles, lower thirds and callouts). do not call caption_from_words. call auto_captions only to switch style: one of ${[...captionStyles().values()].filter((x) => x.kind === 'caption').map((x) => x.id).join(', ')}. edit_caption with a cap### clip id changes words. the hook title is drawn by the app's graphics kit${pictures.graphics?.hookStyle && pictures.graphics.hookStyle !== 'planner' ? ` with the "${pictures.graphics.hookStyle}" effect` : ''}.`
        : '';
      const context = mode === 'followup'
        ? [
          `this is a FOLLOW-UP on an existing, already-loaded kimo project. the user's request: ${note}`,
          'change only what the request asks; keep everything else. do NOT call project_set; do not re-import files that are already in the project; use the clip and track ids from the timeline below exactly. finish with finish_audio if you changed audio, then set done.',
          `current timeline: ${JSON.stringify(timeline ?? {}).slice(0, 6000)}`,
          `canvas: ${P.width}x${P.height}. files:\n${fileLines}`,
          ...brief,
          expertGuide(P, S, files, brief.length ? (loadSavedPlan(projectFile) ?? {}) : null),
          `tools (* = required):\n${toolText}\n${SAM_TOOL_TEXT}\n${CAMERA_TOOL_TEXT}\n${GRAPHIC_TOOL_TEXT}\n${EXPLAIN_TOOL_TEXT}`,
        ]
        : [
          `user's note: ${note || 'make a great video from these'}`,
          `canvas: ${P.width}x${P.height} at ${canvasFps(files)} fps (${P.label}; the footage's own rate, keep it). job folder: ${dir}`,
          `files:\n${fileLines}`,
          ...brief,
          expertGuide(P, S, files, cut?.plan ?? null),
          `tools (* = required):\n${toolText}\n${SAM_TOOL_TEXT}\n${CAMERA_TOOL_TEXT}\n${GRAPHIC_TOOL_TEXT}\n${EXPLAIN_TOOL_TEXT}`,
        ];
      if (captionBrief) context.splice(context.length - 1, 0, captionBrief);
      await buildRounds(mode === 'followup' ? 4 : MAX_ROUNDS, context);
      for (let pass = 1; pass <= MAX_PASSES; pass++) {
        emit({ t: 'say', text: `exporting · check ${pass} of ${MAX_PASSES}` });
        const m = await check(pass);
        const qc = checks.at(-1).qc;
        const failedChecks = qc.filter((c) => !c.ok && !c.warn && !['lufs', 'tp'].includes(c.id));
        emit({ t: 'think', text: `checking 18 frames for caption legibility, safe areas, black frames, colour and the hook (pass ${pass})` });
        let review;
        try {
          review = await ai('review', [
            `check pass ${pass} of ${MAX_PASSES}. style: ${S.label}. user's note: ${note || '(none)'}`,
            `canvas ${P.width}x${P.height}${P.height > P.width ? ' vertical: bottom 20% and right 15% are covered by shorts/reels ui' : ''}. export duration: ${duration ?? m.duration} s`,
            `measured by the app (facts): loudness ${m.lufs ?? '?'} LUFS, true peak ${m.truePeak ?? '?'} dBTP (the app's upload master pulls loudness to -14 and true peak under -1, so do not fix those), black frames: ${m.black.map(([s, e]) => `${s}-${e}s`).join(', ') || 'none'}, silences ≥0.7 s: ${m.silences.map(([s, e]) => `${s.toFixed(1)}-${e.toFixed(1)}s`).join(', ') || 'none'}.`,
            failedChecks.length ? `failed checks: ${failedChecks.map((c) => `${c.label}: ${c.value} (want ${c.want})`).join('; ')}` : 'automatic checks passed.',
            'look hard at: captions readable (size, contrast, not cut off, inside safe area, not over faces), titles, hook strength in the first 2.5 s, black or frozen frames, colour, punch-ins not cropping heads.',
            `also add to your json: "youtube": {"title": string (max 70 chars, specific, curiosity, no clickbait lies), "description": string (2-4 short sentences then a line of 3 hashtags), "chapters": [{"t": seconds, "title": string}] (only when the video has 3+ sections each ≥ 10 s, first at 0; else []), "thumbnail_time": seconds (the most expressive, sharp frame), "thumbnail_text": string (2-4 punchy words)}`,
            `timeline: ${JSON.stringify(timeline ?? {}).slice(0, 3000)}`,
            `history:\n${history.slice(-24).join('\n')}`,
          ].join('\n'), reviewImages.slice(0, 4), signal);
        } catch (err) {
          if (signal?.aborted) throw err;
          emit({ t: 'say', kind: 'check', text: `check ${pass} couldn't run (${err.message}); keeping this render` });
          break;
        }
        if (review.youtube && typeof review.youtube === 'object') youtube = review.youtube;
        const faults = (Array.isArray(review.faults) ? review.faults : []).filter((x) => typeof x === 'string').slice(0, 8);
        const fixes = parseCalls(review.calls);
        const clean = review.verdict === 'clean' || (!faults.length && !fixes.length);
        checks.at(-1).verdict = clean ? 'clean' : 'faults';
        checks.at(-1).faults = faults;
        emit({ t: 'say', kind: 'check', pass, verdict: clean ? 'clean' : 'faults', text: clean
          ? `check ${pass}: clean. ${typeof review.message === 'string' ? review.message : ''}`.trim()
          : `check ${pass}: ${faults.length || 'some'} fault${faults.length === 1 ? '' : 's'}\n${faults.map((f) => `· ${f}`).join('\n')}` });
        if (clean || !fixes.length) break;
        for (const c of fixes) if (allowedCall(c)) await call(c.name, c.args, c.why);
        if (pass === MAX_PASSES) {
          emit({ t: 'say', text: 'final fixes applied · exporting once more' });
          await check(pass + 1);
        }
      }
    }

    // ---------- YouTube upload master ----------
    const m0 = checks.at(-1)?.m ?? (await measure(ffmpeg, ffprobe, out));
    const soundTarget=pictures.lastEdl?.sound?.target_lufs??-14;
    emit({ t: 'status', text: `encoding the YouTube upload master (H.264 High, closed GOP, AAC 384k, ${soundTarget} LUFS)` });
    const id = randomUUID().slice(0, 8);
    emit({ t: 'op', id, phase: 'start', tool: 'youtube_master', title: `youtube_master ${recommendedMbps(P.width, P.height, m0.fps)} Mbps · ${P.width}x${P.height}`, at: Date.now() });
    const t0 = Date.now();
    let master;
    try {
      master = await youtubeMaster({ ffmpeg, input: out, output: finalOut, P, m: m0, signal, audioMastered:Boolean(pictures.lastEdl?.sound?.enabled), onProgress: (f, eta) => emit({ t: 'progress', phase: 'master', label: 'encoding upload master', f, eta }), onFallback: ({ to }) => emit({ t: 'status', text: to.encoder === 'libx264' ? 'GPU encode unavailable; using the limited CPU encoder' : 'retrying GPU encode with software decoding' }) });
      emit({ t: 'op', id, phase: 'end', ok: true, ms: Date.now() - t0, result: `${master.encoder} · ${master.loudnessFixed ? 'loudness corrected to -14 LUFS' : 'loudness already on target'}` });
    } catch (err) {
      if (signal?.aborted) throw err;
      emit({ t: 'op', id, phase: 'end', ok: false, ms: Date.now() - t0, error: String(err.message).slice(0, 240) });
      if(!legacy_kimo_render)throw new Error(`Delivery encode failed; the lossless composed picture is retained: ${err.message}`);
    }
    const output = master && existsSync(finalOut) ? finalOut : out;
    const mf = await measure(ffmpeg, ffprobe, output);
    const qf = qualityChecks(mf, P, { final: output === finalOut, sourceAudio: files.some((f) => f.audio),targetLufs:soundTarget });
    emit({ t: 'quality', pass: 'final', stage: 'master', m: { ...mf, loudnorm: undefined }, checks: qf });

    // ---------- thumbnail + YouTube pack ----------
    // Save the edit first: the thumbnail text below is never part of it.
    await silent('save_project', { path: saved });
    if(pictures.lastEdl){writeFileSync(savedEdl,JSON.stringify(pictures.lastEdl,null,2));emit({t:'timeline',timeline:{...toTimeline(pictures.lastEdl),edl:publicEdl(pictures.lastEdl)}});}
    let thumbnail = null;
    const d = mf.duration || duration || 1;
    if (mode !== 'manual') {
      const tt = Math.max(0, Math.min(d - 0.1, Number(youtube?.thumbnail_time) || Math.min(1.2, d * 0.15)));
      const words = typeof youtube?.thumbnail_text === 'string' ? youtube.thumbnail_text.trim().slice(0, 32).toUpperCase() : '';
      if (words) {
        const tr = resultJson(await silent('add_track', {}) ?? {}).track_id;
        if (tr) {
          const big = Math.round(Math.min(P.width, P.height) * 0.16);
          await silent('add_text', { track_id: tr, text: words, start: Math.max(0, tt - 0.5), duration: 1, size: big, color: '#FFE600', stroke_color: '#000000', stroke_width: Math.round(big / 9), shadow: Math.max(2, Math.round(big / 20)), anchor: 'center', align: 'center', font: 'Anton' });
        }
      }
      const png = join(dir, 'thumbnail.png');
      // captions/titles stay off the thumbnail; only the big thumbnail words show
      const hide = (timeline?.tracks_bottom_to_top ?? []).slice(1).flatMap((t) => t.clips).filter((c) => /^text:|^generated$/.test(c.src ?? '')).map((c) => c.id);
      if (await silent('render_frame', { time: tt, path: png, inline: 'never', ...(words && hide.length ? { hide } : {}) })) {
        const jpg = join(dir, 'thumbnail.jpg');
        const box = P.width >= P.height ? 'scale=1280:720:force_original_aspect_ratio=decrease,pad=1280:720:(ow-iw)/2:(oh-ih)/2' : 'scale=720:1280:force_original_aspect_ratio=decrease';
        await runTool(ffmpeg, ['-hide_banner', '-loglevel', 'error', '-y', '-i', png, '-vf', box, '-q:v', '2', jpg]);
        if (existsSync(jpg)) thumbnail = jpg;
      }
    }
    if (youtube || thumbnail) {
      const chapters = validChapters(youtube?.chapters, d);
      youtube = {
        title: String(youtube?.title ?? '').slice(0, 100),
        description: String(youtube?.description ?? '').slice(0, 2000) + (chapters.length ? `\n\n${chapters.map((c) => `${stamp(c.t)} ${c.title}`).join('\n')}` : ''),
        chapters,
        thumbnail,
        thumbnail_text: youtube?.thumbnail_text,
      };
      emit({ t: 'youtube', youtube });
    }
    // Phase 7: credits for every fetched asset (and the map data) beside the export, and in the description
    let attributions = null;
    const credits = [...(pictures.lastEdl?.explain?.attributions ?? [])];
    if(pictures.lastEdl?.sound?.enabled)credits.push({source:'kimo-audio',text:'Original kimo procedural music and synthesized sound effects, CC0 1.0. Source: https://github.com/naman-sharma12345/kimoapp/tree/main/desktop/audio — https://creativecommons.org/publicdomain/zero/1.0/ . User-imported music is supplied by the project owner.'});
    if (pictures.lastEdl?.explain || pictures.lastEdl?.sound?.enabled) {
      attributions = join(dir, 'ATTRIBUTIONS.txt');
      writeFileSync(attributions, attributionsText(credits, { title: files[0]?.path?.split(/[\\/]/).pop() ?? 'kimo video' }));
      if (youtube && credits.length) youtube.description = `${youtube.description}\n\nCredits:\n${attributionsText(credits).split('\n').filter((l) => l.startsWith('- ')).join('\n')}`.slice(0, 4900);
    }
    const keepMaster=legacy_kimo_render||process.env.KIMO_COMPOSE_KEEP_MASTER==='1'||output===out;
    if(!keepMaster&&existsSync(out))unlinkSync(out);
    return { output, master: keepMaster ? out : output, duration: mf.duration || duration, history, timeline: pictures.lastEdl ? { ...toTimeline(pictures.lastEdl), edl: publicEdl(pictures.lastEdl) } : timeline, edlFile: pictures.lastEdl ? savedEdl : null, edl: publicEdl(pictures.lastEdl), quality: { final: mf.loudnorm ? { ...mf, loudnorm: undefined } : mf, checks: qf, passes: checks.map((c) => ({ pass: c.pass, verdict: c.verdict, faults: c.faults, lufs: c.m.lufs, truePeak: c.m.truePeak, checks: c.qc })) }, youtube, projectFile: existsSync(saved) ? saved : null, speed: msPerSec, camera: pictures.lastEdl?.camera_report ?? null, captions: pictures.lastEdl?.captions?.stats ?? null, explain: pictures.lastEdl?.explain ? { placed: pictures.lastEdl.explain.placed.length, metrics: pictures.lastEdl.explain.metrics, report: pictures.lastEdl.explain.report } : null, attributions, cutPlan: cut ? { summary: cut.plan.summary, metrics: cut.plan.metrics, hook: cut.plan.hook, needs_cover: cut.plan.needs_cover.length, file: join(dir, 'cutplan.json') } : null };
  } finally {
    try { mcp.kill(); } finally { release(); }
  }
}

/** ffprobe: duration + kind for a local file. */
export function probe(ffprobe, path) {
  return new Promise((done) =>
    execFile(ffprobe, ['-v', 'error', '-show_entries', 'format=duration:stream=codec_type,codec_name,profile,bit_rate,sample_rate,channels,width,height,r_frame_rate,avg_frame_rate,nb_frames,pix_fmt,color_space,color_transfer,color_primaries,color_range:stream_tags=rotate:stream_side_data=rotation', '-of', 'json', path],
      { windowsHide: true, timeout: 30_000 }, (err, stdout) => {
        try {
          const j = JSON.parse(stdout);
          const v = j.streams?.find((s) => s.codec_type === 'video'),a=j.streams?.find(s=>s.codec_type==='audio');
          const isImage = /\.(png|jpe?g|webp)$/i.test(path);
          const eff = effectiveRate(v?.r_frame_rate, v?.avg_frame_rate);
          const matrixRotation = v?.side_data_list?.find(s => Number.isFinite(s.rotation))?.rotation;
          done({ path,mtimeMs:statSync(path).mtimeMs,vfr:!!v&&eff.vfr,vcodec:v?.codec_name,profile:v?.profile,pix_fmt:v?.pix_fmt,mbps:v?.bit_rate?+v.bit_rate/1e6:null,acodec:a?.codec_name,arate:+a?.sample_rate||null,achannels:a?.channels,akbps:a?.bit_rate?+a.bit_rate/1000:null, rate: v ? eff.rate : undefined, rotation: matrixRotation != null ? -matrixRotation : Number(v?.tags?.rotate) || 0, color: {primaries:v?.color_primaries,trc:v?.color_transfer,space:v?.color_space,range:v?.color_range}, frames:Number(v?.nb_frames)||undefined, fps: v ? eff.fps : 0, audio: Boolean(j.streams?.some((s) => s.codec_type === 'audio')), duration: Number(j.format?.duration) || 0, kind: isImage ? 'image' : v ? 'video' : 'audio', width: v?.width, height: v?.height, bytes: statSync(path).size });
        } catch {
          done(null);
        }
      }));
}
