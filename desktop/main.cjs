// kimo desktop (Windows): the real kimo v6 engine, FFmpeg and whisper bundled
// and run on this PC. Media stays local; only prompts and sampled frames go
// to the kimo AI proxy at api.getkimo.tech.
const { app, BrowserWindow, ipcMain, dialog, shell, protocol, net, clipboard } = require('electron');
const { join, extname, basename } = require('node:path');
const fs = require('node:fs');
const { pathToFileURL } = require('node:url');
const { execFileBackground: execFile } = require('./resources.cjs');
const https = require('node:https');

const MEDIA = /\.(mp4|mov|m4v|mkv|webm|avi|mp3|wav|m4a|aac|flac|png|jpe?g|webp)$/i;
const MODEL_URL = 'https://huggingface.co/ggerganov/whisper.cpp/resolve/main/ggml-small-q5_1.bin';
const exe = process.platform === 'win32' ? '.exe' : '';

const vendor = app.isPackaged ? join(process.resourcesPath, 'vendor') : join(__dirname, 'vendor');
const data = () => app.getPath('userData');
const paths = () => ({
  kimo: process.env.KIMO_MCP_BIN || join(vendor, 'kimo', 'bin', `kimo-mcp${exe}`),
  fonts: join(vendor, 'kimo', 'fonts'),
  ffmpegDir: join(vendor, 'ffmpeg'),
  ffmpeg: fs.existsSync(join(vendor, 'ffmpeg', `ffmpeg${exe}`)) ? join(vendor, 'ffmpeg', `ffmpeg${exe}`) : 'ffmpeg',
  ffprobe: fs.existsSync(join(vendor, 'ffmpeg', `ffprobe${exe}`)) ? join(vendor, 'ffmpeg', `ffprobe${exe}`) : 'ffprobe',
  whisper: join(vendor, 'whisper', `whisper-cli${exe}`),
  model: [join(vendor, 'models', 'ggml-small-q5_1.bin'), join(data(), 'models', 'ggml-small-q5_1.bin')].find((p) => fs.existsSync(p)) || join(data(), 'models', 'ggml-small-q5_1.bin'),
});
const engineEnv = () => {
  const p = paths();
  return {
    PATH: `${p.ffmpegDir}${process.platform === 'win32' ? ';' : ':'}${process.env.PATH || ''}`,
    KIMO_FONTS: p.fonts,
    KIMO_MODELS: join(p.model, '..'),
    KIMO_WHISPER_BIN: p.whisper,
    KIMO_WHISPER_MODEL: p.model,
    KIMO_TOOLS: 'director',
    KIMO_SPECTATOR: 'off',
  };
};

let engine; // engine.mjs (ESM)
const loadEngine = async () => (engine ??= await import(pathToFileURL(join(__dirname, 'engine.mjs')).href));
let samMod;
const loadSam = async () => (samMod ??= await import(pathToFileURL(join(__dirname, 'sam.mjs')).href));
const logFile = () => join(data(), 'kimo.log');
const log = (...a) => {
  try {
    fs.appendFileSync(logFile(), `${new Date().toISOString()} ${a.join(' ')}\n`);
  } catch {
    /* ignore */
  }
};
process.on('uncaughtException', (e) => log('uncaught', e.stack || e));
process.on('unhandledRejection', (e) => log('unhandled', e?.stack || e));

// ---------- library ----------
const libPath = () => join(data(), 'library.json');
let library = [];
const loadLibrary = () => {
  try {
    library = JSON.parse(fs.readFileSync(libPath(), 'utf8'));
  } catch {
    library = [];
  }
  for (const p of library) if (p.status === 'running' || p.status === 'queued') p.status = 'stopped';
};
const saveLibrary = () => {
  fs.mkdirSync(data(), { recursive: true });
  fs.writeFileSync(`${libPath()}.tmp`, JSON.stringify(library, null, 1));
  fs.renameSync(`${libPath()}.tmp`, libPath());
};
const projectDir = (id) => join(data(), 'projects', id);
const publicProject = (p) => ({ ...p, log: undefined, job: undefined, logCount: p.log?.length ?? 0 });
// learned render speed (ms per second of 1080p timeline) for honest ETAs
const settingsPath = () => join(data(), 'settings.json');
const settings = () => {
  try {
    return JSON.parse(fs.readFileSync(settingsPath(), 'utf8'));
  } catch {
    return {};
  }
};
const saveSettings = (patch) => {
  try {
    fs.writeFileSync(settingsPath(), JSON.stringify({ ...settings(), ...patch }));
  } catch {
    /* ignore */
  }
};
const LIVE_ONLY = new Set(['progress', 'preview', 'timeline', 'frame']);

let win;
const send = (channel, payload) => win && !win.isDestroyed() && win.webContents.send(channel, payload);
const update = (p) => {
  p.updated = Date.now();
  saveLibrary();
  send('project', publicProject(p));
};

async function expand(inputs) {
  const out = [];
  const walk = (p, depth = 0) => {
    let st;
    try {
      st = fs.statSync(p);
    } catch {
      return;
    }
    if (st.isDirectory() && depth < 3) for (const n of fs.readdirSync(p).sort()) walk(join(p, n), depth + 1);
    else if (st.isFile() && MEDIA.test(p)) out.push(p);
  };
  for (const p of inputs) walk(p);
  const e = await loadEngine();
  const probed = await Promise.all(out.slice(0, 200).map((p) => e.probe(paths().ffprobe, p)));
  return probed.filter(Boolean);
}

// ---------- queue ----------
let running = null;
async function pump() {
  if (running) return;
  const next = library.find((p) => p.status === 'queued');
  if (!next) return;
  const controller = new AbortController();
  running = { id: next.id, controller };
  next.status = 'running';
  next.error = undefined;
  const job = next.job ?? { mode: next.mode, note: next.note };
  // a follow-up or timeline edit continues the log; a fresh edit starts it over
  next.log = job.mode === 'followup' || job.mode === 'manual' ? (next.log ?? []).slice(-300) : [];
  next.log.push({ t: 'run', mode: job.mode, text: job.mode === 'followup' ? job.note : job.mode === 'manual' ? `${job.ops.length} timeline edit${job.ops.length === 1 ? '' : 's'}` : next.note, at: Date.now() });
  next.started = Date.now();
  update(next);
  const dir = projectDir(next.id);
  try {
    const e = await loadEngine();
    const result = await e.runEdit({
      bin: paths().kimo, env: engineEnv(), dir, files: next.files, note: job.note,
      preset: next.preset, style: next.style, mode: job.mode, ops: job.ops, projectFile: next.projectFile, edlFile: next.edlFile, edl: job.edl, sam: next.sam,
      signal: controller.signal, ffmpeg: paths().ffmpeg, ffprobe: paths().ffprobe, speed: settings().speed,
      emit: (ev) => {
        if (!LIVE_ONLY.has(ev.t)) next.log.push({ ...ev, at: Date.now() });
        if (ev.t === 'timeline') { next.timeline = ev.timeline; if(ev.timeline?.edl)next.edl=ev.timeline.edl; }
        if (ev.t === 'say' && ev.kind === 'script') next.script = ev.text;
        // keep the project id; a tool call's own id travels as opId
        const { id: opId, ...rest } = ev;
        send('event', opId === undefined ? { ...rest, id: next.id } : { ...rest, id: next.id, opId });
      },
    });
    next.status = 'done';
    next.output = result.output;
    next.master = result.master;
    next.duration = result.duration;
    next.quality = result.quality;
    if (result.youtube) next.youtube = result.youtube;
    if (result.timeline) next.timeline = result.timeline;
    if (result.projectFile) next.projectFile = result.projectFile;
    if (result.edlFile) next.edlFile = result.edlFile;
    if (result.edl) next.edl = result.edl;
    next.renders = (next.renders ?? 0) + 1;
    next.took = Date.now() - next.started;
    if (result.speed) saveSettings({ speed: result.speed });
  } catch (err) {
    next.status = controller.signal.aborted ? 'stopped' : 'failed';
    next.error = controller.signal.aborted ? 'stopped' : String(err.message || err).slice(0, 600);
    log('edit failed', next.id, err.stack || err);
  } finally {
    next.log = next.log.slice(-500);
    next.job = undefined;
    running = null;
    update(next);
    pump();
  }
}

function newProject({ files, note, preset, mode, name, style, sam }) {
  const id = `p${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
  const p = {
    id, name: name || basename(files[0].path, extname(files[0].path)), created: Date.now(), updated: Date.now(),
    files, note: note || '', preset: preset || 'shorts', style: style || 'auto', mode: mode || 'ai', status: 'queued', log: [], turns: [],
    sam: cleanSam(sam),
  };
  library.unshift(p);
  return p;
}

const SAM_EFFECTS = ['reframe', 'text_behind', 'bg_blur', 'bg_color', 'bg_image', 'cutout', 'redact'];
/** Only known fields of the manual SAM choice reach the engine. */
function cleanSam(sam) {
  if (!sam || !SAM_EFFECTS.includes(sam.effect)) return undefined;
  const str = (v, n) => (typeof v === 'string' && v.trim() ? v.trim().slice(0, n) : undefined);
  return { effect: sam.effect, prompt: str(sam.prompt, 80), text: str(sam.text, 40), color: str(sam.color, 9), image: str(sam.image, 600), punch: sam.punch === true };
}

// ---------- first-run model download (only when not bundled) ----------
function downloadModel(onProgress) {
  const target = join(data(), 'models', 'ggml-small-q5_1.bin');
  fs.mkdirSync(join(target, '..'), { recursive: true });
  return new Promise((done, fail) => {
    const get = (url, hops = 0) =>
      https.get(url, (res) => {
        if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location && hops < 5) return get(new URL(res.headers.location, url).href, hops + 1);
        if (res.statusCode !== 200) return fail(new Error(`model download answered ${res.statusCode}`));
        const total = Number(res.headers['content-length']) || 0;
        let got = 0;
        const file = fs.createWriteStream(`${target}.part`);
        res.on('data', (c) => {
          got += c.length;
          if (total) onProgress(got / total);
        });
        res.pipe(file);
        file.on('finish', () => file.close(() => (fs.renameSync(`${target}.part`, target), done(target))));
      }).on('error', fail);
    get(MODEL_URL);
  });
}

const run = (bin, args) =>
  new Promise((done) => execFile(bin, args, { windowsHide: true, timeout: 60_000 }, (err, stdout, stderr) => done({ ok: !err, out: `${stdout}${stderr}` })));

let gpu;
async function status() {
  const p = paths();
  const e = await loadEngine();
  const ff = await run(p.ffmpeg, ['-version']);
  gpu ??= await e.detectGpu(p.ffmpeg).catch(() => null);
  return {
    version: app.getVersion(),
    kimo: fs.existsSync(p.kimo),
    ffmpeg: ff.ok ? (/ffmpeg version (\S+)/.exec(ff.out)?.[1] ?? 'ok') : null,
    whisper: fs.existsSync(p.whisper),
    model: fs.existsSync(p.model),
    gpu,
    presets: e.PRESETS,
    styles: Object.fromEntries(Object.entries(e.STYLES).map(([k, v]) => [k, v.label])),
  };
}

// ---------- headless smoke test (CI): kimo.exe --smoke <clip> --smoke-out <json> ----------
async function smoke(clip, outPath) {
  const report = { started: new Date().toISOString(), stage: 'start' };
  const flush = () => {
    try {
      fs.writeFileSync(outPath, JSON.stringify(report, null, 2));
    } catch {
      /* ignore */
    }
  };
  // watchdog: a stuck stage still leaves a report and a clean exit
  const limit = Number(process.env.KIMO_SMOKE_MINUTES || 40);
  setTimeout(() => {
    report.ok = report.ok ?? false;
    report.error = `${report.error ?? ''} watchdog: stage "${report.stage}" still running after ${limit} min`.trim();
    flush();
    app.exit(report.render?.bytes > 1000 ? 0 : 1);
  }, limit * 60_000).unref();
  try {
    const p = paths();
    const e = await loadEngine();
    report.paths = p;
    report.ffmpeg = (await run(p.ffmpeg, ['-version'])).out.split('\n')[0];
    report.whisperHelp = (await run(p.whisper, ['--help'])).out.includes('usage');
    report.gpu = await e.detectGpu(p.ffmpeg);
    const m = new e.Mcp(p.kimo, data(), engineEnv());
    const s = await m.start();
    m.kill();
    report.kimo = { server: s.server, tools: s.tools.length };
    const files = await expand([clip]);
    const ops = [];
    report.stage = 'captions';
    flush();
    const live = { timeline: 0, preview: 0, progress: 0 };
    const r = await e.runEdit({ bin: p.kimo, env: engineEnv(), dir: join(data(), 'smoke'), files, note: '', preset: 'square', mode: 'captions', ffmpeg: p.ffmpeg, ffprobe: p.ffprobe, emit: (ev) => (ev.t === 'op' && ops.push(ev), ev.t in live && live[ev.t]++) });
    report.render = { edl: r.edl?.edl_version === 1, composed: ops.some(o => o.tool === 'compose' && o.phase === 'end' && o.ok), output: r.output, bytes: fs.statSync(r.output).size, duration: r.duration, live, quality: r.quality, projectFile: Boolean(r.projectFile), ops: ops.filter((o) => o.phase === 'end').map((o) => `${o.ok ? 'ok' : 'ERR'} ${o.ms}ms ${o.error || ''}`) };
    // timeline editor path: trim the first clip on the saved project and re-render
    const first = r.timeline?.tracks_bottom_to_top?.[0]?.clips?.[0];
    report.stage = 'manual';
    flush();
    if (first && r.projectFile) {
      const r3 = await e.runEdit({ bin: p.kimo, env: engineEnv(), dir: join(data(), 'smoke'), files, preset: 'square', mode: 'manual', projectFile: r.projectFile, ops: [{ tool: 'trim_clip', args: { clip_id: first.id, duration: Math.max(1, (first.end - first.start) - 1) } }], ffmpeg: p.ffmpeg, ffprobe: p.ffprobe, emit: () => undefined });
      report.manual = { duration: r3.duration, expected: Math.max(1, (first.end - first.start) - 1) };
    }
    report.captions = r.history.filter((h) => h.startsWith('auto_captions')).map((h) => h.slice(0, 600));
    report.ok = Boolean(report.kimo.tools && report.render.bytes > 1000 && report.render.edl && report.render.composed);
    const samAt = process.argv.indexOf('--smoke-sam');
    if (samAt > 0) {
      // SAM 3.1 end to end on Windows: proxy upload → track → 9:16 follow reframe + text behind the subject → kimo render
      report.stage = 'sam';
      report.sam = { events: [] };
      flush();
      try {
        const t0 = Date.now();
        const samFiles = await expand([process.argv[samAt + 1]]);
        const r4 = await e.runEdit({ bin: p.kimo, env: engineEnv(), dir: join(data(), 'smoke-sam'), files: samFiles, note: '', preset: 'shorts', mode: 'sam', ffmpeg: p.ffmpeg, ffprobe: p.ffprobe,
          sam: { effect: 'text_behind', prompt: 'person', text: 'KIMO', punch: true },
          emit: (ev) => {
            if (ev.t === 'op') report.sam.events.push(ev.phase === 'start' ? `> ${ev.title}` : `  ${ev.ok ? 'ok' : 'ERR ' + ev.error} ${ev.ms}ms ${ev.result ?? ''}`);
            if (ev.t === 'preview') report.sam.previews = (report.sam.previews ?? 0) + 1;
            if (ev.t === 'progress' && ev.phase === 'sam') report.sam.trackProgress = ev.f;
            flush();
          } });
        Object.assign(report.sam, { seconds: Math.round((Date.now() - t0) / 1000), bytes: fs.statSync(r4.output).size, duration: r4.duration, quality: r4.quality?.checks?.map((c) => `${c.id}=${c.ok ? 'ok' : 'FAIL'}(${c.value})`) });
        fs.copyFileSync(r4.output, join(outPath, '..', 'sam-final.mp4'));
        const samOut = join(data(), 'smoke-sam', 'sam', 'sam-text_behind.mp4');
        if (fs.existsSync(samOut)) fs.copyFileSync(samOut, join(outPath, '..', 'sam-text_behind.mp4'));
        // camera smoothness is measured on the render: shake px/frame and repeated frames must pass
        const motion = r4.quality?.checks?.find((c) => c.id === 'motion');
        report.sam.motion = motion ? `${motion.ok ? 'ok' : 'FAIL'} ${motion.value}` : 'not measured';
        report.sam.ok = r4.duration > 1 && Boolean(motion?.ok);
      } catch (err) {
        report.sam.error = String(err.stack || err);
        for (const f of ['sam-graph.txt', 'sam-font-used.txt']) {
          try {
            report.sam[f] = fs.readFileSync(join(data(), 'smoke-sam', 'sam', f), 'utf8').slice(0, 4000);
          } catch {
            /* not written */
          }
        }
        report.sam.ok = false;
      }
      report.ok = report.ok && report.sam.ok;
      flush();
    }
    if (process.argv.includes('--smoke-ai')) {
      report.stage = 'ai';
      report.ai = { events: [] };
      flush();
      const ai = [];
      try {
      const aiAt = process.argv.indexOf('--smoke-ai-clip');
      const aiFiles = aiAt > 0 ? await expand([process.argv[aiAt + 1]]) : files;
      const styleAt = process.argv.indexOf('--smoke-style');
      const style = styleAt > 0 ? process.argv[styleAt + 1] : 'podcast';
      const counts = { timeline: 0, preview: 0, progress: 0 };
      const t0 = Date.now();
      const r2 = await e.runEdit({ bin: p.kimo, env: engineEnv(), dir: join(data(), 'smoke-ai'), files: aiFiles, note: 'turn this into a tight youtube video: strong hook, cut the pauses, captions with keyword highlights, clean grade', preset: 'youtube', style, mode: 'ai', ffmpeg: p.ffmpeg, ffprobe: p.ffprobe, emit: (ev) => {
        if (ev.t in counts) return counts[ev.t]++;
        ai.push(ev);
        report.ai.events.push(ev.t === 'op' ? (ev.phase === 'start' ? `> ${ev.title}` : `  ${ev.ok ? 'ok' : 'ERR ' + ev.error} ${ev.ms}ms`) : `${ev.t}: ${String(ev.text ?? '').slice(0, 300)}`);
        report.ai.seconds = Math.round((Date.now() - t0) / 1000);
        flush();
      } });
      report.ai = { style, seconds: Math.round((Date.now() - t0) / 1000), bytes: fs.statSync(r2.output).size, duration: r2.duration, live: counts, quality: r2.quality, youtube: r2.youtube, events: ai.map((x) => x.t === 'op' ? (x.phase === 'start' ? `> ${x.title}` : `  ${x.ok ? 'ok' : 'ERR ' + x.error} ${x.ms}ms`) : `${x.t}: ${x.text ?? (x.checks ? x.checks.map((c) => `${c.id}=${c.ok ? 'ok' : 'FAIL'}(${c.value})`).join(' ') : '')}`) };
      const outDir = join(outPath, '..');
      for (const [f, n] of [[r2.output, 'ai-final.mp4'], [r2.youtube?.thumbnail, 'ai-thumbnail.jpg'], [join(data(), 'smoke-ai', 'sheet_a.jpg'), 'ai-sheet-a.jpg'], [join(data(), 'smoke-ai', 'sheet_b.jpg'), 'ai-sheet-b.jpg']])
        if (f && fs.existsSync(f)) fs.copyFileSync(f, join(outDir, n));
      } catch (err) {
        report.ai = { error: String(err.message || err), events: ai.map((x) => `${x.t}: ${x.title || x.text || x.error || ''}`) };
      }
    }
  } catch (err) {
    report.ok = false;
    report.error = String(err.stack || err);
  }
  report.stage = 'done';
  flush();
  app.exit(report.ok ? 0 : 1);
}

// ---------- window ----------
protocol.registerSchemesAsPrivileged([{ scheme: 'kimo-media', privileges: { stream: true, supportFetchAPI: true, bypassCSP: true } }]);

function createWindow() {
  win = new BrowserWindow({
    width: 1440, height: 900, minWidth: 1080, minHeight: 680, backgroundColor: '#0b0b0f', show: false,
    title: 'kimo', autoHideMenuBar: true,
    webPreferences: { preload: join(__dirname, 'preload.cjs'), contextIsolation: true, nodeIntegration: false, sandbox: false },
  });
  win.once('ready-to-show', () => win.show());
  win.webContents.setWindowOpenHandler(({ url }) => (url.startsWith('https://') && shell.openExternal(url), { action: 'deny' }));
  win.webContents.on('will-navigate', (ev) => ev.preventDefault());
  win.webContents.on('render-process-gone', (_e, d) => log('renderer gone', d.reason));
  win.loadFile(join(__dirname, 'renderer', 'index.html'));
}

const smokeAt = process.argv.indexOf('--smoke');
if (smokeAt < 0 && !app.requestSingleInstanceLock()) app.quit();
app.on('second-instance', () => win && (win.isMinimized() && win.restore(), win.focus()));

app.whenReady().then(async () => {
  if (smokeAt >= 0) {
    const outAt = process.argv.indexOf('--smoke-out');
    return smoke(process.argv[smokeAt + 1], outAt > 0 ? process.argv[outAt + 1] : join(data(), 'smoke.json'));
  }
  loadLibrary();
  protocol.handle('kimo-media', (req) => {
    const file = decodeURIComponent(new URL(req.url).searchParams.get('p') || '');
    const known = library.some((p) => p.output === file || p.files.some((f) => f.path === file) || file.startsWith(projectDir(p.id)));
    if (!known) return new Response('not found', { status: 404 });
    return net.fetch(pathToFileURL(file).href, { headers: req.headers });
  });
  ipcMain.handle('status', status);
  ipcMain.handle('library', () => library.map(publicProject));
  ipcMain.handle('project:log', (_e, id) => library.find((p) => p.id === id)?.log ?? []);
  ipcMain.handle('edl:get', async (_e,id) => {
    const p=library.find(p=>p.id===id);if(!p)return null;
    const edl=await import('./edl.mjs');
    const model=p.edlFile&&fs.existsSync(p.edlFile)?JSON.parse(fs.readFileSync(p.edlFile,'utf8')):p.projectFile&&fs.existsSync(p.projectFile)?edl.fromKimoProject(JSON.parse(fs.readFileSync(p.projectFile,'utf8')),p.files):null;
    return edl.publicEdl(model);
  });
  ipcMain.handle('expand', (_e, inputs) => expand(inputs));
  ipcMain.handle('pick', async (_e, folders) => {
    const r = await dialog.showOpenDialog(win, { properties: folders ? ['openDirectory', 'multiSelections'] : ['openFile', 'multiSelections'], filters: folders ? [] : [{ name: 'Media', extensions: ['mp4', 'mov', 'm4v', 'mkv', 'webm', 'avi', 'mp3', 'wav', 'm4a', 'png', 'jpg', 'jpeg'] }] });
    return r.canceled ? [] : expand(r.filePaths);
  });
  ipcMain.handle('create', (_e, { files, note, preset, mode, batch, style, sam }) => {
    if (!files?.length) throw new Error('add a video first');
    const made = batch ? files.map((f) => newProject({ files: [f], note, preset, mode, style, sam })) : [newProject({ files, note, preset, mode, style, sam })];
    saveLibrary();
    pump();
    return made.map(publicProject);
  });
  ipcMain.handle('rerun', (_e, { id, note, preset, mode, style, sam }) => {
    const p = library.find((x) => x.id === id);
    if (!p || p.status === 'running') return null;
    Object.assign(p, { note: note ?? p.note, preset: preset ?? p.preset, mode: mode ?? p.mode, style: style ?? p.style, sam: sam === undefined ? p.sam : cleanSam(sam), status: 'queued', error: undefined, job: undefined });
    p.history = [...(p.history ?? []), { at: Date.now(), note: p.note, preset: p.preset, mode: p.mode }].slice(-30);
    update(p);
    pump();
    return publicProject(p);
  });
  // chat-style follow-up: applied on top of the saved project
  ipcMain.handle('followup', (_e, { id, text }) => {
    const p = library.find((x) => x.id === id);
    const note = String(text ?? '').trim().slice(0, 1000);
    if (!p || !note || ['running', 'queued'].includes(p.status)) return null;
    if (!p.projectFile || !fs.existsSync(p.projectFile)) throw new Error('re-run this edit once first (it was made before follow-ups existed)');
    p.turns = [...(p.turns ?? []), { at: Date.now(), text: note }].slice(-50);
    Object.assign(p, { status: 'queued', error: undefined, job: { mode: 'followup', note } });
    update(p);
    pump();
    return publicProject(p);
  });
  // timeline editor: validated move/trim/delete/caption ops, then re-render
  ipcMain.handle('apply', async (_e, { id, ops }) => {
    const p = library.find((x) => x.id === id);
    if (!p || ['running', 'queued'].includes(p.status)) return null;
    if (!p.projectFile || !fs.existsSync(p.projectFile)) throw new Error('re-run this edit once first');
    const e = await loadEngine();
    const num = (v) => typeof v === 'number' && Number.isFinite(v) && v >= 0 && v < 86400;
    const clean = (Array.isArray(ops) ? ops : []).slice(0, 200).filter((o) => e.MANUAL_TOOLS.includes(o?.tool) && typeof o.args?.clip_id === 'string').map((o) => {
      const a = { clip_id: o.args.clip_id.slice(0, 40) };
      for (const k of ['start', 'duration', 'in_point']) if (num(o.args[k])) a[k] = +o.args[k].toFixed(3);
      if (typeof o.args.text === 'string') a.text = o.args.text.slice(0, 300);
      return { tool: o.tool, args: a };
    });
    if (!clean.length) return null;
    const edl=await import('./edl.mjs');
    const current=p.edlFile&&fs.existsSync(p.edlFile)?JSON.parse(fs.readFileSync(p.edlFile,'utf8')):edl.fromKimoProject(JSON.parse(fs.readFileSync(p.projectFile,'utf8')),p.files);
    const changed=edl.applyEdits(current,clean);
    p.edlFile=join(projectDir(p.id),'edit.edl.json');
    fs.writeFileSync(p.edlFile,JSON.stringify(changed,null,2));
    p.edl=edl.publicEdl(changed);p.timeline={...edl.toTimeline(changed),edl:p.edl};
    Object.assign(p, { status: 'queued', error: undefined, job: { mode: 'manual', ops: clean, edl:changed, note: p.note } });
    update(p);
    pump();
    return publicProject(p);
  });
  ipcMain.handle('saveThumb', async (_e, id) => {
    const p = library.find((x) => x.id === id);
    const src = p?.youtube?.thumbnail;
    if (!src || !fs.existsSync(src)) return null;
    const r = await dialog.showSaveDialog(win, { defaultPath: `${p.name}-thumbnail.jpg`, filters: [{ name: 'JPEG', extensions: ['jpg'] }] });
    if (r.canceled || !r.filePath) return null;
    await fs.promises.copyFile(src, r.filePath);
    return r.filePath;
  });
  // manual SAM: segment one frame and show the masks on the preview (one image, ~$0.0025)
  ipcMain.handle('sam:preview', async (_e, { file, prompt, time }) => {
    const s = await loadSam();
    return s.maskPreview({ ffmpeg: paths().ffmpeg, ffprobe: paths().ffprobe, input: String(file), time: Number(time) || 1, prompt: String(prompt || 'person').slice(0, 80), dir: join(data(), 'sam-preview') });
  });
  ipcMain.handle('pickImage', async () => {
    const r = await dialog.showOpenDialog(win, { properties: ['openFile'], filters: [{ name: 'Images', extensions: ['png', 'jpg', 'jpeg', 'webp'] }] });
    return r.canceled ? null : r.filePaths[0];
  });
  ipcMain.handle('copy', (_e, text) => clipboard.writeText(String(text ?? '')));
  ipcMain.handle('stop', (_e, id) => {
    if (running?.id === id) running.controller.abort();
    const p = library.find((x) => x.id === id);
    if (p?.status === 'queued') (p.status = 'stopped'), update(p);
  });
  ipcMain.handle('remove', (_e, id) => {
    if (running?.id === id) running.controller.abort();
    library = library.filter((p) => p.id !== id);
    fs.rmSync(projectDir(id), { recursive: true, force: true });
    saveLibrary();
  });
  ipcMain.handle('save', async (_e, { id, compress }) => {
    const p = library.find((x) => x.id === id);
    if (!p?.output) return null;
    const r = await dialog.showSaveDialog(win, { defaultPath: `${p.name}-kimo.mp4`, filters: [{ name: 'MP4', extensions: ['mp4'] }] });
    if (r.canceled || !r.filePath) return null;
    if (!compress) {
      await fs.promises.copyFile(p.output, r.filePath);
    } else {
      const e = await loadEngine();
      const preset = e.PRESETS[p.preset] ?? e.PRESETS.shorts;
      gpu ??= await e.detectGpu(paths().ffmpeg).catch(() => null);
      await e.deliveryEncode({ ffmpeg: paths().ffmpeg, input: p.output, output: r.filePath, encoder: gpu, mbps: preset.mbps, duration: p.duration, onProgress: (f) => send('event', { id, t: 'progress', phase: 'save', label: `small copy${gpu ? ` on GPU (${gpu})` : ''}`, f }) });
    }
    shell.showItemInFolder(r.filePath);
    return r.filePath;
  });
  ipcMain.handle('reveal', (_e, file) => shell.showItemInFolder(file));
  ipcMain.handle('model:download', () => downloadModel((f) => send('progress', { id: 'model', label: 'downloading the captions model', f })));
  ipcMain.handle('openLog', () => shell.openPath(logFile()));
  createWindow();
  if (app.isPackaged)
    try {
      const { autoUpdater } = require('electron-updater');
      autoUpdater.on('update-downloaded', (info) => send('update', { version: info.version }));
      autoUpdater.on('error', (err) => log('updater', err?.message || err));
      autoUpdater.checkForUpdates().catch(() => undefined);
      ipcMain.handle('update:install', () => autoUpdater.quitAndInstall());
    } catch (err) {
      log('updater unavailable', err.message);
    }
});
app.on('window-all-closed', () => app.quit());
