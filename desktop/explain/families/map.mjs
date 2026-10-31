// map: offline vector map from the bundled Natural Earth outlines (public
// domain) and GeoNames cities (CC BY 4.0). Equirectangular with a cos(lat)
// correction, a camera that zooms from the country to the city, pins that
// drop on each spoken place, an animated route line between places, labels.
// props.map = {shapes: [[lon,lat,…] flat rings in 0.1° units], places:
// [{name, lon, lat, t}], route, from: view, to: view} — prepared by
// explain/geo.mjs so the render page needs no data files.
import { drawPanel, visualAlpha, text, scale, panelLayout, graphicEase, clamp01, withAlpha } from './common.mjs';
import { panelOf } from '../panel.mjs';
import { partialPolyline, strokePolyline } from '../../graphics/kit.mjs';

/** Equirectangular with cos(lat₀): span = degrees of latitude-equivalent across the panel width. */
export function project(view, P, lon, lat) {
  const k = Math.cos((view.lat * Math.PI) / 180);
  const S = P.w / view.span;
  return [P.x + P.w / 2 + (lon - view.lon) * k * S, P.y + P.h / 2 - (lat - view.lat) * S];
}
const mix = (a, b, u) => ({ lon: a.lon + (b.lon - a.lon) * u, lat: a.lat + (b.lat - a.lat) * u, span: Math.exp(Math.log(a.span) + (Math.log(b.span) - Math.log(a.span)) * u) });

export default {
  kind: 'ex_map',
  label: 'Map',
  defaults: { dur: 4.5 },
  layout(canvas, props) {
    const P = panelOf(canvas, props);
    const { pad, small } = scale(P, canvas);
    return panelLayout(P, canvas, { pad, small });
  },
  draw(ctx, t, props, L, env) {
    const { fps, dur, theme: th, canvas } = env;
    const m = props.map ?? { shapes: [], places: [] };
    const a = visualAlpha(t, dur, fps);
    const places = m.places ?? [];
    const firstT = places[0]?.t ?? 0.3;
    const z = graphicEase('cubic')(clamp01((t - Math.max(0, firstT - 0.6)) / 1.1));
    const view = mix(m.from ?? { lon: 78, lat: 22, span: 40 }, m.to ?? m.from ?? { lon: 78, lat: 22, span: 40 }, z);
    ctx.save();
    ctx.globalAlpha = a;
    drawPanel(ctx, L.P, th, canvas, { full: props.mode === 'full' || props.mode === 'pip' });
    ctx.save();
    ctx.beginPath();
    ctx.rect(L.P.x, L.P.y, L.P.w, L.P.h);
    ctx.clip();
    const S = { x: L.P.x + L.pad * 0.5, y: L.P.y + L.pad * 0.5, w: L.P.w - L.pad, h: L.P.h - L.pad };
    for (const shape of m.shapes ?? []) {
      const ring = shape.ring ?? shape;
      ctx.beginPath();
      for (let i = 0; i < ring.length; i += 2) {
        const [x, y] = project(view, S, ring[i] / 10, ring[i + 1] / 10);
        if (i === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      }
      ctx.closePath();
      ctx.fillStyle = shape.hi ? withAlpha(th.colors.accent, 0.22) : withAlpha(th.colors.text, 0.1);
      ctx.fill();
      ctx.lineWidth = 1.2;
      ctx.strokeStyle = withAlpha(th.colors.text, 0.35);
      ctx.stroke();
    }
    const pts = places.map((p) => project(view, S, p.lon, p.lat));
    if (m.route && pts.length > 1) {
      for (let i = 1; i < pts.length; i++) {
        const u = graphicEase('cubic')(clamp01((t - (places[i].t ?? 0) + 0.2) / 0.7));
        if (u <= 0) continue;
        const [x0, y0] = pts[i - 1];
        const [x1, y1] = pts[i];
        const bend = Math.hypot(x1 - x0, y1 - y0) * 0.25;
        const arc = Array.from({ length: 24 }, (_, k) => {
          const s = k / 23;
          return [x0 + (x1 - x0) * s, y0 + (y1 - y0) * s - Math.sin(Math.PI * s) * bend];
        });
        ctx.strokeStyle = th.colors.accent;
        ctx.lineWidth = 4;
        ctx.lineCap = 'round';
        strokePolyline(ctx, partialPolyline(arc, u));
      }
    }
    places.forEach((p, i) => {
      const drop = graphicEase('back_out')(clamp01(((t - (p.t ?? 0)) * fps) / 9));
      if (drop <= 0) return;
      const [x, y] = pts[i];
      const r = L.small * 0.5;
      ctx.save();
      ctx.globalAlpha = a * clamp01(drop * 2);
      ctx.translate(0, (1 - drop) * -40);
      ctx.beginPath();
      ctx.arc(x, y - r * 1.6, r, Math.PI * 0.85, Math.PI * 2.15);
      ctx.lineTo(x, y);
      ctx.closePath();
      ctx.fillStyle = th.colors.accent;
      ctx.fill();
      ctx.beginPath();
      ctx.arc(x, y - r * 1.6, r * 0.4, 0, Math.PI * 2);
      ctx.fillStyle = th.colors.ink;
      ctx.fill();
      text(ctx, p.name, x, y - r * 3.1, th.fonts.label, L.small, th.colors.text, 'center');
      ctx.restore();
    });
    ctx.restore();
    ctx.restore();
  },
};
