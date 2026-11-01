import { useEffect, useState } from 'react';
import { Button } from '@web/components/ui/button';
import { kimo } from './lib.js';
import clean from '../../data/looks/clean.json';
import warm from '../../data/looks/warm-creator.json';
import crisp from '../../data/looks/mkbhd-crisp.json';
import cinematic from '../../data/looks/cinematic-teal-orange.json';
import vlog from '../../data/looks/vlog-bright.json';
import documentary from '../../data/looks/moody-doc.json';
import brand from '../../data/looks/kimo.json';
const LOOKS = [clean, warm, crisp, cinematic, vlog, documentary, brand];
const previews = import.meta.glob('../../data/looks/previews/*.webp', {
  eager: true,
  query: '?url',
  import: 'default',
});

export function ColourFinish({ project, isBusy, guard, setLibrary }) {
  const current = project.edl?.color_finish;
  const [look, setLook] = useState(current?.look ?? 'clean'),
    [strength, setStrength] = useState(current?.strength ?? 1),
    [grain, setGrain] = useState(current?.grain ?? false),
    [vignette, setVignette] = useState(current?.vignette ?? false);
  useEffect(() => {
    setLook(current?.look ?? 'clean');
    setStrength(current?.strength ?? 1);
    setGrain(current?.grain ?? false);
    setVignette(current?.vignette ?? false);
  }, [
    project.id,
    current?.look,
    current?.strength,
    current?.grain,
    current?.vignette,
  ]);
  const selected = LOOKS.find((l) => l.id === look) ?? clean;
  const changed =
    look !== (current?.look ?? 'clean') ||
    strength !== (current?.strength ?? 1) ||
    grain !== (current?.grain ?? false) ||
    vignette !== (current?.vignette ?? false) ||
    !current;
  const apply = guard(async () => {
    const p = await kimo.setColor({
      id: project.id,
      look,
      strength,
      grain,
      vignette,
      sharpen: current?.sharpen !== false,
    });
    if (p)
      setLibrary((list) =>
        list.map((old) => (old.id === p.id ? { ...old, ...p } : old)),
      );
  });
  return (
    <div className="desk-rerender" role="group" aria-label="colour finish">
      <span className="studio-heading">colour finish</span>
      <label className="desk-select">
        <span>look</span>
        <select
          aria-label="colour look"
          value={look}
          disabled={isBusy}
          onChange={(e) => {
            setLook(e.target.value);
            if (!LOOKS.find((l) => l.id === e.target.value)?.grain)
              setGrain(false);
          }}
        >
          {LOOKS.map((l) => (
            <option key={l.id} value={l.id}>
              {l.label}
            </option>
          ))}
        </select>
      </label>
      <label className="ui-field">
        <span>strength · {Math.round(strength * 100)}%</span>
        <input
          className="ui-input"
          style={{ accentColor: 'var(--cream-100)' }}
          aria-label="look strength"
          type="range"
          min="0"
          max="1"
          step="0.05"
          value={strength}
          disabled={isBusy}
          onChange={(e) => setStrength(Number(e.target.value))}
        />
      </label>
      {previews[`../../data/looks/previews/${look}.webp`] ? (
        <img
          className="w-full"
          src={previews[`../../data/looks/previews/${look}.webp`]}
          alt={`source on the left, ${selected.label} reference on the right`}
        />
      ) : null}
      <span className="desk-fine">
        reference at full strength · ProPublica · CC BY 3.0 · colour changed
      </span>
      <label className="ui-field">
        <span>
          <input
            type="checkbox"
            style={{ accentColor: 'var(--cream-100)' }}
            checked={grain}
            disabled={isBusy || !selected.grain}
            onChange={(e) => setGrain(e.target.checked)}
          />{' '}
          subtle grain
        </span>
      </label>
      <label className="ui-field">
        <span>
          <input
            type="checkbox"
            style={{ accentColor: 'var(--cream-100)' }}
            checked={vignette}
            disabled={isBusy}
            onChange={(e) => setVignette(e.target.checked)}
          />{' '}
          subtle vignette
        </span>
      </label>
      <Button
        size="sm"
        disabled={isBusy || !project.edl || !changed}
        onClick={apply}
      >
        apply colour & re-render
      </Button>
    </div>
  );
}
