import { useEffect, useRef, useState } from 'react';
import { FilePlus2, FolderPlus, X, Film, AudioLines, Image as ImageIcon, ScanSearch, ArrowUp, Layers } from 'lucide-react';
import { Button } from '@web/components/ui/button';
import { SegmentedControl } from '@web/components/ui/segmented-control';
import { Toggle } from '@web/components/ui/toggle';
import { Pill } from '@web/components/ui/pill';
import { kimo, fmtTime, fmtBytes, fmtMs, base, STATUS, SAM_EFFECTS, busy } from './lib.js';

const MODES = [
  { value: 'ai', label: 'ai edit' },
  { value: 'captions', label: 'captions only' },
  { value: 'sam', label: 'subject effect only' },
];
const MODE_HINT = {
  ai: 'script → build live → check 18 frames → fix',
  captions: 'fully offline, whisper on this pc',
  sam: 'runs only the subject effect below',
};
const KIND_ICON = { video: Film, audio: AudioLines, image: ImageIcon };

export function Library({ library, current, openProject, presets = {}, now }) {
  return (
    <aside className="studio-panel desk-library" aria-label="library">
      <header className="studio-panel-header">
        <span className="studio-heading">library</span>
        <span className="studio-spacer" />
        <span className="desk-count">{library.length || ''}</span>
      </header>
      <ul className="desk-lib-list">
        {library.length ? (
          library.map((p) => (
            <li key={p.id}>
              <button className="desk-lib-item" data-status={p.status} data-on={current === p.id || undefined} onClick={() => openProject(p.id)}>
                <span className="desk-lib-dot" aria-hidden />
                <span className="desk-lib-name">{p.name}</span>
                <span className="desk-lib-meta">
                  {p.status === 'running' && p.started ? `editing · ${fmtMs(now - p.started)}` : STATUS[p.status] || p.status}
                  {' · '}
                  {(presets[p.preset]?.label || p.preset || '').split(' ·')[0].toLowerCase()}
                </span>
              </button>
            </li>
          ))
        ) : (
          <li className="desk-empty-lib">your edits appear here.</li>
        )}
      </ul>
    </aside>
  );
}

export function SubjectEffects({ sam, setSam, video, guard, compact = false }) {
  const [preview, setPreview] = useState(null);
  const [looking, setLooking] = useState(false);
  const set = (k, v) => setSam((s) => ({ ...s, [k]: v }));
  const effect = SAM_EFFECTS.find((e) => e.value === sam.effect);
  const find = guard(async () => {
    if (!video) throw new Error('add a video first');
    setLooking(true);
    setPreview({ info: 'sam 3.1 is looking…' });
    try {
      const prompt = sam.prompt.trim() || 'person';
      const r = await kimo.samPreview({ file: video.path, prompt, time: Math.min(1, (video.duration || 2) / 2) });
      setPreview({
        image: r.image,
        info: r.objects ? `${r.objects} match${r.objects === 1 ? '' : 'es'} for “${prompt}”. the largest, most central one is the subject.` : 'no match on this frame. try another word.',
      });
    } finally {
      setLooking(false);
    }
  });
  return (
    <section className="desk-sam" data-compact={compact || undefined} aria-label="subject effects">
      <header className="desk-sam-head">
        <ScanSearch size={16} strokeWidth={1.5} aria-hidden />
        <span className="studio-heading">subject effects</span>
        <Pill>meta sam 3.1</Pill>
        <span className="studio-spacer" />
        <span className="desk-fine">a downscaled copy of the clip segment goes to meta via kimo</span>
      </header>
      <div className="desk-sam-body">
        <div className="desk-sam-controls">
          <label className="ui-field desk-field">
            <span>object</span>
            <input className="ui-input" value={sam.prompt} maxLength={80} placeholder="person, dog, face, license plate…" onChange={(e) => set('prompt', e.target.value)} />
          </label>
          <div className="desk-effects" role="radiogroup" aria-label="effect">
            <button role="radio" aria-checked={!sam.effect} className="desk-effect" data-on={!sam.effect || undefined} onClick={() => set('effect', '')}>
              <b>none</b>
              <small>no subject effect</small>
            </button>
            {SAM_EFFECTS.map((e) => (
              <button key={e.value} role="radio" aria-checked={sam.effect === e.value} className="desk-effect" data-on={sam.effect === e.value || undefined} onClick={() => set('effect', e.value)}>
                <b>{e.label}</b>
                <small>{e.hint}</small>
              </button>
            ))}
          </div>
          {effect ? (
            <div className="desk-sam-extra">
              {sam.effect === 'text_behind' ? (
                <label className="ui-field desk-field">
                  <span>text</span>
                  <input className="ui-input" value={sam.text} maxLength={40} placeholder="ONE WORD" onChange={(e) => set('text', e.target.value)} />
                </label>
              ) : null}
              {sam.effect === 'bg_color' || sam.effect === 'text_behind' ? (
                <label className="ui-field desk-field desk-color">
                  <span>colour</span>
                  <input type="color" value={sam.color} onChange={(e) => set('color', e.target.value)} />
                </label>
              ) : null}
              {sam.effect === 'bg_image' ? (
                <Button size="sm" onClick={guard(async () => set('image', await kimo.pickImage()))}>
                  {sam.image ? base(sam.image) : 'choose image'}
                </Button>
              ) : null}
              <label className="desk-toggle-row">
                <Toggle aria-label="punch-ins on the subject" checked={sam.punch} onCheckedChange={(v) => set('punch', v)} />
                <span>punch-ins on the subject</span>
              </label>
            </div>
          ) : null}
          <div className="desk-sam-actions">
            <Button size="sm" variant="secondary" loading={looking} onClick={find} disabled={!video}>
              show masks
            </Button>
            {!video ? <span className="desk-fine">add a video to preview masks</span> : null}
          </div>
        </div>
        <div className="desk-mask" data-empty={!preview?.image || undefined}>
          <div className="desk-mask-frame editor-mask-checkerboard">{preview?.image ? <img src={preview.image} alt="sam masks" /> : <span>mask preview</span>}</div>
          <p className="desk-fine">{preview?.info ?? 'type an object and press show masks to see what sam 3.1 picks.'}</p>
        </div>
      </div>
    </section>
  );
}

export function Home({ status, library, setLibrary, openProject, guard, notify, now }) {
  const [staged, setStaged] = useState([]);
  const [note, setNote] = useState('');
  const [preset, setPreset] = useState(localStorage.preset || 'youtube');
  const [style, setStyle] = useState(localStorage.style || 'auto');
  const [mode, setMode] = useState(localStorage.mode || 'ai');
  const [batch, setBatch] = useState(false);
  const [over, setOver] = useState(false);
  const [samOpen, setSamOpen] = useState(false);
  const [sam, setSam] = useState({ prompt: 'person', effect: '', text: '', color: '#111111', image: null, punch: false });
  const [starting, setStarting] = useState(false);
  const noteRef = useRef(null);
  const presets = status?.presets ?? {};
  const styles = status?.styles ?? { auto: 'Auto' };

  const addFiles = (files) =>
    setStaged((s) => {
      const known = new Set(s.map((f) => f.path));
      const fresh = files.filter((f) => !known.has(f.path));
      if (!files.length) notify('no video, audio or image files found there');
      return [...s, ...fresh];
    });

  useEffect(() => {
    const prevent = (e) => {
      e.preventDefault();
      if (e.type === 'dragenter' || e.type === 'dragover') setOver(true);
      if (e.type === 'drop' || (e.type === 'dragleave' && e.relatedTarget === null)) setOver(false);
    };
    const onDrop = guard(async (e) => {
      const paths = kimo.pathsOf(e.dataTransfer.files);
      if (paths.length) addFiles(await kimo.expand(paths));
    });
    const evs = ['dragenter', 'dragover', 'dragleave', 'drop'];
    evs.forEach((ev) => document.addEventListener(ev, prevent));
    document.addEventListener('drop', onDrop);
    return () => {
      evs.forEach((ev) => document.removeEventListener(ev, prevent));
      document.removeEventListener('drop', onDrop);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const samChoice = sam.effect ? { effect: sam.effect, prompt: sam.prompt.trim() || 'person', text: sam.text.trim(), color: sam.color, image: sam.image, punch: sam.punch } : undefined;
  const start = guard(async () => {
    if (!staged.length) return;
    if (mode === 'sam' && !samChoice) {
      setSamOpen(true);
      throw new Error('pick a subject effect first');
    }
    if (samChoice?.effect === 'bg_image' && !samChoice.image) throw new Error('choose a background image first');
    localStorage.preset = preset;
    localStorage.style = style;
    localStorage.mode = mode;
    setStarting(true);
    try {
      const made = await kimo.create({ files: staged, note: note.trim(), preset, style, mode, batch: batch && staged.length > 1, sam: samChoice });
      setLibrary((l) => [...made, ...l.filter((x) => !made.some((m) => m.id === x.id))]);
      setStaged([]);
      setNote('');
      if (made.length > 1) notify(`${made.length} videos queued. kimo edits them one after another`);
      openProject(made[0].id);
    } finally {
      setStarting(false);
    }
  });
  useEffect(() => {
    const onKey = (e) => {
      if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
        e.preventDefault();
        start();
      }
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  });
  useEffect(() => {
    if (mode === 'sam') setSamOpen(true);
  }, [mode]);

  const video = staged.find((f) => f.kind === 'video');
  const queue = library.filter((p) => busy(p));
  const total = staged.reduce((a, f) => a + (f.duration || 0), 0);

  return (
    <div className="desk-home">
      <Library library={library} openProject={openProject} presets={presets} now={now} />
      <section className="studio-panel desk-compose" aria-label="new edit">
        <div className="desk-compose-inner">
          <h1 className="desk-display">
            tell it the <em>video.</em>
          </h1>
          <p className="desk-lede">drop your footage, say what you want. kimo cuts, captions, grades and scores it on this pc while you watch.</p>

          <div className="desk-drop" data-over={over || undefined} data-has={staged.length > 0 || undefined} tabIndex={0}>
            {staged.length ? (
              <ul className="desk-files">
                {staged.map((f, i) => {
                  const Icon = KIND_ICON[f.kind] ?? Film;
                  return (
                    <li key={f.path} className="desk-file">
                      <span className="desk-file-icon">
                        <Icon size={16} strokeWidth={1.5} />
                      </span>
                      <span className="desk-file-name" title={f.path}>
                        {base(f.path)}
                      </span>
                      <span className="desk-file-meta">
                        {f.duration ? fmtTime(f.duration) : '—'}
                        {f.width ? ` · ${f.width}×${f.height}` : ''} · {fmtBytes(f.bytes)}
                      </span>
                      <button className="desk-file-x" aria-label={`remove ${base(f.path)}`} onClick={() => setStaged((s) => s.filter((_, j) => j !== i))}>
                        <X size={14} />
                      </button>
                    </li>
                  );
                })}
              </ul>
            ) : (
              <div className="desk-drop-empty">
                <b>drop videos or folders</b>
                <span>long videos and 4k are fine. everything stays on this pc.</span>
              </div>
            )}
            <div className="desk-drop-actions">
              <Button size="sm" icon={FilePlus2} onClick={guard(async () => addFiles(await kimo.pick(false)))}>
                choose files
              </Button>
              <Button size="sm" variant="ghost" icon={FolderPlus} onClick={guard(async () => addFiles(await kimo.pick(true)))}>
                choose folder
              </Button>
              {staged.length ? (
                <span className="desk-fine desk-push">
                  {staged.length} file{staged.length > 1 ? 's' : ''} · {fmtTime(total)}
                </span>
              ) : null}
            </div>
          </div>

          <div className="agent-composer desk-composer">
            <textarea
              ref={noteRef}
              className="ui-textarea desk-note"
              rows={3}
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="what should kimo make? e.g. a punchy youtube video with a strong hook, no dead air, word captions and a clean grade"
              aria-label="what should kimo make"
            />
            <div className="desk-composer-row">
              <label className="desk-select">
                <span>format</span>
                <select value={preset} onChange={(e) => setPreset(e.target.value)}>
                  {Object.entries(presets).map(([k, v]) => (
                    <option key={k} value={k}>
                      {v.label}
                    </option>
                  ))}
                </select>
              </label>
              <label className="desk-select" data-disabled={mode !== 'ai' || undefined}>
                <span>style</span>
                <select value={style} onChange={(e) => setStyle(e.target.value)} disabled={mode !== 'ai'}>
                  {Object.entries(styles).map(([k, v]) => (
                    <option key={k} value={k}>
                      {v}
                    </option>
                  ))}
                </select>
              </label>
              <span className="studio-spacer" />
              <Button variant="primary" size="md" icon={ArrowUp} disabled={!staged.length} loading={starting} onClick={start} tooltip="start" shortcut="Ctrl ↵">
                edit with kimo
              </Button>
            </div>
          </div>

          <div className="desk-options">
            <SegmentedControl aria-label="mode" options={MODES} value={mode} onValueChange={setMode} />
            <span className="desk-fine">{MODE_HINT[mode]}</span>
            <span className="studio-spacer" />
            {staged.length > 1 ? (
              <label className="desk-toggle-row">
                <Toggle aria-label="batch" checked={batch} onCheckedChange={setBatch} />
                <span>
                  <Layers size={14} strokeWidth={1.5} aria-hidden /> batch: edit each file separately
                </span>
              </label>
            ) : null}
            <Button size="sm" variant={samOpen ? 'secondary' : 'ghost'} icon={ScanSearch} onClick={() => setSamOpen((o) => !o)} aria-expanded={samOpen}>
              subject effects{sam.effect ? ` · ${SAM_EFFECTS.find((e) => e.value === sam.effect)?.label}` : ''}
            </Button>
          </div>

          {samOpen ? <SubjectEffects sam={sam} setSam={setSam} video={video} guard={guard} /> : null}

          {queue.length ? (
            <div className="desk-queue">
              <span className="studio-heading">queue</span>
              {queue.map((p) => (
                <button key={p.id} className="desk-queue-item" data-status={p.status} onClick={() => openProject(p.id)}>
                  <span className="desk-lib-dot" aria-hidden />
                  {p.name}
                  <small>{p.status === 'running' ? 'editing now' : 'waiting'}</small>
                </button>
              ))}
            </div>
          ) : null}
        </div>
      </section>
    </div>
  );
}
