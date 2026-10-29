// kimo desktop (Windows): the real kimo v6 engine, FFmpeg and whisper bundled
// and run on this PC. Media stays local; only prompts and sampled frames go
// to the kimo AI proxy at api.getkimo.tech.
const { app, BrowserWindow, ipcMain, dialog, shell, protocol, net } = require('electron');
const { join, extname, basename } = require('node:path');
const fs = require('node:fs');
const { pathToFileURL } = require('node:url');
const { execFile } = require('node:child_process');
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
const publicProject = (p) => ({ ...p, log: undefined, logCount: p.log?.length ?? 0 });

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
  const e = await loadEngine();
  const controller = new AbortController();
  running = { id: next.id, controller };
  next.status = 'running';
  next.error = undefined;
  next.log = [];
  next.pass = 0;
  update(next);
  const dir = projectDir(next.id);
  try {
    const result = await e.runEdit({
      bin: paths().kimo, env: engineEnv(), dir, files: next.files, note: next.note,
      preset: next.preset, mode: next.mode, signal: controller.signal,
      emit: (ev) => {
        if (ev.t !== 'frame') next.log.push({ ...ev, at: Date.now() });
        if (ev.t === 'say' && ev.kind === 'script') next.script = ev.text;
        send('event', { id: next.id, ...ev });
      },
    });
    next.status = 'done';
    next.output = result.output;
    next.duration = result.duration;
  } catch (err) {
    next.status = controller.signal.aborted ? 'stopped' : 'failed';
    next.error = controller.signal.aborted ? 'stopped' : String(err.message || err).slice(0, 600);
    log('edit failed', next.id, err.stack || err);
  } finally {
    next.log = next.log.slice(-400);
    running = null;
    update(next);
    pump();
  }
}

function newProject({ files, note, preset, mode, name }) {
  const id = `p${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
  const p = {
    id, name: name || basename(files[0].path, extname(files[0].path)), created: Date.now(), updated: Date.now(),
    files, note: note || '', preset: preset || 'shorts', mode: mode || 'ai', status: 'queued', log: [],
  };
  library.unshift(p);
  return p;
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
  };
}

// ---------- headless smoke test (CI): kimo.exe --smoke <clip> --smoke-out <json> ----------
async function smoke(clip, outPath) {
  const report = { started: new Date().toISOString() };
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
    const r = await e.runEdit({ bin: p.kimo, env: engineEnv(), dir: join(data(), 'smoke'), files, note: '', preset: 'square', mode: 'captions', emit: (ev) => ev.t === 'op' && ops.push(ev) });
    report.render = { output: r.output, bytes: fs.statSync(r.output).size, duration: r.duration, ops: ops.filter((o) => o.phase === 'end').map((o) => `${o.ok ? 'ok' : 'ERR'} ${o.ms}ms ${o.error || ''}`) };
    report.captions = r.history.filter((h) => h.startsWith('auto_captions')).map((h) => h.slice(0, 600));
    report.ok = Boolean(report.kimo.tools && report.render.bytes > 1000);
    if (process.argv.includes('--smoke-ai')) {
      const ai = [];
      try {
      const r2 = await e.runEdit({ bin: p.kimo, env: engineEnv(), dir: join(data(), 'smoke-ai'), files, note: 'tight 1:1 social cut with a short hook title and captions', preset: 'square', mode: 'ai', emit: (ev) => ev.t !== 'frame' && ai.push(ev) });
      report.ai = { bytes: fs.statSync(r2.output).size, duration: r2.duration, events: ai.map((x) => x.t === 'op' ? (x.phase === 'start' ? `> ${x.title}` : `  ${x.ok ? 'ok' : 'ERR ' + x.error}`) : `${x.t}: ${x.text}`) };
      } catch (err) {
        report.ai = { error: String(err.message || err), events: ai.map((x) => `${x.t}: ${x.title || x.text || x.error || ''}`) };
      }
    }
  } catch (err) {
    report.ok = false;
    report.error = String(err.stack || err);
  }
  fs.writeFileSync(outPath, JSON.stringify(report, null, 2));
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
  ipcMain.handle('expand', (_e, inputs) => expand(inputs));
  ipcMain.handle('pick', async (_e, folders) => {
    const r = await dialog.showOpenDialog(win, { properties: folders ? ['openDirectory', 'multiSelections'] : ['openFile', 'multiSelections'], filters: folders ? [] : [{ name: 'Media', extensions: ['mp4', 'mov', 'm4v', 'mkv', 'webm', 'avi', 'mp3', 'wav', 'm4a', 'png', 'jpg', 'jpeg'] }] });
    return r.canceled ? [] : expand(r.filePaths);
  });
  ipcMain.handle('create', (_e, { files, note, preset, mode, batch }) => {
    if (!files?.length) throw new Error('add a video first');
    const made = batch ? files.map((f) => newProject({ files: [f], note, preset, mode })) : [newProject({ files, note, preset, mode })];
    saveLibrary();
    pump();
    return made.map(publicProject);
  });
  ipcMain.handle('rerun', (_e, { id, note, preset, mode }) => {
    const p = library.find((x) => x.id === id);
    if (!p || p.status === 'running') return null;
    Object.assign(p, { note: note ?? p.note, preset: preset ?? p.preset, mode: mode ?? p.mode, status: 'queued', error: undefined });
    p.history = [...(p.history ?? []), { at: Date.now(), note: p.note, preset: p.preset, mode: p.mode }].slice(-30);
    update(p);
    pump();
    return publicProject(p);
  });
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
      await e.deliveryEncode({ ffmpeg: paths().ffmpeg, input: p.output, output: r.filePath, encoder: gpu, mbps: preset.mbps, duration: p.duration, onProgress: (f) => send('progress', { id, label: `encoding${gpu ? ` on GPU (${gpu})` : ''}`, f }) });
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
