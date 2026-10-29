/* global kimo */
const $ = (id) => document.getElementById(id);
const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);
const fmtTime = (s) => (s >= 3600 ? `${Math.floor(s / 3600)}:` : '') + `${Math.floor((s % 3600) / 60)}`.padStart(s >= 3600 ? 2 : 1, '0') + ':' + `${Math.floor(s % 60)}`.padStart(2, '0');
const fmtTc = (s) => `${fmtTime(s || 0)}.${Math.floor(((s || 0) % 1) * 10)}`;
const fmtBytes = (b) => (b > 1e9 ? `${(b / 1e9).toFixed(1)} GB` : `${Math.max(1, Math.round(b / 1e6))} MB`);
const fmtMs = (ms) => (ms >= 60_000 ? `${Math.floor(ms / 60_000)}m${String(Math.round((ms % 60_000) / 1000)).padStart(2, '0')}s` : ms > 900 ? `${(ms / 1000).toFixed(1)}s` : `${ms}ms`);
const STATUS = { queued: 'queued', running: 'editing live…', done: 'ready', failed: 'failed', stopped: 'stopped' };
const media = (p) => `kimo-media://f/?p=${encodeURIComponent(p)}`;
const isTyping = () => ['TEXTAREA', 'INPUT', 'SELECT'].includes(document.activeElement?.tagName);

let library = [];
let current = null;
let staged = [];
let presets = {};
let styles = {};
const opRows = new Map();
let seenClips = new Set();

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
const find = (id) => library.find((p) => p.id === id);

// ---------- health ----------
async function health() {
  const s = await kimo.status();
  presets = s.presets;
  styles = s.styles || { auto: 'Auto' };
  $('ver').textContent = `v${s.version}`;
  for (const sel of [$('preset'), $('represet')]) sel.innerHTML = Object.entries(presets).map(([k, v]) => `<option value="${k}">${esc(v.label)}</option>`).join('');
  for (const sel of [$('style'), $('restyle')]) sel.innerHTML = Object.entries(styles).map(([k, v]) => `<option value="${k}">${esc(v)}</option>`).join('');
  $('preset').value = localStorage.preset || 'youtube';
  $('style').value = localStorage.style || 'auto';
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
    ? library.map((p) => `<li data-id="${p.id}" class="${current === p.id ? 'on' : ''} ${p.status}"><span class="n">${esc(p.name)}</span><span class="s">${STATUS[p.status] || p.status} · ${esc(presets[p.preset]?.label.split(' ·')[0] || p.preset)}${p.style && p.style !== 'auto' ? ` · ${esc((styles[p.style] || p.style).split(' (')[0])}` : ''}</span></li>`).join('')
    : '<li class="s muted">Your edits appear here.</li>';
  for (const li of $('lib').querySelectorAll('li[data-id]')) li.onclick = () => openProject(li.dataset.id);
}

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
  if (!staged.length) return;
  localStorage.preset = $('preset').value;
  localStorage.style = $('style').value;
  localStorage.mode = $('mode').value;
  const sam = samChoice();
  if ($('mode').value === 'sam' && !sam) return toast('Pick a subject effect first');
  if (sam?.effect === 'bg_image' && !sam.image) return toast('Choose a background image first');
  const made = await kimo.create({ files: staged, note: $('note').value.trim(), preset: $('preset').value, style: $('style').value, mode: $('mode').value, batch: $('batch').checked && staged.length > 1, sam });
  library.unshift(...made);
  staged = [];
  $('note').value = '';
  renderFiles();
  if (made.length > 1) toast(`${made.length} videos queued; kimo edits them one after another`);
  openProject(made[0].id);
});

// ---------- manual SAM 3.1: type an object, see its masks, pick an effect ----------
let samImagePath = null;
function samChoice() {
  const effect = $('samEffect').value;
  if (!effect) return undefined;
  return { effect, prompt: $('samPrompt').value.trim() || 'person', text: $('samText').value.trim(), color: $('samColor').value, image: samImagePath, punch: $('samPunch').checked };
}
$('samEffect').onchange = () => {
  const e = $('samEffect').value;
  $('samTextL').classList.toggle('hidden', e !== 'text_behind');
  $('samColorL').classList.toggle('hidden', e !== 'bg_color' && e !== 'text_behind');
  $('samImage').classList.toggle('hidden', e !== 'bg_image');
  if (e && $('mode').value === 'captions') toast('The SAM effect runs first, then captions');
};
$('samImage').onclick = guard(async () => {
  samImagePath = await kimo.pickImage();
  $('samImage').textContent = samImagePath ? samImagePath.split(/[\\/]/).pop() : 'Choose image';
});
$('samFind').onclick = guard(async () => {
  const video = staged.find((f) => f.kind === 'video');
  if (!video) return toast('Add a video first');
  $('samFind').disabled = true;
  $('samInfo').textContent = 'SAM 3.1 is looking…';
  $('samPreview').classList.remove('hidden');
  try {
    const r = await kimo.samPreview({ file: video.path, prompt: $('samPrompt').value.trim() || 'person', time: Math.min(1, (video.duration || 2) / 2) });
    $('samImg').src = r.image;
    $('samInfo').textContent = r.objects ? `${r.objects} match${r.objects === 1 ? '' : 'es'} for "${$('samPrompt').value.trim() || 'person'}" (tinted). The largest, most central one is the subject.` : 'No match on this frame; try another word.';
  } finally {
    $('samFind').disabled = false;
  }
});

// ---------- live stage: preview frames crossfade over the player ----------
let liveFront = 'liveA';
function showPreview(image, caption) {
  const next = liveFront === 'liveA' ? 'liveB' : 'liveA';
  const img = $(next);
  img.onload = () => {
    img.classList.add('show');
    $(liveFront).classList.remove('show');
    liveFront = next;
  };
  img.src = image;
  $('noout').classList.add('hidden');
  const b = $('badge');
  b.textContent = caption;
  b.classList.remove('hidden');
}
function hidePreview() {
  $('liveA').classList.remove('show');
  $('liveB').classList.remove('show');
  $('badge').classList.add('hidden');
}

// ---------- progress with ETA ----------
function progress({ label, f, eta, estimated }) {
  const bar = $('bar');
  bar.classList.remove('hidden');
  const pct = Math.round(Math.max(0, Math.min(1, f)) * 100);
  bar.firstElementChild.style.width = `${pct}%`;
  const left = eta == null ? '' : eta <= 0 ? '' : ` · ${estimated ? '~' : ''}${eta < 60 ? `${Math.ceil(eta)} s` : `${Math.floor(eta / 60)} min ${Math.round(eta % 60)} s`} left`;
  bar.lastElementChild.textContent = `${label} · ${pct}%${left}`;
  clearTimeout(progress.timer);
  if (f >= 1) progress.timer = setTimeout(() => bar.classList.add('hidden'), 1800);
}

// ---------- thinking stream (typewriter) ----------
function think(text) {
  const box = $('thoughts');
  const li = document.createElement('li');
  li.className = 'typing';
  box.append(li);
  while (box.children.length > 40) box.firstElementChild.remove();
  let i = 0;
  const step = Math.max(1, Math.ceil(text.length / 40));
  const tick = () => {
    i = Math.min(text.length, i + step);
    li.textContent = text.slice(0, i);
    box.scrollTop = box.scrollHeight;
    if (i < text.length) requestAnimationFrame(tick);
    else li.classList.remove('typing');
  };
  tick();
}
function typeScript(text) {
  const el = $('script');
  el.classList.remove('muted');
  let i = 0;
  const step = Math.max(2, Math.ceil(text.length / 90));
  const tick = () => {
    i = Math.min(text.length, i + step);
    el.textContent = text.slice(0, i);
    if (i < text.length) requestAnimationFrame(tick);
  };
  tick();
}

// ---------- op log with live timers ----------
function addEvent(ev, replay = false) {
  const ops = $('ops');
  if (ev.t === 'op' && ev.phase === 'start') {
    const li = document.createElement('li');
    li.className = 'run';
    li.dataset.t0 = replay ? '' : String(Date.now());
    li.innerHTML = `<span class="i">◌</span><span class="t">${esc(ev.title)}${ev.why ? `<span class="muted"> — ${esc(ev.why)}</span>` : ''}</span><span class="ms"></span>`;
    opRows.set(ev.id, li);
    ops.append(li);
    if (!replay) $('badge').textContent = `LIVE · ${ev.tool}`;
  } else if (ev.t === 'op') {
    const li = opRows.get(ev.id);
    if (li) {
      li.className = ev.ok ? 'ok' : 'err';
      li.dataset.t0 = '';
      li.querySelector('.i').textContent = ev.ok ? '✓' : '✕';
      li.querySelector('.ms').textContent = fmtMs(ev.ms);
      if (ev.error) li.querySelector('.t').insertAdjacentHTML('beforeend', `<span class="e">${esc(ev.error)}</span>`);
      else if (ev.result && !replay) li.querySelector('.t').insertAdjacentHTML('beforeend', `<span class="r">${esc(ev.result.slice(0, 120))}</span>`);
    }
  } else if (ev.t === 'frame') {
    $('frames').insertAdjacentHTML('beforeend', `<img src="${ev.image}" title="frame at ${Number(ev.time).toFixed(2)} s" />`);
    while ($('frames').children.length > 6) $('frames').firstElementChild.remove();
    return;
  } else if (ev.t === 'preview') {
    if (!replay) showPreview(ev.image, `LIVE · after ${ev.after} · ${Number(ev.time).toFixed(1)} s`);
    return;
  } else if (ev.t === 'timeline') {
    if (!editing()) renderTimeline(ev.timeline, !replay);
    return;
  } else if (ev.t === 'progress') {
    if (!replay) progress(ev);
    return;
  } else if (ev.t === 'think') {
    if (replay) $('thoughts').insertAdjacentHTML('beforeend', `<li>${esc(ev.text)}</li>`);
    else think(ev.text);
    return;
  } else if (ev.t === 'quality') {
    liveQuality(ev);
    return;
  } else if (ev.t === 'youtube') {
    renderYoutube(ev.youtube);
    return;
  } else if (ev.t === 'run') {
    ops.insertAdjacentHTML('beforeend', `<li class="run-h">▸ ${ev.mode === 'followup' ? 'follow-up' : ev.mode === 'manual' ? 'timeline edit' : 'edit'}: ${esc(ev.text || '')}</li>`);
  } else {
    if (ev.kind === 'script') replay ? ($('script').textContent = ev.text, $('script').classList.remove('muted')) : typeScript(ev.text);
    else if (ev.t === 'say') ops.insertAdjacentHTML('beforeend', `<li class="say">${esc(ev.text)}</li>`);
    else if (ev.t === 'status') ops.insertAdjacentHTML('beforeend', `<li class="say muted">· ${esc(ev.text)}</li>`);
    if (ev.t === 'status' && !replay) $('badge').textContent = `LIVE · ${ev.text}`;
  }
  $('opcount').textContent = `${opRows.size} tool calls`;
  if (ops.scrollHeight - ops.scrollTop - ops.clientHeight < 160) ops.scrollTop = ops.scrollHeight;
}
setInterval(() => {
  const now = Date.now();
  for (const li of opRows.values()) if (li.dataset.t0) li.querySelector('.ms').textContent = fmtMs(now - Number(li.dataset.t0));
  const p = find(current);
  $('elapsed').textContent = p?.status === 'running' && p.started ? fmtMs(now - p.started) : p?.took ? `took ${fmtMs(p.took)}` : '';
}, 100);

// ---------- timeline (live + drag-to-edit) ----------
let tl = null; // timeline as kimo reports it
let draft = null; // the user's edited copy
let edits = []; // pending ops
let undoStack = [];
let selected = null;
const editing = () => edits.length > 0;
const clipKind = (c) => (/^text:/.test(c.src ?? '') ? 'text' : /\.(mp3|wav|m4a|aac|flac)$/i.test(c.src ?? '') ? 'audio' : /\./.test(c.src ?? '') ? 'media' : 'other');
const tlDuration = (t) => Math.max(1, Number(t?.duration) || 0, ...(t?.tracks_bottom_to_top ?? []).flatMap((k) => k.clips.map((c) => c.end)));
function renderTimeline(t, animate = false) {
  if (t) tl = t;
  const view = draft ?? tl;
  const tracks = $('tracks');
  if (!view?.tracks_bottom_to_top?.length) {
    tracks.innerHTML = '<div class="muted small">Clips, titles and captions appear here as kimo adds them.</div>';
    $('ruler').innerHTML = '';
    $('tlinfo').textContent = '';
    return;
  }
  const dur = tlDuration(view);
  const ruler = $('ruler');
  ruler.innerHTML = '';
  const stepS = dur > 600 ? 60 : dur > 120 ? 15 : dur > 40 ? 5 : dur > 12 ? 2 : 1;
  for (let s = 0; s < dur; s += stepS) {
    const i = document.createElement('i');
    i.style.left = `${(s / dur) * 100}%`;
    i.textContent = fmtTime(s);
    ruler.append(i);
  }
  tracks.innerHTML = '';
  for (const k of [...view.tracks_bottom_to_top].reverse()) {
    const row = document.createElement('div');
    row.className = 'trk';
    row.dataset.track = k.track_id;
    for (const c of k.clips) {
      const el = document.createElement('div');
      const kind = clipKind(c);
      el.className = `clip ${kind}${selected === c.id ? ' sel' : ''}${animate && !seenClips.has(c.id) ? ' new' : ''}${c.edited ? ' edited' : ''}`;
      el.dataset.id = c.id;
      el.style.left = `${(c.start / dur) * 100}%`;
      el.style.width = `${Math.max(0.4, ((c.end - c.start) / dur) * 100)}%`;
      el.textContent = kind === 'text' ? c.src.replace(/^text:\s*/, '') : c.src || c.id;
      el.title = `${c.id} · ${c.start.toFixed(2)}–${c.end.toFixed(2)} s${c.in != null ? ` · from ${Number(c.in).toFixed(2)} s` : ''}`;
      row.append(el);
    }
    tracks.append(row);
  }
  for (const k of view.tracks_bottom_to_top) for (const c of k.clips) seenClips.add(c.id);
  const n = view.tracks_bottom_to_top.reduce((a, k) => a + k.clips.length, 0);
  $('tlinfo').textContent = `${fmtTc(dur)} · ${n} clip${n === 1 ? '' : 's'} · ${view.tracks_bottom_to_top.length} track${view.tracks_bottom_to_top.length === 1 ? '' : 's'}${edits.length ? ` · ${edits.length} unsaved edit${edits.length === 1 ? '' : 's'}` : ''}`;
  const busy = ['running', 'queued'].includes(find(current)?.status);
  $('tlApply').disabled = !edits.length || busy;
  $('tlUndo').disabled = !undoStack.length;
  $('tlDiscard').disabled = !edits.length;
  movePlayhead();
}
const findClip = (id, t = draft ?? tl) => {
  for (const k of t?.tracks_bottom_to_top ?? []) {
    const c = k.clips.find((x) => x.id === id);
    if (c) return { c, k };
  }
  return null;
};
function canEdit() {
  const p = find(current);
  if (!p || ['running', 'queued'].includes(p.status)) return toast('kimo is still editing; wait for it to finish'), false;
  if (!p.projectFile) return toast('re-run this edit once to unlock the timeline editor'), false;
  return true;
}
function snapshot() {
  undoStack.push({ draft: JSON.parse(JSON.stringify(draft ?? tl)), edits: [...edits] });
  if (!draft) draft = JSON.parse(JSON.stringify(tl));
}
function pushEdit(op) {
  // a later op on the same clip and kind replaces the earlier one
  const i = edits.findIndex((e) => e.tool === op.tool && e.args.clip_id === op.args.clip_id && op.tool !== 'delete_clip');
  if (i >= 0) edits[i] = op;
  else edits.push(op);
}
const snap = (v, t, ignore) => {
  let best = Math.round(v * 20) / 20;
  for (const k of t.tracks_bottom_to_top) for (const c of k.clips) {
    if (c.id === ignore) continue;
    for (const e of [c.start, c.end]) if (Math.abs(e - v) < 0.08) best = e;
  }
  return Math.max(0, best);
};
let drag = null;
$('tracks').addEventListener('pointerdown', (e) => {
  const el = e.target.closest('.clip');
  if (!el || e.target.tagName === 'INPUT') return;
  selected = el.dataset.id;
  for (const x of $('tracks').querySelectorAll('.clip.sel')) x.classList.remove('sel');
  el.classList.add('sel');
  const r = el.getBoundingClientRect();
  const edge = e.clientX - r.left < 7 ? 'left' : r.right - e.clientX < 7 ? 'right' : 'move';
  drag = { el, id: el.dataset.id, edge, x0: e.clientX, pxPerS: $('tracks').clientWidth / tlDuration(draft ?? tl), moved: false };
  el.setPointerCapture(e.pointerId);
});
$('tracks').addEventListener('pointermove', (e) => {
  if (!drag) return;
  const dx = e.clientX - drag.x0;
  if (!drag.moved && Math.abs(dx) < 3) return;
  if (!drag.moved) {
    if (!canEdit()) return (drag = null);
    drag.moved = true;
    snapshot();
    drag.orig = { ...findClip(drag.id).c };
    drag.el.classList.add('dragging');
  }
  const t = draft;
  const { c } = findClip(drag.id, t);
  const o = drag.orig;
  const ds = dx / drag.pxPerS;
  const len = o.end - o.start;
  if (drag.edge === 'move') {
    c.start = snap(o.start + ds, t, c.id);
    c.end = c.start + len;
  } else if (drag.edge === 'right') {
    c.end = Math.max(c.start + 0.2, snap(o.end + ds, t, c.id));
  } else {
    let s = Math.min(o.end - 0.2, snap(o.start + ds, t, c.id));
    if (o.in != null) s = Math.max(s, o.start - o.in); // can't trim before the source start
    c.start = s;
    if (o.in != null) c.in = o.in + (s - o.start);
  }
  const dur = tlDuration(draft);
  drag.el.style.left = `${(c.start / dur) * 100}%`;
  drag.el.style.width = `${((c.end - c.start) / dur) * 100}%`;
});
$('tracks').addEventListener('pointerup', () => {
  if (!drag) return;
  const d = drag;
  drag = null;
  if (!d.moved) return;
  const { c } = findClip(d.id, draft);
  c.edited = true;
  const r3 = (v) => +v.toFixed(3);
  if (d.edge === 'move') pushEdit({ tool: 'move_clip', args: { clip_id: c.id, start: r3(c.start) } });
  else {
    if (d.edge === 'left') pushEdit({ tool: 'move_clip', args: { clip_id: c.id, start: r3(c.start) } });
    pushEdit({ tool: 'trim_clip', args: { clip_id: c.id, duration: r3(c.end - c.start), ...(c.in != null ? { in_point: r3(c.in) } : {}) } });
  }
  renderTimeline();
});
$('tracks').addEventListener('dblclick', (e) => {
  const el = e.target.closest('.clip.text');
  if (!el || !canEdit()) return;
  const { c } = findClip(el.dataset.id);
  const old = c.src.replace(/^text:\s*/, '');
  const input = document.createElement('input');
  input.value = old;
  input.className = 'clip-edit';
  el.textContent = '';
  el.append(input);
  input.focus();
  input.select();
  const done = (save) => {
    const text = input.value.trim();
    input.remove();
    if (save && text && text !== old) {
      snapshot();
      const t = findClip(c.id, draft).c;
      t.src = `text: ${text}`;
      t.edited = true;
      pushEdit({ tool: 'edit_caption', args: { clip_id: c.id, text } });
    }
    renderTimeline();
  };
  input.onkeydown = (k) => {
    k.stopPropagation();
    if (k.key === 'Enter') done(true);
    if (k.key === 'Escape') done(false);
  };
  input.onblur = () => done(true);
});
function deleteSelected() {
  if (!selected || !canEdit()) return;
  snapshot();
  const hit = findClip(selected, draft);
  if (!hit) return;
  hit.k.clips = hit.k.clips.filter((x) => x.id !== selected);
  edits = edits.filter((e) => e.args.clip_id !== selected);
  edits.push({ tool: 'delete_clip', args: { clip_id: selected } });
  selected = null;
  renderTimeline();
}
function undoEdit() {
  const s = undoStack.pop();
  if (!s) return;
  draft = s.edits.length ? s.draft : null;
  edits = s.edits;
  renderTimeline();
}
function discardEdits() {
  draft = null;
  edits = [];
  undoStack = [];
  renderTimeline();
}
$('tlUndo').onclick = undoEdit;
$('tlDiscard').onclick = discardEdits;
$('tlApply').onclick = guard(async () => {
  const p = await kimo.apply({ id: current, ops: edits });
  if (p) {
    Object.assign(find(current), p);
    discardEdits();
    renderProject();
  }
});
function movePlayhead() {
  const v = $('video');
  const dur = tlDuration(draft ?? tl);
  const at = showingOriginal ? 0 : v.currentTime || 0;
  $('playhead').style.left = `${Math.min(100, (at / dur) * 100)}%`;
}
$('ruler').addEventListener('click', (e) => {
  const r = $('ruler').getBoundingClientRect();
  const v = $('video');
  if (v.src) v.currentTime = ((e.clientX - r.left) / r.width) * tlDuration(draft ?? tl);
});

// ---------- player + before/after ----------
let showingOriginal = false;
const v = $('video');
v.addEventListener('timeupdate', () => {
  $('tc').textContent = `${fmtTc(v.currentTime)} / ${fmtTc(v.duration || 0)}`;
  movePlayhead();
});
v.addEventListener('play', () => ($('play').textContent = '❚❚'));
v.addEventListener('pause', () => ($('play').textContent = '▶'));
const playPause = () => v.src && (v.paused ? v.play() : v.pause());
$('play').onclick = playPause;
v.onclick = playPause;
function toggleAB() {
  const p = find(current);
  if (!p?.output || p.files[0]?.kind !== 'video') return;
  showingOriginal = !showingOriginal;
  const t = v.currentTime;
  const wasPlaying = !v.paused;
  const src = showingOriginal ? media(p.files[0].path) : media(p.output) + `&v=${p.updated}`;
  v.dataset.src = src;
  v.src = src;
  v.addEventListener('loadedmetadata', () => {
    v.currentTime = Math.min(t, (v.duration || t) - 0.05);
    if (wasPlaying) v.play();
  }, { once: true });
  const b = $('abBadge');
  b.textContent = showingOriginal ? 'BEFORE · original' : 'AFTER · kimo edit';
  b.classList.remove('hidden');
  clearTimeout(toggleAB.t);
  if (!showingOriginal) toggleAB.t = setTimeout(() => b.classList.add('hidden'), 1500);
}
$('ab').onclick = toggleAB;

// ---------- quality ----------
function renderQuality(q) {
  if (!q?.checks) {
    $('qnums').innerHTML = '';
    $('qchecks').innerHTML = '<li class="muted">Measured after the render: resolution, bitrate, loudness, true peak, black frames, dead air.</li>';
    $('qpasses').innerHTML = '';
    return;
  }
  const m = q.final ?? {};
  const num = (b, s) => `<div><b>${esc(b)}</b><span>${esc(s)}</span></div>`;
  $('qnums').innerHTML = [
    num(m.width ? `${m.width}×${m.height}` : '—', 'resolution'),
    num(m.fps ? `${m.fps}` : '—', 'fps'),
    num(m.mbps ? `${m.mbps} Mbps` : '—', 'video bitrate'),
    num(m.lufs != null ? `${m.lufs} LUFS` : '—', 'loudness'),
    num(m.truePeak != null ? `${m.truePeak} dBTP` : '—', 'true peak'),
    num(m.bytes ? fmtBytes(m.bytes) : '—', `${m.duration ? fmtTc(m.duration) : ''} file`),
  ].join('');
  $('qchecks').innerHTML = q.checks.map((c) => `<li><span class="${c.ok ? 'ok-t' : c.warn ? 'warn-t' : 'bad-t'}">${c.ok ? '✓' : c.warn ? '!' : '✕'}</span><span>${esc(c.label)}</span><span class="v">${esc(c.value)}<br><span class="small">want ${esc(c.want)}</span></span></li>`).join('');
  $('qpasses').innerHTML = (q.passes ?? []).length
    ? q.passes.map((p) => `<li><span><b>pass ${esc(p.pass)}</b> · <span class="${p.verdict === 'clean' ? 'ok-t' : p.verdict ? 'warn-t' : 'muted'}">${esc(p.verdict ?? 'not reviewed')}</span> · ${esc(p.lufs ?? '?')} LUFS before master</span>${(p.faults ?? []).map((f) => `<span class="muted small">· ${esc(f)}</span>`).join('')}</li>`).join('')
    : '<li class="muted">No AI frame check for this run.</li>';
}
function liveQuality(ev) {
  const p = find(current);
  if (!p) return;
  if (ev.stage === 'master') renderQuality({ final: ev.m, checks: ev.checks, passes: p.quality?.passes });
  else renderQuality({ final: ev.m, checks: ev.checks, passes: [] });
}

// ---------- YouTube pack ----------
function renderYoutube(y) {
  const box = $('yt');
  if (!y) {
    box.innerHTML = '<div class="muted">Thumbnail, title, description and chapters appear when an AI edit finishes.</div>';
    return;
  }
  const field = (label, text, key) => `<div class="field"><div class="row"><span class="label">${label}</span><button class="small" data-copy="${key}">Copy</button></div><pre>${esc(text || '—')}</pre></div>`;
  box.innerHTML = [
    y.thumbnail ? `<img src="${media(y.thumbnail)}&v=${Date.now()}" alt="thumbnail" /><div class="row"><span class="muted small">auto thumbnail${y.thumbnail_text ? ` · “${esc(y.thumbnail_text)}”` : ''}</span><span class="grow"></span><button id="saveThumb" class="small">Save thumbnail</button></div>` : '',
    field('Title', y.title, 'title'),
    field('Description', y.description, 'description'),
    y.chapters?.length ? `<div class="muted small">${y.chapters.length} chapters included in the description</div>` : '<div class="muted small">No chapters: YouTube needs 3+ sections of 10 s or more.</div>',
  ].join('');
  for (const b of box.querySelectorAll('[data-copy]')) b.onclick = guard(async () => (await kimo.copy(y[b.dataset.copy] ?? ''), toast('Copied')));
  if ($('saveThumb')) $('saveThumb').onclick = guard(async () => { const f = await kimo.saveThumb(current); if (f) toast(`Saved ${f}`); });
}

// ---------- tabs ----------
function tab(name) {
  for (const b of document.querySelectorAll('.tabs button')) b.classList.toggle('on', b.dataset.tab === name);
  for (const t of ['live', 'quality', 'youtube']) $(`tab-${t}`).classList.toggle('hidden', t !== name);
}
for (const b of document.querySelectorAll('.tabs button')) b.onclick = () => tab(b.dataset.tab);

// ---------- project ----------
function renderProject() {
  const p = find(current);
  if (!p) return showCompose();
  $('pname').textContent = p.name;
  const total = p.files.reduce((a, f) => a + (f.duration || 0), 0);
  $('pmeta').textContent = `${p.files.length} file${p.files.length > 1 ? 's' : ''} · ${fmtTime(total)} source · ${presets[p.preset]?.label ?? p.preset} · ${p.mode === 'captions' ? 'captions only (offline)' : p.mode === 'sam' ? 'SAM effect' : `AI edit · ${styles[p.style] ?? 'Auto'}`}${p.sam ? ` · SAM 3.1 ${p.sam.effect.replace('_', ' ')} on “${p.sam.prompt || 'person'}”` : ''}${p.note ? ` · “${p.note.slice(0, 90)}”` : ''}`;
  const chip = $('pstatus');
  chip.className = `chip ${p.status}`;
  chip.textContent = p.status === 'failed' ? `failed: ${p.error?.slice(0, 80)}` : STATUS[p.status];
  chip.title = p.error || '';
  const busy = ['running', 'queued'].includes(p.status);
  $('stop').classList.toggle('hidden', !busy);
  const ready = p.status !== 'running' && p.output;
  for (const id of ['save', 'compress', 'reveal']) $(id).disabled = !ready || busy;
  $('ab').disabled = !(p.output && p.files[0]?.kind === 'video');
  $('rerun').disabled = busy;
  $('send').disabled = busy;
  if (!busy) hidePreview();
  if (!showingOriginal) {
    const src = ready ? media(p.output) + `&v=${p.updated}` : p.files[0]?.kind === 'video' ? media(p.files[0].path) : '';
    if (v.dataset.src !== src) (v.dataset.src = src), (v.src = src);
  }
  $('noout').classList.toggle('hidden', Boolean(ready || p.files[0]?.kind === 'video'));
  $('represet').value = p.preset;
  $('restyle').value = p.style || 'auto';
  if (p.script && $('script').classList.contains('muted')) ($('script').textContent = p.script), $('script').classList.remove('muted');
  $('turns').innerHTML = (p.turns ?? []).map((t) => `<li class="me">${esc(t.text)}</li>`).join('');
  $('turns').scrollTop = $('turns').scrollHeight;
  if (!busy) renderQuality(p.quality);
  if (!busy && p.youtube) renderYoutube(p.youtube);
  renderTimeline(p.timeline);
}
async function openProject(id) {
  current = id;
  showingOriginal = false;
  $('abBadge').classList.add('hidden');
  $('compose').classList.add('hidden');
  $('project').classList.remove('hidden');
  for (const k of ['ops', 'frames', 'thoughts']) $(k).innerHTML = '';
  $('script').textContent = 'Written before any tool runs.';
  $('script').classList.add('muted');
  $('bar').classList.add('hidden');
  opRows.clear();
  seenClips = new Set();
  tl = null;
  discardEdits();
  selected = null;
  renderYoutube(null);
  renderQuality(null);
  renderLibrary();
  renderProject();
  for (const ev of await kimo.log(id)) addEvent(ev, true);
  renderProject();
}
$('stop').onclick = guard(() => kimo.stop(current));
$('del').onclick = guard(async () => {
  if (!confirm('Delete this edit and its renders? Your original files are not touched.')) return;
  await kimo.remove(current);
  library = library.filter((p) => p.id !== current);
  showCompose();
});
const saveMp4 = guard(async () => { const f = await kimo.save({ id: current }); if (f) toast(`Saved ${f}`); });
$('save').onclick = saveMp4;
$('compress').onclick = guard(async () => { const f = await kimo.save({ id: current, compress: true }); if (f) toast(`Saved ${f}`); });
$('reveal').onclick = () => kimo.reveal(find(current)?.output);
const send = guard(async () => {
  const text = $('ask').value.trim();
  if (!text) return $('ask').focus();
  const p = await kimo.followup({ id: current, text });
  if (p) {
    Object.assign(find(current), p);
    $('ask').value = '';
    renderProject();
    tab('live');
  }
});
$('send').onclick = send;
$('rerun').onclick = guard(async () => {
  const note = $('renote').value.trim();
  const p = await kimo.rerun({ id: current, note: note || undefined, preset: $('represet').value, style: $('restyle').value });
  if (p) {
    Object.assign(find(current), p);
    $('renote').value = '';
    openProject(current);
  }
});

// ---------- keyboard ----------
const help = $('help');
$('keys').onclick = () => help.classList.toggle('hidden');
help.onclick = () => help.classList.add('hidden');
document.addEventListener('keydown', (e) => {
  const ctrl = e.ctrlKey || e.metaKey;
  if (ctrl && e.key === 'Enter') {
    e.preventDefault();
    if (!$('compose').classList.contains('hidden')) $('go').click();
    else if (document.activeElement === $('renote')) $('rerun').click();
    else send();
    return;
  }
  if (ctrl && e.key.toLowerCase() === 's') {
    e.preventDefault();
    if (current && !$('save').disabled) saveMp4();
    return;
  }
  if (isTyping()) return;
  const inProject = Boolean(current);
  if (e.key === '?') return help.classList.toggle('hidden');
  if (e.key === 'Escape') {
    help.classList.add('hidden');
    selected = null;
    return renderTimeline();
  }
  if (e.key === 'n' || e.key === 'N') return showCompose();
  if (!inProject) return;
  if (ctrl && e.key.toLowerCase() === 'z') return e.preventDefault(), undoEdit();
  const step = e.shiftKey ? 1 : 1 / 30;
  switch (e.key) {
    case ' ': e.preventDefault(); playPause(); break;
    case 'k': case 'K': v.pause(); break;
    case 'j': case 'J': v.currentTime = Math.max(0, v.currentTime - 5); break;
    case 'l': case 'L': v.currentTime = Math.min(v.duration || 0, v.currentTime + 5); break;
    case 'ArrowLeft': e.preventDefault(); v.pause(); v.currentTime = Math.max(0, v.currentTime - step); break;
    case 'ArrowRight': e.preventDefault(); v.pause(); v.currentTime = Math.min(v.duration || 0, v.currentTime + step); break;
    case 'b': case 'B': toggleAB(); break;
    case 'Delete': case 'Backspace': deleteSelected(); break;
    case '/': e.preventDefault(); $('ask').focus(); break;
    case '1': tab('live'); break;
    case '2': tab('quality'); break;
    case '3': tab('youtube'); break;
    default:
  }
});

// ---------- events from the engine ----------
kimo.onProject((p) => {
  const i = library.findIndex((x) => x.id === p.id);
  const was = i >= 0 ? library[i].status : null;
  if (i >= 0) library[i] = p;
  else library.unshift(p);
  renderLibrary();
  if (p.id === current) renderProject();
  if (p.status === 'done' && was === 'running') {
    if (p.id !== current) toast(`${p.name} is ready`, { label: 'Open', run: () => ($('toast').classList.add('hidden'), openProject(p.id)) });
    else toast('Render ready · Quality and YouTube tabs updated');
  }
});
kimo.onEvent((ev) => ev.id === current && addEvent(ev));
kimo.onProgress(({ id, label, f }) => id === 'model' && toast(`${label} · ${Math.round(f * 100)}%`));
kimo.onUpdate(({ version }) => toast(`kimo ${version} is ready to install`, { label: 'Restart', run: () => kimo.installUpdate() }));

(async () => {
  await health().catch((e) => toast(`Engine check failed: ${e.message}`));
  library = await kimo.library();
  renderLibrary();
  renderFiles();
})();
