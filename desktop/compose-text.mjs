import { rate, curveValue } from './edl.mjs';

const escape = (s) =>
  String(s ?? '')
    .replaceAll('\\', '\\\\')
    .replaceAll('{', '\\{')
    .replaceAll('}', '\\}')
    .replaceAll('\n', '\\N');
const byte = (n) =>
  Math.max(0, Math.min(255, Math.round(n)))
    .toString(16)
    .padStart(2, '0')
    .toUpperCase();
export function assColour(value, alpha = 0) {
  const rgb = Array.isArray(value)
    ? value.map((v) => Math.round(v * 255))
    : /^#[0-9a-f]{6}$/i.test(value ?? '')
      ? value
          .slice(1)
          .match(/../g)
          .map((v) => parseInt(v, 16))
      : [255, 255, 255];
  return `&H${byte(alpha)}${byte(rgb[2])}${byte(rgb[1])}${byte(rgb[0])}&`;
}
const time = (seconds) => {
  const cs = Math.max(0, Math.floor(seconds * 100 + 1e-7));
  return `${Math.floor(cs / 360000)}:${String(Math.floor(cs / 6000) % 60).padStart(2, '0')}:${String(Math.floor(cs / 100) % 60).padStart(2, '0')}.${String(cs % 100).padStart(2, '0')}`;
};
function primitive(p, scale) {
  const w = p.width * scale,
    h = p.height * scale;
  const n = (v) => Number(v.toFixed(3));
  if (p.primitive === 'ellipse') {
    const x = w / 2,
      y = h / 2,
      k = 0.55228475;
    return `m ${n(w)} ${n(y)} b ${n(w)} ${n(y + k * y)} ${n(x + k * x)} ${n(h)} ${n(x)} ${n(h)} ${n(x - k * x)} ${n(h)} 0 ${n(y + k * y)} 0 ${n(y)} 0 ${n(y - k * y)} ${n(x - k * x)} 0 ${n(x)} 0 ${n(x + k * x)} 0 ${n(w)} ${n(y - k * y)} ${n(w)} ${n(y)}`;
  }
  if (p.primitive === 'polygon') {
    const sides = Math.max(3, Math.min(64, Math.round(p.sides ?? 4)));
    const points = Array.from({ length: sides }, (_, i) => [
      n(w / 2 + (w / 2) * Math.cos(-Math.PI / 2 + (i * 2 * Math.PI) / sides)),
      n(h / 2 + (h / 2) * Math.sin(-Math.PI / 2 + (i * 2 * Math.PI) / sides)),
    ]);
    return `m ${points[0].join(' ')} l ${[...points.slice(1), points[0]].flat().join(' ')}`;
  }
  const r = Math.max(0, Math.min(w / 2, h / 2, (p.corner_radius ?? 0) * scale)),
    k = 0.55228475;
  return `m ${n(r)} 0 l ${n(w - r)} 0 b ${n(w - r + k * r)} 0 ${n(w)} ${n(r - k * r)} ${n(w)} ${n(r)} l ${n(w)} ${n(h - r)} b ${n(w)} ${n(h - r + k * r)} ${n(w - r + k * r)} ${n(h)} ${n(w - r)} ${n(h)} l ${n(r)} ${n(h)} b ${n(r - k * r)} ${n(h)} 0 ${n(h - r + k * r)} 0 ${n(h - r)} l 0 ${n(r)} b 0 ${n(r - k * r)} ${n(r - k * r)} 0 ${n(r)} 0`;
}
function appearance(o, t, canvas) {
  const p = o.props,
    fx = p.text_fx ?? {},
    curves = p.curves ?? {};
  const scale = canvas.w / (p.reference?.w ?? canvas.w);
  const x =
    canvas.w * (p.x ?? 0.5) +
    (curveValue(curves.x, t) - curveValue(curves.x, 0)) * scale;
  const y =
    canvas.h * (p.y ?? 0.5) +
    (curveValue(curves.y, t) - curveValue(curves.y, 0)) * scale;
  const opacity = curveValue(curves.opacity, t, 1);
  const size = Math.max(1, (p.size ?? 48) * scale);
  const zoom = curveValue(curves.scale, t, 1);
  const alpha = 255 * (1 - opacity);
  if (p.primitive) {
    const w = p.width * scale,
      h = p.height * scale;
    return `{\\an7\\pos(${(x - (w * zoom) / 2).toFixed(3)},${(y - (h * zoom) / 2).toFixed(3)})\\org(${x.toFixed(3)},${y.toFixed(3)})\\fscx${(zoom * 100).toFixed(3)}\\fscy${(zoom * 100).toFixed(3)}\\frz${-curveValue(curves.rotation, t)}\\c${assColour(p.fill)}\\3c${assColour(p.stroke_color ?? [0, 0, 0])}\\bord${((p.stroke_width ?? 0) * scale).toFixed(3)}\\shad0\\alpha&H${byte(alpha)}&\\p1}${primitive(p, scale)}{\\p0}`;
  }
  const font = String(p.font ?? 'DejaVu Sans').replace(/[{},\\\r\n]/g, '');
  const tags = `\\an5\\pos(${x.toFixed(3)},${y.toFixed(3)})\\fn${font}\\fs${size.toFixed(3)}\\b${Number.isFinite(fx.weight) ? Math.max(100, Math.min(900, Math.round(fx.weight))) : 400}\\fscx${(zoom * 100).toFixed(3)}\\fscy${(zoom * 100).toFixed(3)}\\frz${-curveValue(curves.rotation, t)}\\bord${((p.stroke_width ?? 0) * scale).toFixed(3)}\\shad${((p.shadow ?? 0) * scale).toFixed(3)}\\fsp${((p.letter_spacing ?? 0) * scale).toFixed(3)}\\3c${assColour(p.stroke_color ?? [0, 0, 0])}\\alpha&H${byte(alpha)}&`;
  const original = fx.uppercase
    ? String(p.text ?? '').toUpperCase()
    : String(p.text ?? '');
  const words = original.split(/(\s+)/);
  const count = words.filter((w) => w.trim()).length;
  let wi = 0;
  const body = words
    .map((w) => {
      if (!w.trim()) return escape(w);
      let colour = p.color ?? [1, 1, 1],
        wordScale = 1,
        hidden = false;
      for (const a of fx.animators ?? []) {
        const offset = curveValue(a.offset, t),
          start = curveValue(a.start, t),
          end = curveValue(a.end, t, 1);
        if (a.id === 'reveal') {
          if ((wi + 1) / Math.max(1, count) > offset + 1e-6) hidden = true;
          continue;
        }
        if (
          wi / count >= start + offset - 1e-7 &&
          wi / count < end + offset - 1e-7
        ) {
          if (a.fill) colour = a.fill;
          wordScale *= curveValue(a.scale, t, 1);
        }
      }
      wi++;
      return `{\\c${assColour(colour)}\\alpha&H${byte(hidden ? 255 : alpha)}&\\fscx${(zoom * wordScale * 100).toFixed(3)}\\fscy${(zoom * wordScale * 100).toFixed(3)}}${escape(w)}`;
    })
    .join('');
  return `{${tags}}${body}`;
}
/** ASS times are rounded down after quantizing to the output frame grid.
 * At <=60 fps, this includes exactly the requested frames despite centisecond ASS timestamps. */
export function subtitles(edl, from = 0, to = Infinity) {
  const fps = rate(edl.canvas.fps);
  const header = `[Script Info]\nScriptType: v4.00+\nYCbCr Matrix: TV.709\nPlayResX: ${edl.canvas.w}\nPlayResY: ${edl.canvas.h}\nWrapStyle: 2\nScaledBorderAndShadow: yes\n\n[V4+ Styles]\nFormat: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding\nStyle: Default,DejaVu Sans,48,&H00FFFFFF,&H00FFFFFF,&H00000000,&H80000000,0,0,0,0,100,100,0,0,1,0,0,5,0,0,0,1\n\n[Events]\nFormat: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text\n`;
  const lines = [];
  for (const [layer, o] of edl.overlays.entries()) {
    if (o.kind === 'image' || (o.kind === 'text_behind' && o.src)) continue;
    const start = Math.max(from, Math.ceil(o.at * fps - 1e-7)),
      end = Math.min(to, Math.ceil((o.at + o.dur) * fps - 1e-7));
    let last,
      begin = start;
    const flush = (n) => {
      if (last != null && n > begin)
        lines.push(
          `Dialogue: ${layer},${time((begin - from) / fps)},${time((n - from) / fps)},Default,,0,0,0,,${last}`,
        );
    };
    for (let n = start; n < end; n++) {
      const text = appearance(o, n / fps - o.at, edl.canvas);
      if (text !== last) {
        flush(n);
        begin = n;
        last = text;
      }
    }
    flush(end);
  }
  return header + lines.join('\n') + '\n';
}
