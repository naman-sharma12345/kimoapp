'use client';
import { useEffect, useRef, useState, useMemo, type PointerEvent } from 'react';
import { motion, AnimatePresence, useReducedMotion } from 'motion/react';
import {
  Lock,
  Unlock,
  Eye,
  EyeOff,
  Volume2,
  VolumeX,
  Blend,
  Film,
  Image as ImageIcon,
  Type,
  Music,
} from 'lucide-react';
import type { Asset, Clip, KimoProject, Op, Track } from '@kimo/client';

const filmCache = new Map<string, Promise<ImageBitmap[]>>();
let filmQueue: Promise<unknown> = Promise.resolve();
function framesFor(asset: Asset, clip: Clip) {
  let frames = filmCache.get(asset.id);
  if (!frames) {
    const task = filmQueue.then(async () => {
      const { filmstripFor } = await import('@kimo/compositor');
      const blobs = await filmstripFor(
        {
          ...clip,
          in: 0,
          start: 0,
          duration: asset.durationSec ?? clip.duration,
        },
        asset,
        640,
      );
      return Promise.all(blobs.map((blob) => createImageBitmap(blob)));
    });
    filmQueue = task.catch(() => undefined);
    frames = task;
    filmCache.set(asset.id, frames);
  }
  return frames;
}
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
  const films = useRef(new Map<string, ImageBitmap[]>());
  const [mediaVersion, setMediaVersion] = useState(0);
  useEffect(() => {
    let alive = true;
    for (const clip of clips) {
      const asset = assets.find((item) => item.id === clip.assetId);
      if (asset?.kind === 'video' && !films.current.has(asset.id)) {
        void framesFor(asset, clip)
          .then((frames) => {
            if (alive) {
              films.current.set(asset.id, frames);
              setMediaVersion((n) => n + 1);
            }
          })
          .catch(() => undefined);
      }
    }
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
  }, [assets, clips]);
  useEffect(() => {
    const canvas = ref.current;
    const ctx = canvas?.getContext('2d');
    if (!canvas || !ctx) return;
    const ratio = window.devicePixelRatio || 1;
    if (canvas.width !== Math.ceil(width * ratio))
      canvas.width = Math.ceil(width * ratio);
    if (canvas.height !== track.height * ratio)
      canvas.height = track.height * ratio;
    ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
    ctx.clearRect(0, 0, width, track.height);
    const css = getComputedStyle(canvas);
    ctx.fillStyle =
      css
        .getPropertyValue(
          `--track-${track.kind === 'audio' ? (/voice|speech/i.test(track.name) ? 'voice' : /sfx|sound/i.test(track.name) ? 'sfx' : 'music') : track.kind === 'overlay' ? 'broll' : track.kind}`,
        )
        .trim() || css.getPropertyValue('--ink-2').trim();
    ctx.save();
    ctx.strokeStyle = css.getPropertyValue('--cream-16').trim();
    ctx.globalAlpha = 0.1875;
    for (let x = -track.height; x < width; x += 6) {
      ctx.beginPath();
      ctx.moveTo(x, track.height);
      ctx.lineTo(x + track.height, 0);
      ctx.stroke();
    }
    ctx.restore();
    for (const clip of clips) {
      const left = clip.start * scale - scroll;
      const size = clip.duration * scale;
      if (left + size < -width || left > width * 2) continue;
      ctx.beginPath();
      ctx.roundRect(left, 4, Math.max(1, size), track.height - 8, 6);
      ctx.fill();
      const frames = clip.assetId ? films.current.get(clip.assetId) : undefined;
      const asset = assets.find((item) => item.id === clip.assetId);
      if (frames?.length) {
        ctx.save();
        ctx.clip();
        ctx.globalAlpha = 0.6;
        const h = track.height - 26;
        const first = frames[0];
        const w = first ? (h * first.width) / first.height : 80;
        for (
          let x = Math.max(left, left + Math.floor(-left / w) * w);
          x < Math.min(width, left + size);
          x += w
        ) {
          const time = clip.in + Math.max(0, (x - left) / scale) * clip.speed;
          const frame =
            frames[
              Math.min(
                frames.length - 1,
                Math.floor(
                  (time / Math.max(0.01, asset?.durationSec ?? clip.duration)) *
                    frames.length,
                ),
              )
            ];
          if (frame) ctx.drawImage(frame, x, 22, w, h);
        }
        ctx.restore();
      }
      const picture = clip.assetId
        ? pictures.current.get(clip.assetId)
        : undefined;
      if (!frames?.length && picture?.complete && picture.naturalWidth) {
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
      ctx.save();
      ctx.beginPath();
      ctx.rect(left + 4, 4, Math.max(0, size - 8), track.height - 8);
      ctx.clip();
      ctx.fillStyle = css
        .getPropertyValue(clip.kind === 'text' ? '--cream-100' : '--cream-60')
        .trim();
      ctx.font = `${css.getPropertyValue(clip.kind === 'text' ? '--t-12' : '--t-11').trim()} ${css.getPropertyValue('--font-sans').trim()}`;
      ctx.fillText(
        `${clip.text?.content ?? asset?.name ?? clip.kind}${clip.speed !== 1 ? ` · ${clip.speed}×` : ''}`,
        left + 6,
        18,
      );
      if (clip.locked) {
        ctx.strokeStyle = css.getPropertyValue('--cream-38').trim();
        ctx.strokeRect(left + size - 13, 9, 8, 6);
        ctx.beginPath();
        ctx.arc(left + size - 9, 9, 3, Math.PI, 0);
        ctx.stroke();
      }
      ctx.restore();
    }
  }, [track, clips, scale, scroll, width, mediaVersion, assets]);
  return (
    <canvas
      ref={ref}
      className="editor-track-canvas"
      style={{ width, height: track.height, left: scroll }}
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
  onAsk,
  onReplace,
  aiClips = [],
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
  onInteraction: (active: boolean, ids?: string[]) => void;
  onAsk: (name: string) => void;
  onReplace: (clipId: string) => void;
  aiClips?: string[];
}) {
  const reduceMotion = useReducedMotion();
  const viewport = useRef<HTMLDivElement>(null);
  const [picked, setPicked] = useState<string[]>([]);
  const [hovered, setHovered] = useState<string | null>(null);
  const [snapAt, setSnapAt] = useState<number | null>(null);
  const [marquee, setMarquee] = useState<{
    x: number;
    y: number;
    w: number;
    h: number;
  } | null>(null);
  const boxStart = useRef<{ x: number; y: number; track: string } | null>(null);
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
  const bodyWidth = Math.max(1, width - 160);
  const fit = Math.max(4, bodyWidth / Math.max(project.duration * 1.1, 1));
  const scale = clamp(fit * 2 ** ((zoom - 50) / 12), 4, 600);
  const total = Math.max(bodyWidth, project.duration * scale * 1.1);
  const drawStart = Math.max(0, scroll - bodyWidth);
  const clips = useMemo(
    () =>
      Object.values(project.clips).map((item) =>
        draft?.id === item.id ? draft : item,
      ),
    [project.clips, draft],
  );
  const rows = useMemo(
    () =>
      new Map(
        project.tracks.map((track) => [
          track.id,
          clips.filter((clip) => clip.trackId === track.id),
        ]),
      ),
    [project.tracks, clips],
  );
  const ticks =
    [1, 2, 5, 10, 30, 60, 120, 300].find((value) => value * scale >= 80) ?? 300;
  function start(
    event: PointerEvent<HTMLButtonElement>,
    clip: Clip,
    edge: 'move' | 'in' | 'out' | 'slip',
  ) {
    if (event.button === 0) {
      onSelect(clip.id);
      setPicked((old) =>
        event.shiftKey
          ? old.includes(clip.id)
            ? old.filter((id) => id !== clip.id)
            : [...old, clip.id]
          : old.includes(clip.id)
            ? old
            : [clip.id],
      );
    }
    if (
      event.button !== 0 ||
      clip.locked ||
      project.tracks.find((track) => track.id === clip.trackId)?.locked
    )
      return;
    event.stopPropagation();
    onSelect(clip.id);
    if (tool === 'slip') onSeek(clip.start);
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
    onInteraction(true, [clip.id]);
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
      if (Math.abs(nearest - target) * scale <= 8) {
        delta = nearest - d.clip.start;
        setSnapAt(nearest);
      } else setSnapAt(null);
    }
    const c = d.clip;
    let next = c;
    if (d.edge === 'move') {
      const row = document
        .elementsFromPoint(event.clientX, event.clientY)
        .map((el) => el.closest<HTMLElement>('[data-editor-track]'))
        .find(Boolean);
      const track = project.tracks.find(
        (item) => item.id === row?.dataset.editorTrack,
      );
      const original = project.tracks.find((item) => item.id === c.trackId);
      next = {
        ...c,
        start: Math.max(0, c.start + delta),
        trackId:
          track && !track.locked && track.kind === original?.kind
            ? track.id
            : c.trackId,
      };
    }
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
        start: d.ripple ? c.start : c.start + delta,
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
    setSnapAt(null);
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
              patch: {
                start: c.start,
                duration: c.duration,
                in: c.in,
                trackId: c.trackId,
              },
            },
          ];
    if (d.edge === 'move' && picked.length > 1)
      for (const id of picked) {
        const other = project.clips[id];
        if (!other || other.id === c.id || other.locked) continue;
        const moved = {
          ...other,
          start: Math.max(0, other.start + c.start - d.clip.start),
        };
        operations.push(
          d.copy
            ? { op: 'clip.add', clip: { ...moved, id: crypto.randomUUID() } }
            : {
                op: 'clip.move',
                id: other.id,
                trackId: other.trackId,
                start: moved.start,
              },
        );
      }
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
      onScroll={(e) => {
        const next =
          Math.floor(e.currentTarget.scrollLeft / bodyWidth) * bodyWidth;
        setScroll((old) => (old === next ? old : next));
      }}
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
          {[
            'split at playhead',
            'duplicate',
            'delete',
            'speed…',
            'detach audio',
            'replace media…',
            'ask kimo about this clip',
            'lock',
          ].map((action) => (
            <button
              role="menuitem"
              key={action}
              onClick={() => {
                const clip = project.clips[menu.id];
                if (!clip) return;
                if (action === 'ask kimo about this clip')
                  onAsk(
                    assets.find((asset) => asset.id === clip.assetId)?.name ??
                      clip.text?.content ??
                      clip.id,
                  );
                if (action === 'replace media…') onReplace(clip.id);
                if (action === 'speed…') {
                  const value = window.prompt('speed…', String(clip.speed));
                  const speed = Number(value);
                  if (value && Number.isFinite(speed) && speed > 0)
                    onEdit([
                      { op: 'clip.update', id: clip.id, patch: { speed } },
                    ]);
                }
                if (action === 'detach audio' && clip.kind === 'video') {
                  const track = project.tracks.find(
                    (item) => item.kind === 'audio' && !item.locked,
                  ) ?? {
                    id: crypto.randomUUID(),
                    kind: 'audio' as const,
                    name: 'detached audio',
                    height: 64 as const,
                    hidden: false,
                    muted: false,
                    locked: false,
                  };
                  onEdit([
                    ...(project.tracks.some((item) => item.id === track.id)
                      ? []
                      : [{ op: 'track.add' as const, track }]),
                    {
                      op: 'clip.add',
                      clip: {
                        ...clip,
                        id: crypto.randomUUID(),
                        kind: 'audio',
                        trackId: track.id,
                      },
                    },
                    { op: 'clip.update', id: clip.id, patch: { volume: 0 } },
                  ]);
                }
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
          ))}
          <button role="menuitem" onClick={() => setMenu(null)}>
            close
          </button>
        </div>
      ) : null}
      <div className="editor-timeline-inner" style={{ width: total + 160 }}>
        {snapAt !== null ? (
          <div
            className="editor-snap-line"
            style={{ left: 160 + snapAt * scale }}
          />
        ) : null}
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
            onPointerDown={(event) => {
              event.currentTarget.setPointerCapture(event.pointerId);
              onSeek(
                Math.max(
                  0,
                  (event.clientX -
                    event.currentTarget.getBoundingClientRect().left) /
                    scale,
                ),
              );
            }}
            onPointerMove={(event) => {
              if (event.buttons === 1)
                onSeek(
                  Math.max(
                    0,
                    (event.clientX -
                      event.currentTarget.getBoundingClientRect().left) /
                      scale,
                  ),
                );
            }}
            onClick={(e) =>
              onSeek(
                (e.clientX - e.currentTarget.getBoundingClientRect().left) /
                  scale,
              )
            }
          >
            {project.markers.map((marker) => (
              <button
                key={marker.id}
                className="editor-marker"
                title={marker.label}
                aria-label={`marker ${marker.label}`}
                style={{ left: marker.time * scale }}
                onClick={(event) => {
                  event.stopPropagation();
                  onSeek(marker.time);
                }}
              />
            ))}
            {Array.from(
              {
                length: Math.min(
                  2000,
                  Math.ceil(
                    total / (scale >= 300 ? scale / 30 : (ticks * scale) / 5),
                  ),
                ),
              },
              (_, index) => (
                <i
                  key={index}
                  className="editor-minor-tick"
                  style={{
                    left:
                      index * (scale >= 300 ? scale / 30 : (ticks * scale) / 5),
                  }}
                />
              ),
            )}
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
        {project.tracks
          .toSorted(
            (a, b) =>
              ({ text: 0, overlay: 1, video: 2, audio: 3 })[a.kind] -
              { text: 0, overlay: 1, video: 2, audio: 3 }[b.kind],
          )
          .map((track) => {
            const row = rows.get(track.id) ?? [];
            return (
              <div
                className="editor-track"
                data-editor-track={track.id}
                key={track.id}
                style={{ height: track.height }}
              >
                <div className="editor-track-header">
                  {track.kind === 'text' ? (
                    <Type size={24} aria-hidden />
                  ) : track.kind === 'audio' ? (
                    <Music size={24} aria-hidden />
                  ) : track.kind === 'overlay' ? (
                    <ImageIcon size={24} aria-hidden />
                  ) : (
                    <Film size={24} aria-hidden />
                  )}
                  <input
                    aria-label={`track name ${track.name}`}
                    defaultValue={track.name}
                    key={`${track.id}-${track.name}`}
                    onBlur={(e) => {
                      if (
                        e.target.value.trim() &&
                        e.target.value !== track.name
                      )
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
                      {track.hidden ? (
                        <EyeOff size={14} aria-hidden />
                      ) : (
                        <Eye size={14} aria-hidden />
                      )}
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
                        {track.muted ? (
                          <VolumeX size={14} aria-hidden />
                        ) : (
                          <Volume2 size={14} aria-hidden />
                        )}
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
                      {track.locked ? (
                        <Lock size={14} aria-hidden />
                      ) : (
                        <Unlock size={14} aria-hidden />
                      )}
                    </button>
                  </div>
                </div>
                <div className="editor-track-body" style={{ width: total }}>
                  <button
                    type="button"
                    className="editor-dropzone"
                    onPointerDown={(event) => {
                      const rect = event.currentTarget.getBoundingClientRect();
                      const time = (event.clientX - rect.left) / scale;
                      const hit = row.find(
                        (clip) =>
                          time >= clip.start &&
                          time < clip.start + clip.duration,
                      );
                      if (hit) {
                        start(event, hit, 'move');
                        return;
                      }
                      if (tool === 'select') {
                        event.currentTarget.setPointerCapture(event.pointerId);
                        const rect =
                          event.currentTarget.getBoundingClientRect();
                        boxStart.current = {
                          x: event.clientX - rect.left,
                          y: event.clientY - rect.top,
                          track: track.id,
                        };
                        onSelect(null);
                        setPicked([]);
                      }
                    }}
                    onPointerMove={(event) => {
                      if (drag.current) {
                        move(event);
                        return;
                      }
                      const time =
                        (event.clientX -
                          event.currentTarget.getBoundingClientRect().left) /
                        scale;
                      setHovered(
                        row.find(
                          (clip) =>
                            time >= clip.start &&
                            time < clip.start + clip.duration,
                        )?.id ?? null,
                      );
                      const start = boxStart.current;
                      if (start) {
                        const rect =
                          event.currentTarget.getBoundingClientRect();
                        const x = event.clientX - rect.left,
                          y = event.clientY - rect.top;
                        setMarquee({
                          x: Math.min(start.x, x),
                          y: Math.min(start.y, y),
                          w: Math.abs(x - start.x),
                          h: Math.abs(y - start.y),
                        });
                        setPicked(
                          clips
                            .filter(
                              (clip) =>
                                clip.trackId === track.id &&
                                clip.start * scale < Math.max(x, start.x) &&
                                (clip.start + clip.duration) * scale >
                                  Math.min(x, start.x),
                            )
                            .map((clip) => clip.id),
                        );
                      }
                    }}
                    onPointerUp={() => {
                      if (drag.current) {
                        finish();
                        return;
                      }
                      if (
                        tool === 'text' &&
                        track.kind === 'text' &&
                        !track.locked
                      ) {
                        const clip: Clip = {
                          id: crypto.randomUUID(),
                          trackId: track.id,
                          kind: 'text',
                          start: playhead,
                          duration: 3,
                          in: 0,
                          text: {
                            content: 'your text',
                            style: 'caption-clean',
                          },
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
                        setInline(clip.id);
                      }
                      boxStart.current = null;
                      setMarquee(null);
                      if (picked.length) onSelect(picked.at(-1) ?? null);
                    }}
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
                          text: {
                            content: 'your text',
                            style: 'caption-clean',
                          },
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
                          event.dataTransfer.getData(
                            'application/x-kimo-asset',
                          ),
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
                  {marquee && boxStart.current?.track === track.id ? (
                    <div
                      className="editor-marquee"
                      style={{
                        left: marquee.x,
                        top: marquee.y,
                        width: marquee.w,
                        height: marquee.h,
                      }}
                    />
                  ) : null}
                  <TrackCanvas
                    track={track}
                    assets={assets}
                    clips={row}
                    scale={scale}
                    scroll={drawStart}
                    width={Math.min(
                      bodyWidth * 3,
                      Math.max(1, total - drawStart),
                    )}
                  />
                  <AnimatePresence
                    initial={false}
                    custom={Object.keys(project.clips)}
                  >
                    {row
                      .filter(
                        (c) =>
                          (c.start + c.duration) * scale >= scroll - width &&
                          c.start * scale <= scroll + width * 2 &&
                          (c.id === selected ||
                            c.id === hovered ||
                            picked.includes(c.id) ||
                            aiClips.includes(c.id) ||
                            c.id ===
                              row.find(
                                (item) =>
                                  (item.start + item.duration) * scale >=
                                  scroll,
                              )?.id),
                      )
                      .map((clip) => (
                        <motion.div
                          layout={
                            aiClips.includes(clip.id) && !reduceMotion
                              ? 'position'
                              : false
                          }
                          initial={
                            aiClips.includes(clip.id)
                              ? { opacity: 0, scaleX: reduceMotion ? 1 : 0 }
                              : false
                          }
                          animate={{ opacity: 1, scaleX: 1 }}
                          custom={Object.keys(project.clips)}
                          variants={{
                            removed: (ids: string[]) =>
                              ids.includes(clip.id)
                                ? {
                                    opacity: 1,
                                    scaleX: 1,
                                    transition: { duration: 0 },
                                  }
                                : {
                                    opacity: 0,
                                    scaleX: reduceMotion ? 1 : 0,
                                    transition: { duration: 0.22 },
                                  },
                          }}
                          exit="removed"
                          transition={{
                            type: 'spring',
                            stiffness: 520,
                            damping: 40,
                            mass: 0.8,
                          }}
                          className="editor-clip-wrap"
                          key={clip.id}
                          style={{
                            left: clip.start * scale,
                            width: Math.max(4, clip.duration * scale),
                            height: track.height - 8,
                            top: 4,
                          }}
                        >
                          {clip.transitionIn ? (
                            <button
                              className="editor-transition-chip"
                              aria-label={`${clip.transitionIn.type} · ${Math.round(clip.transitionIn.duration * 30)}f`}
                              title={`${clip.transitionIn.type.replaceAll('-', ' ')} · ${Math.round(clip.transitionIn.duration * 30)}f`}
                              onClick={() => onSelect(clip.id)}
                            >
                              <Blend size={12} aria-hidden />
                            </button>
                          ) : null}
                          {inline === clip.id && clip.text ? (
                            <input
                              ref={(node) => node?.focus()}
                              aria-label="edit clip text"
                              defaultValue={clip.text.content}
                              onFocus={() => onInteraction(true, [clip.id])}
                              onBlur={(e) => {
                                onInteraction(false);
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
                                if (e.key === 'Escape') {
                                  onInteraction(false);
                                  setInline(null);
                                }
                              }}
                            />
                          ) : (
                            <button
                              className="studio-clip editor-clip"
                              onPointerLeave={() => {
                                if (!drag.current) setHovered(null);
                              }}
                              onContextMenu={(event) => {
                                event.preventDefault();
                                onSelect(clip.id);
                                setMenu({
                                  id: clip.id,
                                  x: event.clientX,
                                  y: event.clientY,
                                });
                              }}
                              tabIndex={
                                selected === clip.id || row[0]?.id === clip.id
                                  ? 0
                                  : -1
                              }
                              data-clip-id={clip.id}
                              data-ai={aiClips.includes(clip.id) || undefined}
                              data-selected={
                                picked.includes(clip.id) ||
                                selected === clip.id ||
                                undefined
                              }
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
                                if (
                                  e.key === 'ArrowLeft' ||
                                  e.key === 'ArrowRight'
                                ) {
                                  e.preventDefault();
                                  e.stopPropagation();
                                  const ordered = row.toSorted(
                                    (a, b) => a.start - b.start,
                                  );
                                  const index = ordered.findIndex(
                                    (item) => item.id === clip.id,
                                  );
                                  const next =
                                    ordered[
                                      index + (e.key === 'ArrowRight' ? 1 : -1)
                                    ];
                                  if (next) {
                                    onSelect(next.id);
                                    requestAnimationFrame(() =>
                                      viewport.current
                                        ?.querySelector<HTMLButtonElement>(
                                          `[data-clip-id="${CSS.escape(next.id)}"]`,
                                        )
                                        ?.focus(),
                                    );
                                  }
                                }
                                if (
                                  (e.key === 'Delete' ||
                                    e.key === 'Backspace') &&
                                  picked.length > 1
                                ) {
                                  e.preventDefault();
                                  e.stopPropagation();
                                  onEdit(
                                    picked
                                      .filter(
                                        (id) => !project.clips[id]?.locked,
                                      )
                                      .map((id) => ({ op: 'clip.remove', id })),
                                  );
                                  setPicked([]);
                                }
                              }}
                            >
                              <span>
                                {clip.locked ? (
                                  <Lock size={10} aria-hidden />
                                ) : null}
                                {clip.text?.content ??
                                  assets.find((a) => a.id === clip.assetId)
                                    ?.name ??
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
                        </motion.div>
                      ))}
                  </AnimatePresence>
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
