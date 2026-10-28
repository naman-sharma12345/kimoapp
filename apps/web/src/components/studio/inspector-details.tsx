'use client';
import { useState } from 'react';
import { contentColors } from '@kimo/compositor/text-styles';
import type { Asset, Clip, Op, KimoProject } from '@kimo/client';
import { Button } from '@/components/ui/button';
import { Toggle } from '@/components/ui/toggle';
import { SegmentedControl } from '@/components/ui/segmented-control';
import { NumberField } from './editing-inspector';
export function ProjectInspector({
  project,
  onEdit,
  onMessage,
}: {
  project: KimoProject;
  onEdit: (ops: Op[]) => void;
  onMessage: (text: string) => void;
}) {
  const [notes, setNotes] = useState(project.notes ?? '');
  return (
    <div className="editor-inspector">
      <h3>project</h3>
      <label className="editor-field">
        aspect
        <select
          aria-label="project aspect"
          value={
            project.width === project.height
              ? '1:1'
              : project.width > project.height
                ? '16:9'
                : '9:16'
          }
          onChange={(e) => {
            const aspect = e.target.value;
            if (
              window.confirm('change the frame? kimo will reframe every clip.')
            ) {
              onEdit([
                {
                  op: 'project.update',
                  patch: {
                    width: aspect === '16:9' ? 1920 : 1080,
                    height: aspect === '9:16' ? 1920 : 1080,
                  },
                },
              ]);
              onMessage(`reframe every clip to ${aspect}`);
            }
          }}
        >
          {['16:9', '9:16', '1:1'].map((value) => (
            <option key={value}>{value}</option>
          ))}
        </select>
      </label>
      <p>duration · {project.duration.toFixed(1)}s</p>
      <p>{project.fps} fps</p>
      <label className="editor-field">
        background
        <select
          aria-label="project background"
          value={project.background ?? 'black'}
          onChange={(e) =>
            onEdit([
              {
                op: 'project.update',
                patch: {
                  background: e.target.value as 'black' | 'white' | 'cream',
                },
              },
            ])
          }
        >
          {['black', 'white', 'cream'].map((value) => (
            <option key={value}>{value}</option>
          ))}
        </select>
      </label>
      <label className="editor-text-label">
        project notes for kimo
        <textarea
          aria-label="project notes for kimo"
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          onBlur={() => {
            if (notes !== project.notes) {
              onEdit([{ op: 'project.update', patch: { notes } }]);
              if (notes.trim()) onMessage(notes);
            }
          }}
        />
      </label>
    </div>
  );
}
export function InspectorDetails({
  clip,
  assets,
  onUpdate,
  onMessage,
  onUpload,
  levelDb,
  onCompare,
}: {
  clip: Clip;
  assets: Asset[];
  onUpdate: (patch: Partial<Clip>) => void;
  onMessage: (text: string) => void;
  onUpload: () => void;
  levelDb: number;
  onCompare: (enabled: boolean) => void;
}) {
  const [query, setQuery] = useState('');
  const [dragEffect, setDragEffect] = useState<string | null>(null);
  const source = assets.find((asset) => asset.id === clip.assetId);
  const setText = (patch: Partial<NonNullable<Clip['text']>>) => {
    if (clip.text) onUpdate({ text: { ...clip.text, ...patch } });
  };
  const grade = clip.effects.find((effect) =>
    ['color_grade', 'colour_grade'].includes(effect.type),
  );
  const setGrade = (patch: Record<string, unknown>) =>
    onUpdate({
      effects: [
        ...clip.effects.filter((item) => item !== grade),
        {
          id: grade?.id ?? crypto.randomUUID(),
          type: 'color_grade',
          params: { ...grade?.params, ...patch },
        },
      ],
    });
  return (
    <>
      {clip.text ? (
        <details open>
          <summary>text formatting</summary>
          <NumberField
            label="text size"
            value={clip.text.size ?? 56}
            min={1}
            max={600}
            onCommit={(size) => setText({ size })}
          />
          <SegmentedControl
            aria-label="text alignment"
            value={clip.text.align ?? 'center'}
            options={['left', 'center', 'right'].map((value) => ({
              value,
              label: value,
            }))}
            onValueChange={(value) =>
              setText({ align: value as 'left' | 'center' | 'right' })
            }
          />
          <div className="editor-swatches">
            {contentColors.map((color) => (
              <button
                key={color}
                aria-label={`text colour ${color}`}
                style={{ background: color }}
                onClick={() => setText({ color })}
              />
            ))}
            <input
              type="color"
              aria-label="custom text colour"
              value={clip.text.color ?? contentColors[0]}
              onChange={(e) => setText({ color: e.target.value })}
            />
          </div>
          <label className="editor-field">
            animation
            <select
              aria-label="text animation"
              value={clip.text.animation ?? 'none'}
              onChange={(e) =>
                setText({
                  animation: e.target.value as NonNullable<
                    Clip['text']
                  >['animation'],
                })
              }
            >
              {['none', 'fade', 'rise', 'type on', 'pop words'].map((value) => (
                <option key={value}>{value}</option>
              ))}
            </select>
          </label>
        </details>
      ) : null}
      <details>
        <summary>colour balance</summary>
        <label className="editor-field">
          before/after
          <input
            type="checkbox"
            aria-label="before/after"
            onChange={(e) => onCompare(e.target.checked)}
          />
        </label>
        {['exposure', 'contrast', 'saturation', 'temperature', 'tint'].map(
          (name) => (
            <label className="editor-field" key={name}>
              {name}
              <input
                aria-label={`${name} slider`}
                type="range"
                min={name === 'contrast' || name === 'saturation' ? 0 : -2}
                max={2}
                step={0.01}
                value={Number(
                  grade?.params[name] ??
                    (name === 'contrast' || name === 'saturation' ? 1 : 0),
                )}
                onChange={(e) => setGrade({ [name]: Number(e.target.value) })}
              />
            </label>
          ),
        )}
        <div className="editor-grade-wheels">
          {['lift', 'gamma', 'gain'].map((name) => {
            const values = Array.isArray(grade?.params[name])
              ? (grade.params[name] as number[])
              : [
                  name === 'lift' ? 0 : 1,
                  name === 'lift' ? 0 : 1,
                  name === 'lift' ? 0 : 1,
                ];
            return (
              <div key={name}>
                <span>{name}</span>
                <input
                  type="color"
                  className="editor-colour-wheel"
                  aria-label={`${name} colour wheel`}
                  value={
                    '#' +
                    values
                      .map((value) =>
                        Math.round(Math.max(0, Math.min(1, value)) * 255)
                          .toString(16)
                          .padStart(2, '0'),
                      )
                      .join('')
                  }
                  onChange={(e) =>
                    setGrade({
                      [name]: [1, 3, 5].map(
                        (offset) =>
                          parseInt(
                            e.target.value.slice(offset, offset + 2),
                            16,
                          ) / 255,
                      ),
                    })
                  }
                />
                {['R', 'G', 'B'].map((channel, index) => (
                  <NumberField
                    key={channel}
                    label={`${name} ${channel}`}
                    value={values[index] ?? 0}
                    step={0.01}
                    min={name === 'lift' ? -1 : 0}
                    max={2}
                    onCommit={(value) =>
                      setGrade({
                        [name]: values.map((old, i) =>
                          i === index ? value : old,
                        ),
                      })
                    }
                  />
                ))}
              </div>
            );
          })}
        </div>
        <label className="editor-field">
          LUT
          <select
            aria-label="LUT"
            value={String(grade?.params.lut ?? 'none')}
            onChange={(e) => setGrade({ lut: e.target.value })}
          >
            {['none', 'warm film', 'teal & orange', 'bleach', 'mono'].map(
              (value) => (
                <option key={value}>{value}</option>
              ),
            )}
          </select>
        </label>
      </details>
      <details>
        <summary>effect order</summary>
        {clip.effects.map((effect, index) => (
          <div key={effect.id} className="editor-effect">
            <button
              type="button"
              aria-label={`reorder ${effect.type}`}
              draggable
              onDragStart={() => setDragEffect(effect.id)}
              onDragOver={(e) => e.preventDefault()}
              onDrop={() => {
                const from = clip.effects.findIndex(
                  (item) => item.id === dragEffect,
                );
                if (from < 0) return;
                const next = [...clip.effects];
                const [item] = next.splice(from, 1);
                if (item) next.splice(index, 0, item);
                onUpdate({ effects: next });
              }}
            >
              {effect.type}
            </button>
            <Toggle
              aria-label={`enable ${effect.type}`}
              checked={effect.enabled ?? true}
              onCheckedChange={(enabled) =>
                onUpdate({
                  effects: clip.effects.map((item) =>
                    item.id === effect.id ? { ...item, enabled } : item,
                  ),
                })
              }
            />
            <Button
              size="xs"
              variant="ghost"
              aria-label={`move ${effect.type} up`}
              disabled={!index}
              onClick={() => {
                const next = [...clip.effects];
                const a = next[index - 1];
                if (a) {
                  next[index - 1] = effect;
                  next[index] = a;
                  onUpdate({ effects: next });
                }
              }}
            >
              ↑
            </Button>
          </div>
        ))}
      </details>
      {clip.mask ? (
        <details>
          <summary>mask selection</summary>
          <div className="editor-mask-checkerboard">
            <div
              className="editor-mask-thumbnail"
              style={{
                backgroundImage: `url(${JSON.stringify(assets.find((asset) => asset.id === clip.mask?.maskAssetId)?.thumbUrl ?? assets.find((asset) => asset.id === clip.mask?.maskAssetId)?.url ?? '')})`,
              }}
            />
          </div>
          <p>{clip.mask.label ?? 'person'}</p>
          <SegmentedControl
            aria-label="apply effect to"
            value={clip.mask.scope ?? 'subject'}
            options={['subject', 'background'].map((value) => ({
              value,
              label: value,
            }))}
            onValueChange={(value) => {
              if (clip.mask)
                onUpdate({
                  mask: {
                    ...clip.mask,
                    scope: value as 'subject' | 'background',
                  },
                });
            }}
          />
          <input
            aria-label="re-segment: describe what to select"
            placeholder="re-segment: describe what to select"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
          <Button
            size="sm"
            disabled={!query.trim()}
            onClick={() =>
              onMessage(
                `use sam 3.1 to select "${query}" on ${source?.name ?? clip.id}`,
              )
            }
          >
            run sam
          </Button>
        </details>
      ) : null}
      {clip.kind === 'audio' || clip.kind === 'video' ? (
        <details>
          <summary>audio envelope</summary>
          <label className="editor-field">
            volume dB
            <input
              type="range"
              aria-label="volume dB"
              min={-60}
              max={12}
              step={0.1}
              value={Math.max(-60, 20 * Math.log10(clip.volume ?? 1))}
              onChange={(e) =>
                onUpdate({ volume: 10 ** (Number(e.target.value) / 20) })
              }
            />
          </label>
          <NumberField
            label="fade in (s)"
            value={clip.fadeIn ?? 0}
            min={0}
            max={clip.duration}
            step={0.1}
            onCommit={(fadeIn) => onUpdate({ fadeIn })}
          />
          <NumberField
            label="fade out (s)"
            value={clip.fadeOut ?? 0}
            min={0}
            max={clip.duration}
            step={0.1}
            onCommit={(fadeOut) => onUpdate({ fadeOut })}
          />
          <div className="editor-field">
            duck under voice
            <Toggle
              aria-label="duck under voice"
              checked={clip.duckUnderVoice ?? false}
              onCheckedChange={(duckUnderVoice) => onUpdate({ duckUnderVoice })}
            />
          </div>
          <div
            role="meter"
            className="editor-level-meter"
            aria-label="live audio level"
            aria-valuemin={-60}
            aria-valuemax={12}
            aria-valuenow={Math.max(-60, levelDb)}
            style={{
              color:
                levelDb >= 0
                  ? 'var(--error)'
                  : levelDb > -6
                    ? 'var(--warning)'
                    : 'var(--cream-60)',
            }}
          >
            {Array.from({ length: 12 }, (_, i) => (
              <span
                key={i}
                data-active={
                  i < Math.ceil(((levelDb + 60) / 72) * 12) || undefined
                }
              />
            ))}
          </div>
        </details>
      ) : null}
      {(['transitionIn', 'transitionOut'] as const).map((key) =>
        clip[key] ? (
          <NumberField
            key={key}
            label={`${key === 'transitionIn' ? 'in' : 'out'} duration (frames)`}
            value={Math.round((clip[key]?.duration ?? 0) * 30)}
            min={1}
            max={300}
            onCommit={(frames) => {
              const value = clip[key];
              if (value)
                onUpdate({ [key]: { ...value, duration: frames / 30 } });
            }}
          />
        ) : null,
      )}
      {source?.source === 'web' ? (
        <details>
          <summary>image source</summary>
          <div
            className="editor-source-thumb"
            style={{
              backgroundImage: `url(${JSON.stringify(source.thumbUrl ?? source.url)})`,
            }}
          />
          <p>found on {source.attribution?.site}</p>
          <p>{source.attribution?.license}</p>
          <Button
            size="sm"
            onClick={() =>
              onMessage(`find another image to replace ${source.name}`)
            }
          >
            replace image
          </Button>
          <Button size="sm" onClick={onUpload}>
            use my own file
          </Button>
        </details>
      ) : null}
    </>
  );
}
