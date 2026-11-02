import { createPortal } from 'react-dom';
import { useEffect, useRef, useState } from 'react';
import { stageForTool, STAGES } from '../../studio-model.mjs';
export function CreatorFeed({ feed, project, now }) {
  const container = useRef(null);
  const groups = STAGES.map((label, index) => ({
    label,
    index,
    items: feed.entries.filter(
      (e) =>
        e.type === 'op' &&
        (/critic|review/i.test(e.tool + ' ' + e.title)
          ? 8
          : stageForTool(e.tool ?? '')) === index,
    ),
  }));
  const current = groups.find((g) =>
    g.items.some((e) => e.status === 'running'),
  )?.index;
  useEffect(() => {
    container.current?.querySelector('details[data-live]')?.scrollIntoView({
      block: 'nearest',
      behavior: matchMedia('(prefers-reduced-motion: reduce)').matches
        ? 'instant'
        : 'smooth',
    });
  }, [current]);
  return (
    <div
      ref={container}
      className="creator-feed"
      aria-label="creator edit stages"
    >
      {project.status === 'running' && !feed.entries.length ? (
        <div
          className="creator-skeleton"
          aria-label="waiting for stage details"
        />
      ) : null}
      {groups.map((g) => {
        const running = g.items.some((e) => e.status === 'running'),
          failed = g.items.some((e) => e.status === 'failed'),
          done = g.items.length && !running && !failed;
        return (
          <details
            key={g.label}
            open={running || undefined}
            data-live={running || undefined}
          >
            <summary>
              <span
                className="creator-stage-dot"
                data-live={running || undefined}
              />
              {g.label}
              <span className="creator-stage-state">
                {g.index === 9 && project.status === 'done'
                  ? `${project.creator?.score ?? '—'}/100`
                  : running
                    ? 'live'
                    : failed
                      ? 'needs attention'
                      : done
                        ? 'done'
                        : current !== undefined && g.index > current
                          ? 'waiting'
                          : '—'}
              </span>
            </summary>
            <ul>
              {g.items.map((e) => (
                <li key={e.id}>
                  <strong>{e.title}</strong>
                  <small>
                    {e.status === 'running'
                      ? `${Math.max(0, (now - e.t0) / 1000).toFixed(1)} s`
                      : e.ms != null
                        ? `${(e.ms / 1000).toFixed(1)} s`
                        : ''}{' '}
                    · {e.error ?? e.result ?? e.status}
                  </small>
                </li>
              ))}
              {g.index === 7 && feed.progress ? (
                <li>
                  {feed.progress.label} ·{' '}
                  {feed.progress.eta != null
                    ? `${Math.ceil(feed.progress.eta)} s ETA`
                    : 'estimating ETA'}
                </li>
              ) : null}
              {g.index === 8
                ? project.creator?.transitions?.flatMap((r, i) =>
                    r.problems?.map((p, j) => (
                      <li key={`${i}-${j}`}>
                        {p.severity} · {p.message}
                      </li>
                    )),
                  )
                : null}
              {!g.items.length ? (
                <li>
                  {g.index === 9 && project.status === 'done'
                    ? (project.creator?.stop ?? 'edit ready')
                    : 'No operation recorded for this stage.'}
                </li>
              ) : null}
            </ul>
          </details>
        );
      })}
    </div>
  );
}
const descriptions = {
  hook: 'Early speech and a supported hook title.',
  dead_air: 'Speech pauses, measured from transcript timing.',
  filler: 'Filler words and repeated takes.',
  cadence: 'Shot length and time without a visual change.',
  framing: 'Varied framing across the edit.',
  motion: 'Source-referenced jitter and frame identity.',
  captions: 'Word timing, safe area and face overlap.',
  sound: 'Measured loudness, peak, range and ducking.',
  colour: 'Clip match and output clipping.',
};
export function CreatorScore({ project }) {
  const number = useRef(null),
    previous = useRef(0);
  useEffect(() => {
    const target = project.creator?.score;
    if (target == null || !number.current) return;
    const duration =
        Number.parseFloat(
          getComputedStyle(document.documentElement).getPropertyValue(
            '--dur-3',
          ),
        ) || 220,
      start = performance.now(),
      from = previous.current;
    previous.current = target;
    if (matchMedia('(prefers-reduced-motion: reduce)').matches) {
      number.current.textContent = String(target);
      return;
    }
    let raf;
    const tick = (now) => {
      const u = Math.min(1, (now - start) / duration);
      if (number.current)
        number.current.textContent = String(
          Math.round((from + (target - from) * (1 - (1 - u) ** 3)) * 10) / 10,
        );
      if (u < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [project.creator?.score]);
  const score = project.creator?.score,
    target =
      project.creator?.target ??
      (project.edl?.canvas.h > project.edl?.canvas.w ? 85 : 80),
    groups = project.quality?.creator?.groups ?? {};
  const state =
    score == null
      ? 'unknown'
      : score >= target
        ? 'good'
        : score >= target - 10
          ? 'near'
          : 'low';
  const [open, setOpen] = useState(false),
    [position, setPosition] = useState({}),
    button = useRef(null),
    popup = useRef(null);
  useEffect(() => {
    if (!open) return;
    popup.current?.focus();
    const close = (e) => {
      if (e.type === 'keydown') {
        if (e.key === 'Escape') {
          setOpen(false);
          button.current?.focus();
        }
      } else if (
        !popup.current?.contains(e.target) &&
        !button.current?.contains(e.target)
      )
        setOpen(false);
    };
    document.addEventListener('keydown', close);
    document.addEventListener('pointerdown', close);
    return () => {
      document.removeEventListener('keydown', close);
      document.removeEventListener('pointerdown', close);
    };
  }, [open]);
  const targets = {
    hook: 'speech <0.4 s; title ≤6 words',
    dead_air: '<3% dead air',
    filler: '0 fillers and repeated takes',
    cadence: '1.5–4 s shots; ≤6 s static',
    framing: '≥3 framings per 30 s',
    motion: '<0.5 px jitter; 0 repeated/skipped frames',
    captions: '≥0.18 s per word; safe, clear of faces',
    sound: '−14 LUFS; ≤−1 dBTP',
    colour: 'ΔE <4; <0.5% clipping',
  };
  return (
    <div className="creator-score" data-score={state}>
      <button
        ref={button}
        type="button"
        aria-label="Creator Score breakdown"
        aria-expanded={open}
        aria-controls="creator-score-breakdown"
        onClick={() => {
          const r = button.current.getBoundingClientRect(),
            css = getComputedStyle(document.documentElement),
            gap = parseFloat(css.getPropertyValue('--space-8')),
            width = parseFloat(css.getPropertyValue('--space-96')) * 3;
          setPosition({
            left: Math.max(gap, Math.min(r.left, innerWidth - width - gap)),
            top: r.bottom + gap,
            maxHeight: `min(calc(var(--space-96)*4),calc(100dvh - ${r.bottom}px - var(--space-16)))`,
          });
          setOpen((v) => !v);
        }}
      >
        <span>Creator Score</span>
        <b
          ref={number}
          aria-label={score == null ? 'score unavailable' : `score ${score}`}
        >
          {score ?? '—'}
        </b>
        <small>/100</small>
      </button>
      {open
        ? createPortal(
            <div
              ref={popup}
              tabIndex={-1}
              role="dialog"
              aria-label="creator score details"
              id="creator-score-breakdown"
              className="creator-score-pop"
              style={position}
            >
              <p>
                Target {target} ·{' '}
                {project.creator?.accepted ? 'verified' : 'unverified'}
              </p>
              {Object.entries(descriptions).map(([id, why]) => (
                <div key={id}>
                  <strong>
                    {id.replaceAll('_', ' ')} ·{' '}
                    {groups[id] == null
                      ? 'unavailable'
                      : `${Math.round(groups[id] * 100)}/100`}
                  </strong>
                  <small>
                    target: {targets[id]} · {why}
                  </small>
                </div>
              ))}
              <p className="desk-fine">
                Unavailable applicable measurements score zero.{' '}
                {project.creator?.limitations}
              </p>
              <button
                type="button"
                className="creator-pop-close"
                onClick={() => {
                  setOpen(false);
                  button.current?.focus();
                }}
              >
                close
              </button>
            </div>,
            document.body,
          )
        : null}
    </div>
  );
}
