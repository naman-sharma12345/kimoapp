// Phase 6 compositor nodes: `graphic` overlays are rendered by the graphics
// engine (graphics/renderer.mjs: offscreen Chromium in the app, the soft
// canvas elsewhere) into transparent QuickTime RLE clips at the canvas rate,
// cached by content hash, and overlaid at their pixel box in overlay order.
// Screen-recording clips with `screen_card` become the "Screen Studio" look: a
// blurred, dimmed copy of the recording fills the frame, a soft card shadow
// sits on it, and the recording itself is inset with rounded corners.
import { join } from 'node:path';
import { rate } from './edl.mjs';
import { graphicJob, renderGraphicVideo, themeFor, backendName } from './graphics/renderer.mjs';
import { cardRect } from './graphics/elements/screen-zoom.mjs';

const META = new Set(['element', 'source', 'theme', 'box', 'safe_box', 'graphics_plan']);
const elementProps = (props) => Object.fromEntries(Object.entries(props ?? {}).filter(([k]) => !META.has(k)));
const clipLen = (c) => (c.out - c.in) / (c.speed ?? 1);

async function render(job, { ffmpeg, dir, signal, warn }) {
  try {
    return await renderGraphicVideo({ job, ffmpeg, dir, signal });
  } catch (error) {
    if (signal?.aborted) throw error;
    if (backendName() === 'soft') throw error;
    // the offscreen window failed: the same element code renders in-process
    warn(`graphics: ${backendName()} failed (${String(error.message).slice(0, 120)}); rendered with the built-in canvas`);
    return renderGraphicVideo({ job, ffmpeg, dir, signal, backend: 'soft' });
  }
}

/**
 * Renders the EDL's graphics and expands screen cards in place (on the
 * compositor's private copy). frameTime limits the work to what one preview
 * frame shows. Returns {graphics, cards, cached, backend, ms}.
 */
export async function prepareGraphics(edl, { ffmpeg = 'ffmpeg', dir, signal, emit = () => {}, warn = () => {}, frameTime = null }) {
  const fps = rate(edl.canvas.fps);
  const canvas = { w: edl.canvas.w, h: edl.canvas.h };
  const live = (at, dur) => frameTime == null || (frameTime >= at - 1e-6 && frameTime < at + dur - 1e-6);
  const gfx = edl.overlays.filter((o) => o.kind === 'graphic');
  if (frameTime != null) edl.overlays = edl.overlays.filter((o) => o.kind !== 'graphic' || live(o.at, o.dur));
  const todo = edl.overlays.filter((o) => o.kind === 'graphic');
  const cardClips = edl.video.flatMap((t) => t.clips.map((c) => ({ c, t }))).filter(({ c }) => c.screen_card && live(c.at, clipLen(c)));
  if (!gfx.length && !cardClips.length) return { graphics: 0, cards: 0 };
  const t0 = Date.now();
  const id = Math.random().toString(16).slice(2, 10);
  const total = todo.length + cardClips.length;
  emit({ t: 'op', id, opId: id, phase: 'start', tool: 'graphics', title: `graphics · ${todo.length} element${todo.length === 1 ? '' : 's'}${cardClips.length ? ` · ${cardClips.length} screen card${cardClips.length === 1 ? '' : 's'}` : ''} (${backendName()})`, why: 'motion graphics drawn frame by frame at exact times, transparent, then overlaid', at: t0 });
  let cached = 0;
  let done = 0;
  const progress = () => emit({ t: 'progress', phase: 'graphics', label: 'rendering graphics', f: Math.min(1, ++done / total) });
  try {
    for (const o of todo) {
      const kind = o.props?.element;
      const job = graphicJob({ kind, props: elementProps(o.props), canvas, fps: edl.canvas.fps, dur: o.dur, theme: themeFor(o.props?.theme) });
      if (!job) {
        warn(`graphic ${o.id} (${kind}) does not fit a ${canvas.w}x${canvas.h} canvas; skipped`);
        o._skip = true;
        progress();
        continue;
      }
      const r = await render(job, { ffmpeg, dir, signal, warn });
      if (r.cached) cached++;
      const sid = `graphic:${o.id}`;
      edl.sources.push({ id: sid, path: r.path.replaceAll('\\', '/'), kind: 'video', fps: edl.canvas.fps, w: r.w, h: r.h, duration: r.duration, frames: r.frames, rotation: 0, alpha: true, color: { primaries: 'bt709', trc: 'bt709' }, generated: true });
      o.src = sid;
      o._place = { x: r.x, y: r.y, w: r.w, h: r.h };
      progress();
    }
    edl.overlays = edl.overlays.filter((o) => !o._skip);
    // screen cards: blurred backdrop + shadow below the inset recording
    if (cardClips.length) {
      const card = cardRect(canvas);
      const short = Math.min(canvas.w, canvas.h);
      const byTrack = new Map();
      for (const x of cardClips) {
        if (!byTrack.has(x.t)) byTrack.set(x.t, []);
        byTrack.get(x.t).push(x.c);
      }
      for (const [track, clips] of byTrack) {
        const bg = { track: `${track.track}:card-bg`, name: 'screen card backdrop', clips: [] };
        const sh = { track: `${track.track}:card-shadow`, name: 'screen card shadow', clips: [] };
        for (const c of clips) {
          bg.clips.push({ id: `${c.id}:card-bg`, src: c.src, in: c.in, out: c.out, at: c.at, speed: c.speed ?? 1, fit: 'cover', ramp: c.ramp, transition_in: c.transition_in, blur: Math.max(8, short / 36), dim: 0.3 });
          const job = graphicJob({ kind: 'screen_zoom', props: { card }, canvas, fps: edl.canvas.fps, dur: Math.max(1 / fps, Math.round(clipLen(c) * fps) / fps), theme: themeFor(edl.graphics?.theme) });
          const r = await render(job, { ffmpeg, dir, signal, warn });
          if (r.cached) cached++;
          const sid = `graphic:${c.id}:card-shadow`;
          edl.sources.push({ id: sid, path: r.path.replaceAll('\\', '/'), kind: 'video', fps: edl.canvas.fps, w: r.w, h: r.h, duration: r.duration, frames: r.frames, rotation: 0, alpha: true, color: { primaries: 'bt709', trc: 'bt709' }, generated: true });
          sh.clips.push({ id: `${c.id}:card-shadow`, src: sid, in: 0, out: r.frames / fps, at: c.at, speed: 1, fit: 'cover', place: { x: r.x, y: r.y, w: r.w, h: r.h } });
          // the recording itself: inset onto the card with rounded corners
          c._card = card;
          c.mask = { shape: 'rect', x: (card.x + card.w / 2) / canvas.w, y: (card.y + card.h / 2) / canvas.h, w: card.w / canvas.w, h: card.h / canvas.h, radius: card.radius / short, feather: 1 / short };
          progress();
        }
        const i = edl.video.indexOf(track);
        edl.video.splice(i, 0, bg, sh);
      }
    }
    const ms = Date.now() - t0;
    emit({ t: 'op', id, phase: 'end', ok: true, ms, result: `${todo.length} graphic${todo.length === 1 ? '' : 's'}${cardClips.length ? ` · ${cardClips.length} screen card${cardClips.length === 1 ? '' : 's'}` : ''} · ${cached} from cache · ${backendName()}` });
    return { graphics: todo.length, cards: cardClips.length, cached, backend: backendName(), ms };
  } catch (error) {
    emit({ t: 'op', id, phase: 'end', ok: false, ms: Date.now() - t0, error: String(error.message).slice(0, 200) });
    throw error;
  }
}
export const graphicsCacheDir = (cacheDir, workspace) => join(cacheDir ?? workspace, 'graphics');
