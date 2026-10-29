// kimo desktop engine: drives the real kimo v6 engine (kimo-mcp over stdio)
// on the user's own PC. Media never leaves the machine; only the edit prompt
// and a few sampled frames go to the kimo AI proxy (api.getkimo.tech).
import { spawn, execFile } from 'node:child_process';
import { existsSync, mkdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';

export const AI_URL =
  process.env.KIMO_AI_URL || 'https://api.getkimo.tech/v1/desktop/ai';
const MAX_ROUNDS = 6;
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
      clientInfo: { name: 'kimo-desktop', version: '0.1' },
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
    .filter((c) => ENGINE_TOOLS.includes(c.name))
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
    const child = spawn(ffmpeg, ['-hide_banner', '-y', '-i', input, ...v, '-pix_fmt', 'yuv420p', '-c:a', 'copy', '-movflags', '+faststart', '-progress', 'pipe:1', '-nostats', output], { windowsHide: true });
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

/**
 * One edit, start to finish. mode 'ai': the AI writes the edit script and
 * drives kimo tools; the engine exports, renders 3 frames + an audio report,
 * and the AI checks them and fixes + re-renders up to 3 passes.
 * mode 'captions': fully offline (no AI): import, lay out, whisper captions,
 * finish audio, export.
 * emit(event): {t:'op'|'say'|'status'|'progress'|'frame', ...}
 */
export async function runEdit({ bin, env, dir, files, note, preset, mode, signal, emit }) {
  mkdirSync(dir, { recursive: true });
  const P = PRESETS[preset] ?? PRESETS.shorts;
  const mcp = new Mcp(bin, dir, env);
  signal?.addEventListener('abort', () => mcp.kill());
  const history = [];
  const out = join(dir, 'master.mp4');
  let duration;
  const frames = [];
  let audio = '';
  const call = async (name, args, why) => {
    if (signal?.aborted) throw new Error('cancelled');
    const id = randomUUID().slice(0, 8);
    emit({ t: 'op', id, phase: 'start', tool: name, title: `${name} ${argsLine(args)}`, why });
    const t0 = Date.now();
    const result = await mcp.call(name, args);
    const failed = Boolean(result?.isError);
    const text = resultText(result);
    history.push(`${name}(${JSON.stringify(args).slice(0, 400)}) => ${failed ? 'ERROR ' : ''}${text}`);
    emit({ t: 'op', id, phase: 'end', ok: !failed, ms: Date.now() - t0, error: failed ? text.slice(0, 240) : undefined });
    if (name === 'export' && !failed) {
      const d = Number(resultJson(result).duration ?? /duration"?\s*[:=]\s*([\d.]+)/.exec(text)?.[1]);
      if (d) duration = d;
    }
    if (name === 'render_frame' && !failed) {
      const image = resultImage(result);
      if (image) {
        frames.push({ t: args.time, image });
        emit({ t: 'frame', time: args.time, image });
      }
    }
    if (name === 'review_export') audio = text.slice(0, 600);
    return result;
  };
  const check = async () => {
    frames.length = 0;
    emit({ t: 'status', text: 'rendering with the real kimo engine' });
    await call('export', { path: out, crf: 18 });
    if (!existsSync(out)) throw new Error(`export failed: ${history.at(-1)?.slice(-300)}`);
    for (const frac of [0.08, 0.5, 0.92])
      await call('render_frame', {
        time: Math.max(0, Math.min((duration ?? 1) - 0.05, frac * (duration ?? 1))),
        path: join(dir, `frame_${Math.round(frac * 100)}.png`),
        inline: 'always', inline_format: 'jpeg', inline_quality: 70, max_inline_px: 640,
      });
    await call('review_export', { path: out, n: 4 });
  };
  try {
    emit({ t: 'status', text: 'starting the kimo engine' });
    const { tools } = await mcp.start();
    const toolText = compactTools(tools);
    const fileLines = files.map((f) => `- ${f.path} (${f.kind}${f.duration ? `, ${Number(f.duration).toFixed(1)} s` : ''})`).join('\n');

    if (mode === 'captions') {
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
      emit({ t: 'status', text: 'captions with whisper, on this PC' });
      await call('auto_captions', clipIds.length ? { clip_ids: clipIds } : {});
      await call('finish_audio', {});
      await check();
      return { output: out, duration, history };
    }

    let done = false;
    for (let round = 0; round < MAX_ROUNDS && !done; round++) {
      emit({ t: 'status', text: round ? 'planning the next tools' : 'writing the edit script' });
      const answer = await ai('build', [
        `user's note: ${note || 'make a great video from these'}`,
        `canvas: ${P.width}x${P.height} at 30 fps (${P.label}). job folder: ${dir}`,
        `files:\n${fileLines}`,
        `tools (* = required):\n${toolText}`,
        `round ${round + 1} of ${MAX_ROUNDS}. history so far:\n${history.slice(-40).join('\n') || '(nothing yet)'}`,
      ].join('\n\n'), [], signal);
      const script = typeof answer.script === 'string' ? answer.script.trim() : '';
      if (script && round === 0) emit({ t: 'say', kind: 'script', text: script.slice(0, 2000) });
      else if (typeof answer.say === 'string' && answer.say.trim()) emit({ t: 'say', text: answer.say.trim().slice(0, 400) });
      const planned = parseCalls(answer.calls);
      for (const c of planned) {
        if (c.name === 'project_set') Object.assign(c.args, { width: P.width, height: P.height });
        await call(c.name, c.args, c.why);
      }
      done = answer.done === true || !planned.length;
    }
    for (let pass = 1; pass <= MAX_PASSES; pass++) {
      emit({ t: 'say', text: `exporting · check ${pass} of ${MAX_PASSES}` });
      await check();
      emit({ t: 'status', text: `checking ${frames.length} frames + audio (pass ${pass})` });
      const review = await ai('review',
        `check pass ${pass}. user's note: ${note}\nexport duration: ${duration ?? '?'} s\naudio report: ${audio || 'none'}\nhistory:\n${history.slice(-24).join('\n')}`,
        frames.map((f) => ({ label: `frame at ${Number(f.t).toFixed(2)} s`, url: f.image })), signal);
      const faults = (Array.isArray(review.faults) ? review.faults : []).filter((x) => typeof x === 'string').slice(0, 8);
      const fixes = parseCalls(review.calls);
      const clean = review.verdict === 'clean' || (!faults.length && !fixes.length);
      emit({ t: 'say', kind: 'check', text: clean
        ? `check ${pass}: clean. ${typeof review.message === 'string' ? review.message : ''}`.trim()
        : `check ${pass}: ${faults.length || 'some'} fault${faults.length === 1 ? '' : 's'}\n${faults.map((f) => `· ${f}`).join('\n')}` });
      if (clean || !fixes.length) break;
      for (const c of fixes) await call(c.name, c.args, c.why);
      if (pass === MAX_PASSES) {
        emit({ t: 'say', text: 'final fixes applied · exporting once more' });
        await call('export', { path: out, crf: 18 });
      }
    }
    return { output: out, duration, history };
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
          done({ path, duration: Number(j.format?.duration) || 0, kind: isImage ? 'image' : v ? 'video' : 'audio', width: v?.width, height: v?.height, bytes: statSync(path).size });
        } catch {
          done(null);
        }
      }));
}
