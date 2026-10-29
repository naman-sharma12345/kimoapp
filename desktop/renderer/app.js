/* global kimo */
const $ = (id) => document.getElementById(id);
const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);
const fmtTime = (s) => (s >= 3600 ? `${Math.floor(s / 3600)}:` : '') + `${Math.floor((s % 3600) / 60)}`.padStart(s >= 3600 ? 2 : 1, '0') + ':' + `${Math.floor(s % 60)}`.padStart(2, '0');
const fmtBytes = (b) => (b > 1e9 ? `${(b / 1e9).toFixed(1)} GB` : `${Math.round(b / 1e6)} MB`);
const STATUS = { queued: 'queued', running: 'editing…', done: 'ready', failed: 'failed', stopped: 'stopped' };
const media = (p) => `kimo-media://f/?p=${encodeURIComponent(p)}`;

let library = [];
let current = null;
let staged = [];
let presets = {};
const opRows = new Map();

function toast(text, action) {
  const t = $('toast');
  t.innerHTML = `<span>${esc(text)}</span>`;
  if (action) {
    const b = document.createElement('button');
    b.textContent = action.label;
    b.onclick = action.run;
    t.append(b);
  }
  t.classList.remove('hidden');
  clearTimeout(toast.timer);
  if (!action) toast.timer = setTimeout(() => t.classList.add('hidden'), 5000);
}
const guard = (fn) => async (...a) => {
  try {
    return await fn(...a);
  } catch (e) {
    toast(String(e.message || e).replace(/^Error invoking remote method '[^']+': (Error: )?/, ''));
  }
};

// ---------- health ----------
async function health() {
  const s = await kimo.status();
  presets = s.presets;
  $('ver').textContent = `v${s.version}`;
  for (const sel of [$('preset'), $('represet')]) sel.innerHTML = Object.entries(presets).map(([k, v]) => `<option value="${k}">${esc(v.label)}</option>`).join('');
  $('preset').value = localStorage.preset || 'shorts';
  $('mode').value = localStorage.mode || 'ai';
  const line = (ok, text) => `<div class="${ok ? 'ok' : 'bad'}">${ok ? '●' : '○'} ${esc(text)}</div>`;
  $('health').innerHTML = [
    line(s.kimo, s.kimo ? 'kimo v6 engine' : 'kimo engine missing'),
    line(s.ffmpeg, s.ffmpeg ? `FFmpeg ${s.ffmpeg.slice(0, 18)}` : 'FFmpeg missing'),
    line(s.whisper && s.model, s.model ? 'offline captions (whisper)' : 'captions model not downloaded'),
    `<div>${s.gpu ? `● GPU encode: ${esc(s.gpu.replace('h264_', '').toUpperCase())}` : '○ GPU encode: none (CPU)'}</div>`,
    '<div><a href="#" id="openlog" class="muted">open log</a></div>',
  ].join('');
  $('openlog').onclick = (e) => (e.preventDefault(), kimo.openLog());
  if (s.whisper && !s.model)
    toast('Captions need the whisper model (≈190 MB, one time).', { label: 'Download', run: guard(async () => { $('toast').classList.add('hidden'); await kimo.downloadModel(); toast('Captions model ready'); health(); }) });
}

// ---------- library ----------
function renderLibrary() {
  $('lib').innerHTML = library.length
    ? library.map((p) => `<li data-id="${p.id}" class="${current === p.id ? 'on' : ''}"><span class="n">${esc(p.name)}</span><span class="s">${STATUS[p.status] || p.status} · ${esc(presets[p.preset]?.label.split(' ·')[0] || p.preset)} · ${new Date(p.updated).toLocaleDateString()}</span></li>`).join('')
    : '<li class="s muted">Your edits appear here.</li>';
  for (const li of $('lib').querySelectorAll('li[data-id]')) li.onclick = () => openProject(li.dataset.id);
}
const find = (id) => library.find((p) => p.id === id);

// ---------- compose ----------
function renderFiles() {
  $('files').innerHTML = staged.map((f, i) => `<li><b>${esc(f.path.split(/[\\/]/).pop())}</b><span class="muted">${f.kind} · ${f.duration ? fmtTime(f.duration) : '—'}${f.width ? ` · ${f.width}×${f.height}` : ''} · ${fmtBytes(f.bytes)}</span><button class="x" data-i="${i}" title="Remove">✕</button></li>`).join('');
  for (const b of $('files').querySelectorAll('.x')) b.onclick = () => (staged.splice(Number(b.dataset.i), 1), renderFiles());
  $('go').disabled = !staged.length;
  $('batch').parentElement.classList.toggle('hidden', staged.length < 2);
}
const addFiles = (files) => {
  const known = new Set(staged.map((f) => f.path));
  const fresh = files.filter((f) => !known.has(f.path));
  staged.push(...fresh);
  if (!fresh.length && files.length === 0) toast('No video, audio or image files found there');
  renderFiles();
};
function showCompose() {
  current = null;
  $('compose').classList.remove('hidden');
  $('project').classList.add('hidden');
  renderLibrary();
}
const drop = $('drop');
for (const ev of ['dragenter', 'dragover']) document.addEventListener(ev, (e) => (e.preventDefault(), drop.classList.add('over')));
for (const ev of ['dragleave', 'drop']) document.addEventListener(ev, (e) => (e.preventDefault(), ev === 'drop' || e.relatedTarget === null ? drop.classList.remove('over') : 0));
document.addEventListener('drop', guard(async (e) => {
  const paths = kimo.pathsOf(e.dataTransfer.files);
  if (!paths.length) return;
  showCompose();
  addFiles(await kimo.expand(paths));
}));
$('pickFiles').onclick = guard(async () => addFiles(await kimo.pick(false)));
$('pickFolder').onclick = guard(async () => addFiles(await kimo.pick(true)));
$('new').onclick = showCompose;
$('go').onclick = guard(async () => {
  localStorage.preset = $('preset').value;
  localStorage.mode = $('mode').value;
  const made = await kimo.create({ files: staged, note: $('note').value.trim(), preset: $('preset').value, mode: $('mode').value, batch: $('batch').checked && staged.length > 1 });
  library.unshift(...made);
  staged = [];
  $('note').value = '';
  renderFiles();
  if (made.length > 1) toast(`${made.length} videos queued; kimo edits them one after another`);
  openProject(made[0].id);
});

// ---------- project ----------
function opLine(ev) {
  if (ev.t === 'say') return `<li class="say">${esc(ev.text)}</li>`;
  if (ev.t === 'status') return `<li class="say muted">· ${esc(ev.text)}</li>`;
  return '';
}
function addEvent(ev) {
  const ops = $('ops');
  if (ev.t === 'op' && ev.phase === 'start') {
    const li = document.createElement('li');
    li.className = 'run';
    li.innerHTML = `<span class="i">◌</span><span class="t">${esc(ev.title)}${ev.why ? `<span class="muted"> — ${esc(ev.why)}</span>` : ''}</span><span class="ms"></span>`;
    opRows.set(ev.id, li);
    ops.append(li);
  } else if (ev.t === 'op') {
    const li = opRows.get(ev.id);
    if (li) {
      li.className = ev.ok ? 'ok' : 'err';
      li.querySelector('.i').textContent = ev.ok ? '✓' : '✕';
      li.querySelector('.ms').textContent = ev.ms > 900 ? `${(ev.ms / 1000).toFixed(1)}s` : `${ev.ms}ms`;
      if (ev.error) li.querySelector('.t').insertAdjacentHTML('beforeend', `<span class="e">${esc(ev.error)}</span>`);
    }
  } else if (ev.t === 'frame') {
    $('frames').insertAdjacentHTML('beforeend', `<img src="${ev.image}" title="frame at ${Number(ev.time).toFixed(2)} s" />`);
    if ($('frames').children.length > 3) $('frames').firstElementChild.remove();
    return;
  } else {
    if (ev.kind === 'script') $('script').textContent = ev.text;
    ops.insertAdjacentHTML('beforeend', opLine(ev));
  }
  $('opcount').textContent = `${opRows.size} tool calls`;
  if (ops.scrollHeight - ops.scrollTop - ops.clientHeight < 120) ops.scrollTop = ops.scrollHeight;
}
function renderProject() {
  const p = find(current);
  if (!p) return showCompose();
  $('pname').textContent = p.name;
  const total = p.files.reduce((a, f) => a + (f.duration || 0), 0);
  $('pmeta').textContent = `${p.files.length} file${p.files.length > 1 ? 's' : ''} · ${fmtTime(total)} source · ${presets[p.preset]?.label ?? p.preset} · ${p.mode === 'captions' ? 'captions only (offline)' : 'AI edit'}${p.note ? ` · “${p.note.slice(0, 90)}”` : ''}`;
  const chip = $('pstatus');
  chip.className = `chip ${p.status}`;
  chip.textContent = p.status === 'failed' ? `failed: ${p.error?.slice(0, 80)}` : STATUS[p.status];
  chip.title = p.error || '';
  $('stop').classList.toggle('hidden', !['running', 'queued'].includes(p.status));
  const ready = p.status === 'done' && p.output;
  for (const id of ['save', 'compress', 'reveal']) $(id).disabled = !ready;
  $('rerun').disabled = ['running', 'queued'].includes(p.status);
  const v = $('video');
  const src = ready ? media(p.output) + `&v=${p.updated}` : p.files[0]?.kind === 'video' ? media(p.files[0].path) : '';
  if (v.dataset.src !== src) (v.dataset.src = src), (v.src = src);
  $('noout').classList.toggle('hidden', Boolean(ready));
  $('represet').value = p.preset;
  if (p.script) $('script').textContent = p.script;
}
async function openProject(id) {
  current = id;
  $('compose').classList.add('hidden');
  $('project').classList.remove('hidden');
  $('ops').innerHTML = '';
  $('frames').innerHTML = '';
  $('script').textContent = 'Written before any tool runs.';
  opRows.clear();
  renderLibrary();
  renderProject();
  for (const ev of await kimo.log(id)) addEvent(ev);
}
$('stop').onclick = guard(() => kimo.stop(current));
$('del').onclick = guard(async () => {
  if (!confirm('Delete this edit and its renders? Your original files are not touched.')) return;
  await kimo.remove(current);
  library = library.filter((p) => p.id !== current);
  showCompose();
});
$('save').onclick = guard(async () => { const f = await kimo.save({ id: current }); if (f) toast(`Saved ${f}`); });
$('compress').onclick = guard(async () => { const f = await kimo.save({ id: current, compress: true }); $('bar').classList.add('hidden'); if (f) toast(`Saved ${f}`); });
$('reveal').onclick = () => kimo.reveal(find(current)?.output);
$('rerun').onclick = guard(async () => {
  const note = $('renote').value.trim();
  const p = await kimo.rerun({ id: current, note: note || undefined, preset: $('represet').value });
  if (p) {
    Object.assign(find(current), p);
    $('renote').value = '';
    openProject(current);
  }
});

kimo.onProject((p) => {
  const i = library.findIndex((x) => x.id === p.id);
  if (i >= 0) library[i] = p;
  else library.unshift(p);
  renderLibrary();
  if (p.id === current) renderProject();
  if (p.status === 'done' && p.id !== current) toast(`${p.name} is ready`, { label: 'Open', run: () => ($('toast').classList.add('hidden'), openProject(p.id)) });
});
kimo.onEvent((ev) => ev.id === current && addEvent(ev));
kimo.onProgress(({ label, f }) => {
  const bar = $('bar');
  bar.classList.remove('hidden');
  bar.firstElementChild.style.width = `${Math.round(f * 100)}%`;
  bar.lastElementChild.textContent = `${label} · ${Math.round(f * 100)}%`;
  if (f >= 1) setTimeout(() => bar.classList.add('hidden'), 1500);
});
kimo.onUpdate(({ version }) => toast(`kimo ${version} is ready to install`, { label: 'Restart', run: () => kimo.installUpdate() }));

(async () => {
  await health().catch((e) => toast(`Engine check failed: ${e.message}`));
  library = await kimo.library();
  renderLibrary();
  renderFiles();
})();
