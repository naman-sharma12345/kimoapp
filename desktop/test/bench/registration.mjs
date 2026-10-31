// Source-referenced small-translation least squares. Physical source motion cancels
// because each decoded output is registered to its own expected source frame.
// This is an estimate, not a replacement for source-frame identity or barcode tests.
export function registerTranslation(output, reference, width, height, mask) {
  if (
    !reference ||
    output.length !== width * height ||
    reference.length !== output.length
  )
    return null;
  let n = 0,
    sr = 0,
    so = 0,
    rr = 0,
    ro = 0;
  const valid = (k) =>
    !mask ||
    (mask[k] &&
      mask[k - 1] &&
      mask[k + 1] &&
      mask[k - width] &&
      mask[k + width]);
  for (let y = 2; y < height - 2; y++)
    for (let x = 2; x < width - 2; x++) {
      const k = y * width + x;
      if (!valid(k)) continue;
      const r = reference[k],
        o = output[k];
      n++;
      sr += r;
      so += o;
      rr += r * r;
      ro += r * o;
    }
  const variance = rr - (sr * sr) / n;
  if (n < width * height * 0.2 || !(variance / n > 4)) return null;
  const gain = (ro - (sr * so) / n) / variance,
    bias = (so - gain * sr) / n;
  if (!(gain > 0.5 && gain < 2)) return null;
  let xx = 0,
    xy = 0,
    yy = 0,
    xt = 0,
    yt = 0;
  for (let y = 2; y < height - 2; y++)
    for (let x = 2; x < width - 2; x++) {
      const k = y * width + x;
      if (!valid(k)) continue;
      const gx = (gain * (reference[k + 1] - reference[k - 1])) / 2;
      const gy = (gain * (reference[k + width] - reference[k - width])) / 2;
      const dt = output[k] - (gain * reference[k] + bias);
      xx += gx * gx;
      xy += gx * gy;
      yy += gy * gy;
      xt += gx * dt;
      yt += gy * dt;
    }
  const determinant = xx * yy - xy * xy;
  if (
    !(determinant > 0) ||
    determinant / (xx + yy) ** 2 < 0.001 ||
    (xx + yy) / n < 0.5
  )
    return null;
  const dx = (yy * xt - xy * yt) / determinant,
    dy = (xx * yt - xy * xt) / determinant;
  // A first-order fit is only meaningful for small residuals. Reject major framing differences.
  if (Math.hypot(dx, dy) > 0.75) return null;
  let error = 0;
  for (let y = 2; y < height - 2; y++)
    for (let x = 2; x < width - 2; x++) {
      const k = y * width + x;
      if (!valid(k)) continue;
      const gx = (gain * (reference[k + 1] - reference[k - 1])) / 2;
      const gy = (gain * (reference[k + width] - reference[k - width])) / 2;
      error +=
        (output[k] - (gain * reference[k] + bias + gx * dx + gy * dy)) ** 2;
    }
  const rmse = Math.sqrt(error / n);
  return rmse <= 6 ? { dx, dy, rmse, gain, pixels: n } : null;
}

export function sourceResidualJitter(
  output,
  reference,
  { width, height, outputWidth, outputHeight, masks } = {},
) {
  const shifts = output.map((frame, i) =>
    registerTranslation(frame, reference[i], width, height, masks?.[i]),
  );
  const weights = [-2, 3, 6, 7, 6, 3, -2].map((v) => v / 21);
  const scaleX =
    ((outputWidth / Math.min(outputWidth, outputHeight)) * 1080) / width;
  const scaleY =
    ((outputHeight / Math.min(outputWidth, outputHeight)) * 1080) / height;
  let squared = 0,
    measured = 0;
  for (let i = 3; i < shifts.length - 3; i++) {
    const window = shifts.slice(i - 3, i + 4);
    if (window.some((v) => !v)) continue;
    const smoothX = window.reduce((s, v, j) => s + weights[j] * v.dx, 0);
    const smoothY = window.reduce((s, v, j) => s + weights[j] * v.dy, 0);
    squared +=
      ((shifts[i].dx - smoothX) * scaleX) ** 2 +
      ((shifts[i].dy - smoothY) * scaleY) ** 2;
    measured++;
  }
  const eligible = Math.max(0, output.length - 6);
  const coverage = eligible ? measured / eligible : 0;
  return {
    jitter_px:
      coverage >= 0.95 && measured ? Math.sqrt(squared / measured) : null,
    measured,
    eligible,
    coverage,
    mean_fit_rmse: shifts.some(Boolean)
      ? shifts.filter(Boolean).reduce((s, v) => s + v.rmse, 0) /
        shifts.filter(Boolean).length
      : null,
  };
}

// Registration measures frames; frame matching measures adjacent pairs. Keep their denominators separate.
export function aggregateRegistration(segments, totalFrames) {
  let eligible = Math.max(0, totalFrames),
    measured = 0,
    squared = 0;
  for (const segment of segments) {
    const camera = segment.camera;
    if (!camera) continue;
    eligible -= Math.min(6, segment.total);
    if (camera.jitter_px != null) {
      measured += camera.measured;
      squared += camera.jitter_px ** 2 * camera.measured;
    }
  }
  if (eligible < 0 || measured > eligible)
    throw new Error('Registration counts exceed eligible output frames');
  const coverage = eligible ? measured / eligible : 0;
  return {
    jitter_px:
      measured && coverage >= 0.95 ? Math.sqrt(squared / measured) : null,
    camera_registration_coverage: coverage,
  };
}
