// Panel rectangles for the explainer layout modes (Phase 7.3). Browser-safe.
//   side    16:9 (and 1:1/4:5): 40 % width panel on the side opposite the face
//   top     9:16: upper 40 % below the safe top; the speaker is reframed lower
//   overlay small card near the subject's shoulder, never over the face
//   full    full-screen visual (voice continues)
//   pip     full-screen visual + the speaker in a rounded bubble
import { safeArea, unit, isVertical } from '../graphics/kit.mjs';

export const MODES = ['side', 'top', 'overlay', 'full', 'pip'];

/** Speaker bubble rect for pip: bottom corner on 16:9, top corner on 9:16 (side away from the panel content). */
export function pipRect(canvas, side = 'right') {
  const u = unit(canvas);
  const vertical = isVertical(canvas);
  const w = Math.round((vertical ? 0.36 : 0.24) * canvas.w);
  const h = Math.round(w * (vertical ? 1.25 : 0.75));
  const m = Math.round(36 * u);
  const sa = safeArea(canvas);
  const x = side === 'left' ? Math.round(sa.x0) : Math.round((vertical ? sa.x1 : canvas.w - m) - w);
  const y = vertical ? Math.round(sa.y0) : canvas.h - m - h;
  return { x, y, w: w - (w % 2), h: h - (h % 2), radius: Math.round(Math.min(w, h) * 0.12) };
}

/**
 * Panel for a mode. face: {x0,y0,x1,y1} canvas px or null; size: 's' | 'm' | 'l'.
 * Returns {x, y, w, h, side} in canvas px, inside the platform safe area.
 */
export function panelRect(canvas, mode, { face = null, size = 'm' } = {}) {
  const sa = safeArea(canvas);
  const u = unit(canvas);
  const vertical = isVertical(canvas);
  const W = sa.x1 - sa.x0;
  const H = sa.y1 - sa.y0;
  const faceCx = face ? (face.x0 + face.x1) / 2 : canvas.w / 2;
  if (mode === 'full' || mode === 'pip') {
    const m = 0;
    return { x: m, y: m, w: canvas.w - 2 * m, h: canvas.h - 2 * m, side: 'full' };
  }
  if (mode === 'top') {
    const h = Math.round(H * (size === 's' ? 0.3 : 0.42));
    const w = Math.round(W * 0.96);
    return { x: Math.round(sa.x0 + (W - w) / 2), y: Math.round(sa.y0), w, h, side: 'top' };
  }
  if (mode === 'overlay') {
    const w = Math.round((vertical ? 0.62 : 0.3) * canvas.w * (size === 'l' ? 1.2 : size === 's' ? 0.75 : 1));
    const h = Math.round(w * (vertical ? 0.52 : 0.5));
    // beside the face, on the side with more room; above it on vertical canvases
    let x;
    let y;
    if (vertical) {
      x = sa.x0 + (W - w) / 2;
      // above the head when there is room, else on the chest below the chin (never over the face)
      y = !face ? sa.y0 + H * 0.05 : face.y0 - h - 24 * u >= sa.y0 ? face.y0 - h - 24 * u : Math.min(sa.y1 - h, face.y1 + 24 * u);
    } else {
      const right = face ? sa.x1 - face.x1 : W / 2;
      const left = face ? face.x0 - sa.x0 : W / 2;
      x = right >= left ? Math.min(sa.x1 - w, (face?.x1 ?? sa.cx) + 40 * u) : Math.max(sa.x0, (face?.x0 ?? sa.cx) - 40 * u - w);
      y = face ? Math.max(sa.y0, Math.min(sa.y1 - h, (face.y0 + face.y1) / 2 - h * 0.35)) : sa.y0 + H * 0.12;
    }
    return { x: Math.round(x), y: Math.round(y), w, h, side: 'overlay' };
  }
  // side: the half away from the face
  const w = Math.round((vertical ? 0.9 : 0.4) * canvas.w);
  const h = Math.round(Math.min(H * 0.86, vertical ? H * 0.42 : w * 1.05));
  const onLeft = faceCx > canvas.w / 2;
  const x = onLeft ? sa.x0 + 8 * u : sa.x1 - 8 * u - w;
  const y = sa.y0 + (H - h) / 2;
  return { x: Math.round(x), y: Math.round(y), w, h, side: onLeft ? 'left' : 'right' };
}

/** The panel a family draws in: props.panel, else the default for props.mode. */
export const panelOf = (canvas, props) => props.panel ?? panelRect(canvas, props.mode ?? (isVertical(canvas) ? 'top' : 'side'), { face: props.face ?? null, size: props.size });
