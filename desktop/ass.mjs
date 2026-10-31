// Typed ASS (Advanced SubStation Alpha) builder for the libass caption and
// title passes. Callers build styles, events and override tags as data; this
// module owns every escape, number format and time format, so no planner or
// style code ever concatenates raw ASS.

const finite = (v, name) => {
  const n = Number(v);
  if (!Number.isFinite(n)) throw new TypeError(`ASS ${name}: finite number required, got ${v}`);
  return n;
};
/** Compact decimal (max 2 places) for tag arguments. */
export const num = (v, name = 'value', places = 2) => {
  const n = finite(v, name);
  return String(Number(n.toFixed(places)));
};
const int = (v, name) => String(Math.round(finite(v, name)));
const byte = (n) =>
  Math.max(0, Math.min(255, Math.round(n)))
    .toString(16)
    .padStart(2, '0')
    .toUpperCase();

/** '#RRGGBB' (or [r,g,b] 0..1) → ASS &HBBGGRR& colour (no alpha). */
export function colour(value) {
  let rgb = [255, 255, 255];
  if (Array.isArray(value)) rgb = value.map((v) => Math.round(Number(v) * 255));
  else if (/^#?[0-9a-f]{6}$/i.test(String(value ?? ''))) rgb = String(value).replace('#', '').match(/../g).map((h) => parseInt(h, 16));
  else if (value != null) throw new TypeError(`ASS colour: #RRGGBB required, got ${value}`);
  return `&H${byte(rgb[2])}${byte(rgb[1])}${byte(rgb[0])}&`;
}
/** Opacity 0..1 → ASS alpha &HAA& (00 opaque, FF transparent). */
export function alpha(opacity) {
  return `&H${byte(255 * (1 - Math.max(0, Math.min(1, finite(opacity, 'opacity')))))}&`;
}
/** Style-line colour with alpha: &HAABBGGRR. */
export function styleColour(value, opacity = 1) {
  return `&H${alpha(opacity).slice(2, 4)}${colour(value).slice(2, -1)}`;
}

/**
 * Event text escaping. libass treats { } as override delimiters (\{ \} are
 * literal braces) and \N \n \h as breaks/spaces; a word joiner after every
 * backslash keeps "C:\new" literal. Newlines in data become hard breaks.
 */
export function escapeText(s) {
  return String(s ?? '')
    .replace(/\r\n?/g, '\n')
    .replace(/\\/g, '\\\u2060')
    .replace(/[{}]/g, (c) => `\\${c}`)
    .replace(/\n/g, '\\N');
}
/** Style names, font names and the Name field are comma-separated fields: no commas, braces or newlines. */
export function fieldText(s) {
  return String(s ?? '')
    .replace(/[,{}\\\r\n]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/** Seconds → H:MM:SS.cc, floored after a tiny epsilon (frame-quantized inputs land on the intended centisecond). */
export function assTime(seconds) {
  const cs = Math.max(0, Math.floor(finite(seconds, 'time') * 100 + 1e-6));
  return `${Math.floor(cs / 360000)}:${String(Math.floor(cs / 6000) % 60).padStart(2, '0')}:${String(Math.floor(cs / 100) % 60).padStart(2, '0')}.${String(cs % 100).padStart(2, '0')}`;
}

// ---------------------------------------------------------------- override tags
/** Override tags as values; each returns the tag text without the braces. */
export const tag = {
  an: (n) => `\\an${int(n, 'an')}`,
  pos: (x, y) => `\\pos(${num(x, 'x')},${num(y, 'y')})`,
  move: (x1, y1, x2, y2, t1, t2) => `\\move(${num(x1, 'x1')},${num(y1, 'y1')},${num(x2, 'x2')},${num(y2, 'y2')}${t1 != null ? `,${int(t1, 't1')},${int(t2, 't2')}` : ''})`,
  org: (x, y) => `\\org(${num(x, 'x')},${num(y, 'y')})`,
  fn: (name) => `\\fn${fieldText(name)}`,
  fs: (size) => `\\fs${num(size, 'fs')}`,
  fsc: (x, y = x) => `\\fscx${num(x, 'fscx')}\\fscy${num(y, 'fscy')}`,
  fscx: (x) => `\\fscx${num(x, 'fscx')}`,
  fscy: (y) => `\\fscy${num(y, 'fscy')}`,
  fsp: (px) => `\\fsp${num(px, 'fsp')}`,
  frz: (deg) => `\\frz${num(deg, 'frz')}`,
  bord: (px) => `\\bord${num(px, 'bord')}`,
  shad: (px) => `\\shad${num(px, 'shad')}`,
  xshad: (px) => `\\xshad${num(px, 'xshad')}`,
  yshad: (px) => `\\yshad${num(px, 'yshad')}`,
  blur: (px) => `\\blur${num(px, 'blur')}`,
  be: (n) => `\\be${int(n, 'be')}`,
  b: (w) => `\\b${int(w, 'b')}`,
  c: (hex) => `\\1c${colour(hex)}`,
  c2: (hex) => `\\2c${colour(hex)}`,
  c3: (hex) => `\\3c${colour(hex)}`,
  c4: (hex) => `\\4c${colour(hex)}`,
  alpha: (opacity) => `\\alpha${alpha(opacity)}`,
  a1: (opacity) => `\\1a${alpha(opacity)}`,
  a3: (opacity) => `\\3a${alpha(opacity)}`,
  a4: (opacity) => `\\4a${alpha(opacity)}`,
  fad: (inMs, outMs) => `\\fad(${int(inMs, 'fad in')},${int(outMs, 'fad out')})`,
  kf: (cs) => `\\kf${int(Math.max(0, cs), 'kf')}`,
  k: (cs) => `\\k${int(Math.max(0, cs), 'k')}`,
  clip: (x1, y1, x2, y2) => `\\clip(${num(x1, 'x1')},${num(y1, 'y1')},${num(x2, 'x2')},${num(y2, 'y2')})`,
  p: (level) => `\\p${int(level, 'p')}`,
  q: (n) => `\\q${int(n, 'q')}`,
  r: (style = '') => `\\r${fieldText(style)}`,
  /** Animated transform: \t(t1,t2,accel,tags...). Times in ms relative to the event start. */
  t: (t1, t2, ...rest) => {
    const accel = typeof rest[0] === 'number' ? rest.shift() : null;
    const body = rest.flat().join('');
    if (!body) throw new TypeError('ASS \\t needs at least one tag');
    return `\\t(${int(t1, 't1')},${int(t2, 't2')},${accel != null ? `${num(accel, 'accel')},` : ''}${body})`;
  },
};

/** Vector drawing path (\p1 units) from commands [['m',x,y],['l',x,y,...],['b',...]]. */
export function drawing(commands) {
  return commands.map(([op, ...pts]) => {
    if (!['m', 'n', 'l', 'b', 's', 'p', 'c'].includes(op)) throw new TypeError(`ASS drawing: bad command ${op}`);
    return [op, ...pts.map((v) => num(v, 'draw', 1))].join(' ');
  }).join(' ');
}
/** Rounded rectangle drawing with its top-left at 0,0. */
export function roundedRect(w, h, r) {
  const k = 0.5523;
  r = Math.max(0, Math.min(r, w / 2, h / 2));
  return drawing([
    ['m', r, 0],
    ['l', w - r, 0],
    ['b', w - r + k * r, 0, w, r - k * r, w, r],
    ['l', w, h - r],
    ['b', w, h - r + k * r, w - r + k * r, h, w - r, h],
    ['l', r, h],
    ['b', r - k * r, h, 0, h - r + k * r, 0, h - r],
    ['l', 0, r],
    ['b', 0, r - k * r, r - k * r, 0, r, 0],
  ]);
}

// ---------------------------------------------------------------- document
const STYLE_FIELDS = ['Name', 'Fontname', 'Fontsize', 'PrimaryColour', 'SecondaryColour', 'OutlineColour', 'BackColour', 'Bold', 'Italic', 'Underline', 'StrikeOut', 'ScaleX', 'ScaleY', 'Spacing', 'Angle', 'BorderStyle', 'Outline', 'Shadow', 'Alignment', 'MarginL', 'MarginR', 'MarginV', 'Encoding'];

/**
 * An ASS document. style() and event() take plain objects; parts of an event
 * are {tags:[...]} override blocks, {text} (escaped) or {draw} vector paths.
 */
export class AssDocument {
  constructor({ w, h, title = 'kimo', matrix = 'TV.709' }) {
    this.w = Math.round(finite(w, 'PlayResX'));
    this.h = Math.round(finite(h, 'PlayResY'));
    this.title = fieldText(title);
    this.matrix = matrix;
    this.styles = new Map();
    this.events = [];
    this.raw = [];
  }
  style(s) {
    const name = fieldText(s.name);
    if (!name) throw new TypeError('ASS style needs a name');
    this.styles.set(name, [
      name,
      fieldText(s.font ?? 'Geist Black'),
      num(s.size ?? 48, 'Fontsize'),
      styleColour(s.primary ?? '#FFFFFF', s.primaryOpacity ?? 1),
      styleColour(s.secondary ?? s.primary ?? '#FFFFFF', s.secondaryOpacity ?? 1),
      styleColour(s.outline ?? '#000000', s.outlineOpacity ?? 1),
      styleColour(s.back ?? '#000000', s.backOpacity ?? 0.5),
      s.bold ? -1 : 0,
      s.italic ? -1 : 0,
      0,
      0,
      num(s.scaleX ?? 100, 'ScaleX'),
      num(s.scaleY ?? 100, 'ScaleY'),
      num(s.spacing ?? 0, 'Spacing'),
      num(s.angle ?? 0, 'Angle'),
      int(s.borderStyle ?? 1, 'BorderStyle'),
      num(s.outlineWidth ?? 0, 'Outline'),
      num(s.shadow ?? 0, 'Shadow'),
      int(s.align ?? 5, 'Alignment'),
      int(s.marginL ?? 0, 'MarginL'),
      int(s.marginR ?? 0, 'MarginR'),
      int(s.marginV ?? 0, 'MarginV'),
      1,
    ].join(','));
    return name;
  }
  hasStyle(name) {
    return this.styles.has(fieldText(name));
  }
  /** {layer, start, end (seconds), style, name, parts:[{tags}|{text}|{draw}]} */
  event(e) {
    const start = finite(e.start, 'start');
    const end = finite(e.end, 'end');
    if (!(end > start)) return this;
    const style = fieldText(e.style ?? 'Default');
    if (!this.styles.has(style) && style !== 'Default') throw new TypeError(`ASS event uses unknown style ${style}`);
    let text = '';
    let drawingOpen = false;
    for (const part of e.parts ?? []) {
      if (part.tags) {
        const tags = part.tags.flat().filter(Boolean);
        if (tags.some((t) => typeof t !== 'string' || !t.startsWith('\\'))) throw new TypeError('ASS tags must come from the tag helpers');
        if (tags.length) text += `{${tags.join('')}}`;
      } else if (part.draw != null) {
        text += `{\\p1}${part.draw}`;
        drawingOpen = true;
        if (part.close !== false) {
          text += '{\\p0}';
          drawingOpen = false;
        }
      } else if (part.text != null) {
        if (drawingOpen) {
          text += '{\\p0}';
          drawingOpen = false;
        }
        text += escapeText(part.text);
      }
    }
    this.events.push({ layer: Math.max(0, Math.round(e.layer ?? 0)), start, end, line: `${int(e.layer ?? 0, 'layer')},${assTime(start)},${assTime(end)},${style},${fieldText(e.name ?? '')},0,0,0,,${text}` });
    return this;
  }
  /** Pre-formatted Dialogue bodies from the legacy overlay text pass (compose-text.mjs). */
  rawDialogue(lines) {
    for (const l of lines) this.raw.push(l);
    return this;
  }
  toString() {
    const head = ['[Script Info]', 'ScriptType: v4.00+', `Title: ${this.title}`, `YCbCr Matrix: ${this.matrix}`, `PlayResX: ${this.w}`, `PlayResY: ${this.h}`, 'WrapStyle: 2', 'ScaledBorderAndShadow: yes', ''];
    const styles = ['[V4+ Styles]', `Format: ${STYLE_FIELDS.join(', ')}`, 'Style: Default,DejaVu Sans,48,&H00FFFFFF,&H00FFFFFF,&H00000000,&H80000000,0,0,0,0,100,100,0,0,1,0,0,5,0,0,0,1', ...[...this.styles.values()].map((s) => `Style: ${s}`), ''];
    const events = ['[Events]', 'Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text', ...this.raw, ...this.events.map((e) => `Dialogue: ${e.line}`)];
    return [...head, ...styles, ...events].join('\n') + '\n';
  }
}
