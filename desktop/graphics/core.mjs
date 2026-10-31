// Frame rendering shared by every backend (Chromium page, soft canvas): one
// element, one frame, drawn at the exact time t = frame / fps (no
// requestAnimationFrame, no wall clock), into a canvas the size of the
// element's pixel box. Browser-safe.
import { ELEMENTS } from './elements/index.mjs';

export const GRAPHICS_VERSION = 1;

/** Metrics lookup key for a font spec. */
export const fontKey = (f) => `${f.family}|${f.weight ?? 400}|${f.style ?? 'normal'}`;

/**
 * Draws frame `frame` of a job into ctx (already sized to job.box).
 * job: {kind, props, layout, theme, canvas, fps, dur, box, metrics}
 * extra: {layer(), images}
 */
export function drawFrame(ctx, job, frame, extra = {}) {
  const el = ELEMENTS[job.kind];
  if (!el) throw new Error(`unknown graphic ${job.kind}`);
  const t = frame / job.fps;
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.globalAlpha = 1;
  ctx.globalCompositeOperation = 'source-over';
  ctx.clearRect(0, 0, job.box.w, job.box.h);
  ctx.save();
  ctx.translate(-job.box.x, -job.box.y);
  const env = {
    fps: job.fps,
    dur: job.dur,
    theme: job.theme,
    canvas: job.canvas,
    origin: { x: job.box.x, y: job.box.y },
    metrics: (f) => job.metrics[fontKey(f)] ?? { capHeight: 0.7, ascent: 0.9, descent: -0.25 },
    layer: extra.layer,
    images: extra.images,
  };
  el.draw(ctx, t, job.props, job.layout, env);
  ctx.restore();
}
