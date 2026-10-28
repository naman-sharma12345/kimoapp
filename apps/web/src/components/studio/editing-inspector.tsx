'use client';
import { useEffect, useState, useRef } from 'react';
import { Toggle } from '@/components/ui/toggle';
import { Textarea } from '@/components/ui/textarea';
import { CaptionsEditor } from './captions-editor';
import { InspectorDetails, ProjectInspector } from './inspector-details';
import type { Asset, Clip, Op, KimoProject } from '@kimo/client';
const styles = [
  'caption-clean',
  'caption-pop',
  'caption-box',
  'title-serif',
  'title-bold',
  'lower-third',
  'label-mono',
  'quote',
];
export function NumberField({
  label,
  value,
  onCommit,
  min,
  max,
  step = 1,
  keyframe,
  onKeyframe,
  reset = 0,
  ai = false,
}: {
  label: string;
  value: number;
  onCommit: (value: number) => void;
  min?: number;
  max?: number;
  step?: number;
  keyframe?: boolean;
  onKeyframe?: () => void;
  reset?: number;
  ai?: boolean;
}) {
  const [draft, setDraft] = useState(String(value));
  const drag = useRef<{ x: number; value: number } | null>(null);
  useEffect(() => setDraft(String(Math.round(value * 100) / 100)), [value]);
  return (
    <label className="editor-field" data-ai={ai || undefined}>
      <button
        type="button"
        aria-label={`scrub ${label}`}
        onPointerDown={(event) => {
          drag.current = { x: event.clientX, value };
          event.currentTarget.setPointerCapture(event.pointerId);
        }}
        onPointerMove={(event) => {
          const start = drag.current;
          if (start)
            setDraft(
              String(
                Math.min(
                  max ?? Infinity,
                  Math.max(
                    min ?? -Infinity,
                    start.value + (event.clientX - start.x) * step,
                  ),
                ),
              ),
            );
        }}
        onPointerUp={() => {
          if (drag.current) {
            drag.current = null;
            onCommit(Number(draft));
          }
        }}
        className="editor-number-label"
      >
        {label}
      </button>
      {value !== reset ? (
        <button
          type="button"
          className="editor-reset-dot"
          aria-label={`reset ${label}`}
          title="reset"
          onClick={() => onCommit(reset)}
        />
      ) : null}
      {onKeyframe ? (
        <button
          type="button"
          aria-label={`keyframe ${label}`}
          aria-pressed={keyframe}
          onClick={onKeyframe}
        >
          {keyframe ? '◆' : '◇'}
        </button>
      ) : null}
      <input
        type="number"
        aria-label={label}
        value={draft}
        min={min}
        max={max}
        step={step}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={() => {
          const n = Number(draft);
          if (Number.isFinite(n) && draft !== '')
            onCommit(Math.min(max ?? Infinity, Math.max(min ?? -Infinity, n)));
          else setDraft(String(value));
        }}
        onKeyDown={(e) => {
          if (e.key === 'Enter') e.currentTarget.blur();
          if (e.shiftKey && (e.key === 'ArrowUp' || e.key === 'ArrowDown')) {
            e.preventDefault();
            setDraft(String(Number(draft) + (e.key === 'ArrowUp' ? 10 : -10)));
          }
        }}
      />
    </label>
  );
}
export function EditingInspector({
  clip,
  project,
  assets,
  onEdit,
  onDraft,
  onInteraction,
  playhead,
  onSeek,
  onMessage,
  onUpload,
  suggestion,
  onSuggestion,
  levelDb = -60,
  ai = false,
}: {
  clip?: Clip;
  project: KimoProject;
  assets: Asset[];
  onEdit: (ops: Op[]) => void;
  onDraft: (clip: Clip | null) => void;
  onInteraction: (active: boolean, ids?: string[]) => void;
  playhead: number;
  onSeek: (time: number) => void;
  onMessage: (text: string) => void;
  onUpload: () => void;
  suggestion?: string;
  onSuggestion: (use: boolean, mine?: string) => void;
  levelDb?: number;
  ai?: boolean;
}) {
  const [text, setText] = useState(clip?.text?.content ?? '');
  const localTimer = useRef<ReturnType<typeof setTimeout> | undefined>(
    undefined,
  );
  const saveTimer = useRef<ReturnType<typeof setTimeout> | undefined>(
    undefined,
  );
  const lastSaved = useRef(clip?.text?.content ?? '');
  const [showSuggestion, setShowSuggestion] = useState(false);
  useEffect(
    () => () => {
      clearTimeout(localTimer.current);
      clearTimeout(saveTimer.current);
    },
    [],
  );
  useEffect(() => {
    setText(clip?.text?.content ?? '');
    lastSaved.current = clip?.text?.content ?? '';
  }, [clip?.id, clip?.text?.content]);
  if (!clip)
    return (
      <ProjectInspector
        project={project}
        onEdit={onEdit}
        onMessage={onMessage}
      />
    );
  const update = (patch: Partial<Clip>) =>
    onEdit([{ op: 'clip.update', id: clip.id, patch }]);
  const transform = (patch: Partial<Clip['transform']>) =>
    update({ transform: { ...clip.transform, ...patch } });
  const cropSide = (side: 'l' | 't' | 'r' | 'b', value: number) => {
    const old = { l: 0, t: 0, r: 0, b: 0, ...clip.transform.crop };
    const next = { ...old, [side]: value / 100 };
    if (clip.cropAspectLock) {
      const ratio = (1 - old.l - old.r) / Math.max(0.01, 1 - old.t - old.b);
      if (side === 'l' || side === 'r') {
        const vertical = Math.max(0, 1 - (1 - next.l - next.r) / ratio);
        next.t = Math.max(
          0,
          Math.min(vertical, old.t + (vertical - old.t - old.b) / 2),
        );
        next.b = vertical - next.t;
      } else {
        const horizontal = Math.max(0, 1 - (1 - next.t - next.b) * ratio);
        next.l = Math.max(
          0,
          Math.min(horizontal, old.l + (horizontal - old.l - old.r) / 2),
        );
        next.r = horizontal - next.l;
      }
    }
    transform({ crop: next });
  };
  const effect = (type: string, params: Record<string, unknown>) => {
    const found = clip.effects.find((e) => e.type === type);
    update({
      effects: [
        ...clip.effects.filter((item) => item.id !== found?.id),
        {
          id: found?.id ?? crypto.randomUUID(),
          type,
          params: { ...found?.params, ...params },
        },
      ],
    });
  };
  return (
    <div
      className="editor-inspector"
      key={clip.id}
      onFocusCapture={() => onInteraction(true, [clip.id])}
      onBlurCapture={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget as Node | null))
          onInteraction(false);
      }}
    >
      {suggestion ? (
        <div className="editor-suggestion">
          <button onClick={() => setShowSuggestion(!showSuggestion)}>
            kimo wants to change this too · see suggestion
          </button>
          {showSuggestion ? (
            <div>
              <p>{suggestion}</p>
              <button
                onPointerDown={(event) => event.preventDefault()}
                onClick={() => onSuggestion(true, text)}
              >
                use it
              </button>
              <button
                onPointerDown={(event) => event.preventDefault()}
                onClick={() => onSuggestion(false, text)}
              >
                keep mine
              </button>
            </div>
          ) : null}
        </div>
      ) : null}
      <details open>
        <summary>transform</summary>
        <div className="editor-fields">
          <NumberField
            label="position x"
            ai={ai}
            reset={0}
            keyframe={clip.keyframes.some(
              (key) =>
                key.property === 'x' &&
                Math.abs(key.time - (playhead - clip.start)) < 1 / project.fps,
            )}
            onKeyframe={() => {
              const time = Math.max(0, playhead - clip.start);
              const existing = clip.keyframes.find(
                (key) =>
                  key.property === 'x' &&
                  Math.abs(key.time - time) < 1 / project.fps,
              );
              update({
                keyframes: existing
                  ? clip.keyframes.filter((key) => key !== existing)
                  : [
                      ...clip.keyframes,
                      {
                        id: crypto.randomUUID(),
                        property: 'x',
                        time,
                        value: clip.transform.x,
                        easing: 'linear',
                      },
                    ],
              });
            }}
            value={clip.transform.x}
            onCommit={(x) => transform({ x })}
          />
          <NumberField
            label="position y"
            ai={ai}
            reset={0}
            keyframe={clip.keyframes.some(
              (key) =>
                key.property === 'y' &&
                Math.abs(key.time - (playhead - clip.start)) < 1 / project.fps,
            )}
            onKeyframe={() => {
              const time = Math.max(0, playhead - clip.start);
              const existing = clip.keyframes.find(
                (key) =>
                  key.property === 'y' &&
                  Math.abs(key.time - time) < 1 / project.fps,
              );
              update({
                keyframes: existing
                  ? clip.keyframes.filter((key) => key !== existing)
                  : [
                      ...clip.keyframes,
                      {
                        id: crypto.randomUUID(),
                        property: 'y',
                        time,
                        value: clip.transform.y,
                        easing: 'linear',
                      },
                    ],
              });
            }}
            value={clip.transform.y}
            onCommit={(y) => transform({ y })}
          />
          <NumberField
            label="scale %"
            ai={ai}
            reset={100}
            keyframe={clip.keyframes.some(
              (key) =>
                key.property === 'scale' &&
                Math.abs(key.time - (playhead - clip.start)) < 1 / project.fps,
            )}
            onKeyframe={() => {
              const time = Math.max(0, playhead - clip.start);
              const existing = clip.keyframes.find(
                (key) =>
                  key.property === 'scale' &&
                  Math.abs(key.time - time) < 1 / project.fps,
              );
              update({
                keyframes: existing
                  ? clip.keyframes.filter((key) => key !== existing)
                  : [
                      ...clip.keyframes,
                      {
                        id: crypto.randomUUID(),
                        property: 'scale',
                        time,
                        value: clip.transform.scale,
                        easing: 'linear',
                      },
                    ],
              });
            }}
            value={clip.transform.scale * 100}
            min={1}
            onCommit={(scale) => transform({ scale: scale / 100 })}
          />
          <NumberField
            label="rotation °"
            ai={ai}
            reset={0}
            keyframe={clip.keyframes.some(
              (key) =>
                key.property === 'rotation' &&
                Math.abs(key.time - (playhead - clip.start)) < 1 / project.fps,
            )}
            onKeyframe={() => {
              const time = Math.max(0, playhead - clip.start);
              const existing = clip.keyframes.find(
                (key) =>
                  key.property === 'rotation' &&
                  Math.abs(key.time - time) < 1 / project.fps,
              );
              update({
                keyframes: existing
                  ? clip.keyframes.filter((key) => key !== existing)
                  : [
                      ...clip.keyframes,
                      {
                        id: crypto.randomUUID(),
                        property: 'rotation',
                        time,
                        value: clip.transform.rotation,
                        easing: 'linear',
                      },
                    ],
              });
            }}
            value={clip.transform.rotation}
            onCommit={(rotation) => transform({ rotation })}
          />
          <NumberField
            label="opacity %"
            ai={ai}
            reset={100}
            keyframe={clip.keyframes.some(
              (key) =>
                key.property === 'opacity' &&
                Math.abs(key.time - (playhead - clip.start)) < 1 / project.fps,
            )}
            onKeyframe={() => {
              const time = Math.max(0, playhead - clip.start);
              const existing = clip.keyframes.find(
                (key) =>
                  key.property === 'opacity' &&
                  Math.abs(key.time - time) < 1 / project.fps,
              );
              update({
                keyframes: existing
                  ? clip.keyframes.filter((key) => key !== existing)
                  : [
                      ...clip.keyframes,
                      {
                        id: crypto.randomUUID(),
                        property: 'opacity',
                        time,
                        value: clip.transform.opacity,
                        easing: 'linear',
                      },
                    ],
              });
            }}
            value={clip.transform.opacity * 100}
            min={0}
            max={100}
            onCommit={(opacity) => transform({ opacity: opacity / 100 })}
          />
        </div>
      </details>
      <details>
        <summary>crop</summary>
        <div className="editor-field">
          aspect lock
          <Toggle
            aria-label="crop aspect lock"
            checked={clip.cropAspectLock ?? false}
            onCheckedChange={(cropAspectLock) => update({ cropAspectLock })}
          />
        </div>
        <div className="editor-fields">
          {(['l', 't', 'r', 'b'] as const).map((side) => (
            <NumberField
              key={side}
              label={side.toUpperCase()}
              value={(clip.transform.crop?.[side] ?? 0) * 100}
              min={0}
              max={99}
              onCommit={(value) => cropSide(side, value)}
            />
          ))}
        </div>
        <button onClick={() => transform({ crop: { l: 0, t: 0, r: 0, b: 0 } })}>
          reset crop
        </button>
      </details>
      <details>
        <summary>speed</summary>
        <div className="editor-field">
          keep pitch
          <Toggle
            aria-label="keep pitch"
            checked={clip.keepPitch ?? true}
            onCheckedChange={(keepPitch) => update({ keepPitch })}
          />
        </div>
        <div className="editor-speed">
          {[0.5, 1, 1.5, 2].map((n) => (
            <button
              key={n}
              aria-pressed={clip.speed === n}
              onClick={() => update({ speed: n })}
            >
              {n}×
            </button>
          ))}
        </div>
        <NumberField
          label="custom speed"
          value={clip.speed}
          min={0.1}
          max={8}
          step={0.1}
          onCommit={(speed) => update({ speed })}
        />
      </details>
      {clip.text ? (
        <details open>
          <summary>text</summary>
          <label
            className="editor-text-label"
            htmlFor={`editor-text-${clip.id}`}
          >
            content
            <Textarea
              id={`editor-text-${clip.id}`}
              aria-label="text content"
              value={text}
              onFocus={() => onInteraction(true, [clip.id])}
              onChange={(e) => {
                const content = e.target.value;
                setText(content);
                clearTimeout(localTimer.current);
                clearTimeout(saveTimer.current);
                localTimer.current = setTimeout(() => {
                  if (clip.text)
                    onDraft({ ...clip, text: { ...clip.text, content } });
                }, 150);
                saveTimer.current = setTimeout(() => {
                  if (content !== lastSaved.current) {
                    onEdit([{ op: 'text.update', clipId: clip.id, content }]);
                    lastSaved.current = content;
                  }
                }, 800);
              }}
              onBlur={() => {
                clearTimeout(localTimer.current);
                clearTimeout(saveTimer.current);
                onDraft(null);
                onInteraction(false);
                if (text !== lastSaved.current)
                  onEdit([
                    { op: 'text.update', clipId: clip.id, content: text },
                  ]);
              }}
            />
          </label>
          <label className="editor-field">
            style
            <select
              aria-label="text style"
              value={clip.text.style}
              onChange={(e) => {
                if (clip.text)
                  update({ text: { ...clip.text, style: e.target.value } });
              }}
            >
              {!styles.includes(clip.text.style) ? (
                <option value={clip.text.style}>{clip.text.style}</option>
              ) : null}
              {styles.map((style) => (
                <option key={style}>{style}</option>
              ))}
            </select>
          </label>
        </details>
      ) : null}
      <details>
        <summary>colour</summary>
        {['exposure', 'contrast', 'saturation'].map((name) => (
          <NumberField
            key={name}
            label={name}
            value={Number(
              clip.effects.find((e) => e.type === 'color_grade')?.params[
                name
              ] ?? (name === 'exposure' ? 0 : 1),
            )}
            step={0.1}
            onCommit={(n) => effect('color_grade', { [name]: n })}
          />
        ))}
      </details>
      <details>
        <summary>effects</summary>
        {clip.effects.map((item) => (
          <div className="editor-effect" key={item.id}>
            <span>{item.type}</span>
            <button
              aria-label={`remove ${item.type}`}
              onClick={() =>
                update({
                  effects: clip.effects.filter((e) => e.id !== item.id),
                })
              }
            >
              ×
            </button>
          </div>
        ))}
        <label className="editor-field">
          add effect
          <select
            aria-label="add effect"
            value=""
            onChange={(e) => {
              if (e.target.value) effect(e.target.value, {});
            }}
          >
            <option value="">choose…</option>
            {[
              'blur',
              'vignette',
              'grain',
              'sharpen',
              'black_and_white',
              'zoom-punch',
            ].map((name) => (
              <option key={name}>{name}</option>
            ))}
          </select>
        </label>
      </details>
      {clip.mask ? (
        <details>
          <summary>mask (sam 3.1)</summary>
          <label className="editor-field">
            invert
            <input
              type="checkbox"
              checked={clip.mask.invert}
              onChange={(e) => {
                if (clip.mask)
                  update({ mask: { ...clip.mask, invert: e.target.checked } });
              }}
            />
          </label>
          <NumberField
            label="feather"
            value={clip.mask.feather}
            min={0}
            onCommit={(feather) => {
              if (clip.mask) update({ mask: { ...clip.mask, feather } });
            }}
          />
        </details>
      ) : null}
      {clip.kind === 'audio' || clip.kind === 'video' ? (
        <details>
          <summary>audio</summary>
          <NumberField
            label="volume %"
            value={(clip.volume ?? 1) * 100}
            min={0}
            max={400}
            onCommit={(volume) => update({ volume: volume / 100 })}
          />
        </details>
      ) : null}
      <details>
        <summary>transitions</summary>
        {(['transitionIn', 'transitionOut'] as const).map((key) => (
          <label className="editor-field" key={key}>
            {key === 'transitionIn' ? 'in' : 'out'}
            <select
              aria-label={`${key} type`}
              value={clip[key]?.type ?? 'none'}
              onChange={(e) =>
                update({
                  [key]:
                    e.target.value === 'none'
                      ? null
                      : {
                          type: e.target.value,
                          duration: clip[key]?.duration ?? 0.4,
                        },
                })
              }
            >
              <option>none</option>
              {[
                'cross-dissolve',
                'dip-to-black',
                'slide-left',
                'slide-right',
                'slide-up',
                'slide-down',
                'zoom-in',
              ].map((name) => (
                <option key={name}>{name}</option>
              ))}
            </select>
          </label>
        ))}
      </details>
      {clip.text?.style.startsWith('caption') ? (
        <CaptionsEditor
          project={project}
          trackId={clip.trackId}
          onEdit={onEdit}
          onSeek={onSeek}
          onInteraction={onInteraction}
        />
      ) : null}
      <InspectorDetails
        clip={clip}
        assets={assets}
        onUpdate={update}
        onMessage={onMessage}
        onUpload={onUpload}
        levelDb={levelDb}
        onCompare={(enabled) => {
          const effects = clip.effects.map((effect) =>
            ['color_grade', 'colour_grade'].includes(effect.type)
              ? { ...effect, params: { ...effect.params, compare: enabled } }
              : effect,
          );
          onDraft(enabled ? { ...clip, effects } : null);
        }}
      />
      {assets.find((asset) => asset.id === clip.assetId)?.attribution ? (
        <details>
          <summary>source</summary>
          <p>
            found on{' '}
            {
              assets.find((asset) => asset.id === clip.assetId)?.attribution
                ?.site
            }
          </p>
          <a
            href={
              assets.find((asset) => asset.id === clip.assetId)?.attribution
                ?.pageUrl
            }
            target="_blank"
            rel="noreferrer"
          >
            open page
          </a>
        </details>
      ) : null}
    </div>
  );
}
