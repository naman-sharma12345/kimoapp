import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Play, Pause, SplitSquareHorizontal, Square, Trash2, Download, Minimize2, FolderOpen, Check, X, LoaderCircle, WandSparkles, ArrowUp, RotateCcw, Undo2, Copy, ImageDown, ChevronDown } from 'lucide-react';
import { Button } from '@web/components/ui/button';
import { Avatar } from '@web/components/ui/avatar';
import { Progress } from '@web/components/ui/progress';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@web/components/ui/tabs';
import { kimo, fmtTime, fmtTc, fmtBytes, fmtMs, fmtEta, media, STATUS, busy, isTyping, base } from './lib.js';
import { Timeline } from './Timeline.jsx';

/* ------------------------------------------------------------------ feed model */
function useFeed(project) {
  const running = useRef(false);
  running.current = project.status === 'running';
  const [feed, setFeed] = useState({ entries: [], script: '', frames: [], live: null, progress: null, quality: null, youtube: null, timeline: null, tick: 0 });
  const ref = useRef(feed);
  const apply = useCallback((ev, replay) => {
    const f = ref.current;
    const entries = f.entries;
    const next = { ...f };
    const push = (e) => (next.entries = [...entries, e]);
    switch (ev.t) {
      case 'op':
        if (ev.phase === 'start') push({ type: 'op', id: ev.id, title: ev.title, why: ev.why, tool: ev.tool, status: 'running', t0: replay ? 0 : Date.now() });
        else
          next.entries = entries.map((e) =>
            e.type === 'op' && e.id === ev.id ? { ...e, status: ev.ok ? 'done' : 'failed', ms: ev.ms, error: ev.error, result: !replay && ev.result ? String(ev.result).slice(0, 140) : e.result, t0: 0 } : e,
          );
        if (ev.phase === 'start' && !replay) next.liveTool = ev.tool;
        break;
      case 'frame':
        next.frames = [...f.frames, { image: ev.image, time: ev.time }].slice(-6);
        break;
      case 'preview':
        if (!replay) next.live = { image: ev.image, caption: `live · after ${ev.after} · ${Number(ev.time).toFixed(1)} s`, n: (f.live?.n ?? 0) + 1 };
        break;
      case 'timeline':
        next.timeline = { data: ev.timeline, animate: !replay, n: (f.timeline?.n ?? 0) + 1 };
        break;
      case 'progress':
        if (!replay) next.progress = { label: ev.label, f: ev.f, eta: ev.eta, estimated: ev.estimated, at: Date.now() };
        break;
      case 'think':
        push({ type: 'think', text: ev.text, stream: !replay });
        break;
      case 'quality':
        next.quality = ev;
        break;
      case 'youtube':
        next.youtube = ev.youtube;
        break;
      case 'run':
        push({ type: 'run', mode: ev.mode, text: ev.text || '' });
        break;
      case 'say':
        if (ev.kind === 'script') next.script = ev.text;
        else push({ type: 'say', text: ev.text });
        break;
      case 'status':
        push({ type: 'status', text: ev.text });
        if (!replay) next.liveTool = ev.text;
        break;
      default:
        if (ev.kind === 'script') next.script = ev.text;
    }
    ref.current = next;
    setFeed(next);
  }, []);
  const reset = useCallback(() => {
    ref.current = { entries: [], script: '', frames: [], live: null, progress: null, quality: null, youtube: null, timeline: null };
    setFeed(ref.current);
  }, []);
  useEffect(() => {
    let alive = true;
    reset();
    (async () => {
      const log = await kimo.log(project.id);
      if (!alive) return;
      for (const ev of log) apply(ev, true);
    })();
    // main.cjs sends { id: projectId, ...ev }, so an op event's own id replaces the
    // project id. Only one project edits at a time, so op events while this one is
    // running belong to it.
    const off = kimo.onEvent((ev) => (ev.id === project.id || (ev.t === 'op' && running.current)) && apply(ev, false));
    return () => {
      alive = false;
      off?.();
    };
  }, [project.id, apply, reset]);
  return feed;
}

/* ---------------------------------------------------------------- feed pieces */
function Streamed({ text, stream }) {
  const [n, setN] = useState(stream ? 0 : text.length);
  useEffect(() => {
    if (!stream || window.matchMedia('(prefers-reduced-motion: reduce)').matches) return setN(text.length);
    let i = 0;
    const step = Math.max(1, Math.ceil(text.length / 40));
    let raf;
    const tick = () => {
      i = Math.min(text.length, i + step);
      setN(i);
      if (i < text.length) raf = requestAnimationFrame(tick);
    };
    tick();
    return () => cancelAnimationFrame(raf);
  }, [text, stream]);
  return (
    <>
      {text.slice(0, n)}
      {n < text.length ? <span className="desk-caret" /> : null}
    </>
  );
}
function StepIcon({ status }) {
  return status === 'running' ? <LoaderCircle className="agent-spinner" size={14} aria-label="running" /> : status === 'done' ? <Check size={14} aria-label="done" /> : <X size={14} className="agent-failed" aria-label="failed" />;
}
function OpGroup({ ops, now }) {
  const [open, setOpen] = useState(false);
  const running = ops.find((o) => o.status === 'running');
  const last = running ?? ops.at(-1);
  const total = ops.reduce((a, o) => a + (o.ms ?? (o.t0 ? now - o.t0 : 0)), 0);
  const shown = open ? ops : ops.slice(-4);
  return (
    <div className="agent-action-group desk-group" data-running={running ? true : undefined}>
      <div className="agent-group-header">
        <div className="agent-group-summary">
          <WandSparkles size={14} aria-hidden />
          <button aria-expanded={open} onClick={() => setOpen(!open)}>
            {last?.title ?? 'editing'}
          </button>
          <span className="agent-duration">{total ? fmtMs(total) : '…'}</span>
          {ops.length > 4 ? (
            <button aria-label={open ? 'collapse steps' : `show all ${ops.length} steps`} aria-expanded={open} onClick={() => setOpen(!open)} className="desk-chev" data-open={open || undefined}>
              <ChevronDown size={14} />
            </button>
          ) : null}
        </div>
      </div>
      {!open && ops.length > 4 ? <div className="desk-more">{ops.length - 4} earlier steps</div> : null}
      {shown.map((o) => (
        <div key={o.id} className="agent-step desk-step" data-running={o.status === 'running' || undefined} data-failed={o.status === 'failed' || undefined}>
          <StepIcon status={o.status} />
          <span title={o.why ? `${o.title} — ${o.why}` : o.title}>
            {o.title}
            {o.why ? <em> — {o.why}</em> : null}
            {o.error ? <i className="desk-step-err">{o.error}</i> : o.result ? <i>{o.result}</i> : null}
          </span>
          <span className="desk-step-ms">{o.status === 'running' ? (o.t0 ? fmtMs(now - o.t0) : '…') : o.ms != null ? fmtMs(o.ms) : ''}</span>
        </div>
      ))}
    </div>
  );
}
function Feed({ feed, project, now }) {
  const scroll = useRef(null);
  const stick = useRef(true);
  const items = useMemo(() => {
    const out = [];
    for (const e of feed.entries) {
      if (e.type === 'op') {
        const prev = out.at(-1);
        if (prev?.type === 'ops') prev.ops.push(e);
        else out.push({ type: 'ops', ops: [e], key: `g${e.id}` });
      } else out.push(e);
    }
    return out;
  }, [feed.entries]);
  useEffect(() => {
    const el = scroll.current;
    if (el && stick.current) el.scrollTop = el.scrollHeight;
  });
  const opCount = feed.entries.filter((e) => e.type === 'op').length;
  return (
    <div
      className="agent-stream desk-stream"
      ref={scroll}
      onScroll={(e) => {
        const n = e.currentTarget;
        stick.current = n.scrollHeight - n.clientHeight - n.scrollTop < 120;
      }}
    >
      {!items.length ? (
        <div className="desk-feed-empty">
          <Avatar identity="agent" acting={busy(project)} />
          <p>{busy(project) ? 'kimo is getting ready…' : 'the activity of this edit appears here: kimo’s thinking, the edit script, every tool call with its timer, and the frames it checks.'}</p>
        </div>
      ) : null}
      {items.map((e, i) =>
        e.type === 'run' ? (
          e.mode === 'followup' || e.mode === 'edit' || !e.mode ? (
            <div key={i} className="agent-user">
              <div className="agent-user-bubble">
                <p>{e.text || (e.mode === 'followup' ? 'follow-up' : project.note || 'edit this video')}</p>
              </div>
              <small>{e.mode === 'followup' ? 'follow-up edit' : 'new edit'}</small>
            </div>
          ) : (
            <p key={i} className="agent-system">
              {e.mode === 'manual' ? 'timeline edit' : e.mode}
              {e.text ? `: ${e.text}` : ''}
            </p>
          )
        ) : e.type === 'think' ? (
          <div key={i} className="desk-agent">
            <Avatar identity="agent" acting={i === items.length - 1 && busy(project)} />
            <div className="agent-message-text">
              <Streamed text={e.text} stream={e.stream} />
            </div>
          </div>
        ) : e.type === 'ops' ? (
          <OpGroup key={e.key} ops={e.ops} now={now} />
        ) : e.type === 'say' ? (
          <div key={i} className="desk-agent desk-say">
            <span className="desk-avatar-gap" />
            <div className="agent-message-text">{e.text}</div>
          </div>
        ) : (
          <p key={i} className="agent-system">
            {e.text}
          </p>
        ),
      )}
      {feed.frames.length ? (
        <div className="desk-frames" aria-label="frames kimo checked">
          <span className="desk-fine">frames checked</span>
          <div>
            {feed.frames.map((f, i) => (
              <img key={i} src={f.image} alt={`frame at ${Number(f.time).toFixed(2)} s`} title={`frame at ${Number(f.time).toFixed(2)} s`} />
            ))}
          </div>
        </div>
      ) : null}
      <div className="desk-opcount">{opCount ? `${opCount} tool call${opCount === 1 ? '' : 's'}` : ''}</div>
    </div>
  );
}

/* --------------------------------------------------------------- inspector */
function QualityView({ q, passes }) {
  if (!q?.checks)
    return <p className="desk-fine desk-pad">measured after the render: resolution, bitrate, loudness, true peak, black frames, dead air.</p>;
  const m = q.final ?? q.m ?? {};
  const nums = [
    [m.width ? `${m.width}×${m.height}` : '—', 'resolution'],
    [m.fps ? `${m.fps}` : '—', 'fps'],
    [m.mbps ? `${m.mbps} Mbps` : '—', 'video bitrate'],
    [m.lufs != null ? `${m.lufs} LUFS` : '—', 'loudness'],
    [m.truePeak != null ? `${m.truePeak} dBTP` : '—', 'true peak'],
    [m.bytes ? fmtBytes(m.bytes) : '—', m.duration ? `${fmtTc(m.duration)} file` : 'file'],
  ];
  return (
    <div className="desk-quality">
      <div className="desk-nums">
        {nums.map(([b, s]) => (
          <div key={s}>
            <b>{b}</b>
            <span>{s}</span>
          </div>
        ))}
      </div>
      <div className="desk-section-label">checks</div>
      <ul className="desk-checks">
        {q.checks.map((c, i) => (
          <li key={i} data-state={c.ok ? 'ok' : c.warn ? 'warn' : 'bad'}>
            <span className="desk-check-i">{c.ok ? <Check size={12} /> : c.warn ? '!' : <X size={12} />}</span>
            <span className="desk-check-l">{c.label}</span>
            <span className="desk-check-v">
              {c.value}
              <small>want {c.want}</small>
            </span>
          </li>
        ))}
      </ul>
      <div className="desk-section-label">ai frame checks</div>
      <ul className="desk-passes">
        {(passes ?? []).length ? (
          passes.map((p, i) => (
            <li key={i}>
              <b>pass {p.pass}</b> · <span data-v={p.verdict === 'clean' ? 'ok' : p.verdict ? 'warn' : undefined}>{p.verdict ?? 'not reviewed'}</span> · {p.lufs ?? '?'} LUFS before master
              {(p.faults ?? []).map((f, j) => (
                <small key={j}>· {f}</small>
              ))}
            </li>
          ))
        ) : (
          <li className="desk-fine">no ai frame check for this run.</li>
        )}
      </ul>
    </div>
  );
}
function YoutubeView({ y, project, guard, notify }) {
  if (!y) return <p className="desk-fine desk-pad">thumbnail, title, description and chapters appear when an ai edit finishes.</p>;
  const copy = (key) => guard(async () => (await kimo.copy(y[key] ?? ''), notify('copied')));
  return (
    <div className="desk-yt">
      {y.thumbnail ? (
        <figure className="desk-thumb">
          <img src={`${media(y.thumbnail)}&v=${project.updated ?? ''}`} alt="auto thumbnail" />
          <figcaption>
            <span className="desk-fine">auto thumbnail{y.thumbnail_text ? ` · “${y.thumbnail_text}”` : ''}</span>
            <Button size="xs" icon={ImageDown} onClick={guard(async () => { const f = await kimo.saveThumb(project.id); if (f) notify(`saved ${f}`); })}>
              save
            </Button>
          </figcaption>
        </figure>
      ) : null}
      {[
        ['title', y.title],
        ['description', y.description],
      ].map(([k, v]) => (
        <div key={k} className="desk-ytfield">
          <div className="desk-ytfield-h">
            <span className="desk-section-label">{k}</span>
            <Button size="xs" variant="ghost" icon={Copy} onClick={copy(k)}>
              copy
            </Button>
          </div>
          <pre>{v || '—'}</pre>
        </div>
      ))}
      <p className="desk-fine">{y.chapters?.length ? `${y.chapters.length} chapters included in the description` : 'no chapters: youtube needs 3+ sections of 10 s or more.'}</p>
    </div>
  );
}
function ExportView({ project, presets, styles, ready, isBusy, guard, notify, setLibrary }) {
  const [fmt, setFmt] = useState(project.preset);
  const [sty, setSty] = useState(project.style || 'auto');
  const [renote, setRenote] = useState('');
  const P = presets[project.preset];
  const save = guard(async () => { const f = await kimo.save({ id: project.id }); if (f) notify(`saved ${f}`); });
  const small = guard(async () => { const f = await kimo.save({ id: project.id, compress: true }); if (f) notify(`saved ${f}`); });
  const rerun = guard(async () => {
    const p = await kimo.rerun({ id: project.id, note: renote.trim() || undefined, preset: fmt, style: sty });
    if (p) {
      setLibrary((l) => l.map((x) => (x.id === p.id ? { ...x, ...p } : x)));
      setRenote('');
    }
  });
  return (
    <div className="desk-export">
      <div className="desk-export-card" data-ready={ready || undefined}>
        <div className="desk-export-h">
          <span className="studio-heading">youtube master</span>
          <span className="desk-fine">h.264 high · closed gop · aac 384k · −14 lufs</span>
        </div>
        <dl className="desk-rows">
          <div>
            <dt>format</dt>
            <dd>{P?.label ?? project.preset}</dd>
          </div>
          <div>
            <dt>frame</dt>
            <dd className="mono">{P ? `${P.width}×${P.height}` : '—'}</dd>
          </div>
          <div>
            <dt>bitrate</dt>
            <dd className="mono">{P?.mbps ? `${P.mbps} Mbps` : '—'}</dd>
          </div>
        </dl>
        <Button variant="primary" size="lg" icon={Download} disabled={!ready || isBusy} onClick={save} tooltip="save the youtube upload master" shortcut="Ctrl S" className="w-full">
          save mp4
        </Button>
        <div className="desk-export-row">
          <Button size="sm" icon={Minimize2} disabled={!ready || isBusy} onClick={small} tooltip="smaller copy for messaging (gpu when available)">
            small copy
          </Button>
          <Button size="sm" variant="ghost" icon={FolderOpen} disabled={!ready} onClick={() => kimo.reveal(project.output)}>
            show file
          </Button>
        </div>
      </div>
      <div className="desk-section-label">render again</div>
      <div className="desk-rerender">
        <label className="desk-select">
          <span>format</span>
          <select value={fmt} onChange={(e) => setFmt(e.target.value)}>
            {Object.entries(presets).map(([k, v]) => (
              <option key={k} value={k}>
                {v.label}
              </option>
            ))}
          </select>
        </label>
        <label className="desk-select">
          <span>style</span>
          <select value={sty} onChange={(e) => setSty(e.target.value)}>
            {Object.entries(styles).map(([k, v]) => (
              <option key={k} value={k}>
                {v}
              </option>
            ))}
          </select>
        </label>
        <textarea className="ui-textarea" rows={2} value={renote} onChange={(e) => setRenote(e.target.value)} placeholder="new note for a full re-run (optional)" aria-label="new note" />
        <Button size="sm" icon={RotateCcw} disabled={isBusy} onClick={rerun}>
          re-run from scratch
        </Button>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ studio */
export function Studio({ project: p, status, guard, notify, goHome, setLibrary, now }) {
  const feed = useFeed(p);
  const presets = status?.presets ?? {};
  const styles = status?.styles ?? { auto: 'Auto' };
  const video = useRef(null);
  const askRef = useRef(null);
  const [tab, setTab] = useState('export');
  const [ask, setAsk] = useState('');
  const [playing, setPlaying] = useState(false);
  const [t, setT] = useState({ cur: 0, dur: 0 });
  const [orig, setOrig] = useState(false);
  const [abBadge, setAbBadge] = useState(null);
  const [front, setFront] = useState(0);
  const [imgs, setImgs] = useState([null, null]);
  const [sending, setSending] = useState(false);
  const isBusy = busy(p);
  const ready = p.status !== 'running' && Boolean(p.output);
  const isVideo = p.files?.[0]?.kind === 'video';

  // live preview frames crossfade over the player
  useEffect(() => {
    if (!feed.live) return;
    const back = front ? 0 : 1;
    const img = new Image();
    img.onload = () => {
      setImgs((s) => {
        const n = [...s];
        n[back] = feed.live.image;
        return n;
      });
      setFront(back);
    };
    img.src = feed.live.image;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [feed.live?.n]);
  const showLive = isBusy && Boolean(feed.live);

  // player source
  const src = orig ? (isVideo ? media(p.files[0].path) : '') : ready ? `${media(p.output)}&v=${p.updated ?? ''}` : isVideo ? media(p.files[0].path) : '';
  useEffect(() => {
    const v = video.current;
    if (!v || v.dataset.src === src) return;
    const at = v.currentTime;
    const was = !v.paused;
    v.dataset.src = src;
    v.src = src;
    if (orig || abBadge) {
      v.addEventListener(
        'loadedmetadata',
        () => {
          v.currentTime = Math.min(at, (v.duration || at) - 0.05);
          if (was) v.play();
        },
        { once: true },
      );
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [src]);

  const playPause = useCallback(() => {
    const v = video.current;
    if (v?.src) v.paused ? v.play() : v.pause();
  }, []);
  const toggleAB = useCallback(() => {
    if (!p.output || !isVideo) return;
    setOrig((o) => {
      setAbBadge(!o ? 'before · original' : 'after · kimo edit');
      return !o;
    });
  }, [p.output, isVideo]);
  useEffect(() => {
    if (!abBadge || orig) return;
    const tm = setTimeout(() => setAbBadge(null), 1500);
    return () => clearTimeout(tm);
  }, [abBadge, orig]);

  const send = guard(async () => {
    const text = ask.trim();
    if (!text) return askRef.current?.focus();
    setSending(true);
    try {
      const np = await kimo.followup({ id: p.id, text });
      if (np) {
        setLibrary((l) => l.map((x) => (x.id === np.id ? { ...x, ...np } : x)));
        setAsk('');
      }
    } finally {
      setSending(false);
    }
  });
  const saveMp4 = guard(async () => { const f = await kimo.save({ id: p.id }); if (f) notify(`saved ${f}`); });
  const remove = guard(async () => {
    if (!confirm('delete this edit and its renders? your original files are not touched.')) return;
    await kimo.remove(p.id);
    setLibrary((l) => l.filter((x) => x.id !== p.id));
    goHome();
  });

  useEffect(() => {
    const onKey = (e) => {
      const ctrl = e.ctrlKey || e.metaKey;
      if (ctrl && e.key === 'Enter') {
        e.preventDefault();
        return send();
      }
      if (ctrl && e.key.toLowerCase() === 's') {
        e.preventDefault();
        if (ready && !isBusy) saveMp4();
        return;
      }
      if (isTyping() || ctrl) return;
      const v = video.current;
      const step = e.shiftKey ? 1 : 1 / 30;
      switch (e.key) {
        case ' ':
          e.preventDefault();
          playPause();
          break;
        case 'k':
        case 'K':
          v?.pause();
          break;
        case 'j':
        case 'J':
          if (v) v.currentTime = Math.max(0, v.currentTime - 5);
          break;
        case 'l':
        case 'L':
          if (v) v.currentTime = Math.min(v.duration || 0, v.currentTime + 5);
          break;
        case 'ArrowLeft':
          e.preventDefault();
          if (v) (v.pause(), (v.currentTime = Math.max(0, v.currentTime - step)));
          break;
        case 'ArrowRight':
          e.preventDefault();
          if (v) (v.pause(), (v.currentTime = Math.min(v.duration || 0, v.currentTime + step)));
          break;
        case 'b':
        case 'B':
          toggleAB();
          break;
        case '/':
          e.preventDefault();
          askRef.current?.focus();
          break;
        case '1':
          setTab('export');
          break;
        case '2':
          setTab('quality');
          break;
        case '3':
          setTab('youtube');
          break;
        default:
      }
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  });

  const prog = feed.progress && (feed.progress.f < 1 || Date.now() - feed.progress.at < 1800) && isBusy ? feed.progress : null;
  const quality = isBusy && feed.quality ? { final: feed.quality.m, checks: feed.quality.checks } : p.quality;
  const youtube = feed.youtube ?? p.youtube;
  const total = (p.files ?? []).reduce((a, f) => a + (f.duration || 0), 0);
  const P = presets[p.preset];
  const aspect = P ? `${P.width} / ${P.height}` : '16 / 9';
  const modeLabel = p.mode === 'captions' ? 'captions only (offline)' : p.mode === 'sam' ? 'subject effect' : `ai edit · ${(styles[p.style] ?? 'Auto').split(' (')[0].toLowerCase()}`;

  return (
    <div className="studio-workspace desk-workspace">
      <div className="studio-upper desk-upper">
        {/* activity */}
        <aside className="studio-panel studio-agent desk-agent-panel" aria-label="activity">
          <header className="studio-panel-header">
            <Avatar identity="agent" acting={isBusy} />
            <span className="studio-heading">activity</span>
            <span className="studio-spacer" />
            {p.status === 'running' && p.started ? <span className="agent-duration">{fmtMs(now - p.started)}</span> : p.took ? <span className="agent-duration">took {fmtMs(p.took)}</span> : null}
          </header>
          {feed.script ? (
            <details className="desk-script" open={isBusy || undefined}>
              <summary>edit script</summary>
              <pre>{feed.script}</pre>
            </details>
          ) : null}
          <Feed feed={feed} project={p} now={now} />
          <div className="agent-composer desk-ask">
            <textarea
              ref={askRef}
              className="ui-textarea"
              rows={2}
              value={ask}
              onChange={(e) => setAsk(e.target.value)}
              placeholder={isBusy ? 'kimo is editing. ask for a change when it is done' : 'ask kimo for a change: make the hook punchier, bigger captions…'}
              aria-label="ask kimo for a change"
              disabled={isBusy}
            />
            <Button variant="primary" size="sm" iconOnly icon={ArrowUp} aria-label="send" tooltip="send" shortcut="Ctrl ↵" disabled={isBusy || !ask.trim()} loading={sending} onClick={send} />
          </div>
        </aside>
        <span />

        {/* viewer */}
        <section className="studio-panel studio-viewer desk-viewer" aria-label="preview">
          <header className="studio-panel-header desk-viewer-head">
            <span className="desk-viewer-title">{p.name}</span>
            <span className="desk-chip" data-status={p.status} title={p.error || ''}>
              {p.status === 'failed' ? `failed: ${String(p.error || '').slice(0, 60)}` : STATUS[p.status]}
            </span>
            <span className="studio-spacer" />
            {isBusy ? (
              <Button size="sm" variant="secondary" icon={Square} onClick={guard(() => kimo.stop(p.id))}>
                stop
              </Button>
            ) : null}
            <Button size="sm" variant="ghost" iconOnly icon={Trash2} aria-label="delete edit" tooltip="delete edit" onClick={remove} />
          </header>
          {prog ? (
            <div className="desk-progress">
              <Progress thin value={prog.f} running label={prog.label} />
              <span>
                {prog.label} · {Math.round(Math.max(0, Math.min(1, prog.f)) * 100)}%{fmtEta(prog.eta, prog.estimated) ? ` · ${fmtEta(prog.eta, prog.estimated)}` : ''}
              </span>
            </div>
          ) : isBusy ? (
            <div className="studio-loading-line" />
          ) : null}
          <div className="studio-frame-area desk-frame-area">
            <div className="studio-frame desk-frame" style={{ aspectRatio: aspect }}>
              <video
                ref={video}
                preload="metadata"
                onClick={playPause}
                onPlay={() => setPlaying(true)}
                onPause={() => setPlaying(false)}
                onTimeUpdate={(e) => setT({ cur: e.currentTarget.currentTime, dur: e.currentTarget.duration || 0 })}
                onSeeked={(e) => setT({ cur: e.currentTarget.currentTime, dur: e.currentTarget.duration || 0 })}
                onLoadedMetadata={(e) => setT({ cur: e.currentTarget.currentTime, dur: e.currentTarget.duration || 0 })}
              />
              {imgs.map((s, i) => (s ? <img key={i} className="desk-live" data-show={(showLive && front === i) || undefined} src={s} alt="" /> : null))}
              {!src && !showLive ? <div className="desk-noout">the live preview appears here as kimo edits.</div> : null}
              {showLive ? (
                <div className="desk-badge">
                  <span className="ui-live-dot" />
                  {feed.liveTool ? `live · ${String(feed.liveTool).slice(0, 48)}` : feed.live.caption}
                </div>
              ) : null}
              {abBadge ? <div className="desk-ab" data-before={orig || undefined}>{abBadge}</div> : null}
            </div>
          </div>
          <div className="studio-transport desk-transport">
            <span className="studio-time">
              {fmtTc(t.cur)} <small>/ {fmtTc(t.dur)}</small>
            </span>
            <div className="studio-transport-controls">
              <Button variant="ghost" size="md" iconOnly icon={playing ? Pause : Play} aria-label={playing ? 'pause' : 'play'} tooltip={playing ? 'pause' : 'play'} shortcut="Space" onClick={playPause} />
            </div>
            <div className="studio-transport-extra">
              <Button size="sm" variant="ghost" icon={SplitSquareHorizontal} aria-pressed={orig} disabled={!(p.output && isVideo)} onClick={toggleAB} tooltip="before / after" shortcut="B">
                before / after
              </Button>
              <span className="desk-fine mono">{P ? `${P.width}×${P.height}` : ''}</span>
            </div>
          </div>
        </section>
        <span />

        {/* inspector */}
        <aside className="studio-panel studio-inspector desk-inspector" aria-label="inspector">
          <header className="studio-panel-header desk-insp-head">
            <div>
              <span className="studio-heading">inspector</span>
              <span className="desk-sub" title={p.note || ''}>
                {p.files.length} file{p.files.length > 1 ? 's' : ''} · {fmtTime(total)} source · {modeLabel}
              </span>
            </div>
          </header>
          {p.sam ? (
            <div className="desk-sam-chip">
              sam 3.1 · {p.sam.effect.replace('_', ' ')} on “{p.sam.prompt || 'person'}”
            </div>
          ) : null}
          <Tabs value={tab} onValueChange={setTab}>
            <TabsList aria-label="inspector views">
              <TabsTrigger value="export">export</TabsTrigger>
              <TabsTrigger value="quality">quality</TabsTrigger>
              <TabsTrigger value="youtube">youtube</TabsTrigger>
            </TabsList>
            <TabsContent value="export">
              <ExportView project={p} presets={presets} styles={styles} ready={ready} isBusy={isBusy} guard={guard} notify={notify} setLibrary={setLibrary} />
            </TabsContent>
            <TabsContent value="quality">
              <QualityView q={quality} passes={isBusy ? [] : p.quality?.passes} />
            </TabsContent>
            <TabsContent value="youtube">
              <YoutubeView y={isBusy ? feed.youtube : youtube} project={p} guard={guard} notify={notify} />
            </TabsContent>
          </Tabs>
        </aside>
      </div>
      <span />
      <Timeline project={p} live={feed.timeline} video={video} time={t.cur} orig={orig} guard={guard} notify={notify} setLibrary={setLibrary} />
    </div>
  );
}
