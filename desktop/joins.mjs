// Join motion for the cut planner (Phase 3.2.5): how far the subject moved
// across each jump cut. Two tiny grey frames per join (last frame before the
// cut, first after), a brute-force shift search on the central region, with
// subpixel refinement. < 2 % of frame height is a micro-jump.
import { spawnBackground as spawn } from './resources.cjs';

export const PROBE_H = 72;

const grab = (ffmpeg, input, t, w, h, signal) =>
  new Promise((done) => {
    const child = spawn(ffmpeg, ['-nostdin', '-hide_banner', '-loglevel', 'error', '-ss', Math.max(0, t).toFixed(3), '-i', input, '-frames:v', '1', '-an', '-vf', `scale=${w}:${h}:flags=area,format=gray`, '-f', 'rawvideo', 'pipe:1'], { windowsHide: true, stdio: ['ignore', 'pipe', 'ignore'], signal });
    const chunks = [];
    child.stdout.on('data', (d) => chunks.push(d));
    child.on('error', () => done(null));
    child.on('exit', () => {
      const b = Buffer.concat(chunks);
      done(b.length >= w * h ? new Uint8Array(b.buffer, b.byteOffset, w * h) : null);
    });
  });

/** Best integer+subpixel translation between two grey frames on the central region. */
export function frameShift(a, b, w, h) {
  const R = Math.max(2, Math.round(h * 0.08));
  const x0 = Math.round(w * 0.2) + R;
  const x1 = Math.round(w * 0.8) - R;
  const y0 = Math.round(h * 0.05) + R;
  const y1 = Math.round(h * 0.95) - R;
  const cost = new Map();
  const mad = (dx, dy) => {
    const key = `${dx},${dy}`;
    if (cost.has(key)) return cost.get(key);
    let s = 0;
    let n = 0;
    for (let y = y0; y < y1; y++)
      for (let x = x0; x < x1; x++) {
        s += Math.abs(a[y * w + x] - b[(y + dy) * w + (x + dx)]);
        n++;
      }
    const v = s / Math.max(1, n);
    cost.set(key, v);
    return v;
  };
  let best = { dx: 0, dy: 0, v: mad(0, 0) };
  for (let dy = -R; dy <= R; dy++)
    for (let dx = -R; dx <= R; dx++) {
      const v = mad(dx, dy);
      if (v < best.v - 1e-9) best = { dx, dy, v };
    }
  const sub = (m, c, p) => (m + p - 2 * c > 1e-9 ? (0.5 * (m - p)) / (m + p - 2 * c) : 0);
  const fx = Math.abs(best.dx) < R ? best.dx + sub(mad(best.dx - 1, best.dy), best.v, mad(best.dx + 1, best.dy)) : best.dx;
  const fy = Math.abs(best.dy) < R ? best.dy + sub(mad(best.dx, best.dy - 1), best.v, mad(best.dx, best.dy + 1)) : best.dy;
  return { shift: Math.hypot(fx, fy) / h, dx: fx / h, dy: fy / h, residual: best.v / 255, still: mad(0, 0) / 255 };
}

/**
 * Motion across each needs_cover join of a plan: [{shift, residual}] aligned
 * with plan.needs_cover. Sources without a picture, or joins past maxJoins,
 * get null (treated as ordinary jump cuts).
 */
export async function joinMotion({ ffmpeg, plan, sources, signal, maxJoins = 150, onProgress }) {
  const out = [];
  for (const [n, j] of plan.needs_cover.entries()) {
    const s = sources.get(j.src);
    if (!s || !(s.width > 0 && s.height > 0) || n >= maxJoins) {
      out.push(null);
      continue;
    }
    if (signal?.aborted) throw new Error('cancelled');
    const rotated = Math.abs(s.rotation ?? 0) % 180 === 90;
    const aspect = rotated ? s.height / s.width : s.width / s.height;
    const h = PROBE_H;
    const w = Math.max(16, Math.round((h * aspect) / 2) * 2);
    const frame = 1 / (s.fps || 30);
    const [a, b] = [await grab(ffmpeg, s.path, j.from - frame, w, h, signal), await grab(ffmpeg, s.path, j.to, w, h, signal)];
    out.push(a && b ? frameShift(a, b, w, h) : null);
    onProgress?.((n + 1) / Math.min(plan.needs_cover.length, maxJoins));
  }
  return out;
}
