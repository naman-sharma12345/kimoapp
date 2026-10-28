'use client';
import { useEffect, useRef, useState } from 'react';
import {
  projectSchema,
  assetSchema,
  type KimoProject,
  type Asset,
  type Op,
} from '@kimo/client';
import type { CompositorController } from '@kimo/compositor';
import { z } from 'zod';
import { Dialog, DialogContent } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { recentPrompts } from '@/lib/telemetry';

export const cutSchema = z.object({
  name: z.string(),
  project: projectSchema,
  assets: z.array(assetSchema),
});
export type Cut = z.infer<typeof cutSchema>;
export function readCuts(id: string): Cut[] {
  try {
    return z
      .array(cutSchema)
      .parse(JSON.parse(localStorage.getItem(`kimo.cuts.${id}`) ?? '[]'));
  } catch {
    return [];
  }
}
export function restoreCut(current: KimoProject, cut: KimoProject): Op[] {
  return [
    ...Object.keys(current.clips).map((id) => ({
      op: 'clip.remove' as const,
      id,
    })),
    ...current.tracks.map((t) => ({ op: 'track.remove' as const, id: t.id })),
    ...current.markers.map((m) => ({ op: 'marker.remove' as const, id: m.id })),
    {
      op: 'project.update',
      patch: {
        width: cut.width,
        height: cut.height,
        background: cut.background,
        notes: cut.notes,
      },
    },
    ...cut.tracks.map((track) => ({ op: 'track.add' as const, track })),
    ...Object.values(cut.clips).map((clip) => ({
      op: 'clip.add' as const,
      clip,
    })),
    ...cut.markers.map((marker) => ({ op: 'marker.add' as const, marker })),
  ];
}
export function CommandPalette({
  open,
  onOpenChange,
  project,
  assets,
  onAction,
  onClip,
  onPrompt,
  readonly,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  project: KimoProject;
  assets: Asset[];
  onAction: (action: string) => void;
  onClip: (id: string) => void;
  onPrompt: (prompt: string) => void;
  readonly: boolean;
}) {
  const [query, setQuery] = useState('');
  const origin = useRef<HTMLElement | null>(null);
  const pendingRun = useRef<(() => void) | null>(null);
  const [active, setActive] = useState(0);
  useEffect(() => {
    if (open)
      document
        .getElementById(`command-${active}`)
        ?.scrollIntoView({ block: 'nearest' });
  }, [active, open]);
  const options = [
    ...['add text', 'split', 'render', 'toggle captions'].map((label) => ({
      label,
      run: () => onAction(label),
      disabled: readonly,
    })),
    ...Object.values(project.clips).map((clip) => ({
      label:
        clip.text?.content ??
        assets.find((a) => a.id === clip.assetId)?.name ??
        clip.id,
      run: () => onClip(clip.id),
      disabled: false,
    })),
    ...recentPrompts().map((label) => ({
      label,
      run: () => onPrompt(label),
      disabled: readonly,
    })),
  ]
    .filter((item) => item.label.toLowerCase().includes(query.toLowerCase()))
    .slice(0, 30);
  const choose = (index: number) => {
    const item = options[index];
    if (!item || item.disabled) return;
    pendingRun.current = item.run;
    onOpenChange(false);
  };
  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        setQuery('');
        setActive(0);
        onOpenChange(next);
      }}
      trigger={<span hidden />}
    >
      <DialogContent
        onOpenAutoFocus={() => {
          origin.current =
            document.activeElement instanceof HTMLElement
              ? document.activeElement
              : null;
        }}
        onCloseAutoFocus={(e) => {
          e.preventDefault();
          if (pendingRun.current) {
            const run = pendingRun.current;
            pendingRun.current = null;
            requestAnimationFrame(() => {
              run();
              requestAnimationFrame(() => {
                if (document.activeElement === document.body)
                  origin.current?.focus({ preventScroll: true });
              });
            });
            return;
          }
          const target = origin.current?.isConnected
            ? origin.current
            : document.querySelector<HTMLElement>('#main');
          target?.focus({ preventScroll: true });
        }}
        title="commands"
        description="search actions, clips and recent prompts"
      >
        <input
          className="launch-search"
          aria-label="search commands"
          role="combobox"
          aria-expanded="true"
          aria-controls="command-results"
          aria-autocomplete="list"
          aria-activedescendant={
            options[active] ? `command-${active}` : undefined
          }
          value={query}
          onChange={(e) => {
            setQuery(e.target.value);
            setActive(0);
          }}
          onKeyDown={(e) => {
            if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
              e.preventDefault();
              setActive(
                (i) =>
                  (i +
                    (e.key === 'ArrowDown' ? 1 : -1) +
                    Math.max(1, options.length)) %
                  Math.max(1, options.length),
              );
            }
            if (e.key === 'Enter') {
              e.preventDefault();
              choose(active);
            }
          }}
        />
        <div
          id="command-results"
          role="listbox"
          aria-label="commands"
          className="launch-results"
        >
          {options.map((item, index) => (
            <button
              type="button"
              role="option"
              tabIndex={-1}
              id={`command-${index}`}
              key={`${item.label}-${index}`}
              aria-selected={index === active}
              aria-disabled={item.disabled}
              disabled={item.disabled}
              className="ui-button ui-button-ghost ui-size-md"
              onMouseMove={() => setActive(index)}
              onClick={() => choose(index)}
            >
              <span className="launch-truncate" title={item.label}>
                {item.label}
              </span>
            </button>
          ))}
          {!options.length ? <p>no matching commands</p> : null}
        </div>
      </DialogContent>
    </Dialog>
  );
}
export function ComparePreview({
  cut,
  source,
  onClose,
}: {
  cut: Cut;
  source: () => { time: number; playing: boolean; rate: number };
  onClose: () => void;
}) {
  const canvas = useRef<HTMLCanvasElement>(null);
  const controller = useRef<CompositorController | null>(null);
  const [position, setPosition] = useState(50);
  const [error, setError] = useState(false);
  const clock = useRef(source);
  clock.current = source;
  useEffect(() => {
    let disposed = false;
    let instance: CompositorController | undefined;
    let frame = 0;
    let playRequested = false;
    void import('@kimo/compositor')
      .then(async ({ CompositorController }) => {
        if (disposed || !canvas.current) return;
        instance = new CompositorController(
          canvas.current,
          cut.project,
          cut.assets,
          () => {},
        );
        controller.current = instance;
        instance.setVolume(0);
        await instance.mount();
        if (disposed) return;
        const sync = () => {
          if (disposed || !instance) return;
          const state = clock.current();
          const target = Math.max(
            0,
            Math.min(cut.project.duration, state.time),
          );
          if (Math.abs(instance.current - target) > 1 / cut.project.fps)
            instance.seek(target);
          if (instance.playbackRate !== state.rate)
            instance.setSpeed(state.rate);
          if (
            state.playing &&
            target < cut.project.duration &&
            !instance.isPlaying &&
            !playRequested
          ) {
            playRequested = true;
            void instance.play().finally(() => {
              playRequested = false;
            });
          } else if (
            (!state.playing || target >= cut.project.duration) &&
            instance.isPlaying
          )
            instance.pause();
          frame = requestAnimationFrame(sync);
        };
        instance.seek(clock.current().time);
        sync();
      })
      .catch(() => {
        if (!disposed) setError(true);
      });
    return () => {
      disposed = true;
      cancelAnimationFrame(frame);
      instance?.destroy();
      controller.current = null;
    };
  }, [cut]);
  return (
    <div className="launch-compare">
      <canvas
        ref={canvas}
        aria-label={`comparison preview · ${cut.name}`}
        style={{ clipPath: `inset(0 ${100 - position}% 0 0)` }}
      />
      <div className="launch-compare-line" style={{ left: `${position}%` }} />
      <div className="launch-compare-controls">
        <span>
          {error ? 'comparison unavailable' : `${cut.name} / current cut`}
        </span>
        <Button size="sm" onClick={onClose}>
          close comparison
        </Button>
      </div>
      <input
        type="range"
        min="0"
        max="100"
        value={position}
        onChange={(e) => setPosition(Number(e.target.value))}
        aria-label="comparison split position"
      />
    </div>
  );
}
const lessons = [
  'talk to kimo here, even while it’s working',
  'double-click any text to rewrite it',
  'render when you’re happy',
];
export function StudioCoach() {
  const [step, setStep] = useState<number | null>(null);
  useEffect(() => {
    try {
      if (!localStorage.getItem('kimo.coached')) setStep(0);
    } catch {
      /* No persistence available. */
    }
  }, []);
  if (step === null) return null;
  const dismiss = () => {
    try {
      localStorage.setItem('kimo.coached', '1');
    } catch {
      /* Dismiss for this visit. */
    }
    setStep(null);
  };
  return (
    <aside
      className="launch-coach"
      data-step={step}
      aria-label="studio tips"
      role="region"
    >
      <p>{lessons[step]}</p>
      <div>
        <Button size="sm" onClick={dismiss}>
          got it
        </Button>
        {step < 2 ? (
          <Button size="sm" onClick={() => setStep(step + 1)}>
            next
          </Button>
        ) : null}
      </div>
    </aside>
  );
}
