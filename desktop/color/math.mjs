export const clamp = (v, a = 0, b = 1) => Math.min(b, Math.max(a, v));
export const mix = (a, b, t) => a + (b - a) * t;
export const luma = ([r, g, b]) => 0.2126 * r + 0.7152 * g + 0.0722 * b;
export function chroma(rgb) {
  const y = luma(rgb);
  return [(rgb[2] - y) / 1.8556, (rgb[0] - y) / 1.5748];
}
export function fromChroma(y, [cb, cr]) {
  const r = y + 1.5748 * cr,
    b = y + 1.8556 * cb;
  return [r, (y - 0.2126 * r - 0.0722 * b) / 0.7152, b];
}
export const hue = (rgb) => {
  const [c, b] = chroma(rgb);
  return ((Math.atan2(b, c) * 180) / Math.PI + 360) % 360;
};
export const saturation = (rgb) => {
  const hi = Math.max(...rgb),
    lo = Math.min(...rgb);
  return hi > 0 ? (hi - lo) / hi : 0;
};
export const hueDistance = (a, b) => Math.abs(((a - b + 540) % 360) - 180);
export function skinWeight(rgb) {
  const y = luma(rgb),
    s = saturation(rgb),
    h = hue(rgb);
  if (y < 0.08 || y > 0.95 || s < 0.06 || s > 0.85) return 0;
  return (
    clamp((28 - hueDistance(h, 123)) / 14) *
    clamp((s - 0.06) / 0.12) *
    clamp((y - 0.08) / 0.1)
  );
}
export function skinClass([r, g, b]) {
  r *= 255;
  g *= 255;
  b *= 255;
  const cb = 128 - 0.168736 * r - 0.331264 * g + 0.5 * b,
    cr = 128 + 0.5 * r - 0.418688 * g - 0.081312 * b;
  return cb >= 77 && cb <= 127 && cr >= 133 && cr <= 173;
}
/** Keep RGB in gamut by reducing chroma around luma, not clipping channels. */
export function gamut(rgb, lo = 0.012, hi = 0.988) {
  const y = clamp(luma(rgb), lo, hi);
  let k = 1;
  for (const c of rgb) {
    const d = c - luma(rgb);
    if (d > 0) k = Math.min(k, (hi - y) / d);
    else if (d < 0) k = Math.min(k, (lo - y) / d);
  }
  return rgb.map((c) => y + (c - luma(rgb)) * Math.max(0, k));
}
export function protectSkin(input, output) {
  const w = skinWeight(input);
  if (w <= 0) return output;
  const y = luma(output),
    [cb, cr] = chroma(output),
    angle = (Math.atan2(cr, cb) * 180) / Math.PI;
  const fixed = (clamp(angle, 115, 131) * Math.PI) / 180,
    r = Math.hypot(cb, cr);
  const corrected = fromChroma(y, [r * Math.cos(fixed), r * Math.sin(fixed)]);
  return output.map((v, i) => mix(v, corrected[i], w));
}
/** Shape-preserving cubic curve, with nonzero floor and a soft highlight shoulder. */
export function toneCurve(stats, { faceTarget = 0.46, exposure = 1 } = {}) {
  if (!stats?.available) return { x: [0, 1], y: [0, 1], m: [1, 1] };
  const points = [
    [0, 0.006],
    [clamp(stats.p1, 0.001, 0.2), 0.02],
  ];
  if (stats.skin?.count > 24)
    points.push([
      clamp(stats.skin.p50 ?? luma(stats.skin.rgb), points[1][0] + 0.02, 0.85),
      faceTarget,
    ]);
  else {
    // Anchor untracked shots to their existing middle exposure. Endpoint
    // percentiles alone can create a steep toe that washes out faces/UI.
    const mid = clamp(stats.p50, points[1][0] + 0.02, 0.85);
    const stretched =
      0.02 + (0.95 * (mid - stats.p1)) / Math.max(0.1, stats.p99 - stats.p1);
    points.push([
      mid,
      clamp(mid + clamp(stretched - mid, -0.04, 0.04), 0.04, 0.92),
    ]);
  }
  points.push(
    [clamp(stats.p99, points.at(-1)[0] + 0.02, 0.999), 0.97],
    [1, 0.994],
  );
  const x = points.map((p) => p[0]),
    y = points.map((p) => p[1]);
  for (let i = 1; i < y.length; i++) y[i] = Math.max(y[i - 1] + 0.0001, y[i]);
  const d = x.slice(1).map((v, i) => (y[i + 1] - y[i]) / (v - x[i]));
  const m = x.map((_, i) =>
    i === 0
      ? d[0]
      : i === x.length - 1
        ? d.at(-1)
        : d[i - 1] * d[i] <= 0
          ? 0
          : 2 / (1 / d[i - 1] + 1 / d[i]),
  );
  // Fritsch–Carlson bound prevents overshoot and hard clipping.
  for (let i = 0; i < d.length; i++) {
    const a = m[i] / d[i],
      b = m[i + 1] / d[i],
      s = a * a + b * b;
    if (s > 9) {
      const t = 3 / Math.sqrt(s);
      m[i] = t * a * d[i];
      m[i + 1] = t * b * d[i];
    }
  }
  return { x, y, m, exposure };
}
export function curveAt(v, c) {
  const i = Math.max(
    0,
    c.x.findIndex((x, j) => j < c.x.length - 1 && v <= c.x[j + 1]),
  );
  const n = i >= c.x.length - 1 ? c.x.length - 2 : i,
    h = c.x[n + 1] - c.x[n],
    t = clamp((v - c.x[n]) / h),
    t2 = t * t,
    t3 = t2 * t;
  return (
    (2 * t3 - 3 * t2 + 1) * c.y[n] +
    (t3 - 2 * t2 + t) * h * c.m[n] +
    (-2 * t3 + 3 * t2) * c.y[n + 1] +
    (t3 - t2) * h * c.m[n + 1]
  );
}
const linear = (v) =>
  v < 0.081 ? v / 4.5 : ((v + 0.099) / 1.099) ** (1 / 0.45);
export function rgbToLab(rgb) {
  const [r, g, b] = rgb.map(linear);
  const xyz = [
    (0.4123908 * r + 0.3575843 * g + 0.1804808 * b) / 0.95047,
    0.212639 * r + 0.7151687 * g + 0.0721923 * b,
    (0.0193308 * r + 0.1191948 * g + 0.9505322 * b) / 1.08883,
  ];
  const [x, y, z] = xyz.map((v) =>
    v > 216 / 24389 ? Math.cbrt(v) : ((24389 / 27) * v + 16) / 116,
  );
  return [116 * y - 16, 500 * (x - y), 200 * (y - z)];
}
/** CIEDE2000 (Sharma/Wu/Dalal); verified against published Lab pairs in tests. */
export function deltaE2000([l1, a1, b1], [l2, a2, b2]) {
  const rad = Math.PI / 180,
    c1 = Math.hypot(a1, b1),
    c2 = Math.hypot(a2, b2),
    c = (c1 + c2) / 2,
    g = 0.5 * (1 - Math.sqrt(c ** 7 / (c ** 7 + 25 ** 7)));
  const ap1 = (1 + g) * a1,
    ap2 = (1 + g) * a2,
    cp1 = Math.hypot(ap1, b1),
    cp2 = Math.hypot(ap2, b2);
  const h1 = (Math.atan2(b1, ap1) / rad + 360) % 360,
    h2 = (Math.atan2(b2, ap2) / rad + 360) % 360;
  const dl = l2 - l1,
    dc = cp2 - cp1,
    dh =
      cp1 * cp2 === 0
        ? 0
        : Math.abs(h2 - h1) <= 180
          ? h2 - h1
          : h2 <= h1
            ? h2 - h1 + 360
            : h2 - h1 - 360;
  const dH = 2 * Math.sqrt(cp1 * cp2) * Math.sin((dh * rad) / 2),
    lp = (l1 + l2) / 2,
    cp = (cp1 + cp2) / 2;
  const hp =
    cp1 * cp2 === 0
      ? h1 + h2
      : Math.abs(h1 - h2) <= 180
        ? (h1 + h2) / 2
        : h1 + h2 < 360
          ? (h1 + h2 + 360) / 2
          : (h1 + h2 - 360) / 2;
  const T =
    1 -
    0.17 * Math.cos((hp - 30) * rad) +
    0.24 * Math.cos(2 * hp * rad) +
    0.32 * Math.cos((3 * hp + 6) * rad) -
    0.2 * Math.cos((4 * hp - 63) * rad);
  const sl = 1 + (0.015 * (lp - 50) ** 2) / Math.sqrt(20 + (lp - 50) ** 2),
    sc = 1 + 0.045 * cp,
    sh = 1 + 0.015 * cp * T;
  const rt =
    -2 *
    Math.sqrt(cp ** 7 / (cp ** 7 + 25 ** 7)) *
    Math.sin(60 * Math.exp(-(((hp - 275) / 25) ** 2)) * rad);
  const A = dl / sl,
    B = dc / sc,
    C = dH / sh;
  return Math.sqrt(Math.max(0, A * A + B * B + C * C + rt * B * C));
}
