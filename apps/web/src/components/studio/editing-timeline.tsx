'use client';
import { useEffect, useRef, useState, type PointerEvent } from 'react';
import type { Asset, Clip, KimoProject, Op, Track } from '@kimo/client';

type Tool = 'select' | 'blade' | 'slip' | 'text';
const clamp = (value: number, min: number, max: number) =>
  Math.max(min, Math.min(max, value));
const clock = (time: number) =>
  `${String(Math.floor(time / 60)).padStart(2, '0')}:${String(Math.floor(time % 60)).padStart(2, '0')}`;
function TrackCanvas({
  track,
  clips,
  scale,
  scroll,
  width,
  assets,
}: {
  track: Track;
  clips: Clip[];
  scale: number;
  scroll: number;
  width: number;
  assets: Asset[];
}) {
  const ref = useRef<HTMLCanvasElement>(null);
  const pictures = useRef(new Map<string, HTMLImageElement>());
  const waves = useRef(new Map<string, Float32Array>());
  const [mediaVersion, setMediaVersion] = useState(0);
  useEffect(() => {
    let alive = true;
    for (const asset of assets) {
      if (
        (asset.thumbUrl || asset.kind === 'image') &&
        !pictures.current.has(asset.id)
      ) {
        const image = new Image();
        image.crossOrigin = 'anonymous';
        image.onload = () => {
          if (alive) setMediaVersion((n) => n + 1);
        };
        image.src = asset.thumbUrl ?? asset.url;
        pictures.current.set(asset.id, image);
      }
      if (asset.kind === 'audio' && !waves.current.has(asset.id)) {
        waves.current.set(asset.id, new Float32Array());
        void import('@kimo/compositor')
          .then(({ cachedWaveform }) => cachedWaveform(asset))
          .then((wave) => {
            if (alive && wave) {
              waves.current.set(asset.id, wave);
              setMediaVersion((n) => n + 1);
            }
          })
          .catch(() => undefined);
      }
    }
    return () => {
      alive = false;
    };
  }, [assets]);
  useEffect(() => {
    const canvas = ref.current;
    const ctx = canvas?.getContext('2d');
    if (!canvas || !ctx) return;
    const ratio = window.devicePixelRatio || 1;
    canvas.width = Math.ceil(width * ratio);
    canvas.height = track.height * ratio;
    ctx.scale(ratio, ratio);
    const css = getComputedStyle(canvas);
    ctx.fillStyle =
      css
        .getPropertyValue(
          `--track-${track.kind === 'overlay' ? 'video' : track.kind}`,
        )
        .trim() || css.getPropertyValue('--ink-2').trim();
    for (const clip of clips) {
      const left = clip.start * scale - scroll;
      const size = clip.duration * scale;
      if (left + size < -width || left > width * 2) continue;
      ctx.beginPath();
      ctx.roundRect(left, 4, Math.max(1, size), track.height - 8, 6);
      ctx.fill();
      const picture = clip.assetId
        ? pictures.current.get(clip.assetId)
        : undefined;
      if (picture?.complete && picture.naturalWidth) {
        ctx.save();
        ctx.clip();
        ctx.globalAlpha = 0.6;
        const h = track.height - 26;
        const w = Math.max(
          1,
          (h * picture.naturalWidth) / picture.naturalHeight,
        );
        for (
          let x = Math.max(left, left + Math.floor(-left / w) * w);
          x < Math.min(width, left + size);
          x += w
        )
          ctx.drawImage(picture, x, 22, w, h);
        ctx.restore();
      }
      const wave = clip.assetId ? waves.current.get(clip.assetId) : undefined;
      if (wave?.length) {
        ctx.save();
        ctx.fillStyle = css.getPropertyValue('--cream-38').trim();
        for (
          let x = Math.max(0, left);
          x < Math.min(width, left + size);
          x += 3
        ) {
          const sample =
            wave[Math.floor(((x - left) / size) * wave.length)] ?? 0;
          const h = Math.max(1, sample * (track.height - 24));
          ctx.fillRect(x, track.height / 2 - h / 2, 1, h);
        }
        ctx.restore();
      }
    }
  }, [track, clips, scale, scroll, width, mediaVersion]);
  return (
    <canvas
      ref={ref}
      className="editor-track-canvas"
      style={{ width, height: track.height }}
      aria-hidden="true"
    />
  );
}
export function EditingTimeline({
  project,
  assets,
  selected,
  onSelect,
  tool,
  snap,
  zoom,
  playhead,
  onSeek,
  onEdit,
  onDraft,
  onInteraction,
}: {
  project: KimoProject;
  assets: Asset[];
  selected: string | null;
  onSelect: (id: string | null) => void;
  tool: Tool;
  snap: boolean;
  zoom: number;
  playhead: number;
  onSeek: (time: number) => void;
  onEdit: (ops: Op[]) => void;
  onDraft: (clip: Clip | null) => void;
  onInteraction: (active: boolean) => void;
}) {
  const viewport = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(600);
  const [scroll, setScroll] = useState(0);
  const [draft, setDraft] = useState<Clip | null>(null);
  const [inline, setInline] = useState<string | null>(null);
  const [menu, setMenu] = useState<{ id: string; x: number; y: number } | null>(
    null,
  );
  const drag = useRef<{
    clip: Clip;
    x: number;
    edge: 'move' | 'in' | 'out' | 'slip';
    copy: boolean;
    ripple: boolean;
    moved: boolean;
    value: Clip;
  } | null>(null);
  useEffect(() => {
    const el = viewport.current;
    if (!el) return;
    const observer = new ResizeObserver(() => setWidth(el.clientWidth));
    observer.observe(el);
    setWidth(el.clientWidth);
    return () => observer.disconnect();
  }, []);
  const fit = Math.max(4, width / Math.max(project.duration * 1.1, 1));
  const scale = clamp(fit * 2 ** ((zoom - 50) / 12), 4, 600);
  const total = Math.max(width, project.duration * scale * 1.1);
  const clips = Object.values(project.clips).map((item) =>
    draft?.id === item.id ? draft : item,
  );
  const ticks =
    [1, 2, 5, 10, 30, 60, 120, 300].find((value) => value * scale >= 80) ?? 300;
  function start(
    event: PointerEvent<HTMLButtonElement>,
    clip: Clip,
    edge: 'move' | 'in' | 'out' | 'slip',
  ) {
    if (event.button === 0) onSelect(clip.id);
    if (
      event.button !== 0 ||
      clip.locked ||
      project.tracks.find((track) => track.id === clip.trackId)?.locked
    )
      return;
    event.stopPropagation();
    onSelect(clip.id);
    if (tool === 'blade') {
      const x =
        event.clientX - event.currentTarget.getBoundingClientRect().left;
      const at = clip.start + x / scale;
      if (at > clip.start && at < clip.start + clip.duration)
        onEdit([
          { op: 'clip.split', id: clip.id, at, newId: crypto.randomUUID() },
        ]);
      return;
    }
    drag.current = {
      clip,
      x: event.clientX,
      edge: tool === 'slip' ? 'slip' : edge,
      copy: event.altKey,
      ripple: event.metaKey || event.ctrlKey,
      moved: false,
      value: clip,
    };
    onInteraction(true);
    event.currentTarget.setPointerCapture(event.pointerId);
  }
  function move(event: PointerEvent<HTMLButtonElement>) {
    const d = drag.current;
    if (!d) return;
    let delta = (event.clientX - d.x) / scale;
    if (Math.abs(event.clientX - d.x) > 3) d.moved = true;
    if (snap && d.edge === 'move') {
      const target = d.clip.start + delta;
      const candidates = [
        playhead,
        ...project.markers.map((m) => m.time),
        ...clips
          .filter((c) => c.id !== d.clip.id)
          .flatMap((c) => [c.start, c.start + c.duration]),
      ];
      const nearest = candidates.reduce(
        (best, candidate) =>
          Math.abs(candidate - target) < Math.abs(best - target)
            ? candidate
            : best,
        target + 1000,
      );
      if (Math.abs(nearest - target) * scale <= 8)
        delta = nearest - d.clip.start;
    }
    const c = d.clip;
    let next = c;
    if (d.edge === 'move') next = { ...c, start: Math.max(0, c.start + delta) };
    if (d.edge === 'slip')
      next = { ...c, in: Math.max(0, c.in + delta * c.speed) };
    if (d.edge === 'in') {
      delta = clamp(
        delta,
        Math.max(-c.start, -c.in / c.speed),
        c.duration - 1 / project.fps,
      );
      next = {
        ...c,
        start: c.start + delta,
        duration: c.duration - delta,
        in: c.in + delta * c.speed,
      };
    }
    if (d.edge === 'out')
      next = { ...c, duration: Math.max(1 / project.fps, c.duration + delta) };
    d.value = next;
    setDraft(next);
    onDraft(next);
  }
  function finish() {
    const d = drag.current;
    drag.current = null;
    setDraft(null);
    onDraft(null);
    onInteraction(false);
    if (!d || !d.moved) return;
    const c = d.value;
    const operations: Op[] =
      d.copy && d.edge === 'move'
        ? [
            {
              op: 'clip.add',
              clip: { ...c, id: crypto.randomUUID(), locked: false },
            },
          ]
        : [
            {
              op: 'clip.update',
              id: c.id,
              patch: { start: c.start, duration: c.duration, in: c.in },
            },
          ];
    if (d.ripple && (d.edge === 'in' || d.edge === 'out')) {
      const shift = c.start + c.duration - (d.clip.start + d.clip.duration);
      for (const other of clips)
        if (
          other.trackId === c.trackId &&
          other.start >= d.clip.start + d.clip.duration &&
          other.id !== c.id
        )
          operations.push({
            op: 'clip.move',
            id: other.id,
            trackId: other.trackId,
            start: Math.max(0, other.start + shift),
          });
    }
    onEdit(operations);
  }
  return (
    <div
      className="editor-timeline-scroll"
      ref={viewport}
      onScroll={(e) => setScroll(e.currentTarget.scrollLeft)}
    >
      {menu && project.clips[menu.id] ? (
        <div
          className="editor-context"
          role="menu"
          tabIndex={-1}
          ref={(node) => node?.focus()}
          aria-label="clip actions"
          style={{ left: menu.x, top: menu.y }}
          onKeyDown={(event) => {
            if (event.key === 'Escape') setMenu(null);
          }}
        >
          {['split at playhead', 'duplicate', 'delete', 'lock'].map(
            (action) => (
              <button
                role="menuitem"
                key={action}
                onClick={() => {
                  const clip = project.clips[menu.id];
                  if (!clip) return;
                  if (action === 'lock')
                    onEdit([
                      {
                        op: 'clip.update',
                        id: clip.id,
                        patch: { locked: !clip.locked },
                      },
                    ]);
                  else if (!clip.locked) {
                    if (action === 'duplicate')
                      onEdit([
                        {
                          op: 'clip.add',
                          clip: {
                            ...clip,
                            id: crypto.randomUUID(),
                            start: clip.start + clip.duration,
                          },
                        },
                      ]);
                    if (action === 'delete')
                      onEdit([{ op: 'clip.remove', id: clip.id }]);
                    if (
                      action === 'split at playhead' &&
                      playhead > clip.start &&
                      playhead < clip.start + clip.duration
                    )
                      onEdit([
                        {
                          op: 'clip.split',
                          id: clip.id,
                          at: playhead,
                          newId: crypto.randomUUID(),
                        },
                      ]);
                  }
                  setMenu(null);
                }}
              >
                {action === 'lock' && project.clips[menu.id]?.locked
                  ? 'unlock'
                  : action}
              </button>
            ),
          )}
          <button role="menuitem" onClick={() => setMenu(null)}>
            close
          </button>
        </div>
      ) : null}
      <div className="editor-timeline-inner" style={{ width: total + 160 }}>
        <div className="editor-ruler">
          <div className="editor-header-spacer" />
          <div
            className="editor-ruler-content"
            role="slider"
            tabIndex={0}
            aria-label="seek timeline"
            aria-valuemin={0}
            aria-valuemax={project.duration}
            aria-valuenow={Math.min(playhead, project.duration)}
            onKeyDown={(event) => {
              if (event.key === 'ArrowLeft' || event.key === 'ArrowRight') {
                event.preventDefault();
                onSeek(
                  clamp(
                    playhead +
                      (event.key === 'ArrowRight' ? 1 : -1) / project.fps,
                    0,
                    project.duration,
                  ),
                );
              }
            }}
            style={{ width: total }}
            onClick={(e) =>
              onSeek(
                (e.clientX - e.currentTarget.getBoundingClientRect().left) /
                  scale,
              )
            }
          >
            {Array.from(
              { length: Math.ceil(total / (ticks * scale)) + 1 },
              (_, i) => (
                <span key={i} style={{ left: i * ticks * scale }}>
                  {clock(i * ticks)}
                </span>
              ),
            )}
          </div>
        </div>
        {project.tracks.map((track) => {
          const row = clips.filter((c) => c.trackId === track.id);
          return (
            <div
              className="editor-track"
              key={track.id}
              style={{ height: track.height }}
            >
              <div className="editor-track-header">
                <input
                  aria-label={`track name ${track.name}`}
                  defaultValue={track.name}
                  key={`${track.id}-${track.name}`}
                  onBlur={(e) => {
                    if (e.target.value.trim() && e.target.value !== track.name)
                      onEdit([
                        {
                          op: 'track.update',
                          id: track.id,
                          patch: { name: e.target.value.trim() },
                        },
                      ]);
                  }}
                />
                <div>
                  <button
                    aria-label={`${track.hidden ? 'show' : 'hide'} ${track.name}`}
                    onClick={() =>
                      onEdit([
                        {
                          op: 'track.update',
                          id: track.id,
                          patch: { hidden: !track.hidden },
                        },
                      ])
                    }
                  >
                    {track.hidden ? '○' : '◉'}
                  </button>
                  {track.kind === 'audio' ? (
                    <button
                      aria-label={`${track.muted ? 'unmute' : 'mute'} ${track.name}`}
                      onClick={() =>
                        onEdit([
                          {
                            op: 'track.update',
                            id: track.id,
                            patch: { muted: !track.muted },
                          },
                        ])
                      }
                    >
                      {track.muted ? '×' : '♪'}
                    </button>
                  ) : null}
                  <button
                    aria-label={`${track.locked ? 'unlock' : 'lock'} ${track.name}`}
                    onClick={() =>
                      onEdit([
                        {
                          op: 'track.update',
                          id: track.id,
                          patch: { locked: !track.locked },
                        },
                      ])
                    }
                  >
                    {track.locked ? '🔒' : '⌑'}
                  </button>
                </div>
              </div>
              <div className="editor-track-body" style={{ width: total }}>
                <button
                  type="button"
                  className="editor-dropzone"
                  aria-label={`${track.name} track`}
                  onKeyDown={(event) => {
                    if (
                      event.key === 'Enter' &&
                      tool === 'text' &&
                      track.kind === 'text'
                    ) {
                      event.preventDefault();
                      const clip: Clip = {
                        id: crypto.randomUUID(),
                        trackId: track.id,
                        kind: 'text',
                        start: playhead,
                        duration: 3,
                        in: 0,
                        text: { content: 'your text', style: 'caption-clean' },
                        transform: {
                          x: 0,
                          y: 0,
                          scale: 1,
                          rotation: 0,
                          opacity: 1,
                        },
                        effects: [],
                        keyframes: [],
                        speed: 1,
                      };
                      onEdit([{ op: 'clip.add', clip }]);
                      onSelect(clip.id);
                    }
                  }}
                  onDragOver={(event) => {
                    if (
                      event.dataTransfer.types.includes(
                        'application/x-kimo-asset',
                      )
                    )
                      event.preventDefault();
                  }}
                  onDrop={(event) => {
                    event.preventDefault();
                    const asset = assets.find(
                      (item) =>
                        item.id ===
                        event.dataTransfer.getData('application/x-kimo-asset'),
                    );
                    if (
                      !asset ||
                      asset.kind === 'doc' ||
                      (track.kind === 'audio'
                        ? asset.kind !== 'audio'
                        : asset.kind === 'audio') ||
                      track.locked
                    )
                      return;
                    const at = Math.max(
                      0,
                      (event.clientX -
                        event.currentTarget.getBoundingClientRect().left) /
                        scale,
                    );
                    const clip: Clip = {
                      id: crypto.randomUUID(),
                      trackId: track.id,
                      assetId: asset.id,
                      kind: asset.kind,
                      start: at,
                      duration: asset.durationSec ?? 3,
                      in: 0,
                      transform: {
                        x: 0,
                        y: 0,
                        scale: 1,
                        rotation: 0,
                        opacity: 1,
                      },
                      effects: [],
                      keyframes: [],
                      speed: 1,
                    };
                    onEdit([{ op: 'clip.add', clip }]);
                    onSelect(clip.id);
                  }}
                ></button>
                <TrackCanvas
                  track={track}
                  assets={assets}
                  clips={row}
                  scale={scale}
                  scroll={scroll}
                  width={width}
                />
                {row
                  .filter(
                    (c) =>
                      (c.start + c.duration) * scale >= scroll - width &&
                      c.start * scale <= scroll + width * 2,
                  )
                  .map((clip) => (
                    <div
                      className="editor-clip-wrap"
                      key={clip.id}
                      style={{
                        left: clip.start * scale,
                        width: Math.max(4, clip.duration * scale),
                        height: track.height - 8,
                        top: 4,
                      }}
                    >
                      {inline === clip.id && clip.text ? (
                        <input
                          ref={(node) => node?.focus()}
                          aria-label="edit clip text"
                          defaultValue={clip.text.content}
                          onBlur={(e) => {
                            onEdit([
                              {
                                op: 'text.update',
                                clipId: clip.id,
                                content: e.target.value,
                              },
                            ]);
                            setInline(null);
                          }}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter') e.currentTarget.blur();
                            if (e.key === 'Escape') setInline(null);
                          }}
                        />
                      ) : (
                        <button
                          className="studio-clip editor-clip"
                          onContextMenu={(event) => {
                            event.preventDefault();
                            onSelect(clip.id);
                            setMenu({
                              id: clip.id,
                              x: event.clientX,
                              y: event.clientY,
                            });
                          }}
                          data-selected={selected === clip.id || undefined}
                          aria-label={`${assets.find((a) => a.id === clip.assetId)?.name ?? clip.text?.content ?? clip.kind}, ${clip.kind}, starts ${clock(clip.start)}, ${clip.duration.toFixed(1)} seconds`}
                          onDoubleClick={() => {
                            if (clip.text) setInline(clip.id);
                          }}
                          onPointerDown={(e) => start(e, clip, 'move')}
                          onPointerMove={move}
                          onPointerUp={finish}
                          onPointerCancel={finish}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter') onSelect(clip.id);
                          }}
                        >
                          <span>
                            {clip.locked ? '⌑ ' : ''}
                            {clip.text?.content ??
                              assets.find((a) => a.id === clip.assetId)?.name ??
                              clip.kind}
                            {clip.speed !== 1 ? ` · ${clip.speed}×` : ''}
                          </span>
                        </button>
                      )}
                      {!clip.locked && selected === clip.id ? (
                        <>
                          <button
                            className="editor-trim editor-trim-left"
                            aria-label="trim start"
                            onPointerDown={(e) => start(e, clip, 'in')}
                            onPointerMove={move}
                            onPointerUp={finish}
                            onPointerCancel={finish}
                          />
                          <button
                            className="editor-trim editor-trim-right"
                            aria-label="trim end"
                            onPointerDown={(e) => start(e, clip, 'out')}
                            onPointerMove={move}
                            onPointerUp={finish}
                            onPointerCancel={finish}
                          />
                        </>
                      ) : null}
                    </div>
                  ))}
              </div>
            </div>
          );
        })}
        <div
          className="editor-playhead"
          style={{ left: 160 + playhead * scale }}
          aria-hidden="true"
        />
      </div>
    </div>
  );
}
