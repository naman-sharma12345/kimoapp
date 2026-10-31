// Easing library shared by the camera director (main process) and the graphics
// render page (Chromium): one ESM module, no imports, no I/O.
const clamp01 = (u) => (u <= 0 ? 0 : u >= 1 ? 1 : u);
const SPRING_K = 8.5; // ω·duration: the spring is settled (≈0.2 %) at the end
const springNorm = 1 - (1 + SPRING_K) * Math.exp(-SPRING_K);

/** Easing library. back_out is for graphics only and never used by the camera. */
export const EASINGS = {
  linear: (u) => clamp01(u),
  sine: (u) => 0.5 - 0.5 * Math.cos(Math.PI * clamp01(u)),
  cubic: (u) => {
    u = clamp01(u);
    return u < 0.5 ? 4 * u * u * u : 1 - (-2 * u + 2) ** 3 / 2;
  },
  expo_out: (u) => {
    u = clamp01(u);
    return u >= 1 ? 1 : (1 - 2 ** (-10 * u)) / (1 - 2 ** -10);
  },
  expo_in: (u) => {
    u = clamp01(u);
    return u <= 0 ? 0 : (2 ** (10 * u - 10) - 2 ** -10) / (1 - 2 ** -10);
  },
  back_out: (u, s = 1.2) => {
    u = clamp01(u) - 1;
    return 1 + (s + 1) * u ** 3 + s * u * u;
  },
  // critically damped spring step response, ω = SPRING_K / duration, normalised to land on 1
  spring: (u) => {
    u = clamp01(u);
    return (1 - (1 + SPRING_K * u) * Math.exp(-SPRING_K * u)) / springNorm;
  },
  hold: () => 0,
};

/** Camera-safe ease by name; accepts the names native projects and older EDLs use. */
export function easeFn(name) {
  const n = String(name ?? 'cubic').toLowerCase();
  if (EASINGS[n] && n !== 'back_out') return EASINGS[n];
  if (n === 'hold' || n === 'step') return EASINGS.hold;
  if (/back/.test(n)) return (u) => 1 - (1 - clamp01(u)) ** 3; // graphics overshoot is never used on the camera
  if (/out.*quart/.test(n)) return (u) => 1 - (1 - clamp01(u)) ** 4;
  if (/expo/.test(n)) return /in/.test(n) && !/out/.test(n) ? EASINGS.expo_in : EASINGS.expo_out;
  if (/sine/.test(n)) return EASINGS.sine;
  if (/out.*cubic|ease_out|^out$/.test(n)) return (u) => 1 - (1 - clamp01(u)) ** 3;
  if (/in.*cubic|ease_in$|^in$/.test(n) && !/out/.test(n)) return (u) => clamp01(u) ** 3;
  if (/spring/.test(n)) return EASINGS.spring;
  if (/linear/.test(n)) return EASINGS.linear;
  return EASINGS.cubic; // cubic, in_out, smooth, ease, unknown
}


/** Graphics ease by name (graphics may overshoot: back_out is allowed here). */
export function graphicEase(name) {
  const n = String(name ?? 'cubic').toLowerCase();
  if (n === 'back_out' || n === 'back') return EASINGS.back_out;
  if (n === 'cubic_out' || n === 'out') return (u) => 1 - (1 - clamp01(u)) ** 3;
  if (n === 'cubic_in' || n === 'in') return (u) => clamp01(u) ** 3;
  return EASINGS[n] ?? easeFn(n);
}
export { clamp01 };
