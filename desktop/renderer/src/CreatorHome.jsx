import { useEffect, useRef } from 'react';
import { Button } from '@web/components/ui/button';
import { TEMPLATES, NAMES, VIBES, previewFor, lookIds } from './creator-ui.js';
import { kimo, base } from './lib.js';
function Preview({ id, active }) {
  const ref = useRef(null);
  useEffect(() => {
    const v = ref.current,
      query = matchMedia('(prefers-reduced-motion: reduce)');
    const update = () => {
      if (!v) return;
      if (active && !query.matches && !document.hidden)
        v.play().catch(() => {});
      else v.pause();
    };
    update();
    query.addEventListener('change', update);
    document.addEventListener('visibilitychange', update);
    return () => {
      query.removeEventListener('change', update);
      document.removeEventListener('visibilitychange', update);
    };
  }, [active]);
  return (
    <video
      ref={ref}
      src={previewFor(id)}
      muted
      loop
      playsInline
      preload={active ? 'auto' : 'metadata'}
      aria-label={`${NAMES[TEMPLATES.findIndex((t) => t.id === id)]} preview`}
    />
  );
}
export function CreatorHome({
  style,
  onStyle,
  options,
  onOptions,
  musicFile,
  onMusicFile,
  guard,
}) {
  const t = TEMPLATES.find((t) => t.id === style) ?? TEMPLATES[0],
    set = (key, value) => onOptions({ ...options, [key]: value });
  const reset = (key) =>
    onOptions(
      Object.fromEntries(Object.entries(options).filter(([k]) => k !== key)),
    );
  return (
    <section className="creator-home" aria-label="creator templates">
      <div
        className="creator-template-list"
        role="group"
        aria-label="template picker"
      >
        {TEMPLATES.map((t, i) => (
          <button
            type="button"
            className="creator-template"
            data-selected={style === t.id || undefined}
            aria-pressed={style === t.id}
            key={t.id}
            onClick={() => {
              onStyle(t.id);
              onOptions({});
              onMusicFile(null);
            }}
          >
            <Preview id={t.id} active={style === t.id} />
            <strong>{NAMES[i]}</strong>
            <span>{VIBES[i]}</span>
            <small>
              {t.platform === 'vertical'
                ? '9:16'
                : t.platform === 'landscape'
                  ? '16:9'
                  : 'any aspect'}{' '}
              · {t.duration.max_s ? `${t.duration.max_s} s` : 'full length'}
            </small>
          </button>
        ))}
      </div>
      <div className="creator-overrides">
        <label className="desk-select">
          <span>length target</span>
          <select
            aria-label="length target"
            value={options.length ?? 'auto'}
            onChange={(e) =>
              set(
                'length',
                /^\d+$/.test(e.target.value)
                  ? Number(e.target.value)
                  : e.target.value,
              )
            }
          >
            {['auto', 30, 45, 60, 'full'].map((v) => (
              <option key={v} value={v}>
                {typeof v === 'number' ? `${v} s` : v}
              </option>
            ))}
          </select>
        </label>
        <label className="desk-select">
          <span>look override</span>
          <select
            aria-label="look override"
            value={options.look ?? 'auto'}
            onChange={(e) => set('look', e.target.value)}
          >
            <option value="auto">{t.color.look} · template</option>
            {lookIds.map((id) => (
              <option key={id}>{id}</option>
            ))}
          </select>
        </label>
        <label className="desk-select">
          <span>music</span>
          <select
            aria-label="music mode"
            value={options.music ?? 'on'}
            onChange={guard(async (e) => {
              const value = e.target.value;
              if (value === 'file') {
                const f = await kimo.pickMusic();
                if (!f) return;
                onMusicFile(f);
              } else onMusicFile(null);
              set('music', value);
            })}
          >
            <option value="on">on · {t.audio.music_mood}</option>
            <option value="off">off</option>
            <option value="file">your file</option>
          </select>
        </label>
      </div>
      <div className="creator-pills" aria-label="template overrides">
        {Object.entries(options)
          .filter(
            ([k, v]) => v !== { length: 'auto', look: 'auto', music: 'on' }[k],
          )
          .map(([k, v]) => (
            <button
              type="button"
              key={k}
              onClick={() => {
                reset(k);
                if (k === 'music') onMusicFile(null);
              }}
              aria-label={`reset ${k} override`}
            >
              {k}: {k === 'music' && musicFile ? base(musicFile.path) : v} ×
            </button>
          ))}
      </div>
      <details className="creator-preview-credits">
        <summary>preview credits</summary>
        <p>
          ProPublica · Unedited: ProPublica Interviews President Biden,
          September 2023. CC BY 3.0. Silent excerpts, cropped and reframed, with
          template-name labels. No endorsement. These samples show framing and
          captions, not a complete edit.
        </p>
        <a
          href="https://commons.wikimedia.org/wiki/File:Unedited-_ProPublica_Interviews_President_Biden,_September_2023.webm"
          target="_blank"
          rel="noreferrer"
        >
          source
        </a>{' '}
        ·{' '}
        <a
          href="https://creativecommons.org/licenses/by/3.0/"
          target="_blank"
          rel="noreferrer"
        >
          licence
        </a>
      </details>
    </section>
  );
}
