// kimo desktop engine: drives the real kimo v6 engine (kimo-mcp over stdio)
// on the user's own PC. Only the edit prompt and a few sampled frames go to the
// kimo AI proxy (api.getkimo.tech); SAM effects also send a downscaled copy of
// the clip segment they process (see sam.mjs).
import { spawn, execFile } from 'node:child_process';
import { existsSync, mkdirSync, statSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';
import { samEffect, SAM_EFFECTS } from './sam.mjs';

export const AI_URL =
  process.env.KIMO_AI_URL || 'https://api.getkimo.tech/v1/desktop/ai';
const MAX_ROUNDS = 7;
const MAX_PASSES = 3;
const CALL_TIMEOUT_MS = 30 * 60_000; // long 4K renders are fine locally

/** The kimo-mcp tools the model may drive (export/render_frame stay ours). */
export const ENGINE_TOOLS = [
  'project_set', 'import_media', 'auto_rough_cut', 'cut_to_beat', 'auto_grade',
  'add_title', 'add_text', 'add_glow_text', 'auto_captions', 'caption_from_words',
  'edit_caption', 'finish_audio', 'lint_edit', 'timeline_summary', 'add_track',
  'add_clip', 'trim_clip', 'move_clip', 'delete_clip', 'set_property', 'set_audio',
  'add_smart_punch', 'add_punch_ins', 'auto_reframe', 'stabilize', 'place_broll', 'undo',
];

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
    this.child = spawn(bin, [], {
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
    .filter((c) => ENGINE_TOOLS.includes(c.name) || SAM_TOOLS.includes(c.name))
    .slice(0, 8);
}
function argsLine(args) {
  const text = JSON.stringify(args).replace(/"([a-z_]+)":/g, '$1:');
  return text.length > 110 ? `${text.slice(0, 110)}…` : text;
}

async function ai(kind, text, images = [], signal) {
  for (let attempt = 0; attempt < 3; attempt++) {
    let response;
    try {
      response = await fetch(AI_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-Kimo-Desktop': '1' },
        body: JSON.stringify({ kind, text: text.slice(0, 60_000), images }),
        signal: AbortSignal.any([signal, AbortSignal.timeout(200_000)].filter(Boolean)),
      });
    } catch (e) {
      if (signal?.aborted) throw new Error('cancelled');
      if (attempt === 2) throw new Error(`can't reach kimo AI (${e.message}); check your internet`);
      continue;
    }
    if (response.ok) return (await response.json()).record ?? {};
    const body = await response.json().catch(() => ({}));
    const message = body?.error?.message || `kimo AI answered ${response.status}`;
    if (response.status < 500 || attempt === 2) throw new Error(message);
    await new Promise((r) => setTimeout(r, 3000 * (attempt + 1)));
  }
  return {};
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
    guide: 'high-energy youtube pacing: zero dead air (max_pause 0.2), a bold hook_box title in the first 2.5 s, add_punch_ins pattern alternate scale 1.18-1.25 on the talking track, impact or pop captions 1-3 words per line with keyword colours, punchy grade (auto_grade strength 0.9), loud clean mix.',
    captions: { style: 'impact', max_words_per_line: 2, keywords: true, highlight: true },
    title: 'hook_box',
    punch: 1.22,
    max_pause: 0.2,
  },
  documentary: {
    label: 'Documentary',
    guide: 'measured documentary feel: keep natural breaths (max_pause 0.45), a cinematic or lower_third title, clean captions 2 lines, gentle grade (strength 0.6), slow add_smart_punch zoom 1.08-1.12 on long shots instead of hard punches, music low under speech (-20 dB).',
    captions: { style: 'clean', max_words_per_line: 6, lines: 2 },
    title: 'cinematic',
    punch: 1.08,
    max_pause: 0.45,
  },
  podcast: {
    label: 'Podcast clip',
    guide: 'podcast highlight clip: open on the most quotable line, remove silences and fillers (max_pause 0.25), add_punch_ins alternate scale 1.12 focus on the face, karaoke or boxed captions with keyword colours, a lower_third with the topic, grade 0.75.',
    captions: { style: 'karaoke', max_words_per_line: 4, keywords: true, highlight: true },
    title: 'lower_third',
    punch: 1.12,
    max_pause: 0.25,
  },
  cinematic: {
    label: 'Cinematic',
    guide: 'cinematic: deliberate pacing, an elegant or cinematic title, minimal clean captions, rich grade (strength 0.85, target_luma 0.38), slow push-ins with add_smart_punch zoom 1.1, music swells under speech at -16 dB.',
    captions: { style: 'clean', max_words_per_line: 5, lines: 1 },
    title: 'cinematic',
    punch: 1.1,
    max_pause: 0.4,
  },
  tutorial: {
    label: 'Tutorial / explainer',
    guide: 'tutorial: clarity first, cut dead air (max_pause 0.3) but keep every step, boxed or clean captions 2 lines for legibility, a lower_third naming the topic, add_punch_ins with ease 0.4 scale 1.1 to emphasise key moments, neutral grade 0.7.',
    captions: { style: 'boxed', max_words_per_line: 5, lines: 2 },
    title: 'lower_third',
    punch: 1.1,
    max_pause: 0.3,
  },
};

/** What a top YouTube editor does, as rules the model follows with kimo's tools. */
function expertGuide(P, S, files) {
  const vertical = P.height > P.width;
  const talking = files.some((f) => f.kind === 'video');
  return `edit like a top youtube editor (the result must look professionally edited, not auto-generated):
- hook: the first 2-3 s decide retention. start on speech or the most striking moment, never on dead air. put a 3-6 word hook on its own top track in the first 2.5 s with add_title style "${S.title}" (short, specific, curiosity, no clickbait lies).
- pacing: ${talking ? `auto_rough_cut every talking clip in story order with max_pause ${S.max_pause ?? 0.3} and pad 0.05; read the returned segments and re-run with drop [{asset_id,index}] for false starts, repeats and filler-only segments (um, uh, like).` : 'cut to the beat or keep shots 1.5-4 s.'}
- energy: ${S.punch > 1.12 ? `add_punch_ins on the talking track (pattern alternate, scale ${S.punch}, focus on the face) for jump-cut rhythm` : `add_smart_punch zoom ${S.punch + 0.05} on long single shots, or add_punch_ins scale ${S.punch} with ease 0.4`}. if there are extra non-speech video files, place_broll them over the talking track (min_shot 1.2, max_shot 3).
- captions: auto_captions style "${S.captions.style}", max_words_per_line ${S.captions.max_words_per_line}${S.captions.lines ? `, lines ${S.captions.lines}` : ''}, keywords true, highlight true, position auto, hint = names/terms from the note. captions must stay inside the title-safe area${vertical ? ' (vertical: keep text out of the bottom 20% and right 15% where shorts/reels ui sits; position middle is safest)' : ''}.
- look: auto_grade every media clip (style strength as given). never stack two grades.
- sound: finish_audio last with target_lufs -14 (music under speech ${S.label.startsWith('Doc') ? -20 : -16} db when there is music). the app enforces true-peak -1 dBTP on delivery.
- before "done": run lint_edit (platform ${vertical ? 'shorts' : 'none'}) and fix what it reports, then timeline_summary to confirm.
- style for this video: ${S.label} — ${S.guide}
- quality over busyness: every element must serve the viewer. no overlapping texts, no text over faces.`;
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

const runTool = (bin, args, onLine) =>
  new Promise((done) => {
    const child = spawn(bin, bin.includes('ffmpeg') ? ['-nostdin', ...args] : args, { windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] });
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
export function qualityChecks(m, P, { final = false, sourceAudio = false } = {}) {
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
    add('lufs', 'loudness', Math.abs(m.lufs + 14) <= 1, `${m.lufs} LUFS`, '-14 ± 1 LUFS');
    add('tp', 'true peak', m.truePeak <= -1, `${m.truePeak} dBTP`, '≤ -1 dBTP');
  } else if (!m.acodec) add('lufs', 'loudness', true, 'no audio', '-', true);
  const black = m.black.filter(([s, e]) => e - s >= 0.2);
  add('black', 'black frames', !black.length, black.length ? black.map(([s, e]) => `${s.toFixed(1)}-${e.toFixed(1)} s`).join(', ') : 'none', 'none');
  const hookGap = m.silences.find(([s, e]) => s < 2.5 && e - s >= 0.7);
  add('hook', 'hook (first 2.5 s)', !hookGap, hookGap ? `dead air ${hookGap[0].toFixed(1)}-${hookGap[1].toFixed(1)} s` : 'starts on sound', 'no dead air');
  const gaps = m.silences.filter(([s, e]) => s >= 2.5 && e - s >= 1.5 && e < m.duration - 0.3);
  add('pacing', 'pacing', !gaps.length, gaps.length ? `${gaps.length} pause${gaps.length > 1 ? 's' : ''} ≥ 1.5 s` : 'tight', 'no long pauses', true);
  return c;
}

/**
 * YouTube upload master: H.264 High, closed GOP of half the frame rate,
 * 2 B-frames, BT.709, YouTube's recommended bitrate, AAC-LC 384 kbps 48 kHz,
 * faststart, and loudness pulled to -14 LUFS / -1.5 dBTP when it is off.
 */
export function youtubeMaster({ ffmpeg, input, output, P, m, signal, onProgress }) {
  const fps = m.fps || 30;
  const rec = recommendedMbps(P.width, P.height, fps);
  const gop = Math.max(1, Math.round(fps / 2));
  const L = m.loudnorm;
  const fix = L && (Math.abs(m.lufs + 14) > 0.5 || m.truePeak > -1.5);
  const af = fix
    ? ['-af', `loudnorm=I=-14:TP=-1.5:LRA=11:measured_I=${L.input_i}:measured_TP=${L.input_tp}:measured_LRA=${L.input_lra}:measured_thresh=${L.input_thresh}:offset=${L.target_offset}:linear=true,aresample=48000`]
    : [];
  const args = [
    '-hide_banner', '-y', '-i', input, ...af,
    '-c:v', 'libx264', '-preset', m.duration > 600 ? 'medium' : 'slow',
    '-b:v', `${rec}M`, '-maxrate', `${Math.round(rec * 1.5)}M`, '-bufsize', `${rec * 2}M`,
    '-profile:v', 'high', '-level:v', Math.max(P.width, P.height) >= 3840 ? '5.1' : '4.2', '-pix_fmt', 'yuv420p',
    '-g', String(gop), '-keyint_min', String(gop), '-sc_threshold', '0', '-bf', '2', '-flags', '+cgop',
    '-colorspace', 'bt709', '-color_primaries', 'bt709', '-color_trc', 'bt709',
    ...(m.acodec ? ['-c:a', 'aac', '-b:a', '384k', '-ar', '48000', '-ac', '2'] : []),
    '-movflags', '+faststart', '-progress', 'pipe:1', '-nostats', output,
  ];
  const t0 = Date.now();
  return new Promise((done, fail) => {
    const child = spawn(ffmpeg, ['-nostdin', ...args], { windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] });
    signal?.addEventListener('abort', () => child.kill('SIGKILL'));
    child.stdout.on('data', (d) => {
      const x = /out_time_us=(\d+)/.exec(d.toString());
      if (x && m.duration) {
        const f = Math.min(1, Number(x[1]) / 1e6 / m.duration);
        const el = (Date.now() - t0) / 1000;
        onProgress?.(f, f > 0.02 ? Math.max(0, el / f - el) : null);
      }
    });
    let err = '';
    child.stderr.on('data', (d) => (err = (err + d).slice(-1500)));
    child.on('exit', (code) => (code === 0 ? done({ output, loudnessFixed: Boolean(fix), mbps: rec }) : fail(new Error(`master encode failed: ${err.split('\n').slice(-3).join(' ')}`))));
  });
}

const VISUAL = new Set([
  'auto_rough_cut', 'cut_to_beat', 'add_clip', 'trim_clip', 'move_clip', 'delete_clip', 'set_property',
  'add_title', 'add_text', 'add_glow_text', 'auto_captions', 'caption_from_words', 'edit_caption',
  'auto_grade', 'add_smart_punch', 'add_punch_ins', 'auto_reframe', 'stabilize', 'place_broll', 'undo',
]);
const STRUCTURE = new Set([...VISUAL, 'add_track', 'import_media', 'project_set', 'load_project']);
/** Ops the timeline editor may send (validated before they reach kimo). */
export const MANUAL_TOOLS = ['move_clip', 'trim_clip', 'delete_clip', 'edit_caption', 'set_property'];

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
export async function runEdit({ bin, env, dir, files, note, preset, style, mode, signal, emit, ffmpeg, ffprobe, projectFile, ops, speed, sam }) {
  mkdirSync(dir, { recursive: true });
  const P = PRESETS[preset] ?? PRESETS.shorts;
  const S = STYLES[style] ?? STYLES.auto;
  const mcp = new Mcp(bin, dir, env);
  signal?.addEventListener('abort', () => mcp.kill());
  const history = [];
  const out = join(dir, 'master.mp4');
  const finalOut = join(dir, 'final.mp4');
  const saved = join(dir, 'project.kimo.json');
  let duration;
  let timeline = null;
  let msPerSec = speed || 2500; // export ms per second of 1080p timeline, learned per PC
  const checks = [];
  let youtube = null;
  let reviewImages = [];
  const silent = async (name, args) => {
    const r = await mcp.call(name, args);
    return r?.isError ? null : r;
  };
  const refreshTimeline = async () => {
    const r = await silent('timeline_summary', {});
    if (!r) return;
    timeline = resultJson(r);
    emit({ t: 'timeline', timeline });
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
    } else if (['trim_clip', 'move_clip', 'set_property', 'add_smart_punch', 'auto_reframe', 'stabilize'].includes(name) && args.clip_id) {
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
    if (name === 'export') {
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
    const result = await (SAM_TOOLS.includes(name) ? samTool(name, args) : mcp.call(name, args)).finally(() => clearInterval(ticker));
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
  /** Export + measure + sample frames for the review. */
  const check = async (pass) => {
    emit({ t: 'status', text: `rendering with the real kimo engine (pass ${pass})` });
    await call('export', { path: out, crf: 16 });
    if (!existsSync(out)) throw new Error(`export failed: ${history.at(-1)?.slice(-300)}`);
    emit({ t: 'status', text: 'measuring loudness, true peak, black frames and dead air' });
    let m = await measure(ffmpeg, ffprobe, out);
    if (!m.acodec && files.some((f) => f.audio)) {
      emit({ t: 'think', text: 'the render lost the source sound; restoring it and rendering again' });
      const mediaClips = (timeline?.tracks_bottom_to_top ?? []).flatMap((t) => t.clips).filter((c) => c.in != null && !/^text:/.test(c.src ?? ''));
      for (const c of mediaClips.slice(0, 60)) await silent('set_audio', { clip_id: c.id, mute: false });
      await call('finish_audio', { target_lufs: -14, keep_ambience: true }, 'keep the original sound');
      await call('export', { path: out, crf: 16 });
      m = await measure(ffmpeg, ffprobe, out);
    }
    const qc = qualityChecks(m, P, { sourceAudio: files.some((f) => f.audio) });
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
        if (c.name === 'project_set') Object.assign(c.args, { width: P.width, height: P.height });
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
      files = files.map((f) => (f === target ? { ...f, path: r.output, duration: r.duration, width: r.width, height: r.height, sam: { effect: r.effect, source: target.path } } : f));
      emit({ t: 'say', text: `SAM 3.1 ${r.effect.replace('_', ' ')} done · ${r.width}x${r.height} · tracked "${r.prompt}" on ${r.tracks.seen}/${r.tracks.frames} frames` });
    }
    const fileLines = files.map((f) => `- ${f.path} (${f.kind}${f.duration ? `, ${Number(f.duration).toFixed(1)} s` : ''})`).join('\n');
    const loaded = (mode === 'followup' || mode === 'manual') && projectFile && existsSync(projectFile);
    if ((mode === 'followup' || mode === 'manual') && !loaded) throw new Error('this edit has no saved project yet; re-run it first');
    if (loaded) await call('load_project', { path: projectFile });


    if (mode === 'captions' || mode === 'sam') {
      await call('project_set', { width: P.width, height: P.height, fps: 30 });
      const assets = [];
      for (const f of files) {
        const r = await call('import_media', { path: f.path });
        const j = resultJson(r);
        if (j.asset_id) assets.push({ id: j.asset_id, duration: Number(j.duration) || 0, kind: f.kind });
      }
      if (!assets.length) throw new Error('none of the files could be imported');
      const track = resultJson(await call('add_track', {})).track_id;
      let at = 0;
      const clipIds = [];
      for (const a of assets.filter((x) => x.kind !== 'audio' && x.duration > 0)) {
        const j = resultJson(await call('add_clip', { track_id: track, source_type: 'media', asset_id: a.id, start: at, duration: a.duration, in_point: 0, fit: 'cover' }));
        if (j.clip_id) clipIds.push(j.clip_id);
        at += a.duration;
      }
      if (mode === 'sam') {
        await call('finish_audio', { target_lufs: -14, keep_ambience: true });
        await check(1);
      } else {
      emit({ t: 'status', text: 'captions with whisper, on this PC' });
      await call('auto_captions', { ...(clipIds.length ? { clip_ids: clipIds } : {}), style: S.captions.style, max_words_per_line: S.captions.max_words_per_line, keywords: true });
      await call('finish_audio', { target_lufs: -14, keep_ambience: true });
      await check(1);
      }
    } else if (mode === 'manual') {
      for (const o of ops ?? []) if (MANUAL_TOOLS.includes(o.tool)) await call(o.tool, o.args ?? {}, 'your timeline edit');
      await check(1);
    } else {
      const context = mode === 'followup'
        ? [
          `this is a FOLLOW-UP on an existing, already-loaded kimo project. the user's request: ${note}`,
          'change only what the request asks; keep everything else. do NOT call project_set; do not re-import files that are already in the project; use the clip and track ids from the timeline below exactly. finish with finish_audio if you changed audio, then set done.',
          `current timeline: ${JSON.stringify(timeline ?? {}).slice(0, 6000)}`,
          `canvas: ${P.width}x${P.height}. files:\n${fileLines}`,
          expertGuide(P, S, files),
          `tools (* = required):\n${toolText}\n${SAM_TOOL_TEXT}`,
        ]
        : [
          `user's note: ${note || 'make a great video from these'}`,
          `canvas: ${P.width}x${P.height} at 30 fps (${P.label}). job folder: ${dir}`,
          `files:\n${fileLines}`,
          expertGuide(P, S, files),
          `tools (* = required):\n${toolText}\n${SAM_TOOL_TEXT}`,
        ];
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
        for (const c of fixes) await call(c.name, c.args, c.why);
        if (pass === MAX_PASSES) {
          emit({ t: 'say', text: 'final fixes applied · exporting once more' });
          await check(pass + 1);
        }
      }
    }

    // ---------- YouTube upload master ----------
    const m0 = checks.at(-1)?.m ?? (await measure(ffmpeg, ffprobe, out));
    emit({ t: 'status', text: 'encoding the YouTube upload master (H.264 High, closed GOP, AAC 384k, -14 LUFS)' });
    const id = randomUUID().slice(0, 8);
    emit({ t: 'op', id, phase: 'start', tool: 'youtube_master', title: `youtube_master ${recommendedMbps(P.width, P.height, m0.fps)} Mbps · ${P.width}x${P.height}`, at: Date.now() });
    const t0 = Date.now();
    let master;
    try {
      master = await youtubeMaster({ ffmpeg, input: out, output: finalOut, P, m: m0, signal, onProgress: (f, eta) => emit({ t: 'progress', phase: 'master', label: 'encoding upload master', f, eta }) });
      emit({ t: 'op', id, phase: 'end', ok: true, ms: Date.now() - t0, result: master.loudnessFixed ? 'loudness corrected to -14 LUFS' : 'loudness already on target' });
    } catch (err) {
      if (signal?.aborted) throw err;
      emit({ t: 'op', id, phase: 'end', ok: false, ms: Date.now() - t0, error: String(err.message).slice(0, 240) });
    }
    const output = master && existsSync(finalOut) ? finalOut : out;
    const mf = await measure(ffmpeg, ffprobe, output);
    const qf = qualityChecks(mf, P, { final: output === finalOut, sourceAudio: files.some((f) => f.audio) });
    emit({ t: 'quality', pass: 'final', stage: 'master', m: { ...mf, loudnorm: undefined }, checks: qf });

    // ---------- thumbnail + YouTube pack ----------
    // Save the edit first: the thumbnail text below is never part of it.
    await silent('save_project', { path: saved });
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
    return { output, master: out, duration: mf.duration || duration, history, timeline, quality: { final: mf.loudnorm ? { ...mf, loudnorm: undefined } : mf, checks: qf, passes: checks.map((c) => ({ pass: c.pass, verdict: c.verdict, faults: c.faults, lufs: c.m.lufs, truePeak: c.m.truePeak, checks: c.qc })) }, youtube, projectFile: existsSync(saved) ? saved : null, speed: msPerSec };
  } finally {
    mcp.kill();
  }
}

/** ffprobe: duration + kind for a local file. */
export function probe(ffprobe, path) {
  return new Promise((done) =>
    execFile(ffprobe, ['-v', 'error', '-show_entries', 'format=duration:stream=codec_type,width,height', '-of', 'json', path],
      { windowsHide: true, timeout: 30_000 }, (err, stdout) => {
        try {
          const j = JSON.parse(stdout);
          const v = j.streams?.find((s) => s.codec_type === 'video');
          const isImage = /\.(png|jpe?g|webp)$/i.test(path);
          done({ path, audio: Boolean(j.streams?.some((s) => s.codec_type === 'audio')), duration: Number(j.format?.duration) || 0, kind: isImage ? 'image' : v ? 'video' : 'audio', width: v?.width, height: v?.height, bytes: statSync(path).size });
        } catch {
          done(null);
        }
      }));
}
