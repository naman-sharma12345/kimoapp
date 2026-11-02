import { useEffect, useRef, useState } from 'react';
import {
  Tabs,
  TabsList,
  TabsTrigger,
  TabsContent,
} from '@web/components/ui/tabs';
import { Button } from '@web/components/ui/button';
import { ColourFinish } from './ColourFinish.jsx';
import { TEMPLATES, NAMES, captionIds, captionPreview } from './creator-ui.js';
import { kimo, media } from './lib.js';
export function StudioSlider({
  label,
  value,
  min,
  max,
  step,
  onCommit,
  onPreview,
  disabled,
}) {
  const [draft, setDraft] = useState(value),
    sent = useRef(value);
  useEffect(() => {
    setDraft(value);
    sent.current = value;
  }, [value]);
  const commit = () => {
    if (draft !== sent.current) {
      sent.current = draft;
      onCommit(draft);
    }
  };
  return (
    <label className="ui-field">
      <span>
        {label} · {Number(draft).toFixed(step < 1 ? 2 : 0)}
      </span>
      <input
        className="ui-input"
        aria-label={label}
        type="range"
        min={min}
        max={max}
        step={step}
        value={draft}
        disabled={disabled}
        onChange={(e) => {
          const n = Number(e.target.value);
          setDraft(n);
          onPreview?.(n);
        }}
        onPointerUp={commit}
        onKeyUp={commit}
        onBlur={commit}
      />
    </label>
  );
}
function useStemPreview(project, video) {
  const state = useRef(null);
  useEffect(
    () => () => {
      const s = state.current;
      if (!s) return;
      for (const remove of s.remove) remove();
      for (const a of s.audio) a.pause();
      s.context.close();
      if (video.current) video.current.muted = s.muted;
      state.current = null;
    },
    [project.id, project.updated, video],
  );
  return (levels) => {
    const v = video.current;
    if (!v || !project.stems) return;
    if (!state.current) {
      const context = new AudioContext(),
        audio = ['voice', 'music', 'sfx'].map(
          (k) => new Audio(media(project.stems[k])),
        ),
        nodes = audio.map((a) => {
          const source = context.createMediaElementSource(a),
            gain = context.createGain();
          source.connect(gain).connect(context.destination);
          return gain;
        });
      const muted = v.muted;
      v.muted = true;
      const sync = () =>
        audio.forEach((a) => {
          if (Number.isFinite(a.duration))
            a.currentTime = Math.min(a.duration, v.currentTime);
        });
      const play = () => {
          sync();
          audio.forEach((a) => a.play().catch(() => {}));
        },
        pause = () => audio.forEach((a) => a.pause());
      const remove = [];
      for (const [event, fn] of [
        ['play', play],
        ['pause', pause],
        ['seeking', sync],
      ]) {
        v.addEventListener(event, fn);
        remove.push(() => v.removeEventListener(event, fn));
      }
      state.current = { context, audio, nodes, remove, muted };
      if (!v.paused) play();
    }
    state.current.context.resume().catch(() => {});
    ['voice', 'music', 'sfx'].forEach((k, i) =>
      state.current.nodes[i].gain.setTargetAtTime(
        10 ** (levels[k] / 20),
        state.current.context.currentTime,
        0.03,
      ),
    );
  };
}
export function CreatorInspector({
  project,
  status,
  tab,
  setTab,
  patch,
  guard,
  notify,
  setLibrary,
  isBusy,
  video,
  split,
  setSplit,
  renderExport,
  renderQuality,
  renderYoutube,
}) {
  const settings = project.edl?.creator_settings ?? {},
    captions = settings.captions ?? {},
    music = settings.music ?? {},
    sample =
      project.edl?.overlays.find((o) => o.kind === 'caption_word_group')?.props
        .text ?? 'clear words, one idea';
  const [catalog, setCatalog] = useState({ music: [] }),
    [levels, setLevels] = useState(
      settings.levels ?? { voice: 0, music: 0, sfx: 0 },
    );
  const musicPlayer = useRef(null),
    previewLevels = useStemPreview(project, video);
  useEffect(() => {
    let active = true;
    kimo
      .creatorCatalog?.()
      .then((data) => {
        if (active) setCatalog(data);
      })
      .catch((error) => notify(error.message));
    return () => {
      active = false;
      musicPlayer.current?.pause();
    };
  }, [notify]);
  useEffect(
    () => setLevels(settings.levels ?? { voice: 0, music: 0, sfx: 0 }),
    [settings.levels],
  );
  const change = (command) => patch(command),
    regenerate = (part) => change({ type: 'regenerate', part });
  const parts = (
    <div className="creator-actions">
      <Button
        size="xs"
        variant="ghost"
        disabled={isBusy}
        onClick={() => regenerate('new hook')}
      >
        new hook
      </Button>
      <Button
        size="xs"
        variant="ghost"
        disabled={isBusy}
        onClick={() => {
          const index = catalog.music.findIndex((m) => m.id === music.track),
            next = catalog.music[(index + 1) % catalog.music.length];
          if (next) change({ type: 'music', track: next.id, enabled: true });
        }}
      >
        different music
      </Button>
      <Button
        size="xs"
        variant="ghost"
        disabled={isBusy}
        onClick={() =>
          change({
            type: 'edit',
            energy: Math.min(5, (settings.energy ?? 3) + 1),
          })
        }
      >
        more zooms
      </Button>
      <Button
        size="xs"
        variant="ghost"
        disabled={isBusy}
        onClick={() =>
          change({
            type: 'edit',
            energy: Math.max(1, (settings.energy ?? 3) - 1),
          })
        }
      >
        less zooms
      </Button>
      <Button
        size="xs"
        variant="ghost"
        disabled={isBusy}
        onClick={() => regenerate('new b-roll picks')}
      >
        new b-roll picks
      </Button>
      <Button
        size="xs"
        variant="ghost"
        disabled={isBusy}
        onClick={() =>
          change({
            type: 'captions',
            style:
              captionIds[
                (captionIds.indexOf(captions.style) + 1) % captionIds.length
              ],
          })
        }
      >
        re-style captions
      </Button>
    </div>
  );
  return (
    <div className="creator-inspector">
      <Tabs value={tab} onValueChange={setTab}>
        <TabsList aria-label="inspector views">
          {[
            ['edit', 'Edit'],
            ['captions', 'Captions'],
            ['sound', 'Sound'],
            ['look', 'Look'],
            ['export', 'Export'],
            ['quality', 'Quality'],
            ['youtube', 'YouTube pack'],
          ].map(([id, label]) => (
            <TabsTrigger key={id} value={id}>
              {label}
            </TabsTrigger>
          ))}
        </TabsList>
        <TabsContent value="edit">
          <div className="creator-inspector-body">
            {(project.edl?.studio?.warnings ?? []).map((warning, i) => (
              <p key={i} role="status">
                {warning}
              </p>
            ))}
            <label className="ui-field">
              <span>template</span>
              <select
                className="ui-input"
                aria-label="edit template"
                disabled={isBusy}
                value={settings.template ?? project.style}
                onChange={(e) =>
                  change({ type: 'template', id: e.target.value })
                }
              >
                {TEMPLATES.map((t, i) => (
                  <option key={t.id} value={t.id}>
                    {NAMES[i]}
                  </option>
                ))}
              </select>
            </label>
            <StudioSlider
              label="energy"
              value={settings.energy ?? 3}
              min={1}
              max={5}
              step={1}
              disabled={isBusy}
              onCommit={(energy) => change({ type: 'edit', energy })}
            />
            <StudioSlider
              label="pause tightness"
              value={settings.pause ?? 0.2}
              min={0.05}
              max={1}
              step={0.05}
              disabled={isBusy}
              onCommit={(pause) => change({ type: 'edit', pause })}
            />
            {parts}
            <div className="creator-actions">
              <Button
                size="xs"
                variant="ghost"
                disabled={isBusy}
                onClick={() => regenerate('new hook')}
              >
                regenerate hook
              </Button>
              <Button
                size="xs"
                variant="ghost"
                disabled={isBusy}
                onClick={() => regenerate('new b-roll picks')}
              >
                regenerate b-roll
              </Button>
            </div>
          </div>
        </TabsContent>
        <TabsContent value="captions">
          <div className="creator-inspector-body">
            <div
              className="creator-caption-gallery"
              role="group"
              aria-label="caption style gallery"
            >
              {captionIds.map((id) => (
                <button
                  type="button"
                  key={id}
                  onPointerEnter={(e) => {
                    if (!matchMedia('(prefers-reduced-motion: reduce)').matches)
                      e.currentTarget
                        .querySelector('video')
                        ?.play()
                        .catch(() => {});
                  }}
                  onPointerLeave={(e) =>
                    e.currentTarget.querySelector('video')?.pause()
                  }
                  onFocus={(e) => {
                    if (!matchMedia('(prefers-reduced-motion: reduce)').matches)
                      e.currentTarget
                        .querySelector('video')
                        ?.play()
                        .catch(() => {});
                  }}
                  onBlur={(e) =>
                    e.currentTarget.querySelector('video')?.pause()
                  }
                  aria-pressed={captions.style === id}
                  disabled={isBusy}
                  data-caption-style={id}
                  onClick={() => change({ type: 'captions', style: id })}
                >
                  <video
                    muted
                    loop
                    playsInline
                    preload="metadata"
                    src={captionPreview(id)}
                    aria-label={`${id} caption preview`}
                  />
                  <span>{sample}</span>
                  <small>{id}</small>
                </button>
              ))}
            </div>
            <StudioSlider
              label="caption size"
              value={captions.font_scale ?? 1}
              min={0.55}
              max={1.3}
              step={0.05}
              disabled={isBusy}
              onCommit={(size) => change({ type: 'captions', size })}
            />
            <label className="ui-field">
              <span>position</span>
              <select
                className="ui-input"
                aria-label="caption position"
                disabled={isBusy}
                value={captions.position ?? 'auto'}
                onChange={(e) =>
                  change({ type: 'captions', position: e.target.value })
                }
              >
                {['auto', 'top', 'middle', 'bottom'].map((v) => (
                  <option key={v}>{v}</option>
                ))}
              </select>
            </label>
            <label className="ui-field">
              <span>accent colour</span>
              <select
                className="ui-input"
                aria-label="accent colour"
                value={settings.accent ?? 'template'}
                disabled={isBusy}
                onChange={(e) =>
                  change({ type: 'captions', accent: e.target.value })
                }
              >
                {['template', 'cream', 'orange'].map((v) => (
                  <option key={v}>{v}</option>
                ))}
              </select>
            </label>
          </div>
        </TabsContent>
        <TabsContent value="sound">
          <div className="creator-inspector-body">
            <p className="desk-fine">
              {project.stems
                ? 'Drag to audition the retained stems; release to update the master.'
                : 'Retained stems appear after this edit is rendered.'}
            </p>
            {['voice', 'music', 'sfx'].map((k) => (
              <StudioSlider
                key={k}
                label={`${k} level`}
                value={settings.levels?.[k] ?? 0}
                min={-60}
                max={6}
                step={1}
                disabled={isBusy}
                onPreview={(n) => {
                  const next = { ...levels, [k]: n };
                  setLevels(next);
                  previewLevels(next);
                }}
                onCommit={(n) => change({ type: 'levels', ...levels, [k]: n })}
              />
            ))}
            <Button
              size="sm"
              variant="ghost"
              disabled={isBusy}
              onClick={() => change({ type: 'music', enabled: false })}
            >
              no music
            </Button>
            <div
              className="creator-music-list"
              role="group"
              aria-label="music track picker"
            >
              {catalog.music.map((m) => (
                <div key={m.id}>
                  <button
                    type="button"
                    aria-pressed={music.track === m.id}
                    disabled={isBusy}
                    onClick={() =>
                      change({ type: 'music', track: m.id, enabled: true })
                    }
                  >
                    {m.title}
                    <small>
                      {m.mood} · {m.bpm} bpm
                    </small>
                  </button>
                  <Button
                    size="xs"
                    variant="ghost"
                    aria-label={`play ${m.title}`}
                    onClick={() => {
                      musicPlayer.current?.pause();
                      musicPlayer.current = new Audio(media(m.path));
                      musicPlayer.current
                        .play()
                        .catch((error) => notify(error.message));
                    }}
                  >
                    play
                  </Button>
                </div>
              ))}
            </div>
          </div>
        </TabsContent>
        <TabsContent value="look">
          <ColourFinish
            project={project}
            isBusy={isBusy}
            guard={guard}
            setLibrary={setLibrary}
            onApply={(settings) =>
              patch({
                type: 'look',
                ...Object.fromEntries(
                  Object.entries(settings).filter(([k]) => k !== 'id'),
                ),
              })
            }
          />
          <label className="creator-split-control">
            <input
              type="checkbox"
              checked={split}
              onChange={(e) => setSplit(e.target.checked)}
            />
            before/after split
          </label>
        </TabsContent>
        <TabsContent value="export">{renderExport()}</TabsContent>
        <TabsContent value="quality">
          {renderQuality()}
          <div className="creator-inspector-body">
            <strong>creator measurements</strong>
            <ul className="creator-metrics">
              {Object.entries(project.quality?.creator?.metrics ?? {}).map(
                ([k, v]) => (
                  <li key={k}>
                    <span>{k.replaceAll('_', ' ')}</span>
                    <b>{v == null ? 'unavailable' : String(v)}</b>
                  </li>
                ),
              )}
            </ul>
          </div>
        </TabsContent>
        <TabsContent value="youtube">{renderYoutube()}</TabsContent>
      </Tabs>
    </div>
  );
}
export function CreatorSplit({ project, video }) {
  const ref = useRef(null),
    [split, setSplit] = useState(50);
  useEffect(() => {
    const v = video.current,
      b = ref.current;
    if (!v || !b) return;
    const sync = () => {
      const c = project.edl?.video
          .flatMap((t) => t.clips)
          .findLast(
            (c) =>
              v.currentTime >= c.at &&
              v.currentTime < c.at + (c.out - c.in) / (c.speed ?? 1),
          ),
        source =
          project.beforeOutput ??
          project.edl?.sources.find((s) => s.id === c?.src)?.path ??
          project.files[0]?.path,
        url = media(source);
      if (b.dataset.source !== source) {
        b.dataset.source = source;
        b.src = url;
      }
      const at = project.beforeOutput
        ? v.currentTime
        : (c?.in ?? 0) + (v.currentTime - (c?.at ?? 0)) * (c?.speed ?? 1);
      if (Number.isFinite(b.duration) && Math.abs(b.currentTime - at) > 0.1)
        b.currentTime = Math.min(b.duration, Math.max(0, at));
      if (!v.paused) b.play().catch(() => {});
      else b.pause();
    };
    ['timeupdate', 'play', 'pause', 'seeking'].forEach((e) =>
      v.addEventListener(e, sync),
    );
    sync();
    return () => {
      ['timeupdate', 'play', 'pause', 'seeking'].forEach((e) =>
        v.removeEventListener(e, sync),
      );
      b.pause();
    };
  }, [project, video]);
  return (
    <div className="creator-split">
      <video
        ref={ref}
        muted
        playsInline
        style={{ clipPath: `inset(0 ${100 - split}% 0 0)` }}
        aria-label="before look"
      />
      <span>before</span>
      <input
        aria-label="before after split position"
        type="range"
        min="0"
        max="100"
        value={split}
        onChange={(e) => setSplit(Number(e.target.value))}
      />
    </div>
  );
}
