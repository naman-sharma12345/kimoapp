import { filterPath } from '../fonts.mjs';
/** Decode a tagged source to full-range, display-encoded BT.709 float RGB. */
export function inputFilters(source = {}) {
  const c = source.color ?? {},
    rgb = /^(rgb|bgr|gbr)/.test(source.pixel_format ?? '') || c.space === 'gbr';
  const range =
    c.range === 'pc' || c.range === 'full' || rgb ? 'full' : 'limited';
  const primaries = ['bt709', 'bt2020', 'smpte170m', 'bt470bg'].includes(
    c.primaries,
  )
    ? c.primaries
    : 'bt709';
  const transfer = [
    'bt709',
    'iec61966-2-1',
    'smpte2084',
    'arib-std-b67',
    'bt2020-10',
    'bt2020-12',
    'smpte170m',
  ].includes(c.trc)
    ? c.trc
    : 'bt709';
  const matrix = rgb
    ? 'gbr'
    : ['bt709', 'bt2020nc', 'smpte170m', 'bt470bg', 'fcc'].includes(c.space)
      ? c.space
      : 'bt709';
  const base = `zscale=pin=${primaries}:tin=${transfer}:min=${matrix}:rin=${range}`;
  if (transfer === 'smpte2084' || transfer === 'arib-std-b67')
    return `${base}:p=bt709:t=linear:m=gbr:r=full:npl=100,format=gbrpf32le,tonemap=tonemap=mobius:param=0.3:desat=1,zscale=pin=bt709:tin=linear:min=gbr:rin=full:p=bt709:t=bt709:m=gbr:r=full,format=gbrpf32le`;
  return `${base}:p=bt709:t=bt709:m=gbr:r=full,format=gbrpf32le`;
}
/** One float LUT, then one full→limited range conversion, dithered for the 8-bit warp. */
export function colorFilters(source, color, { normalized = false } = {}) {
  return [
    normalized ? 'format=gbrpf32le' : inputFilters(source),
    `lut3d=file=${filterPath(color.lut)}:interp=tetrahedral`,
    'zscale=pin=bt709:tin=bt709:min=gbr:rin=full:p=bt709:t=bt709:m=bt709:r=limited:dither=error_diffusion',
    'format=yuv444p',
    'setparams=range=limited:colorspace=bt709:color_primaries=bt709:color_trc=bt709',
  ].join(',');
}
export function finishSettings(source, canvas, rects = [], options = {}) {
  const rotated = Math.abs(source.rotation ?? 0) % 180 === 90,
    W = rotated ? source.h : source.w,
    H = rotated ? source.w : source.h;
  const factor = rects.length
    ? Math.max(...rects.map((r) => Math.max(canvas.w / r[2], canvas.h / r[3])))
    : Math.max(canvas.w / W, canvas.h / H);
  // Oversampled 4K downscales already have detail; do not sharpen them again.
  const amount = factor >= 1.3 ? Math.min(0.4, (0.4 * (factor - 1)) / 0.5) : 0;
  return {
    upscale_factor: Number(factor.toFixed(4)),
    sharpen: options.sharpen === false ? 0 : amount,
    grain: Boolean(options.grain),
    vignette: Boolean(options.vignette),
  };
}
/** Always called on footage after its last scale, before any overlay/text. */
export function finishFilters(settings) {
  const filters = [];
  if (settings.sharpen > 0)
    filters.push(`unsharp=5:5:${settings.sharpen.toFixed(5)}:3:3:0`);
  if (settings.grain)
    filters.push('noise=c0s=4:c0f=t:c1s=0:c2s=0:c3s=0:all_seed=9071');
  // Blend 20% of the PI/5 cosine falloff in limited-range luma; preserve chroma and alpha.
  if (settings.vignette)
    filters.push(
      "geq=lum='16+(lum(X,Y)-16)*(0.8+0.2*pow(cos(hypot(X-W/2,Y-H/2)/hypot(W/2,H/2)*PI/5),4))':cb='cb(X,Y)':cr='cr(X,Y)':a='alpha(X,Y)'",
    );
  return filters;
}
