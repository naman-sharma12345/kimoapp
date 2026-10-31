// A small, deterministic Canvas 2D subset in pure JS. The graphics elements
// draw through the standard CanvasRenderingContext2D API; in the app that is
// Chromium's canvas (offscreen Electron window), and in Node (unit tests, the
// headless bench, and the fallback when no offscreen window is available) it is
// this rasteriser. Same element code, same layout, same easing.
//
// Supported: transforms, save/restore, paths (lines, quadratic/cubic curves,
// arcs, ellipses, rects, round rects), fill (nonzero-ish signed-area coverage,
// font-rs style), stroke (round joins/caps), clip, solid/linear/radial paints,
// globalAlpha, source-over / source-atop / destination-out / lighter,
// shadows, filter blur(), fillText/strokeText from TrueType outlines with
// letterSpacing, measureText, drawImage (bilinear, any transform) and
// getImageData (straight alpha, like the browser).
// Not supported (never used by the elements): patterns, line dashes, miter
// joins (drawn round), complex text shaping (Devanagari renders unshaped here;
// the Chromium path shapes it).

// ---------------------------------------------------------------- colours
const NAMED = { transparent: [0, 0, 0, 0], black: [0, 0, 0, 1], white: [1, 1, 1, 1], red: [1, 0, 0, 1] };
const colourCache = new Map();
/** CSS colour → straight [r,g,b,a] in 0..1. */
export function parseColour(c) {
  if (Array.isArray(c)) return c;
  const key = String(c ?? 'black').trim().toLowerCase();
  if (colourCache.has(key)) return colourCache.get(key);
  let out = NAMED[key];
  if (!out && key[0] === '#') {
    let h = key.slice(1);
    if (h.length === 3 || h.length === 4) h = [...h].map((x) => x + x).join('');
    const n = (i) => parseInt(h.slice(i, i + 2), 16) / 255;
    out = [n(0), n(2), n(4), h.length >= 8 ? n(6) : 1];
  }
  if (!out) {
    const m = /^rgba?\(([^)]+)\)$/.exec(key);
    if (m) {
      const p = m[1].split(/[\s,/]+/).filter(Boolean).map((v) => (v.endsWith('%') ? (parseFloat(v) / 100) * 255 : parseFloat(v)));
      out = [p[0] / 255, p[1] / 255, p[2] / 255, p[3] == null ? 1 : m[1].includes('%') && String(m[1].split(/[\s,/]+/).filter(Boolean)[3]).endsWith('%') ? p[3] / 255 : p[3]];
    }
  }
  out = (out ?? [0, 0, 0, 1]).map((v) => (Number.isFinite(v) ? Math.max(0, Math.min(1, v)) : 0));
  colourCache.set(key, out);
  return out;
}

// ---------------------------------------------------------------- matrices
const mul = (m, n) => [m[0] * n[0] + m[2] * n[1], m[1] * n[0] + m[3] * n[1], m[0] * n[2] + m[2] * n[3], m[1] * n[2] + m[3] * n[3], m[0] * n[4] + m[2] * n[5] + m[4], m[1] * n[4] + m[3] * n[5] + m[5]];
const apply = (m, x, y) => [m[0] * x + m[2] * y + m[4], m[1] * x + m[3] * y + m[5]];
function invert(m) {
  const det = m[0] * m[3] - m[1] * m[2];
  if (!det) return [1, 0, 0, 1, 0, 0];
  return [m[3] / det, -m[1] / det, -m[2] / det, m[0] / det, (m[2] * m[5] - m[3] * m[4]) / det, (m[1] * m[4] - m[0] * m[5]) / det];
}
const scaleOf = (m) => Math.sqrt(Math.abs(m[0] * m[3] - m[1] * m[2])) || 1;

// ---------------------------------------------------------------- coverage
/** Signed-area accumulation of one edge (font-rs), x already inside [0, bw]. */
function accLine(acc, stride, h, x0, y0, x1, y1) {
  if (y0 === y1) return;
  let dir = 1;
  if (y0 > y1) {
    dir = -1;
    [x0, x1] = [x1, x0];
    [y0, y1] = [y1, y0];
  }
  if (y1 <= 0 || y0 >= h) return;
  const dxdy = (x1 - x0) / (y1 - y0);
  if (y0 < 0) {
    x0 -= dxdy * y0;
    y0 = 0;
  }
  if (y1 > h) {
    x1 = x0 + dxdy * (h - y0);
    y1 = h;
  }
  let x = x0;
  const ys = Math.floor(y0);
  const ye = Math.ceil(y1);
  for (let y = ys; y < ye; y++) {
    const ls = y * stride;
    const dy = Math.min(y + 1, y1) - Math.max(y, y0);
    const xn = x + dxdy * dy;
    const d = dy * dir;
    const xa = Math.min(x, xn);
    const xb = Math.max(x, xn);
    const xa0 = Math.floor(xa);
    const xb1 = Math.ceil(xb);
    if (xb1 <= xa0 + 1) {
      const xmf = 0.5 * (x + xn) - xa0;
      acc[ls + xa0] += d - d * xmf;
      acc[ls + xa0 + 1] += d * xmf;
    } else {
      const s = 1 / (xb - xa);
      const x0f = xa - xa0;
      const a0 = 0.5 * s * (1 - x0f) * (1 - x0f);
      const x1f = xb - xb1 + 1;
      const am = 0.5 * s * x1f * x1f;
      acc[ls + xa0] += d * a0;
      if (xb1 === xa0 + 2) acc[ls + xa0 + 1] += d * (1 - a0 - am);
      else {
        const a1 = s * (1.5 - x0f);
        acc[ls + xa0 + 1] += d * (a1 - a0);
        for (let xi = xa0 + 2; xi < xb1 - 1; xi++) acc[ls + xi] += d * s;
        const a2 = a1 + (xb1 - xa0 - 3) * s;
        acc[ls + xb1 - 1] += d * (1 - a2 - am);
      }
      acc[ls + xb1] += d * am;
    }
    x = xn;
  }
}
/** An edge in bbox space; pieces left/right of the box become vertical edges on its border. */
function addEdge(acc, stride, bw, bh, x0, y0, x1, y1) {
  if (y0 === y1) return;
  const inside = (x) => x >= 0 && x <= bw;
  if (inside(x0) && inside(x1)) return accLine(acc, stride, bh, x0, y0, x1, y1);
  const ts = [0, 1];
  for (const bx of [0, bw]) {
    if ((x0 - bx) * (x1 - bx) < 0) ts.push((bx - x0) / (x1 - x0));
  }
  ts.sort((a, b) => a - b);
  for (let i = 0; i < ts.length - 1; i++) {
    const ta = ts[i];
    const tb = ts[i + 1];
    if (tb - ta < 1e-12) continue;
    const xa = x0 + (x1 - x0) * ta;
    const ya = y0 + (y1 - y0) * ta;
    const xb = x0 + (x1 - x0) * tb;
    const yb = y0 + (y1 - y0) * tb;
    const xm = (xa + xb) / 2;
    const cx = (v) => Math.max(0, Math.min(bw, v));
    if (xm < 0) accLine(acc, stride, bh, 0, ya, 0, yb);
    else if (xm > bw) accLine(acc, stride, bh, bw, ya, bw, yb);
    else accLine(acc, stride, bh, cx(xa), ya, cx(xb), yb);
  }
}
/**
 * Coverage of closed device-space polygons inside the W×H canvas:
 * {x0, y0, w, h, a: Float32Array} or null when nothing is visible.
 */
export function coverage(polys, W, H) {
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const p of polys)
    for (let i = 0; i < p.length; i += 2) {
      const x = p[i];
      const y = p[i + 1];
      if (x < minX) minX = x;
      if (x > maxX) maxX = x;
      if (y < minY) minY = y;
      if (y > maxY) maxY = y;
    }
  if (!(maxX > minX) || !(maxY > minY)) return null;
  const x0 = Math.max(0, Math.floor(minX));
  const y0 = Math.max(0, Math.floor(minY));
  const x1 = Math.min(W, Math.ceil(maxX));
  const y1 = Math.min(H, Math.ceil(maxY));
  if (x1 <= x0 || y1 <= y0) return null;
  const bw = x1 - x0;
  const bh = y1 - y0;
  const stride = bw + 2;
  const acc = new Float32Array(stride * bh + 2);
  for (const p of polys) {
    const n = p.length / 2;
    if (n < 3) continue;
    for (let i = 0; i < n; i++) {
      const j = (i + 1) % n;
      addEdge(acc, stride, bw, bh, p[i * 2] - x0, p[i * 2 + 1] - y0, p[j * 2] - x0, p[j * 2 + 1] - y0);
    }
  }
  const a = new Float32Array(bw * bh);
  for (let y = 0; y < bh; y++) {
    let s = 0;
    const ls = y * stride;
    for (let x = 0; x < bw; x++) {
      s += acc[ls + x];
      const v = Math.abs(s);
      a[y * bw + x] = v > 1 ? 1 : v < 1e-5 ? 0 : v;
    }
  }
  return { x0, y0, w: bw, h: bh, a };
}

// ---------------------------------------------------------------- geometry helpers
const signedArea = (p) => {
  let s = 0;
  for (let i = 0, n = p.length / 2; i < n; i++) {
    const j = (i + 1) % n;
    s += p[i * 2] * p[j * 2 + 1] - p[j * 2] * p[i * 2 + 1];
  }
  return s / 2;
};
const positive = (p) => {
  if (signedArea(p) >= 0) return p;
  const out = [];
  for (let i = p.length - 2; i >= 0; i -= 2) out.push(p[i], p[i + 1]);
  return out;
};
function circlePoly(cx, cy, r) {
  const n = Math.max(8, Math.min(96, Math.ceil(r * 1.2)));
  const out = [];
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2;
    out.push(cx + Math.cos(a) * r, cy + Math.sin(a) * r);
  }
  return positive(out);
}
/** Stroke outline polygons of device-space polylines: segment quads + round joins/caps. */
function strokePolys(lines, hw, cap) {
  const polys = [];
  for (const { pts, closed } of lines) {
    const n = pts.length / 2;
    if (n < 1) continue;
    if (n === 1) {
      if (cap === 'round') polys.push(circlePoly(pts[0], pts[1], hw));
      continue;
    }
    const segs = closed ? n : n - 1;
    for (let i = 0; i < segs; i++) {
      const j = (i + 1) % n;
      const ax = pts[i * 2];
      const ay = pts[i * 2 + 1];
      const bx = pts[j * 2];
      const by = pts[j * 2 + 1];
      const L = Math.hypot(bx - ax, by - ay);
      if (L < 1e-9) continue;
      let ux = (bx - ax) / L;
      let uy = (by - ay) / L;
      const nx = -uy * hw;
      const ny = ux * hw;
      let sx = ax;
      let sy = ay;
      let ex = bx;
      let ey = by;
      if (!closed && cap === 'square') {
        if (i === 0) {
          sx -= ux * hw;
          sy -= uy * hw;
        }
        if (i === segs - 1) {
          ex += ux * hw;
          ey += uy * hw;
        }
      }
      polys.push(positive([sx + nx, sy + ny, ex + nx, ey + ny, ex - nx, ey - ny, sx - nx, sy - ny]));
    }
    const first = closed ? 0 : 1;
    const last = closed ? n : n - 1;
    for (let i = first; i < last; i++) polys.push(circlePoly(pts[i * 2], pts[i * 2 + 1], hw));
    if (!closed && cap === 'round') {
      polys.push(circlePoly(pts[0], pts[1], hw));
      polys.push(circlePoly(pts[(n - 1) * 2], pts[(n - 1) * 2 + 1], hw));
    }
  }
  return polys;
}
/** 3-pass box blur of a single-channel Float32 plane (≈ Gaussian with std dev sigma). */
function blurPlane(a, w, h, sigma) {
  if (!(sigma > 0.3)) return a;
  const n = 3;
  const wIdeal = Math.sqrt((12 * sigma * sigma) / n + 1);
  let wl = Math.floor(wIdeal);
  if (wl % 2 === 0) wl--;
  const m = Math.round((12 * sigma * sigma - n * wl * wl - 4 * n * wl - 3 * n) / (-4 * wl - 4));
  const sizes = Array.from({ length: n }, (_, i) => (i < m ? wl : wl + 2));
  let src = a;
  let tmp = new Float32Array(a.length);
  for (const size of sizes) {
    const r = (size - 1) / 2;
    // horizontal
    for (let y = 0; y < h; y++) {
      let s = 0;
      const row = y * w;
      for (let x = -r - 1; x < r; x++) s += x >= 0 && x < w ? src[row + x] : 0;
      for (let x = 0; x < w; x++) {
        const add = x + r;
        const sub = x - r - 1;
        s += (add < w ? src[row + add] : 0) - (sub >= 0 ? src[row + sub] : 0);
        tmp[row + x] = s / size;
      }
    }
    // vertical
    const out = src === a ? new Float32Array(a.length) : src;
    for (let x = 0; x < w; x++) {
      let s = 0;
      for (let y = -r - 1; y < r; y++) s += y >= 0 && y < h ? tmp[y * w + x] : 0;
      for (let y = 0; y < h; y++) {
        const add = y + r;
        const sub = y - r - 1;
        s += (add < h ? tmp[add * w + x] : 0) - (sub >= 0 ? tmp[sub * w + x] : 0);
        out[y * w + x] = s / size;
      }
    }
    src = out;
  }
  tmp = null;
  return src;
}

// ---------------------------------------------------------------- paints
class Gradient {
  constructor(kind, args) {
    this.kind = kind;
    this.args = args;
    this.stops = [];
  }
  addColorStop(offset, colour) {
    this.stops.push([Math.max(0, Math.min(1, Number(offset))), parseColour(colour)]);
    this.stops.sort((a, b) => a[0] - b[0]);
  }
  at(t) {
    const s = this.stops;
    if (!s.length) return [0, 0, 0, 0];
    if (t <= s[0][0]) return s[0][1];
    if (t >= s.at(-1)[0]) return s.at(-1)[1];
    for (let i = 1; i < s.length; i++)
      if (t <= s[i][0]) {
        const [o0, c0] = s[i - 1];
        const [o1, c1] = s[i];
        const u = o1 > o0 ? (t - o0) / (o1 - o0) : 1;
        // premultiplied interpolation (what Chromium does)
        const a = c0[3] + (c1[3] - c0[3]) * u;
        if (a <= 0) return [0, 0, 0, 0];
        return [(c0[0] * c0[3] + (c1[0] * c1[3] - c0[0] * c0[3]) * u) / a, (c0[1] * c0[3] + (c1[1] * c1[3] - c0[1] * c0[3]) * u) / a, (c0[2] * c0[3] + (c1[2] * c1[3] - c0[2] * c0[3]) * u) / a, a];
      }
    return s.at(-1)[1];
  }
}
function paintFn(style, inv) {
  if (style instanceof Gradient) {
    const g = style;
    if (g.kind === 'linear') {
      const [x0, y0, x1, y1] = g.args;
      const dx = x1 - x0;
      const dy = y1 - y0;
      const d2 = dx * dx + dy * dy || 1;
      return (px, py) => {
        const [u, v] = apply(inv, px, py);
        return g.at(((u - x0) * dx + (v - y0) * dy) / d2);
      };
    }
    const [x0, y0, r0, x1, y1, r1] = g.args;
    return (px, py) => {
      const [u, v] = apply(inv, px, py);
      const d = Math.hypot(u - x1, v - y1);
      return g.at(r1 > r0 ? (d - r0) / (r1 - r0) : 0);
    };
  }
  const c = parseColour(style);
  return () => c;
}

// ---------------------------------------------------------------- the context
const DEFAULT_STATE = () => ({
  m: [1, 0, 0, 1, 0, 0],
  fillStyle: '#000',
  strokeStyle: '#000',
  lineWidth: 1,
  lineCap: 'butt',
  lineJoin: 'round',
  globalAlpha: 1,
  globalCompositeOperation: 'source-over',
  font: '10px sans-serif',
  textAlign: 'start',
  textBaseline: 'alphabetic',
  letterSpacing: '0px',
  shadowBlur: 0,
  shadowColor: 'rgba(0,0,0,0)',
  shadowOffsetX: 0,
  shadowOffsetY: 0,
  filter: 'none',
  clip: null,
});

/** Parses a CSS font shorthand: "italic 900 96px Geist". */
export function parseFont(font) {
  const s = String(font);
  const m = /(?:(italic|oblique)\s+)?(?:(normal|bold|[1-9]00)\s+)?(?:(italic)\s+)?([\d.]+)px\s+(.+)$/i.exec(s.trim());
  if (!m) return { style: 'normal', weight: 400, size: 10, family: 'sans-serif' };
  const w = m[2] === 'bold' ? 700 : m[2] === 'normal' || !m[2] ? 400 : Number(m[2]);
  return { style: m[1] || m[3] ? 'italic' : 'normal', weight: w, size: Number(m[4]), family: m[5].split(',')[0].replace(/["']/g, '').trim() };
}

export class SoftContext {
  constructor(canvas, fonts) {
    this.canvas = canvas;
    this.fonts = fonts;
    this.W = canvas.width;
    this.H = canvas.height;
    this.buf = new Float32Array(this.W * this.H * 4); // premultiplied RGBA
    this.s = DEFAULT_STATE();
    this.stack = [];
    this.beginPath();
  }
  // state
  save() {
    this.stack.push({ ...this.s, m: [...this.s.m] });
  }
  restore() {
    if (this.stack.length) this.s = this.stack.pop();
  }
  // properties (plain fields on the state)
  get fillStyle() { return this.s.fillStyle; }
  set fillStyle(v) { this.s.fillStyle = v; }
  get strokeStyle() { return this.s.strokeStyle; }
  set strokeStyle(v) { this.s.strokeStyle = v; }
  get lineWidth() { return this.s.lineWidth; }
  set lineWidth(v) { if (v > 0) this.s.lineWidth = Number(v); }
  get lineCap() { return this.s.lineCap; }
  set lineCap(v) { this.s.lineCap = v; }
  get lineJoin() { return this.s.lineJoin; }
  set lineJoin(v) { this.s.lineJoin = v; }
  get globalAlpha() { return this.s.globalAlpha; }
  set globalAlpha(v) { if (v >= 0 && v <= 1) this.s.globalAlpha = Number(v); }
  get globalCompositeOperation() { return this.s.globalCompositeOperation; }
  set globalCompositeOperation(v) { this.s.globalCompositeOperation = v; }
  get font() { return this.s.font; }
  set font(v) { this.s.font = v; }
  get textAlign() { return this.s.textAlign; }
  set textAlign(v) { this.s.textAlign = v; }
  get textBaseline() { return this.s.textBaseline; }
  set textBaseline(v) { this.s.textBaseline = v; }
  get letterSpacing() { return this.s.letterSpacing; }
  set letterSpacing(v) { this.s.letterSpacing = v; }
  get shadowBlur() { return this.s.shadowBlur; }
  set shadowBlur(v) { this.s.shadowBlur = Math.max(0, Number(v) || 0); }
  get shadowColor() { return this.s.shadowColor; }
  set shadowColor(v) { this.s.shadowColor = v; }
  get shadowOffsetX() { return this.s.shadowOffsetX; }
  set shadowOffsetX(v) { this.s.shadowOffsetX = Number(v) || 0; }
  get shadowOffsetY() { return this.s.shadowOffsetY; }
  set shadowOffsetY(v) { this.s.shadowOffsetY = Number(v) || 0; }
  get filter() { return this.s.filter; }
  set filter(v) { this.s.filter = v; }
  // transforms
  setTransform(a, b, c, d, e, f) {
    this.s.m = typeof a === 'object' ? [a.a, a.b, a.c, a.d, a.e, a.f] : [a, b, c, d, e, f];
  }
  resetTransform() {
    this.s.m = [1, 0, 0, 1, 0, 0];
  }
  transform(a, b, c, d, e, f) {
    this.s.m = mul(this.s.m, [a, b, c, d, e, f]);
  }
  translate(x, y) {
    this.transform(1, 0, 0, 1, x, y);
  }
  scale(x, y) {
    this.transform(x, 0, 0, y, 0, 0);
  }
  rotate(a) {
    const c = Math.cos(a);
    const s = Math.sin(a);
    this.transform(c, s, -s, c, 0, 0);
  }
  getTransform() {
    const [a, b, c, d, e, f] = this.s.m;
    return { a, b, c, d, e, f };
  }
  // paths (stored in device space, like the browser)
  beginPath() {
    this.subs = [];
    this.cur = null;
  }
  _pt(x, y) {
    return apply(this.s.m, x, y);
  }
  _tol() {
    return 0.25;
  }
  moveTo(x, y) {
    const [px, py] = this._pt(x, y);
    this.cur = { pts: [px, py], closed: false };
    this.subs.push(this.cur);
    this.last = [x, y];
  }
  _ensure(x, y) {
    if (!this.cur) this.moveTo(x, y);
  }
  lineTo(x, y) {
    this._ensure(x, y);
    const [px, py] = this._pt(x, y);
    this.cur.pts.push(px, py);
    this.last = [x, y];
  }
  _curve(points, fn) {
    // subdivision count from the device-space control polygon length
    let len = 0;
    for (let i = 2; i < points.length; i += 2) len += Math.hypot(points[i] - points[i - 2], points[i + 1] - points[i - 1]);
    const n = Math.max(2, Math.min(96, Math.ceil(Math.sqrt(len) * 1.6)));
    for (let i = 1; i <= n; i++) {
      const [x, y] = fn(i / n);
      this.cur.pts.push(x, y);
    }
  }
  quadraticCurveTo(cx, cy, x, y) {
    this._ensure(cx, cy);
    const [ax, ay] = this.cur.pts.slice(-2);
    const [bx, by] = this._pt(cx, cy);
    const [ex, ey] = this._pt(x, y);
    this._curve([ax, ay, bx, by, ex, ey], (t) => {
      const u = 1 - t;
      return [u * u * ax + 2 * u * t * bx + t * t * ex, u * u * ay + 2 * u * t * by + t * t * ey];
    });
    this.last = [x, y];
  }
  bezierCurveTo(c1x, c1y, c2x, c2y, x, y) {
    this._ensure(c1x, c1y);
    const [ax, ay] = this.cur.pts.slice(-2);
    const [bx, by] = this._pt(c1x, c1y);
    const [cx, cy] = this._pt(c2x, c2y);
    const [ex, ey] = this._pt(x, y);
    this._curve([ax, ay, bx, by, cx, cy, ex, ey], (t) => {
      const u = 1 - t;
      return [u * u * u * ax + 3 * u * u * t * bx + 3 * u * t * t * cx + t * t * t * ex, u * u * u * ay + 3 * u * u * t * by + 3 * u * t * t * cy + t * t * t * ey];
    });
    this.last = [x, y];
  }
  ellipse(x, y, rx, ry, rot, a0, a1, ccw = false) {
    let sweep = a1 - a0;
    if (!ccw && sweep < 0) sweep = (sweep % (2 * Math.PI)) + 2 * Math.PI;
    if (ccw && sweep > 0) sweep = (sweep % (2 * Math.PI)) - 2 * Math.PI;
    if (Math.abs(a1 - a0) >= 2 * Math.PI - 1e-9) sweep = ccw ? -2 * Math.PI : 2 * Math.PI;
    const r = Math.max(rx, ry) * scaleOf(this.s.m);
    const n = Math.max(4, Math.min(256, Math.ceil((Math.abs(sweep) * Math.max(4, r)) / 3)));
    const c = Math.cos(rot);
    const s = Math.sin(rot);
    const at = (a) => {
      const ex = Math.cos(a) * rx;
      const ey = Math.sin(a) * ry;
      return [x + ex * c - ey * s, y + ex * s + ey * c];
    };
    const [sx, sy] = at(a0);
    if (!this.cur) this.moveTo(sx, sy);
    else this.lineTo(sx, sy);
    for (let i = 1; i <= n; i++) {
      const [px, py] = at(a0 + (sweep * i) / n);
      const [dx, dy] = this._pt(px, py);
      this.cur.pts.push(dx, dy);
      this.last = [px, py];
    }
  }
  arc(x, y, r, a0, a1, ccw = false) {
    this.ellipse(x, y, r, r, 0, a0, a1, ccw);
  }
  rect(x, y, w, h) {
    this.moveTo(x, y);
    this.lineTo(x + w, y);
    this.lineTo(x + w, y + h);
    this.lineTo(x, y + h);
    this.closePath();
  }
  roundRect(x, y, w, h, r = 0) {
    const rr = Math.max(0, Math.min(Array.isArray(r) ? r[0] ?? 0 : r, Math.abs(w) / 2, Math.abs(h) / 2));
    if (!rr) return this.rect(x, y, w, h);
    this.moveTo(x + rr, y);
    this.lineTo(x + w - rr, y);
    this.arc(x + w - rr, y + rr, rr, -Math.PI / 2, 0);
    this.lineTo(x + w, y + h - rr);
    this.arc(x + w - rr, y + h - rr, rr, 0, Math.PI / 2);
    this.lineTo(x + rr, y + h);
    this.arc(x + rr, y + h - rr, rr, Math.PI / 2, Math.PI);
    this.lineTo(x, y + rr);
    this.arc(x + rr, y + rr, rr, Math.PI, Math.PI * 1.5);
    this.closePath();
  }
  closePath() {
    if (this.cur) {
      this.cur.closed = true;
      const [x, y] = [this.cur.pts[0], this.cur.pts[1]];
      this.cur = { pts: [x, y], closed: false };
      this.subs.push(this.cur);
    }
  }
  // drawing
  _fillPolys() {
    return this.subs.filter((s) => s.pts.length >= 6).map((s) => s.pts);
  }
  fill() {
    this._draw(this._fillPolys(), paintFn(this.s.fillStyle, invert(this.s.m)));
  }
  stroke() {
    const hw = (this.s.lineWidth * scaleOf(this.s.m)) / 2;
    const lines = this.subs.filter((s) => s.pts.length >= 4);
    this._draw(strokePolys(lines, hw, this.s.lineCap), paintFn(this.s.strokeStyle, invert(this.s.m)));
  }
  clip() {
    const cov = coverage(this._fillPolys(), this.W, this.H);
    const mask = new Float32Array(this.W * this.H);
    if (cov)
      for (let y = 0; y < cov.h; y++)
        for (let x = 0; x < cov.w; x++) mask[(y + cov.y0) * this.W + x + cov.x0] = cov.a[y * cov.w + x];
    if (this.s.clip) for (let i = 0; i < mask.length; i++) mask[i] *= this.s.clip[i];
    this.s.clip = mask;
  }
  fillRect(x, y, w, h) {
    const keep = this.subs;
    const cur = this.cur;
    this.beginPath();
    this.rect(x, y, w, h);
    this.fill();
    this.subs = keep;
    this.cur = cur;
  }
  strokeRect(x, y, w, h) {
    const keep = this.subs;
    const cur = this.cur;
    this.beginPath();
    this.rect(x, y, w, h);
    this.stroke();
    this.subs = keep;
    this.cur = cur;
  }
  clearRect(x, y, w, h) {
    const [ax, ay] = this._pt(x, y);
    const [bx, by] = this._pt(x + w, y + h);
    const x0 = Math.max(0, Math.round(Math.min(ax, bx)));
    const x1 = Math.min(this.W, Math.round(Math.max(ax, bx)));
    const y0 = Math.max(0, Math.round(Math.min(ay, by)));
    const y1 = Math.min(this.H, Math.round(Math.max(ay, by)));
    for (let yy = y0; yy < y1; yy++) this.buf.fill(0, (yy * this.W + x0) * 4, (yy * this.W + x1) * 4);
  }
  /** Coverage + paint → composite (with shadow and blur filter when set). */
  _draw(polys, paint, sampler = null) {
    const cov = coverage(polys, this.W, this.H);
    if (!cov) return;
    const ga = this.s.globalAlpha;
    const blur = /blur\(\s*([\d.]+)px\s*\)/.exec(String(this.s.filter ?? ''))?.[1];
    const sc = parseColour(this.s.shadowColor);
    const shadow = sc[3] > 0 && (this.s.shadowBlur > 0 || this.s.shadowOffsetX || this.s.shadowOffsetY);
    // source layer (premultiplied), with room for blur
    const pad = Math.ceil(3 * Math.max(Number(blur) || 0, shadow ? this.s.shadowBlur / 2 : 0)) + 1;
    const pad0 = blur ? pad : 0;
    const lx0 = Math.max(0, cov.x0 - pad0);
    const ly0 = Math.max(0, cov.y0 - pad0);
    const lx1 = Math.min(this.W, cov.x0 + cov.w + pad0);
    const ly1 = Math.min(this.H, cov.y0 + cov.h + pad0);
    const lw = lx1 - lx0;
    const lh = ly1 - ly0;
    let L = new Float32Array(lw * lh * 4);
    for (let y = 0; y < cov.h; y++)
      for (let x = 0; x < cov.w; x++) {
        const a = cov.a[y * cov.w + x];
        if (!a) continue;
        const px = x + cov.x0;
        const py = y + cov.y0;
        const c = sampler ? sampler(px + 0.5, py + 0.5) : paint(px + 0.5, py + 0.5);
        const sa = c[3] * a * ga;
        if (!sa) continue;
        const o = ((py - ly0) * lw + (px - lx0)) * 4;
        L[o] = sampler ? c[0] * a * ga : c[0] * sa;
        L[o + 1] = sampler ? c[1] * a * ga : c[1] * sa;
        L[o + 2] = sampler ? c[2] * a * ga : c[2] * sa;
        L[o + 3] = sa;
      }
    if (blur && Number(blur) > 0.3) {
      for (let ch = 0; ch < 4; ch++) {
        const plane = new Float32Array(lw * lh);
        for (let i = 0; i < plane.length; i++) plane[i] = L[i * 4 + ch];
        const b = blurPlane(plane, lw, lh, Number(blur));
        for (let i = 0; i < plane.length; i++) L[i * 4 + ch] = b[i];
      }
    }
    if (shadow) {
      const sp = Math.ceil(3 * (this.s.shadowBlur / 2)) + 1;
      const ox = this.s.shadowOffsetX;
      const oy = this.s.shadowOffsetY;
      const sw = lw + 2 * sp;
      const sh = lh + 2 * sp;
      let A = new Float32Array(sw * sh);
      for (let y = 0; y < lh; y++) for (let x = 0; x < lw; x++) A[(y + sp) * sw + x + sp] = L[(y * lw + x) * 4 + 3];
      A = blurPlane(A, sw, sh, this.s.shadowBlur / 2);
      const S = { x0: lx0 - sp + ox, y0: ly0 - sp + oy, w: sw, h: sh };
      this._compositeShadow(S, A, sc);
    }
    this._composite(lx0, ly0, lw, lh, L);
  }
  _compositeShadow(S, A, sc) {
    // fractional offsets are rounded (browser shadows are pixel-aligned too)
    const bx = Math.round(S.x0);
    const by = Math.round(S.y0);
    const L = new Float32Array(S.w * S.h * 4);
    for (let i = 0; i < A.length; i++) {
      const a = A[i] * sc[3];
      L[i * 4] = sc[0] * a;
      L[i * 4 + 1] = sc[1] * a;
      L[i * 4 + 2] = sc[2] * a;
      L[i * 4 + 3] = a;
    }
    this._composite(bx, by, S.w, S.h, L);
  }
  _composite(x0, y0, w, h, L) {
    const op = this.s.globalCompositeOperation;
    const clip = this.s.clip;
    const B = this.buf;
    for (let y = 0; y < h; y++) {
      const py = y + y0;
      if (py < 0 || py >= this.H) continue;
      for (let x = 0; x < w; x++) {
        const px = x + x0;
        if (px < 0 || px >= this.W) continue;
        const o = (y * w + x) * 4;
        let k = 1;
        if (clip) {
          k = clip[py * this.W + px];
          if (!k) continue;
        }
        const sa = L[o + 3] * k;
        if (!sa && op !== 'copy') continue;
        const sr = L[o] * k;
        const sg = L[o + 1] * k;
        const sb = L[o + 2] * k;
        const d = (py * this.W + px) * 4;
        if (op === 'destination-out') {
          const f = 1 - sa;
          B[d] *= f;
          B[d + 1] *= f;
          B[d + 2] *= f;
          B[d + 3] *= f;
        } else if (op === 'source-atop') {
          const da = B[d + 3];
          const f = 1 - sa;
          B[d] = sr * da + B[d] * f;
          B[d + 1] = sg * da + B[d + 1] * f;
          B[d + 2] = sb * da + B[d + 2] * f;
        } else if (op === 'lighter') {
          B[d] = Math.min(1, B[d] + sr);
          B[d + 1] = Math.min(1, B[d + 1] + sg);
          B[d + 2] = Math.min(1, B[d + 2] + sb);
          B[d + 3] = Math.min(1, B[d + 3] + sa);
        } else {
          const f = 1 - sa;
          B[d] = sr + B[d] * f;
          B[d + 1] = sg + B[d + 1] * f;
          B[d + 2] = sb + B[d + 2] * f;
          B[d + 3] = sa + B[d + 3] * f;
        }
      }
    }
  }
  // gradients
  createLinearGradient(x0, y0, x1, y1) {
    return new Gradient('linear', [x0, y0, x1, y1]);
  }
  createRadialGradient(x0, y0, r0, x1, y1, r1) {
    return new Gradient('radial', [x0, y0, r0, x1, y1, r1]);
  }
  // text
  _face() {
    const f = parseFont(this.s.font);
    const face = this.fonts?.face(f.family, f.weight, f.style);
    if (!face) throw new Error(`soft canvas: no font for "${this.s.font}"`);
    return { f, face };
  }
  _spacing(size) {
    const v = String(this.s.letterSpacing ?? '0px');
    const n = parseFloat(v);
    return v.endsWith('em') ? n * size : n || 0;
  }
  measureText(text) {
    const { f, face } = this._face();
    const k = f.size / face.unitsPerEm;
    const sp = this._spacing(f.size);
    let w = 0;
    for (const ch of String(text)) w += face.advance(ch.codePointAt(0)) * k + sp;
    return { width: w, fontBoundingBoxAscent: face.ascent * k, fontBoundingBoxDescent: -face.descent * k, actualBoundingBoxAscent: face.capHeight * k, actualBoundingBoxDescent: 0 };
  }
  _textPolys(text, x, y) {
    const { f, face } = this._face();
    const k = f.size / face.unitsPerEm;
    const w = this.measureText(text).width;
    const align = this.s.textAlign;
    let pen = x - (align === 'center' ? w / 2 : align === 'right' || align === 'end' ? w : 0);
    const bl = this.s.textBaseline;
    const asc = face.ascent * k;
    const desc = -face.descent * k;
    const by = bl === 'top' ? y + asc : bl === 'middle' ? y + (asc - desc) / 2 : bl === 'bottom' ? y - desc : y;
    const sp = this._spacing(f.size);
    const polys = [];
    const m = this.s.m;
    for (const ch of String(text)) {
      const cp = ch.codePointAt(0);
      for (const contour of face.contours(cp)) {
        const pts = [];
        let px = 0;
        let py = 0;
        for (const c of contour) {
          if (c[0] === 'M' || c[0] === 'L') {
            [px, py] = [c[1], c[2]];
            pts.push(...apply(m, pen + px * k, by - py * k));
          } else if (c[0] === 'Q') {
            const [, qx, qy, ex, ey] = c;
            const steps = Math.max(2, Math.min(24, Math.ceil(Math.sqrt(Math.hypot(qx - px, qy - py) * k + Math.hypot(ex - qx, ey - qy) * k) * 1.4)));
            for (let i = 1; i <= steps; i++) {
              const t = i / steps;
              const u = 1 - t;
              pts.push(...apply(m, pen + (u * u * px + 2 * u * t * qx + t * t * ex) * k, by - (u * u * py + 2 * u * t * qy + t * t * ey) * k));
            }
            [px, py] = [ex, ey];
          }
        }
        if (pts.length >= 6) polys.push(pts);
      }
      pen += face.advance(cp) * k + sp;
    }
    return polys;
  }
  fillText(text, x, y) {
    this._draw(this._textPolys(text, x, y), paintFn(this.s.fillStyle, invert(this.s.m)));
  }
  strokeText(text, x, y) {
    const hw = (this.s.lineWidth * scaleOf(this.s.m)) / 2;
    const lines = this._textPolys(text, x, y).map((pts) => ({ pts, closed: true }));
    this._draw(strokePolys(lines, hw, 'round'), paintFn(this.s.strokeStyle, invert(this.s.m)));
  }
  // images: {width, height, data: straight RGBA bytes}
  drawImage(img, dx, dy, dw, dh) {
    if (typeof img.getContext === 'function') {
      const d = img.getContext('2d').getImageData(0, 0, img.width, img.height);
      img = { width: d.width, height: d.height, data: d.data };
    }
    dw ??= img.width;
    dh ??= img.height;
    const m = mul(this.s.m, [dw / img.width, 0, 0, dh / img.height, dx, dy]);
    const inv = invert(m);
    const quad = [...apply(m, 0, 0), ...apply(m, img.width, 0), ...apply(m, img.width, img.height), ...apply(m, 0, img.height)];
    const D = img.data;
    const W = img.width;
    const H = img.height;
    const px = (x, y) => {
      x = Math.max(0, Math.min(W - 1, x));
      y = Math.max(0, Math.min(H - 1, y));
      const o = (y * W + x) * 4;
      const a = D[o + 3] / 255;
      return [(D[o] / 255) * a, (D[o + 1] / 255) * a, (D[o + 2] / 255) * a, a];
    };
    const sampler = (X, Y) => {
      const [u, v] = apply(inv, X, Y);
      const fx = u - 0.5;
      const fy = v - 0.5;
      const x0 = Math.floor(fx);
      const y0 = Math.floor(fy);
      const tx = fx - x0;
      const ty = fy - y0;
      const a = px(x0, y0);
      const b = px(x0 + 1, y0);
      const c = px(x0, y0 + 1);
      const d = px(x0 + 1, y0 + 1);
      const out = [0, 0, 0, 0];
      for (let i = 0; i < 4; i++) out[i] = (a[i] * (1 - tx) + b[i] * tx) * (1 - ty) + (c[i] * (1 - tx) + d[i] * tx) * ty;
      return out; // premultiplied
    };
    this._draw([positive(quad)], null, sampler);
  }
  getImageData(x = 0, y = 0, w = this.W, h = this.H) {
    const out = new Uint8ClampedArray(w * h * 4);
    for (let yy = 0; yy < h; yy++)
      for (let xx = 0; xx < w; xx++) {
        const sx = xx + x;
        const sy = yy + y;
        if (sx < 0 || sy < 0 || sx >= this.W || sy >= this.H) continue;
        const s = (sy * this.W + sx) * 4;
        const d = (yy * w + xx) * 4;
        const a = this.buf[s + 3];
        if (a <= 0) continue;
        out[d] = Math.round((this.buf[s] / a) * 255);
        out[d + 1] = Math.round((this.buf[s + 1] / a) * 255);
        out[d + 2] = Math.round((this.buf[s + 2] / a) * 255);
        out[d + 3] = Math.round(a * 255);
      }
    return { width: w, height: h, data: out };
  }
}

/** A canvas-like object: {width, height, getContext('2d')}. fonts: a FontBook (glyphs.mjs). */
export function createSoftCanvas(width, height, fonts) {
  const canvas = { width: Math.max(1, Math.round(width)), height: Math.max(1, Math.round(height)) };
  const ctx = new SoftContext(canvas, fonts);
  canvas.getContext = () => ctx;
  return canvas;
}
