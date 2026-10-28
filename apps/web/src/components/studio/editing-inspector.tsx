'use client';
import { useEffect, useState } from 'react';
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
function NumberField({
  label,
  value,
  onCommit,
  min,
  max,
  step = 1,
}: {
  label: string;
  value: number;
  onCommit: (value: number) => void;
  min?: number;
  max?: number;
  step?: number;
}) {
  const [draft, setDraft] = useState(String(value));
  useEffect(() => setDraft(String(Math.round(value * 100) / 100)), [value]);
  return (
    <label className="editor-field">
      <span>{label}</span>
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
}: {
  clip?: Clip;
  project: KimoProject;
  assets: Asset[];
  onEdit: (ops: Op[]) => void;
  onDraft: (clip: Clip | null) => void;
  onInteraction: (active: boolean) => void;
}) {
  const [text, setText] = useState(clip?.text?.content ?? '');
  useEffect(() => {
    setText(clip?.text?.content ?? '');
  }, [clip?.id, clip?.text?.content]);
  if (!clip)
    return (
      <div className="editor-inspector">
        <h3>project</h3>
        <p>
          {project.width} × {project.height}
        </p>
        <p>duration · {project.duration.toFixed(1)}s</p>
        <p>{project.fps} fps</p>
      </div>
    );
  const update = (patch: Partial<Clip>) =>
    onEdit([{ op: 'clip.update', id: clip.id, patch }]);
  const transform = (patch: Partial<Clip['transform']>) =>
    update({ transform: { ...clip.transform, ...patch } });
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
    <div className="editor-inspector" key={clip.id}>
      <details open>
        <summary>transform</summary>
        <div className="editor-fields">
          <NumberField
            label="position x"
            value={clip.transform.x}
            onCommit={(x) => transform({ x })}
          />
          <NumberField
            label="position y"
            value={clip.transform.y}
            onCommit={(y) => transform({ y })}
          />
          <NumberField
            label="scale %"
            value={clip.transform.scale * 100}
            min={1}
            onCommit={(scale) => transform({ scale: scale / 100 })}
          />
          <NumberField
            label="rotation °"
            value={clip.transform.rotation}
            onCommit={(rotation) => transform({ rotation })}
          />
          <NumberField
            label="opacity %"
            value={clip.transform.opacity * 100}
            min={0}
            max={100}
            onCommit={(opacity) => transform({ opacity: opacity / 100 })}
          />
        </div>
      </details>
      <details>
        <summary>crop</summary>
        <div className="editor-fields">
          {(['l', 't', 'r', 'b'] as const).map((side) => (
            <NumberField
              key={side}
              label={side.toUpperCase()}
              value={(clip.transform.crop?.[side] ?? 0) * 100}
              min={0}
              max={99}
              onCommit={(value) =>
                transform({
                  crop: {
                    l: 0,
                    t: 0,
                    r: 0,
                    b: 0,
                    ...clip.transform.crop,
                    [side]: value / 100,
                  },
                })
              }
            />
          ))}
        </div>
        <button onClick={() => transform({ crop: { l: 0, t: 0, r: 0, b: 0 } })}>
          reset crop
        </button>
      </details>
      <details>
        <summary>speed</summary>
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
          <label className="editor-text-label">
            content
            <textarea
              aria-label="text content"
              value={text}
              onFocus={() => onInteraction(true)}
              onChange={(e) => {
                setText(e.target.value);
                if (clip.text)
                  onDraft({
                    ...clip,
                    text: { ...clip.text, content: e.target.value },
                  });
              }}
              onBlur={() => {
                onDraft(null);
                onInteraction(false);
                if (text !== clip.text?.content)
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
                      ? undefined
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
