import { writeFile, rename, mkdir } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { createHash } from 'node:crypto';
import {
  clamp,
  mix,
  luma,
  chroma,
  fromChroma,
  hue,
  hueDistance,
  skinWeight,
  gamut,
  protectSkin,
  toneCurve,
  curveAt,
  rgbToLab,
  deltaE2000,
} from './math.mjs';
import { loadLook } from './looks.mjs';
import { curveValue } from '../edl.mjs';

export const LUT_VERSION = 4;
export function primary(rgb, correction) {
  if (!correction?.available) return [...rgb];
  let c = rgb.map((v, i) => v * correction.wb[i]);
  const Y = luma(c),
    target = curveAt(clamp(Y), correction.curve);
  c = Y > 1e-8 ? c.map((v) => (v * target) / Y) : [target, target, target];
  let y = luma(c),
    [cb, cr] = chroma(c);
  if (correction.log_like) {
    y = 0.5 + (y - 0.5) * (1.12 - 0.1 * Math.abs(y - 0.5));
    cb *= 1.25;
    cr *= 1.25;
  }
  const m = correction.match ?? { y: 0, cb: 0, cr: 0 };
  let targetY = y + m.y;
  const inputY = luma(rgb),
    skin = skinWeight(rgb),
    ceiling = inputY > 0.45 ? Math.min(0.84, inputY + 0.09) : inputY + 0.22;
  if (targetY > ceiling) targetY = mix(targetY, ceiling, skin);
  return gamut(fromChroma(targetY, [cb + m.cb, cr + m.cr]));
}
export function makeCorrection(
  stats,
  reference = null,
  { broll = false } = {},
) {
  if (!stats?.available)
    return { available: false, reason: stats?.reason ?? 'no usable frames' };
  if (stats.screen)
    return {
      available: false,
      reason: 'known screen recording: preserve exposure and white balance',
    };
  let wb = [1, 1, 1];
  if (stats.grey.count > 24) {
    const g = stats.grey.rgb,
      mean = g.reduce((a, b) => a + b, 0) / 3;
    wb = g.map((v) => clamp(mean / Math.max(0.02, v), 0.85, 1.15));
  }
  // A neutral reference must not drag a warm face away from the skin line.
  if (stats.skin.count > 24)
    for (let amount = 1; amount >= 0; amount -= 0.1) {
      const candidate = wb.map((v) => mix(1, v, amount)),
        skin = stats.skin.rgb.map((v, i) => v * candidate[i]);
      if (hueDistance(hue(skin), 123) <= 8 || amount < 0.05) {
        wb = candidate;
        break;
      }
    }
  const result = {
    available: true,
    wb,
    curve: toneCurve(stats),
    log_like: stats.log_like,
    match: { y: 0, cb: 0, cr: 0 },
    match_weight: broll ? 0.35 : 1,
  };
  if (reference?.stats?.available) {
    const skin = stats.skin.count > 24 && reference.stats.skin.count > 24;
    const current = primary(skin ? stats.skin.rgb : stats.mid.rgb, result),
      goal = primary(
        skin ? reference.stats.skin.rgb : reference.stats.mid.rgb,
        reference.correction,
      );
    const a = chroma(current),
      b = chroma(goal),
      w = result.match_weight;
    result.match = {
      y: clamp(luma(goal) - luma(current), -0.08, 0.08) * w,
      cb: clamp(b[0] - a[0], -0.04, 0.04) * w,
      cr: clamp(b[1] - a[1], -0.04, 0.04) * w,
    };
    result.match_basis = skin ? 'sampled skin' : 'mid-tone scene proxy';
    result.delta_e_before = deltaE2000(rgbToLab(current), rgbToLab(goal));
    result.delta_e_after = deltaE2000(
      rgbToLab(primary(skin ? stats.skin.rgb : stats.mid.rgb, result)),
      rgbToLab(goal),
    );
  }
  return result;
}
export function transform(
  rgb,
  { correction = null, look = 'clean', strength = 1, primaries = [] } = {},
) {
  strength = clamp(strength);
  if (strength === 0) return [...rgb];
  const data = typeof look === 'string' ? loadLook(look) : look;
  let corrected = primary(rgb, correction);
  for (const effect of primaries) {
    const p = effect.params ?? {},
      v = (key, fallback) => curveValue(p[key], 0, fallback);
    corrected = corrected.map((x, i) => {
      const key = ['r', 'g', 'b'][i];
      return (
        Math.max(
          0,
          (x + v('lift_' + key, 0) + v('lift_m', 0)) *
            v('gain_' + key, 1) *
            v('gain_m', 1) +
            v('offset_' + key, 0) +
            v('offset_m', 0),
        ) **
        (1 / Math.max(0.001, v('gamma_' + key, 1) * v('gamma_m', 1)))
      );
    });
    const y = luma(corrected),
      s = v('saturation', 1),
      contrast = v('contrast', 1);
    corrected = corrected.map((x) => (y + (x - y) * s - 0.5) * contrast + 0.5);
  }
  const base = rgb.map((v, i) => mix(v, corrected[i], strength));
  let c = base.map(
    (v, i) =>
      Math.max(0, (v + data.lift[i]) * data.gain[i]) ** (1 / data.gamma[i]),
  );
  c = c.map((v) => (v - 0.5) * data.contrast + 0.5);
  const y = luma(c),
    h = hue(c),
    red = Math.max(0, 1 - hueDistance(h, 103) / 28),
    green = Math.max(0, 1 - hueDistance(h, 230) / 45);
  const sat =
    data.saturation *
    (1 + (data.red_boost ?? 0) * red) *
    (1 - (1 - (data.green_sat ?? 1)) * green);
  c = c.map((v) => y + (v - y) * sat);
  const weight = Math.min(strength, data.cap) * (1 - 0.6 * skinWeight(rgb));
  c = base.map((v, i) => mix(v, c[i], weight));
  c = protectSkin(rgb, c);
  // Leave room for one 8-bit range quantization/dither step at the warp boundary.
  return gamut(
    c,
    (data.id === 'moody-doc' ? 0.014 : 0.012) * strength,
    1 - 0.012 * strength,
  );
}
/** .cube uses red-fastest order. A single 33³ tetrahedral LUT owns the complete grade. */
export function cubeText(options = {}, size = 33) {
  if (!Number.isInteger(size) || size < 2 || size > 65)
    throw new Error('Unsupported LUT size');
  const lines = [
    'TITLE "kimo colour finish"',
    `LUT_3D_SIZE ${size}`,
    'DOMAIN_MIN 0 0 0',
    'DOMAIN_MAX 1 1 1',
  ];
  for (let b = 0; b < size; b++)
    for (let g = 0; g < size; g++)
      for (let r = 0; r < size; r++)
        lines.push(
          transform([r / (size - 1), g / (size - 1), b / (size - 1)], options)
            .map((v) => v.toFixed(8))
            .join(' '),
        );
  return lines.join('\n') + '\n';
}
export async function writeLut(directory, options) {
  await mkdir(directory, { recursive: true });
  const normalized = { ...options, look: loadLook(options.look ?? 'clean') },
    key = createHash('sha256')
      .update(JSON.stringify([LUT_VERSION, normalized]))
      .digest('hex')
      .slice(0, 24);
  const path = join(directory, key + '.cube');
  if (!existsSync(path)) {
    const temporary = path + '.partial';
    await writeFile(temporary, cubeText(normalized));
    await rename(temporary, path);
  }
  return { path, key };
}
