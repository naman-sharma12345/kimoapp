// SVG path data → Canvas 2D calls, identical in Chromium and the soft
// canvas (moveTo / lineTo / bezierCurveTo / quadraticCurveTo / ellipse only).
// Used for the bundled Lucide / Tabler icons and Simple Icons brand marks.
// Browser-safe.

const CMD = /([MmLlHhVvCcSsQqTtAaZz])|(-?(?:\d+\.?\d*|\.\d+)(?:e[-+]?\d+)?)/g;

/** Parses path data into absolute segments: [op, ...args] with op in M L C Q A Z. */
export function parsePath(d) {
  const tokens = [];
  for (const m of String(d).matchAll(CMD)) tokens.push(m[1] ?? Number(m[2]));
  const out = [];
  let i = 0;
  let cmd = null;
  let x = 0;
  let y = 0;
  let sx = 0;
  let sy = 0;
  let lc = null; // last control point (for S/T)
  let lq = null;
  const n = () => tokens[i++];
  while (i < tokens.length) {
    if (typeof tokens[i] === 'string') cmd = tokens[i++];
    if (!cmd) break;
    const rel = cmd === cmd.toLowerCase();
    const C = cmd.toUpperCase();
    if (C === 'Z') {
      out.push(['Z']);
      x = sx;
      y = sy;
      lc = lq = null;
      cmd = null;
      continue;
    }
    if (typeof tokens[i] !== 'number') {
      cmd = null;
      continue;
    }
    if (C === 'M') {
      x = (rel ? x : 0) + n();
      y = (rel ? y : 0) + n();
      sx = x;
      sy = y;
      out.push(['M', x, y]);
      cmd = rel ? 'l' : 'L';
      lc = lq = null;
    } else if (C === 'L') {
      x = (rel ? x : 0) + n();
      y = (rel ? y : 0) + n();
      out.push(['L', x, y]);
      lc = lq = null;
    } else if (C === 'H') {
      x = (rel ? x : 0) + n();
      out.push(['L', x, y]);
      lc = lq = null;
    } else if (C === 'V') {
      y = (rel ? y : 0) + n();
      out.push(['L', x, y]);
      lc = lq = null;
    } else if (C === 'C' || C === 'S') {
      let c1x;
      let c1y;
      if (C === 'C') {
        c1x = (rel ? x : 0) + n();
        c1y = (rel ? y : 0) + n();
      } else {
        c1x = lc ? 2 * x - lc[0] : x;
        c1y = lc ? 2 * y - lc[1] : y;
      }
      const c2x = (rel ? x : 0) + n();
      const c2y = (rel ? y : 0) + n();
      const ex = (rel ? x : 0) + n();
      const ey = (rel ? y : 0) + n();
      out.push(['C', c1x, c1y, c2x, c2y, ex, ey]);
      lc = [c2x, c2y];
      lq = null;
      x = ex;
      y = ey;
    } else if (C === 'Q' || C === 'T') {
      let qx;
      let qy;
      if (C === 'Q') {
        qx = (rel ? x : 0) + n();
        qy = (rel ? y : 0) + n();
      } else {
        qx = lq ? 2 * x - lq[0] : x;
        qy = lq ? 2 * y - lq[1] : y;
      }
      const ex = (rel ? x : 0) + n();
      const ey = (rel ? y : 0) + n();
      out.push(['Q', qx, qy, ex, ey]);
      lq = [qx, qy];
      lc = null;
      x = ex;
      y = ey;
    } else if (C === 'A') {
      const rx = Math.abs(n());
      const ry = Math.abs(n());
      const rot = n();
      const large = n();
      const sweep = n();
      const ex = (rel ? x : 0) + n();
      const ey = (rel ? y : 0) + n();
      out.push(...arcToCenter(x, y, rx, ry, rot, large, sweep, ex, ey));
      lc = lq = null;
      x = ex;
      y = ey;
    } else i++;
  }
  return out;
}

/** SVG endpoint arc → ['E', cx, cy, rx, ry, rot, a0, a1, ccw] (or a line when degenerate). */
function arcToCenter(x1, y1, rx, ry, phiDeg, fa, fs, x2, y2) {
  if (!rx || !ry) return [['L', x2, y2]];
  if (x1 === x2 && y1 === y2) return [];
  const phi = (phiDeg * Math.PI) / 180;
  const cos = Math.cos(phi);
  const sin = Math.sin(phi);
  const dx = (x1 - x2) / 2;
  const dy = (y1 - y2) / 2;
  const x1p = cos * dx + sin * dy;
  const y1p = -sin * dx + cos * dy;
  const lam = (x1p * x1p) / (rx * rx) + (y1p * y1p) / (ry * ry);
  if (lam > 1) {
    rx *= Math.sqrt(lam);
    ry *= Math.sqrt(lam);
  }
  const num = rx * rx * ry * ry - rx * rx * y1p * y1p - ry * ry * x1p * x1p;
  const den = rx * rx * y1p * y1p + ry * ry * x1p * x1p;
  let co = Math.sqrt(Math.max(0, num / den));
  if (Boolean(fa) === Boolean(fs)) co = -co;
  const cxp = (co * rx * y1p) / ry;
  const cyp = (-co * ry * x1p) / rx;
  const cx = cos * cxp - sin * cyp + (x1 + x2) / 2;
  const cy = sin * cxp + cos * cyp + (y1 + y2) / 2;
  const ang = (ux, uy, vx, vy) => {
    const a = Math.atan2(ux * vy - uy * vx, ux * vx + uy * vy);
    return a;
  };
  const a0 = ang(1, 0, (x1p - cxp) / rx, (y1p - cyp) / ry);
  let da = ang((x1p - cxp) / rx, (y1p - cyp) / ry, (-x1p - cxp) / rx, (-y1p - cyp) / ry);
  if (!fs && da > 0) da -= 2 * Math.PI;
  if (fs && da < 0) da += 2 * Math.PI;
  return [['E', cx, cy, rx, ry, phi, a0, a0 + da, !fs]];
}

const CACHE = new Map();
const parsed = (d) => {
  if (!CACHE.has(d)) {
    if (CACHE.size > 4000) CACHE.clear();
    CACHE.set(d, parsePath(d));
  }
  return CACHE.get(d);
};

/** Adds the path to ctx's current path, scaled by s and offset by (ox, oy). */
export function tracePath(ctx, d, ox = 0, oy = 0, s = 1) {
  for (const seg of parsed(d)) {
    const [op] = seg;
    if (op === 'M') ctx.moveTo(ox + seg[1] * s, oy + seg[2] * s);
    else if (op === 'L') ctx.lineTo(ox + seg[1] * s, oy + seg[2] * s);
    else if (op === 'C') ctx.bezierCurveTo(ox + seg[1] * s, oy + seg[2] * s, ox + seg[3] * s, oy + seg[4] * s, ox + seg[5] * s, oy + seg[6] * s);
    else if (op === 'Q') ctx.quadraticCurveTo(ox + seg[1] * s, oy + seg[2] * s, ox + seg[3] * s, oy + seg[4] * s);
    else if (op === 'E') ctx.ellipse(ox + seg[1] * s, oy + seg[2] * s, seg[3] * s, seg[4] * s, seg[5], seg[6], seg[7], seg[8]);
    else if (op === 'Z') ctx.closePath();
  }
}

/** Strokes a 24-unit line icon (Lucide/Tabler) at (x, y) with size px. */
export function strokeIcon(ctx, d, x, y, size, colour, weight = 2) {
  ctx.save();
  ctx.beginPath();
  tracePath(ctx, d, x, y, size / 24);
  ctx.lineWidth = (weight * size) / 24;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  ctx.strokeStyle = colour;
  ctx.stroke();
  ctx.restore();
}
/** Fills a 24-unit glyph (Simple Icons brand mark). */
export function fillIcon(ctx, d, x, y, size, colour) {
  ctx.save();
  ctx.beginPath();
  tracePath(ctx, d, x, y, size / 24);
  ctx.fillStyle = colour;
  ctx.fill();
  ctx.restore();
}
