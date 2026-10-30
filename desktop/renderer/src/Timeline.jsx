import { useEffect, useMemo, useRef, useState } from 'react';
import { Undo2, X, Check } from 'lucide-react';
import { Button } from '@web/components/ui/button';
import { kimo, fmtTime, fmtTc, busy } from './lib.js';
import { toTimeline } from '../../edl.mjs';

const clipKind = (c) => (/^text:/.test(c.src ?? '') ? 'text' : /\.(mp3|wav|m4a|aac|flac|ogg)$/i.test(c.src ?? '') ? 'audio' : /\.(png|jpe?g|webp|gif)$/i.test(c.src ?? '') ? 'image' : /\./.test(c.src ?? '') ? 'video' : 'fx');
const tlDuration = (t) => Math.max(1, Number(t?.duration) || 0, ...(t?.tracks_bottom_to_top ?? []).flatMap((k) => k.clips.map((c) => c.end)));
const clone = (x) => JSON.parse(JSON.stringify(x));
const trackLabel = (k, i, counts) => {
  const kinds = k.clips.map(clipKind);
  const kind = kinds.includes('text') ? 'T' : kinds.includes('audio') ? 'A' : kinds.includes('video') || kinds.includes('image') ? 'V' : 'FX';
  counts[kind] = (counts[kind] ?? 0) + 1;
  return `${kind}${counts[kind]}`;
};
const label = (c) => (clipKind(c) === 'text' ? c.src.replace(/^text:\s*/, '') : String(c.src || c.id).split(/[\\/]/).pop());

export function Timeline({ project, live, video, time, orig, guard, notify, setLibrary }) {
  const model = useMemo(() => project.edl ? toTimeline(project.edl) : null, [project.edl]);
  const [tl, setTl] = useState(model);
  const [draft, setDraft] = useState(null);
  const [edits, setEdits] = useState([]);
  const [undo, setUndo] = useState([]);
  const [selected, setSelected] = useState(null);
  const [editingText, setEditingText] = useState(null);
  const seen = useRef(new Set());
  const area = useRef(null);
  const drag = useRef(null);
  const [, force] = useState(0);
  const isBusy = busy(project);

  useEffect(() => {
    if (live?.data?.edl && !edits.length) setTl(toTimeline(live.data.edl));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [live?.n]);
  useEffect(() => {
    if (model && !edits.length && !live) setTl(model);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [model]);
  useEffect(() => {
    if(model || !kimo.edl)return;
    let active=true;
    kimo.edl(project.id).then(edl=>{if(active&&edl)setTl(toTimeline(edl));}).catch(error=>notify(String(error.message??error)));
    return()=>{active=false;};
  },[project.id,model,notify]);

  const view = draft ?? tl;
  const dur = tlDuration(view);
  const tracks = view?.tracks_bottom_to_top ?? [];
  const animate = Boolean(live?.animate);
  useEffect(() => {
    for (const k of tracks) for (const c of k.clips) seen.current.add(c.id);
  });

  const canEdit = () => {
    if (isBusy) return notify('kimo is still editing. wait for it to finish'), false;
    if (!project.projectFile) return notify('re-run this edit once to unlock the timeline editor'), false;
    return true;
  };
  const findClip = (id, t) => {
    for (const k of t?.tracks_bottom_to_top ?? []) {
      const c = k.clips.find((x) => x.id === id);
      if (c) return { c, k };
    }
    return null;
  };
  const snapshot = () => {
    setUndo((u) => [...u, { draft: clone(draft ?? tl), edits: [...edits] }]);
    return draft ? clone(draft) : clone(tl);
  };
  const pushEdit = (list, op) => {
    const i = list.findIndex((e) => e.tool === op.tool && e.args.clip_id === op.args.clip_id && op.tool !== 'delete_clip');
    const n = [...list];
    if (i >= 0) n[i] = op;
    else n.push(op);
    return n;
  };
  const snap = (v, t, ignore) => {
    let best = Math.round(v * 20) / 20;
    for (const k of t.tracks_bottom_to_top) for (const c of k.clips) if (c.id !== ignore) for (const e of [c.start, c.end]) if (Math.abs(e - v) < 0.08) best = e;
    return Math.max(0, best);
  };

  const onDown = (e, c) => {
    if (e.target.tagName === 'INPUT') return;
    setSelected(c.id);
    const r = e.currentTarget.getBoundingClientRect();
    const edge = e.clientX - r.left < 7 ? 'left' : r.right - e.clientX < 7 ? 'right' : 'move';
    drag.current = { id: c.id, edge, x0: e.clientX, pxPerS: area.current.clientWidth / dur, moved: false };
    e.currentTarget.setPointerCapture(e.pointerId);
  };
  const onMove = (e) => {
    const d = drag.current;
    if (!d) return;
    const dx = e.clientX - d.x0;
    if (!d.moved && Math.abs(dx) < 3) return;
    if (!d.moved) {
      if (!canEdit()) return (drag.current = null);
      d.moved = true;
      d.work = snapshot();
      d.orig = { ...findClip(d.id, d.work).c };
    }
    const t = d.work;
    const { c } = findClip(d.id, t);
    const o = d.orig;
    const ds = dx / d.pxPerS;
    const len = o.end - o.start;
    if (d.edge === 'move') {
      c.start = snap(o.start + ds, t, c.id);
      c.end = c.start + len;
    } else if (d.edge === 'right') c.end = Math.max(c.start + 0.2, snap(o.end + ds, t, c.id));
    else {
      let s = Math.min(o.end - 0.2, snap(o.start + ds, t, c.id));
      if (o.in != null) s = Math.max(s, o.start - o.in);
      c.start = s;
      if (o.in != null) c.in = o.in + (s - o.start);
    }
    setDraft({ ...t });
  };
  const onUp = () => {
    const d = drag.current;
    drag.current = null;
    if (!d?.moved) return;
    const t = d.work;
    const { c } = findClip(d.id, t);
    c.edited = true;
    const r3 = (v) => +v.toFixed(3);
    let n = edits;
    if (d.edge === 'move') n = pushEdit(n, { tool: 'move_clip', args: { clip_id: c.id, start: r3(c.start) } });
    else {
      if (d.edge === 'left') n = pushEdit(n, { tool: 'move_clip', args: { clip_id: c.id, start: r3(c.start) } });
      n = pushEdit(n, { tool: 'trim_clip', args: { clip_id: c.id, duration: r3(c.end - c.start), ...(c.in != null ? { in_point: r3(c.in) } : {}) } });
    }
    setDraft({ ...t });
    setEdits(n);
  };
  const commitText = (c, text) => {
    setEditingText(null);
    const old = c.src.replace(/^text:\s*/, '');
    if (!text || text === old) return;
    const t = snapshot();
    const hit = findClip(c.id, t).c;
    hit.src = `text: ${text}`;
    hit.edited = true;
    setDraft(t);
    setEdits((n) => pushEdit(n, { tool: 'edit_caption', args: { clip_id: c.id, text } }));
  };
  const deleteSelected = () => {
    if (!selected || !canEdit()) return;
    const t = snapshot();
    const hit = findClip(selected, t);
    if (!hit) return;
    hit.k.clips = hit.k.clips.filter((x) => x.id !== selected);
    setEdits((n) => [...n.filter((x) => x.args.clip_id !== selected), { tool: 'delete_clip', args: { clip_id: selected } }]);
    setDraft(t);
    setSelected(null);
  };
  const undoEdit = () => {
    setUndo((u) => {
      const s = u.at(-1);
      if (!s) return u;
      setDraft(s.edits.length ? s.draft : null);
      setEdits(s.edits);
      return u.slice(0, -1);
    });
  };
  const discard = () => {
    setDraft(null);
    setEdits([]);
    setUndo([]);
  };
  const applyEdits = guard(async () => {
    const p = await kimo.apply({ id: project.id, ops: edits });
    if (p) {
      setLibrary((l) => l.map((x) => (x.id === p.id ? { ...x, ...p } : x)));
      discard();
    }
  });

  useEffect(() => {
    const onKey = (e) => {
      if (['TEXTAREA', 'INPUT', 'SELECT'].includes(document.activeElement?.tagName)) return;
      const ctrl = e.ctrlKey || e.metaKey;
      if (ctrl && e.key.toLowerCase() === 'z') return e.preventDefault(), undoEdit();
      if (e.key === 'Delete' || e.key === 'Backspace') return deleteSelected();
      if (e.key === 'Escape') setSelected(null);
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  });

  const ticks = useMemo(() => {
    const stepS = dur > 600 ? 60 : dur > 120 ? 15 : dur > 40 ? 5 : dur > 12 ? 2 : 1;
    const out = [];
    for (let s = 0; s < dur; s += stepS) out.push(s);
    return out;
  }, [dur]);
  const seek = (e) => {
    const r = area.current.getBoundingClientRect();
    const v = video.current;
    if (v?.src) v.currentTime = Math.max(0, ((e.clientX - r.left) / r.width) * dur);
  };
  const n = tracks.reduce((a, k) => a + k.clips.length, 0);
  const counts = {};
  const rows = [...tracks].map((k, i) => ({ k, label: trackLabel(k, i, counts) })).reverse();
  const at = orig ? 0 : time || 0;

  return (
    <section className="studio-panel studio-timeline desk-timeline" aria-label="timeline">
      <div className="studio-timeline-toolbar desk-tl-toolbar">
        <span className="studio-heading">timeline</span>
        <span className="desk-fine mono">{tracks.length ? `${fmtTc(dur)} · ${n} clip${n === 1 ? '' : 's'} · ${tracks.length} track${tracks.length === 1 ? '' : 's'}` : ''}</span>
        {edits.length ? <span className="desk-unsaved">{edits.length} unsaved edit{edits.length === 1 ? '' : 's'}</span> : null}
        <span className="studio-spacer" />
        <span className="studio-tool-hint">drag to move · drag edges to trim · delete removes · double-click a caption to edit</span>
        <Button size="xs" variant="ghost" icon={Undo2} disabled={!undo.length} onClick={undoEdit} tooltip="undo timeline edit" shortcut="Ctrl Z">
          undo
        </Button>
        <Button size="xs" variant="ghost" icon={X} disabled={!edits.length} onClick={discard}>
          discard
        </Button>
        <Button size="xs" variant="primary" icon={Check} disabled={!edits.length || isBusy} onClick={applyEdits}>
          apply & re-render
        </Button>
      </div>
      {tracks.length ? (
        <div className="desk-tl-body">
          <div className="desk-tl-heads">
            <div className="desk-tl-ruler-gap" />
            {rows.map(({ k, label: l }) => (
              <div key={k.track_id} className="desk-tl-head">
                {l}
              </div>
            ))}
          </div>
          <div className="desk-tl-area" ref={area}>
            <div className="desk-tl-ruler" onClick={seek} role="slider" aria-label="seek" aria-valuemin={0} aria-valuemax={Math.round(dur)} aria-valuenow={Math.round(at)} tabIndex={0}>
              {ticks.map((s) => (
                <i key={s} style={{ left: `${(s / dur) * 100}%` }}>
                  {fmtTime(s)}
                </i>
              ))}
            </div>
            {rows.map(({ k }) => (
              <div key={k.track_id} className="desk-tl-track">
                {k.clips.map((c) => {
                  const kind = clipKind(c);
                  return (
                    <div
                      key={c.id}
                      className="desk-clip"
                      data-kind={kind}
                      data-sel={selected === c.id || undefined}
                      data-new={(animate && !seen.current.has(c.id)) || undefined}
                      data-edited={c.edited || undefined}
                      style={{ left: `${(c.start / dur) * 100}%`, width: `${Math.max(0.4, ((c.end - c.start) / dur) * 100)}%` }}
                      title={`${c.id} · ${c.start.toFixed(2)}–${c.end.toFixed(2)} s${c.in != null ? ` · from ${Number(c.in).toFixed(2)} s` : ''}`}
                      onPointerDown={(e) => onDown(e, c)}
                      onPointerMove={onMove}
                      onPointerUp={onUp}
                      onDoubleClick={() => kind === 'text' && canEdit() && setEditingText(c.id)}
                    >
                      {editingText === c.id ? (
                        <input
                          className="desk-clip-input"
                          autoFocus
                          defaultValue={label(c)}
                          onFocus={(e) => e.target.select()}
                          onKeyDown={(e) => {
                            e.stopPropagation();
                            if (e.key === 'Enter') commitText(c, e.currentTarget.value.trim());
                            if (e.key === 'Escape') setEditingText(null);
                          }}
                          onBlur={(e) => commitText(c, e.currentTarget.value.trim())}
                        />
                      ) : (
                        <span>{label(c)}</span>
                      )}
                    </div>
                  );
                })}
              </div>
            ))}
            <div className="desk-playhead" style={{ left: `${Math.min(100, (at / dur) * 100)}%` }} />
          </div>
        </div>
      ) : (
        <div className="desk-tl-empty">clips, titles and captions appear here as kimo adds them.</div>
      )}
    </section>
  );
}
