/**
 * Shared VFR-safe frame-rate handling for ffprobe's r_frame_rate /
 * avg_frame_rate pair.
 *
 * Phones (and some VFR encoders) write a nominal r_frame_rate that is a
 * high-timebase artifact far above the content's real average rate (e.g.
 * "600/1" on a clip that actually plays at ~30 fps). Trusting r_frame_rate
 * verbatim inflates any fps-driven math downstream: minterpolate targets
 * hundreds of fps for content that has nowhere near that many real frames
 * (crawling renders), and per-frame source-index math (edl.mjs framePlan)
 * can walk far outside the real content.
 *
 * The guard used consistently elsewhere in this app (engine.mjs probe(),
 * sam.mjs probeJson()): when r_frame_rate is more than 1.5x avg_frame_rate,
 * trust avg_frame_rate instead. This module is the one place that rule
 * lives now; compose.mjs previously duplicated the raw (unguarded) read.
 */

/** "n/d" or a plain number -> a numeric fps, or 0 if unparseable/zero. */
export function parseRate(x) {
  const [n, d] = String(x ?? '').split('/').map(Number);
  if (d == null) return n > 0 ? n : 0;
  return n > 0 && d > 0 ? n / d : 0;
}

/**
 * Picks the safe rate to treat as a clip's fps from ffprobe's two fields.
 *   rFrameRate / avgFrameRate: raw ffprobe strings (e.g. "600/1"), as read
 *     from stream.r_frame_rate / stream.avg_frame_rate.
 *   fallback: used when neither field parses to something usable (string
 *     "n/d" or a number; default '30/1').
 * Returns:
 *   rate   - "n/d" string, safe to feed to ffmpeg (-vf fps=, minterpolate=fps=).
 *   fps    - the same rate as a number, rounded to 3 decimals.
 *   vfr    - true when r_frame_rate and avg_frame_rate disagree by more
 *            than 0.01 fps (this clip genuinely has a variable frame rate,
 *            regardless of which field won out above).
 *   guarded- true when r_frame_rate was far enough above avg_frame_rate
 *            (>1.5x) that avg_frame_rate was substituted for it.
 */
export function effectiveRate(rFrameRate, avgFrameRate, fallback = '30/1') {
  const fr = parseRate(rFrameRate);
  const avg = parseRate(avgFrameRate);
  const guarded = fr > 0 && avg > 0 && fr > avg * 1.5;
  const fallbackFps = parseRate(fallback) || 30;
  const rateStr = guarded
    ? String(avgFrameRate)
    : fr
      ? String(rFrameRate)
      : avg
        ? String(avgFrameRate)
        : String(fallback);
  const fps = guarded ? avg : fr || avg || fallbackFps;
  return {
    rate: rateStr && rateStr !== '0/0' ? rateStr : String(fallback),
    fps: +fps.toFixed(3),
    vfr: fr > 0 && avg > 0 && Math.abs(fr - avg) > 0.01,
    guarded,
  };
}
