// Phase 7.3 layout and coexistence with the speaker. Node + browser safe.
//
// Layout modes per beat (side / top / overlay / full / pip) chosen by aspect,
// the subject's face box, the visual's size and length; the speaker is
// reframed (an eased "make room" camera move) for side and top; and a
// collision engine keeps the priorities face > explainer > caption >
// decorative graphic: a panel never covers the face, never two explainer
// visuals at once, lower-priority Phase 6 graphics move or wait, and the
// caption engine (which runs after) yields to the explainer's box.
import { isVertical, safeArea } from '../graphics/kit.mjs';
import { panelRect, pipRect, MODES } from './panel.mjs';

export { MODES };
/** Kinds drawn as a small floating card near the shoulder. */
export const SMALL = new Set(['stat', 'logo_or_icon', 'name_card', 'emoji']);
/** Kinds that need no panel at all (audio only, b-roll picture, UI arrows on the recording). */
export const PANELLESS = new Set(['sound_gag', 'broll', 'ui_callout', 'emoji']);
export const FULL_SHARE_MAX = 0.25;
export const PIP_MIN_S = 6;
/** Phase 6 graphics an explainer outranks (they move or wait). */
export const DECORATIVE = new Set(['stat', 'sticker', 'callout', 'lower_third', 'chapter', 'text_behind']);
/** Phase 6 graphics that outrank an explainer (the explainer waits). */
export const FIXED = new Set(['hook_title', 'cta']);

export const complexBeat = (b) => b.kind === 'chart' || b.kind === 'map' || (b.kind === 'flow' && (b.items?.length ?? 0) >= 4);

/** Rect intersection area of {x,y,w,h} and a face box {x0,y0,x1,y1}, with a margin around the face. */
export function faceOverlap(r, face, margin = 0) {
  if (!r || !face) return 0;
  const x0 = Math.max(r.x, face.x0 - margin);
  const y0 = Math.max(r.y, face.y0 - margin);
  const x1 = Math.min(r.x + r.w, face.x1 + margin);
  const y1 = Math.min(r.y + r.h, face.y1 + margin);
  return Math.max(0, x1 - x0) * Math.max(0, y1 - y0);
}

/** Mode order to try for a beat (the first that keeps the face clear wins). */
export function modeOrder(beat, { canvas, template = 'auto', dur = 3, fullLeft = 0, hint = null } = {}) {
  const vertical = isVertical(canvas);
  const base = vertical ? 'top' : 'side';
  const order = [];
  const push = (m) => !order.includes(m) && order.push(m);
  const fullOk = (complexBeat(beat) || beat.kind === 'photo' || beat.kind === 'screenshot') && dur <= fullLeft + 1e-6;
  const pipOk = dur >= PIP_MIN_S || template === 'explainer' || hint === 'pip';
  if (hint && MODES.includes(hint)) {
    if (hint === 'full' && fullOk) push('full');
    else if (hint === 'pip' && pipOk) push('pip');
    else if (hint !== 'full' && hint !== 'pip') push(hint);
  }
  if (SMALL.has(beat.kind)) push('overlay');
  if (template === 'explainer' && dur >= PIP_MIN_S && !SMALL.has(beat.kind)) push('pip');
  if (complexBeat(beat) && fullOk && template !== 'explainer') push('full');
  push(base);
  if (!SMALL.has(beat.kind)) push(vertical ? 'side' : 'top');
  push('overlay');
  if (pipOk || complexBeat(beat)) push('pip');
  return order.filter((m) => m !== 'side' || !vertical || canvas.w / canvas.h > 0.7);
}

/**
 * Speaker reframing for a mode: the target camera state (source fractions)
 * that moves the face into the free part of the canvas. head: {cx, top, chin}
 * source fractions; geom: {W, H, cw, ch} (camera.mjs coverGeometry); state:
 * the director's camera state {x, y, zoom}. Returns {x, y, zoom} or null.
 */
export function reframeFor(mode, panel, { head, geom, state, canvas }) {
  if (!head || !geom || !panel) return null;
  if (mode !== 'side' && mode !== 'top') return null;
  const vertical = isVertical(canvas);
  const zoom = Math.max(state?.zoom ?? 1, vertical ? 1.3 : 1.18);
  const cwf = geom.cw / geom.W / zoom;
  const chf = geom.ch / geom.H / zoom;
  let x = state?.x ?? 0.5;
  let y = state?.y ?? 0.5;
  if (mode === 'side') {
    // face centred in the free part beside the panel
    const freeX0 = panel.side === 'left' ? panel.x + panel.w : 0;
    const freeX1 = panel.side === 'left' ? canvas.w : panel.x;
    const fx = (freeX0 + freeX1) / 2 / canvas.w;
    x = head.cx - (fx - 0.5) * cwf;
  } else {
    // eyes at ~60 % of the canvas height, below the visual
    const eyes = head.top + (head.chin - head.top) * 0.45;
    y = eyes - (0.6 - 0.5) * chf;
  }
  x = Math.max(cwf / 2, Math.min(1 - cwf / 2, x));
  y = Math.max(chf / 2, Math.min(1 - chf / 2, y));
  return { x: +x.toFixed(4), y: +y.toFixed(4), zoom: +zoom.toFixed(4) };
}

/** Canvas face box for a head under a camera state (same maths as camera.mjs cameraRect without the soft clamp). */
export function projectFace(head, geom, state, canvas) {
  const z = Math.max(1e-6, state.zoom ?? 1);
  const w = geom.cw / z;
  const h = geom.ch / z;
  const x = Math.max(0, Math.min(geom.W - w, (state.x ?? 0.5) * geom.W - w / 2));
  const y = Math.max(0, Math.min(geom.H - h, (state.y ?? 0.5) * geom.H - h / 2));
  const sx = canvas.w / w;
  const sy = canvas.h / h;
  const hh = (head.chin - head.top) * geom.H;
  const hw = hh * 0.8;
  const cx = head.cx * geom.W;
  return { x0: (cx - hw / 2 - x) * sx, x1: (cx + hw / 2 - x) * sx, y0: (head.top * geom.H - y) * sy, y1: (head.chin * geom.H - y) * sy };
}

/**
 * Places one beat: tries the mode order and returns the first mode whose
 * panel keeps every sampled face box clear (after reframing for side/top).
 * samples: [{face (canvas box or null), head, geom, state}] over the beat.
 * Returns {mode, panel, pip, reframe, face} or {mode: null, why}.
 */
export function placeBeat(beat, { canvas, template, dur, fullLeft, hint, samples = [], size }) {
  if (PANELLESS.has(beat.kind)) {
    const face = samples.find((s) => s.face)?.face ?? null;
    return { mode: beat.kind === 'emoji' ? 'overlay' : 'none', panel: null, pip: null, reframe: null, face };
  }
  const order = modeOrder(beat, { canvas, template, dur, fullLeft, hint });
  const margin = 0.02 * Math.min(canvas.w, canvas.h);
  const known = samples.filter((s) => s.face);
  const face0 = known[0]?.face ?? null;
  for (const mode of order) {
    if (mode === 'full' || mode === 'pip') {
      return { mode, panel: panelRect(canvas, mode), pip: mode === 'pip' ? pipRect(canvas, 'right') : null, reframe: null, face: face0 };
    }
    for (const sz of size ? [size] : ['m', 's']) {
      const panel = panelRect(canvas, mode, { face: face0, size: sz });
      let reframe = null;
      let clear = true;
      for (const s of known) {
        let f = s.face;
        if ((mode === 'side' || mode === 'top') && s.head && s.geom) {
          const r = reframeFor(mode, panel, { head: s.head, geom: s.geom, state: s.state, canvas });
          if (r) {
            reframe ??= r;
            f = projectFace(s.head, s.geom, r, canvas);
          }
        }
        if (faceOverlap(panel, f, margin) > 0) {
          clear = false;
          break;
        }
      }
      // no face known: a centred subject is assumed; side/top/overlay panels stay off the centre third
      if (!known.length && mode === 'overlay') {
        const sa = safeArea(canvas);
        const centre = { x0: canvas.w * 0.38, x1: canvas.w * 0.62, y0: sa.y0 + (sa.y1 - sa.y0) * 0.2, y1: sa.y0 + (sa.y1 - sa.y0) * 0.55 };
        if (faceOverlap(panel, centre) > 0) clear = false;
      }
      if (clear) return { mode, panel, pip: null, reframe, face: face0 };
    }
  }
  // last resort for a real panel: the visual full-screen with the speaker in a bubble
  if (!SMALL.has(beat.kind) && dur >= 2.5) return { mode: 'pip', panel: panelRect(canvas, 'pip'), pip: pipRect(canvas, 'right'), reframe: null, face: face0, fallback: true };
  return { mode: null, why: 'no layout keeps the face clear' };
}

/**
 * Collision with the Phase 6 graphics: decorative graphics overlapping an
 * explainer window move after it (≤ 0.6 s) or are removed; fixed graphics
 * (hook title, end card) make the explainer wait or drop. Mutates overlays;
 * returns {moved, removed, blocked: [beat ids]}.
 */
export function resolveGraphics(overlays, windows, { gap = 0.4, total = Infinity } = {}) {
  const moved = [];
  const removed = [];
  const blocked = [];
  const gfx = overlays.filter((o) => o.kind === 'graphic' && !String(o.props?.element ?? '').startsWith('ex_'));
  for (const w of windows) {
    for (const o of gfx) {
      if (o._gone) continue;
      const el = o.props?.element;
      const hit = o.at < w.end + gap && w.at < o.at + o.dur + gap;
      if (!hit) continue;
      if (FIXED.has(el)) {
        blocked.push(w.id);
        continue;
      }
      if (!DECORATIVE.has(el)) continue;
      const newAt = w.end + gap;
      const shift = newAt - o.at;
      const free = !windows.some((x) => x !== w && x.at < newAt + o.dur + gap && newAt < x.end + gap);
      if (shift > 0 && shift <= 0.6 && newAt + o.dur <= total && free) {
        o.at = +newAt.toFixed(3);
        moved.push(o.id);
      } else {
        o._gone = true;
        removed.push(o.id);
      }
    }
  }
  for (let i = overlays.length - 1; i >= 0; i--) if (overlays[i]._gone) overlays.splice(i, 1);
  return { moved, removed, blocked };
}
