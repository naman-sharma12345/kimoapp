// TrueType outlines for the soft canvas (Node only): glyf/loca contours,
// composite glyphs, advances and vertical metrics of the bundled OFL faces.
// The Chromium path loads the same files with @font-face.
import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { fontMetrics, bundledFontsDir } from '../fonts.mjs';
import { FONT_FACES } from './kit.mjs';

function tableDir(buf) {
  const n = buf.readUInt16BE(4);
  const out = {};
  for (let i = 0; i < n; i++) {
    const o = 12 + i * 16;
    out[buf.toString('latin1', o, o + 4)] = { offset: buf.readUInt32BE(o + 8), length: buf.readUInt32BE(o + 12) };
  }
  return out;
}

/** One face: metrics from fonts.mjs, outlines parsed lazily per glyph. */
export class Face {
  constructor(file) {
    this.file = file;
    const m = fontMetrics(file);
    const buf = readFileSync(file);
    const t = tableDir(buf);
    this.buf = buf;
    this.t = t;
    this.m = m;
    this.unitsPerEm = m.unitsPerEm;
    this.ascent = m.ascent;
    this.descent = m.descent;
    const os2 = t['OS/2'];
    this.capHeight = os2 && buf.readUInt16BE(os2.offset) >= 2 ? buf.readInt16BE(os2.offset + 88) : m.ascent * 0.7;
    this.longLoca = buf.readInt16BE(t.head.offset + 50) === 1;
    this.numGlyphs = buf.readUInt16BE(t.maxp.offset + 4);
    this.cache = new Map();
  }
  glyphId(cp) {
    return this.m.cmap.get(cp) ?? 0;
  }
  advance(cp) {
    const g = this.glyphId(cp);
    if (cp === 0x20 || g) return this.m.advances[Math.min(g, this.m.advances.length - 1)];
    return this.unitsPerEm * 0.6;
  }
  _loca(g) {
    const o = this.t.loca.offset;
    return this.longLoca ? [this.buf.readUInt32BE(o + g * 4), this.buf.readUInt32BE(o + g * 4 + 4)] : [this.buf.readUInt16BE(o + g * 2) * 2, this.buf.readUInt16BE(o + g * 2 + 2) * 2];
  }
  /** Raw points per contour [{x, y, on}] in font units (composites flattened). */
  _points(g, depth = 0) {
    if (g >= this.numGlyphs || depth > 6) return [];
    const [a, b] = this._loca(g);
    if (b <= a) return [];
    const buf = this.buf;
    const p = this.t.glyf.offset + a;
    const nc = buf.readInt16BE(p);
    if (nc >= 0) {
      const ends = [];
      for (let i = 0; i < nc; i++) ends.push(buf.readUInt16BE(p + 10 + i * 2));
      const n = nc ? ends.at(-1) + 1 : 0;
      let q = p + 10 + nc * 2;
      q += 2 + buf.readUInt16BE(q);
      const flags = [];
      while (flags.length < n) {
        const f = buf[q++];
        flags.push(f);
        if (f & 8) {
          let r = buf[q++];
          while (r-- > 0 && flags.length < n) flags.push(f);
        }
      }
      const xs = [];
      let v = 0;
      for (const f of flags) {
        if (f & 2) {
          const d = buf[q++];
          v += f & 16 ? d : -d;
        } else if (!(f & 16)) {
          v += buf.readInt16BE(q);
          q += 2;
        }
        xs.push(v);
      }
      const ys = [];
      v = 0;
      for (const f of flags) {
        if (f & 4) {
          const d = buf[q++];
          v += f & 32 ? d : -d;
        } else if (!(f & 32)) {
          v += buf.readInt16BE(q);
          q += 2;
        }
        ys.push(v);
      }
      const contours = [];
      let s = 0;
      for (const e of ends) {
        const c = [];
        for (let i = s; i <= e; i++) c.push({ x: xs[i], y: ys[i], on: Boolean(flags[i] & 1) });
        contours.push(c);
        s = e + 1;
      }
      return contours;
    }
    // composite
    const out = [];
    let q = p + 10;
    for (;;) {
      const flags = buf.readUInt16BE(q);
      const gi = buf.readUInt16BE(q + 2);
      q += 4;
      let dx;
      let dy;
      if (flags & 1) {
        dx = buf.readInt16BE(q);
        dy = buf.readInt16BE(q + 2);
        q += 4;
      } else {
        dx = buf.readInt8(q);
        dy = buf.readInt8(q + 1);
        q += 2;
      }
      let [a1, b1, c1, d1] = [1, 0, 0, 1];
      const f2 = (o) => buf.readInt16BE(o) / 16384;
      if (flags & 8) {
        a1 = d1 = f2(q);
        q += 2;
      } else if (flags & 0x40) {
        a1 = f2(q);
        d1 = f2(q + 2);
        q += 4;
      } else if (flags & 0x80) {
        a1 = f2(q);
        b1 = f2(q + 2);
        c1 = f2(q + 4);
        d1 = f2(q + 6);
        q += 8;
      }
      if (!(flags & 2)) dx = dy = 0; // point-matched anchors are rare in these faces; placed at origin
      for (const c of this._points(gi, depth + 1)) out.push(c.map((pt) => ({ x: a1 * pt.x + c1 * pt.y + dx, y: b1 * pt.x + d1 * pt.y + dy, on: pt.on })));
      if (!(flags & 0x20)) break;
    }
    return out;
  }
  /** Contours as path commands in font units: M / L / Q (y up). */
  contours(cp) {
    if (this.cache.has(cp)) return this.cache.get(cp);
    const out = [];
    for (const pts of this._points(this.glyphId(cp))) {
      if (pts.length < 2) continue;
      let start = pts.findIndex((p) => p.on);
      let seq;
      if (start < 0) {
        // all off-curve: start at the midpoint of the first two
        const m = { x: (pts[0].x + pts[1].x) / 2, y: (pts[0].y + pts[1].y) / 2, on: true };
        seq = [m, ...pts.slice(1), pts[0]];
        start = 0;
      } else seq = [...pts.slice(start), ...pts.slice(0, start)];
      const cmds = [['M', seq[0].x, seq[0].y]];
      for (let i = 1; i <= seq.length; i++) {
        const p = seq[i % seq.length];
        const prev = seq[i - 1];
        if (p.on) {
          if (prev.on) cmds.push(['L', p.x, p.y]);
        } else {
          const next = seq[(i + 1) % seq.length];
          const end = next.on ? next : { x: (p.x + next.x) / 2, y: (p.y + next.y) / 2 };
          cmds.push(['Q', p.x, p.y, end.x, end.y]);
        }
      }
      out.push(cmds);
    }
    this.cache.set(cp, out);
    return out;
  }
}

/** Font book over the bundled faces (family + weight + style → nearest file). */
export class FontBook {
  constructor(dir = bundledFontsDir(), faces = FONT_FACES) {
    this.dir = dir;
    this.list = faces.filter((f) => existsSync(join(dir, f.file)));
    this.loaded = new Map();
  }
  face(family, weight = 400, style = 'normal') {
    const fam = this.list.filter((f) => f.family.toLowerCase() === String(family).toLowerCase());
    if (!fam.length) return null;
    const pick = [...fam].sort((a, b) => (a.style === style ? 0 : 1000) + Math.abs(a.weight - weight) - ((b.style === style ? 0 : 1000) + Math.abs(b.weight - weight)))[0];
    if (!this.loaded.has(pick.file)) this.loaded.set(pick.file, new Face(join(this.dir, pick.file)));
    return this.loaded.get(pick.file);
  }
}
