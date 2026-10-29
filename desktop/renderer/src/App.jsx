import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Plus, Settings2, Keyboard } from 'lucide-react';
import { Button } from '@web/components/ui/button';
import { Kbd } from '@web/components/ui/kbd';
import { kimo, cleanErr, fmtMs, isTyping, busy } from './lib.js';
import { Home } from './Home.jsx';
import { Studio } from './Studio.jsx';
import { Settings } from './Settings.jsx';

const SHORTCUTS = [
  ['Space', 'play / pause'],
  ['J K L', 'back 5 s · pause · forward 5 s'],
  ['← →', 'one frame (shift: 1 s)'],
  ['B', 'before / after'],
  ['Delete', 'remove the selected clip'],
  ['Ctrl Z', 'undo a timeline edit'],
  ['Ctrl Enter', 'send · start'],
  ['Ctrl S', 'save the youtube master'],
  ['/', 'ask kimo for a change'],
  ['1 2 3', 'export · quality · youtube'],
  ['N', 'new edit'],
  [',', 'settings'],
  ['Esc', 'deselect · close'],
];

export function App() {
  const [status, setStatus] = useState(null);
  const [library, setLibrary] = useState([]);
  const [current, setCurrent] = useState(null);
  const [view, setView] = useState('home');
  const [toast, setToast] = useState(null);
  const [help, setHelp] = useState(false);
  const [update, setUpdate] = useState(null);
  const [model, setModel] = useState(null);
  const [now, setNow] = useState(Date.now());
  const libRef = useRef(library);
  libRef.current = library;
  const curRef = useRef(current);
  curRef.current = current;

  const notify = useCallback((text, action, sticky = false) => {
    setToast({ text, action, id: Math.random(), sticky: sticky || Boolean(action) });
  }, []);
  const guard = useCallback(
    (fn) =>
      async (...a) => {
        try {
          return await fn(...a);
        } catch (e) {
          notify(cleanErr(e));
        }
      },
    [notify],
  );

  useEffect(() => {
    if (!toast || toast.sticky) return;
    const t = setTimeout(() => setToast(null), 5000);
    return () => clearTimeout(t);
  }, [toast]);
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 250);
    return () => clearInterval(t);
  }, []);

  const refreshStatus = useCallback(async () => {
    const s = await kimo.status();
    setStatus(s);
    return s;
  }, []);

  const downloadModel = useCallback(async () => {
    setModel({ f: 0, label: 'downloading the captions model' });
    try {
      await kimo.downloadModel();
      notify('captions model ready');
      await refreshStatus();
    } catch (e) {
      notify(cleanErr(e));
    } finally {
      setModel(null);
    }
  }, [notify, refreshStatus]);

  useEffect(() => {
    (async () => {
      try {
        const s = await refreshStatus();
        if (s.whisper && !s.model) notify('captions need the whisper model (≈190 MB, one time).', { label: 'download', run: downloadModel });
      } catch (e) {
        notify(`engine check failed: ${cleanErr(e)}`);
      }
      setLibrary(await kimo.library());
    })();
    const offs = [
      kimo.onProject((p) => {
        const list = libRef.current;
        const was = list.find((x) => x.id === p.id)?.status;
        setLibrary((l) => (l.some((x) => x.id === p.id) ? l.map((x) => (x.id === p.id ? p : x)) : [p, ...l]));
        if (p.status === 'done' && was === 'running') {
          if (p.id !== curRef.current) notify(`${p.name} is ready`, { label: 'open', run: () => openProject(p.id) });
          else notify('render ready · quality and youtube updated');
        }
      }),
      kimo.onProgress(({ id, label, f }) => id === 'model' && setModel({ label, f })),
      kimo.onUpdate((u) => {
        setUpdate(u);
        notify(`kimo ${u.version} is ready to install`, { label: 'restart', run: () => kimo.installUpdate() });
      }),
    ];
    return () => offs.forEach((off) => off?.());
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const openProject = useCallback((id) => {
    setCurrent(id);
    setView('project');
    setToast(null);
  }, []);
  const goHome = useCallback(() => {
    setCurrent(null);
    setView('home');
  }, []);
  const patchProject = useCallback((p) => setLibrary((l) => l.map((x) => (x.id === p.id ? { ...x, ...p } : x))), []);

  useEffect(() => {
    const onKey = (e) => {
      if (isTyping()) return;
      if (e.ctrlKey || e.metaKey || e.altKey) return;
      if (e.key === '?') return setHelp((h) => !h);
      if (e.key === 'Escape') return setHelp(false);
      if (e.key === 'n' || e.key === 'N') return goHome();
      if (e.key === ',') return setView('settings');
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [goHome]);

  const project = library.find((p) => p.id === current);
  const running = library.filter((p) => p.status === 'running');
  const queued = library.filter((p) => p.status === 'queued');
  const live = view === 'project' && project?.status === 'running';

  const pill = useMemo(() => {
    if (live) return { state: 'editing', text: 'kimo is editing', small: project.started ? fmtMs(now - project.started) : '' };
    if (running.length) return { state: 'editing', text: `editing ${running[0].name}`, small: queued.length ? `+${queued.length} queued` : '' };
    if (queued.length) return { state: 'thinking', text: `${queued.length} queued`, small: '' };
    return null;
  }, [live, project, running, queued, now]);

  return (
    <main id="main" className="studio-shell desk-shell" data-view={view} data-ready="true">
      <header className="studio-topbar desk-topbar">
        <div className="studio-top-left">
          <button className="studio-mark desk-mark" aria-label="library" onClick={goHome} />
          <button className="desk-word" onClick={goHome}>kimo</button>
          {view === 'project' && project ? (
            <>
              <span className="desk-slash">/</span>
              <span className="studio-title desk-crumb" title={project.name}>{project.name}</span>
            </>
          ) : view === 'settings' ? (
            <>
              <span className="desk-slash">/</span>
              <span className="studio-title desk-crumb">settings</span>
            </>
          ) : null}
        </div>
        {pill ? (
          <div className="studio-top-center">
            <button
              className="studio-status-pill desk-pill"
              data-state={pill.state}
              onClick={() => (live ? null : openProject((running[0] ?? queued[0]).id))}
            >
              <span className="studio-status-dot" />
              {pill.text}
              {pill.small ? <small>{pill.small}</small> : null}
            </button>
          </div>
        ) : null}
        <div className="studio-top-right">
          {update ? (
            <Button size="sm" variant="secondary" onClick={() => kimo.installUpdate()}>
              restart to update
            </Button>
          ) : null}
          <Button size="sm" variant="ghost" iconOnly icon={Keyboard} aria-label="keyboard shortcuts" tooltip="keyboard shortcuts" shortcut="?" onClick={() => setHelp(true)} />
          <Button size="sm" variant="ghost" iconOnly icon={Settings2} aria-label="settings" tooltip="settings" shortcut="," onClick={() => setView('settings')} />
          {view !== 'home' ? (
            <Button size="sm" variant="primary" icon={Plus} onClick={goHome} tooltip="new edit" shortcut="N">
              new edit
            </Button>
          ) : null}
        </div>
      </header>

      {view === 'home' || (view === 'project' && !project) ? (
        <Home status={status} library={library} setLibrary={setLibrary} openProject={openProject} guard={guard} notify={notify} now={now} />
      ) : view === 'settings' ? (
        <Settings status={status} refresh={refreshStatus} model={model} downloadModel={downloadModel} update={update} guard={guard} />
      ) : (
        <Studio key={project.id} project={project} status={status} patchProject={patchProject} guard={guard} notify={notify} goHome={goHome} setLibrary={setLibrary} now={now} />
      )}

      <footer className="studio-statusbar desk-statusbar">
        <div>
          <span className="desk-health" data-ok={status?.kimo || undefined}>
            <i /> {status ? (status.kimo ? 'kimo v6 engine' : 'engine missing') : 'checking engine…'}
          </span>
          <span className="desk-health" data-ok={Boolean(status?.ffmpeg) || undefined}>
            <i /> {status?.ffmpeg ? `ffmpeg ${String(status.ffmpeg).split(/[ -]/)[0]}` : 'ffmpeg missing'}
          </span>
          <span className="desk-health" data-ok={Boolean(status?.whisper && status?.model) || undefined}>
            <i /> {status?.model ? 'offline captions' : 'captions model not downloaded'}
          </span>
          <span className="desk-health" data-ok={Boolean(status?.gpu) || undefined}>
            <i /> {status?.gpu ? `gpu ${String(status.gpu).replace('h264_', '')}` : 'cpu encode'}
          </span>
          {model ? <span>{model.label} · {Math.round(model.f * 100)}%</span> : null}
        </div>
        <div>
          <span>everything stays on this pc</span>
          <span>{status ? `v${status.version}` : ''}</span>
          <button className="studio-shortcuts-trigger" aria-label="keyboard shortcuts" onClick={() => setHelp(true)}>
            ?
          </button>
        </div>
      </footer>

      {help ? (
        <div className="desk-overlay" onClick={() => setHelp(false)} role="presentation">
          <div className="ui-dialog desk-sheet" data-size="md" role="dialog" aria-label="keyboard shortcuts" onClick={(e) => e.stopPropagation()}>
            <div className="ui-dialog-title">keyboard shortcuts</div>
            <div className="studio-shortcuts">
              {SHORTCUTS.map(([keys, description]) => (
                <div key={keys}>
                  <span>{description}</span>
                  <span className="desk-keys">
                    {keys.split(' ').map((k) => (
                      <Kbd key={k}>{k}</Kbd>
                    ))}
                  </span>
                </div>
              ))}
            </div>
            <div className="ui-dialog-actions">
              <Button onClick={() => setHelp(false)}>close</Button>
            </div>
          </div>
        </div>
      ) : null}

      {toast ? (
        <div className="desk-toast" role="status" key={toast.id}>
          <span>{toast.text}</span>
          {toast.action ? (
            <Button
              size="xs"
              variant="primary"
              onClick={() => {
                setToast(null);
                toast.action.run();
              }}
            >
              {toast.action.label}
            </Button>
          ) : null}
          <button className="desk-toast-x" aria-label="dismiss" onClick={() => setToast(null)}>
            ×
          </button>
        </div>
      ) : null}
    </main>
  );
}
