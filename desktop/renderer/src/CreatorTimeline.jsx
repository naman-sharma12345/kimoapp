import { rate } from '../../edl.mjs';
import { useEffect, useMemo, useRef, useState } from 'react';
import { Button } from '@web/components/ui/button';
import {
  Undo2,
  Redo2,
  VolumeX,
  EyeOff,
  Headphones,
  Copy,
  Trash2,
} from 'lucide-react';
import { studioTracks } from '../../studio-model.mjs';
import { captionIds } from './creator-ui.js';
import { fmtTc, isTyping } from './lib.js';
function CaptionEditor({ clip, patch, disabled }) {
  const [text, setText] = useState(clip.props.text);
  useEffect(() => setText(clip.props.text), [clip.id, clip.props.text]);
  return (
    <form
      className="creator-caption-editor"
      aria-label="caption chunk editor"
      onSubmit={(e) => {
        e.preventDefault();
        patch({ type: 'caption', clip_id: clip.id, text });
      }}
    >
      <input
        className="ui-input"
        aria-label="caption text"
        value={text}
        maxLength={300}
        disabled={disabled}
        onChange={(e) => setText(e.target.value)}
      />
      <select
        className="ui-input"
        aria-label="chunk caption style"
        disabled={disabled}
        value={clip.props.style ?? 'kimo'}
        onChange={(e) =>
          patch({ type: 'caption', clip_id: clip.id, style: e.target.value })
        }
      >
        {captionIds.map((id) => (
          <option key={id}>{id}</option>
        ))}
      </select>
      <Button
        size="xs"
        type="submit"
        disabled={disabled || text === clip.props.text}
      >
        apply caption
      </Button>
      <div
        className="creator-word-accents"
        role="group"
        aria-label="word accents"
      >
        {clip.props.words?.map((w, i) => (
          <label key={i}>
            <input
              type="checkbox"
              disabled={disabled}
              checked={!!w.accent}
              onChange={(e) =>
                patch({
                  type: 'caption',
                  clip_id: clip.id,
                  word: i,
                  accent: e.target.checked,
                })
              }
            />
            {w.w}
          </label>
        ))}
      </div>
    </form>
  );
}
export function CreatorTimeline({
  project,
  video,
  time,
  patch,
  isBusy,
  notify,
}) {
  const [restoreChoices, setRestoreChoices] = useState(null);
  const edl = project.edl,
    tracks = useMemo(() => studioTracks(edl), [edl]),
    removedGroups = useMemo(() => {
      const groups = new Map();
      for (const r of edl.removed ?? []) {
        const key = Math.round(r.at * rate(edl.canvas.fps));
        if (!groups.has(key)) groups.set(key, []);
        groups.get(key).push(r);
      }
      return [...groups.values()];
    }, [edl]),
    total = Math.max(1, ...tracks.flatMap((t) => t.clips.map((c) => c.end))),
    [selected, setSelected] = useState(null),
    [selectedKey, setSelectedKey] = useState(null),
    area = useRef(null),
    drag = useRef(null);
  const clip = tracks.flatMap((t) => t.clips).find((c) => c.id === selected);
  const remove = () => {
    if (clip && !isBusy)
      patch({ type: 'block', clip_id: clip.id, action: 'delete' });
  };
  const duplicate = () => {
    if (clip && !isBusy)
      patch({ type: 'block', clip_id: clip.id, action: 'duplicate' });
  };
  useEffect(() => {
    const fn = (e) => {
      if (isTyping() || isBusy) return;
      const ctrl = e.ctrlKey || e.metaKey;
      if (ctrl && e.key.toLowerCase() === 'd') {
        e.preventDefault();
        duplicate();
      } else if (e.key === 'Delete') {
        e.preventDefault();
        remove();
      } else if (e.key.toLowerCase() === 'c') {
        const c =
          clip?.kind === 'caption_word_group'
            ? clip
            : (tracks
                .find((t) => t.id === 'CAP')
                ?.clips.find(
                  (c) => c.at <= (time ?? 0) && c.end > (time ?? 0),
                ) ?? tracks.find((t) => t.id === 'CAP')?.clips[0]);
        if (c) {
          e.preventDefault();
          setSelected(c.id);
          requestAnimationFrame(() =>
            document.querySelector('[aria-label="caption text"]')?.focus(),
          );
        }
      }
    };
    document.addEventListener('keydown', fn);
    return () => document.removeEventListener('keydown', fn);
  });
  const down = (e, c, keyIndex) => {
    if (isBusy) return;
    setSelected(c.id);
    e.stopPropagation();
    const row = e.currentTarget.closest('.creator-lane');
    drag.current = {
      id: c.id,
      x: e.clientX,
      start: keyIndex == null ? c.at : c.camera[keyIndex].t,
      width: row.clientWidth,
      keyIndex,
      clip: c,
      node: e.currentTarget,
      moved: false,
    };
    e.currentTarget.setPointerCapture(e.pointerId);
  };
  const move = (e) => {
    const d = drag.current;
    if (!d) return;
    const delta = ((e.clientX - d.x) / d.width) * total;
    if (Math.abs(e.clientX - d.x) < 3) return;
    d.moved = true;
    d.next = Math.max(
      0,
      Math.min(
        d.keyIndex == null
          ? total - (d.clip.end - d.clip.at)
          : Math.max(0, d.clip.end - d.clip.at - 1 / rate(edl.canvas.fps)),
        d.start + delta,
      ),
    );
    d.node.style.left = `${((d.keyIndex == null ? d.next : d.clip.at + d.next) / total) * 100}%`;
  };
  const up = () => {
    const d = drag.current;
    drag.current = null;
    if (!d?.moved) return;
    if (d.keyIndex == null)
      patch({
        type: 'block',
        clip_id: d.id,
        action: 'move',
        at: +d.next.toFixed(4),
      });
    else
      patch({
        type: 'camera',
        clip_id: d.id,
        index: d.keyIndex,
        time: +d.next.toFixed(4),
      });
  };
  return (
    <section
      className="studio-panel creator-timeline"
      aria-label="creator timeline"
    >
      <header className="studio-timeline-toolbar creator-timeline-head">
        <strong>timeline</strong>
        <span className="desk-fine mono">{fmtTc(total)} · 7 tracks</span>
        {isBusy ? (
          <span className="creator-updating" role="status">
            updating preview…
          </span>
        ) : null}
        <span className="studio-spacer" />
        <Button
          size="xs"
          variant="ghost"
          icon={Undo2}
          disabled={isBusy || !project.studioHistory?.undo}
          onClick={() => patch({ type: 'undo' })}
          aria-label="undo creator edit"
        >
          undo
        </Button>
        <Button
          size="xs"
          variant="ghost"
          icon={Redo2}
          disabled={isBusy || !project.studioHistory?.redo}
          onClick={() => patch({ type: 'redo' })}
          aria-label="redo creator edit"
        >
          redo
        </Button>
        <Button
          size="xs"
          variant="ghost"
          icon={Copy}
          disabled={isBusy || !clip || clip.type === 'video' || clip.linked}
          onClick={duplicate}
          aria-label="duplicate selected block"
        />
        <Button
          size="xs"
          variant="ghost"
          icon={Trash2}
          disabled={isBusy || !clip}
          onClick={remove}
          aria-label="delete selected block"
        />
      </header>
      <div className="creator-track-scroll" ref={area}>
        <div className="creator-track-row creator-ruler">
          <span>tracks</span>
          <div
            className="creator-lane"
            onClick={(e) => {
              const r = e.currentTarget.getBoundingClientRect();
              if (video.current)
                video.current.currentTime =
                  ((e.clientX - r.left) / r.width) * total;
            }}
          >
            {[0, 0.25, 0.5, 0.75, 1].map((f) => (
              <small
                key={f}
                style={{
                  left: f === 1 ? 'auto' : `${f * 100}%`,
                  right: f === 1 ? 0 : undefined,
                  transform: f === 0 || f === 1 ? 'none' : undefined,
                }}
              >
                {fmtTc(total * f)}
              </small>
            ))}
          </div>
        </div>
        {tracks.map((t) => (
          <div className="creator-track-row" key={t.id}>
            <header>
              <b>
                {t.id}
                {t.id === 'V1' ? <small>A-roll</small> : null}
              </b>
              <div>
                {[
                  ['muted', VolumeX, 'mute'],
                  ['solo', Headphones, 'solo'],
                  ['hidden', EyeOff, 'hide'],
                ].map(([key, Icon, label]) => (
                  <button
                    type="button"
                    key={key}
                    aria-label={`${label} ${t.id}`}
                    aria-pressed={!!t.state[key]}
                    disabled={
                      isBusy ||
                      (key === 'muted' && ['GFX', 'CAP'].includes(t.id))
                    }
                    title={
                      key === 'muted' && ['GFX', 'CAP'].includes(t.id)
                        ? 'this track contains no audio'
                        : `${label} ${t.id}`
                    }
                    onClick={() =>
                      patch({
                        type: 'track',
                        track: t.id,
                        [key]: !t.state[key],
                      })
                    }
                  >
                    <Icon size={14} />
                  </button>
                ))}
              </div>
            </header>
            <div className="creator-lane" aria-label={`${t.id} track`}>
              {(t.state.hidden ? [] : t.clips).map((c) => (
                <button
                  type="button"
                  key={c.id}
                  className="creator-block"
                  data-selected={selected === c.id || undefined}
                  data-track={t.id}
                  style={{
                    left: `${(c.at / total) * 100}%`,
                    width: `${Math.max(0.4, ((c.end - c.at) / total) * 100)}%`,
                  }}
                  aria-label={`${t.id} ${c.label}`}
                  title={c.label}
                  onFocus={() => setSelected(c.id)}
                  onClick={() => setSelected(c.id)}
                  onPointerDown={
                    t.id !== 'V1' && !c.linked ? (e) => down(e, c) : undefined
                  }
                  onPointerMove={move}
                  onPointerUp={up}
                >
                  {c.label}
                </button>
              ))}
              {t.id === 'V1' && !t.state.hidden
                ? t.clips.flatMap((c) =>
                    (c.camera ?? []).map((key, index) => (
                      <button
                        type="button"
                        className="creator-key"
                        key={`${c.id}-${index}`}
                        style={{ left: `${((c.at + key.t) / total) * 100}%` }}
                        aria-label={`camera key ${c.id} ${index + 1}`}
                        title={`camera key · ${key.t.toFixed(2)} s`}
                        onPointerDown={(e) => down(e, c, index)}
                        onPointerMove={move}
                        onPointerUp={up}
                        onClick={() => setSelectedKey({ clip: c.id, index })}
                        onContextMenu={(e) => {
                          e.preventDefault();
                          setSelectedKey({ clip: c.id, index });
                        }}
                      />
                    )),
                  )
                : null}
              {t.id === 'V1'
                ? removedGroups.map((group) => {
                    const r = group[0];
                    return (
                      <button
                        type="button"
                        className="creator-removed"
                        key={r.index}
                        style={{
                          left: `min(calc(100% - var(--space-6)), ${(r.at / total) * 100}%)`,
                        }}
                        aria-label={`restore this pause ${r.index + 1}`}
                        title={`${r.reason} · ${r.dur.toFixed(2)} s · restore this pause`}
                        disabled={isBusy}
                        onClick={() =>
                          group.length === 1
                            ? patch({ type: 'restore', index: r.index })
                            : setRestoreChoices(group)
                        }
                      />
                    );
                  })
                : null}
              <i
                className="creator-playhead"
                style={{ left: `${Math.min(1, (time ?? 0) / total) * 100}%` }}
              />
            </div>
          </div>
        ))}
      </div>
      {restoreChoices ? (
        <div
          className="creator-inline"
          role="group"
          aria-label="removed segments here"
        >
          {restoreChoices.map((r) => (
            <button
              key={r.index}
              type="button"
              onClick={() => {
                setRestoreChoices(null);
                patch({ type: 'restore', index: r.index });
              }}
            >
              {r.reason} · {r.dur.toFixed(2)} s · restore this pause
            </button>
          ))}
        </div>
      ) : null}
      {selectedKey ? (
        <div className="creator-inline">
          <label>
            camera time{' '}
            <input
              className="ui-input"
              aria-label="camera key time"
              type="number"
              min="0"
              step={1 / rate(edl.canvas.fps)}
              defaultValue={
                tracks
                  .flatMap((t) => t.clips)
                  .find((c) => c.id === selectedKey.clip)?.camera?.[
                  selectedKey.index
                ]?.t ?? 0
              }
              onBlur={(e) => {
                const old = tracks
                  .flatMap((t) => t.clips)
                  .find((c) => c.id === selectedKey.clip)?.camera?.[
                  selectedKey.index
                ]?.t;
                if (Number(e.target.value) !== old)
                  patch({
                    type: 'camera',
                    clip_id: selectedKey.clip,
                    index: selectedKey.index,
                    time: Number(e.target.value),
                  });
              }}
            />
          </label>
          <label>
            camera framing{' '}
            <select
              className="ui-input"
              aria-label="camera framing"
              disabled={isBusy}
              defaultValue="medium"
              onChange={(e) =>
                patch({
                  type: 'camera',
                  clip_id: selectedKey.clip,
                  index: selectedKey.index,
                  framing: e.target.value,
                })
              }
            >
              {['wide', 'medium', 'tight'].map((v) => (
                <option key={v}>{v}</option>
              ))}
            </select>
          </label>
          <Button
            size="xs"
            variant="ghost"
            onClick={() => setSelectedKey(null)}
          >
            close
          </Button>
        </div>
      ) : null}
      {clip && clip.type !== 'video' && !clip.linked ? (
        <label className="creator-inline">
          block start{' '}
          <input
            className="ui-input"
            type="number"
            aria-label="block start time"
            min="0"
            step={1 / rate(edl.canvas.fps)}
            key={clip.id + clip.at}
            defaultValue={clip.at}
            disabled={isBusy}
            onBlur={(e) => {
              if (Number(e.target.value) !== clip.at)
                patch({
                  type: 'block',
                  clip_id: clip.id,
                  action: 'move',
                  at: Number(e.target.value),
                });
            }}
          />
        </label>
      ) : null}
      {clip?.kind === 'caption_word_group' ? (
        <CaptionEditor clip={clip} patch={patch} disabled={isBusy} />
      ) : null}
      {(edl.removed ?? []).length ? (
        <details className="creator-removed-list">
          <summary>
            {edl.removed.length} removed segments · restore this pause
          </summary>
          {edl.removed.map((r) => (
            <button
              type="button"
              key={r.index}
              disabled={isBusy}
              onClick={() => patch({ type: 'restore', index: r.index })}
            >
              {r.reason} · {r.dur.toFixed(2)} s · restore this pause
            </button>
          ))}
        </details>
      ) : null}
    </section>
  );
}
