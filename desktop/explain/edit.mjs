// Timeline editing of explainer beats (Phase 7.5, Studio GFX track):
// change the text, items, family (list / flow / timeline), layout mode, or
// delete a beat with its speaker bubble and ring. Browser-safe (the renderer
// bundles edl.mjs, which calls this from applyEdits).
import { panelRect, pipRect, MODES } from './panel.mjs';

export const SWITCHABLE = { list: 'ex_list', flow: 'ex_flow', timeline: 'ex_timeline' };
const ELEMENT_KIND = { ex_list: 'list', ex_flow: 'flow', ex_timeline: 'timeline' };
const words6 = (s, n = 6) => String(s ?? '').split(/\s+/).filter(Boolean).slice(0, n).join(' ');
const r3 = (n) => +Number(n).toFixed(3);

export const isExplain = (o) => Boolean(o?.props?.explain);
/** The bubble and ring overlays that belong to an explainer overlay. */
export const companions = (edl, o) => edl.overlays.filter((x) => x !== o && String(x.id).startsWith(`${o.id}-`) && x.props?.explain_plan);

function talkingTrack(edl) {
  const keep = new Set((edl.cut_plan?.keep ?? []).map((k) => k.clip_id));
  return edl.video.find((t) => t.clips.some((c) => keep.has(c.id))) ?? edl.video.find((t) => !String(t.track).startsWith('overlay:') && t.clips.some((c) => edl.sources.find((s) => s.id === c.src)?.kind === 'video'));
}

/** Adds the speaker bubble (+ ring) over an explainer that switched to pip. */
function addPip(edl, o) {
  const canvas = edl.canvas;
  const rect = pipRect(canvas);
  const short = Math.min(canvas.w, canvas.h);
  const mask = { shape: 'rect', x: r3((rect.x + rect.w / 2) / canvas.w), y: r3((rect.y + rect.h / 2) / canvas.h), w: r3(rect.w / canvas.w), h: r3(rect.h / canvas.h), radius: r3(rect.radius / short), feather: r3(1 / short) };
  const track = talkingTrack(edl);
  const out = [];
  let n = 0;
  for (const c of [...(track?.clips ?? [])].sort((a, b) => a.at - b.at)) {
    const len = (c.out - c.in) / (c.speed ?? 1);
    const a0 = Math.max(o.at, c.at);
    const a1 = Math.min(o.at + o.dur, c.at + len);
    if (a1 - a0 < 0.02) continue;
    out.push({ id: `${o.id}-pip-${++n}`, kind: 'pip', src: c.src, at: r3(a0), dur: r3(a1 - a0), track: o.track ?? 'graphics', props: { in: r3(c.in + (a0 - c.at) * (c.speed ?? 1)), speed: c.speed ?? 1, pip: { x: rect.x, y: rect.y, w: rect.w, h: rect.h, zoom: 1.1 }, mask, explain_plan: true } });
  }
  out.push({ id: `${o.id}-ring`, kind: 'graphic', at: o.at, dur: o.dur, track: o.track ?? 'graphics', props: { element: 'ex_pip', rect, theme: o.props.theme, safe_box: { x0: rect.x, y0: rect.y, x1: rect.x + rect.w, y1: rect.y + rect.h }, explain_plan: true } });
  const i = edl.overlays.indexOf(o);
  edl.overlays.splice(i + 1, 0, ...out);
}

/**
 * Applies one inline edit to an explainer overlay. args: {title, items:
 * [text], text (single-text beats), kind (list|flow|timeline), mode}.
 * Returns the overlay. Item times stay on their words; new items follow the
 * last one 0.6 s apart.
 */
export function editExplain(edl, o, args = {}) {
  const p = o.props;
  if (typeof args.title === 'string') p.title = words6(args.title);
  if (Array.isArray(args.items)) {
    const old = p.items ?? [];
    p.items = args.items.slice(0, 12).map((text, k) => ({ ...(old[k] ?? {}), text: words6(text), t: old[k]?.t ?? (old.at(-1)?.t ?? 0) + 0.6 * (k - old.length + 1) }));
  }
  if (typeof args.text === 'string') {
    for (const k of ['label', 'question', 'term', 'keyword', 'caption', 'text', 'quote']) if (typeof p[k] === 'string') p[k] = k === 'quote' || k === 'text' ? String(args.text).slice(0, 280) : k === 'question' ? String(args.text).slice(0, 120) : words6(args.text);
  }
  if (args.kind && SWITCHABLE[args.kind] && ELEMENT_KIND[p.element]) {
    p.element = SWITCHABLE[args.kind];
    p.explain = { ...p.explain, kind: args.kind };
    if (args.kind === 'timeline') p.items = (p.items ?? []).map((it) => ({ when: it.when ?? '', ...it }));
  }
  if (args.mode && MODES.includes(args.mode) && args.mode !== p.mode) {
    for (const x of companions(edl, o)) edl.overlays.splice(edl.overlays.indexOf(x), 1);
    p.mode = args.mode;
    p.panel = panelRect(edl.canvas, args.mode, { face: p.face ?? null });
    p.safe_box = { x0: p.panel.x, y0: p.panel.y, x1: p.panel.x + p.panel.w, y1: p.panel.y + p.panel.h };
    delete p.box;
    if (args.mode === 'pip') addPip(edl, o);
  }
  // a moved/trimmed beat drags its bubble and ring
  const ring = companions(edl, o).find((x) => x.kind === 'graphic');
  if (ring && (ring.at !== o.at || ring.dur !== o.dur)) {
    for (const x of companions(edl, o)) edl.overlays.splice(edl.overlays.indexOf(x), 1);
    if (p.mode === 'pip') addPip(edl, o);
  }
  return o;
}

/** Deletes an explainer overlay and its companions. */
export function deleteExplain(edl, o) {
  const drop = new Set([o, ...companions(edl, o)]);
  edl.overlays = edl.overlays.filter((x) => !drop.has(x));
}
