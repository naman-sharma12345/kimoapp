// Font self-test for the Windows smoke: renders (1) the final text pass of a
// real edit and (2) every caption/title style with Latin + Devanagari words
// through libass with the bundled fonts dir, and reports any fallback face.
import { writeFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { AssDocument } from './ass.mjs';
import { captionStyles, captionOverlays } from './captions.mjs';
import { drawCaptions } from './caption-render.mjs';
import { checkFonts, bundledFontsDir, fontFiles } from './fonts.mjs';
import { finalScript } from './compose.mjs';

const sample = (text, t0) => {
  let t = t0;
  return text.split(' ').map((w) => {
    const r = { w, start: +t.toFixed(3), end: +(t + 0.25).toFixed(3) };
    t += 0.32;
    return r;
  });
};

export async function fontSelfTest({ ffmpeg, dir, edl = null }) {
  mkdirSync(dir, { recursive: true });
  const report = { fontsDir: bundledFontsDir(), files: fontFiles(), ok: true };
  if (edl?.overlays?.some((o) => o.props?.engine === 'kimo-captions')) {
    const ass = join(dir, 'edit-text-pass.ass');
    const [a, b = 1] = String(edl.canvas.fps).split('/').map(Number);
    const fps = a / b || 30;
    writeFileSync(ass, finalScript(edl, edl.overlays, 0, Math.ceil((Math.max(...edl.overlays.map((o) => o.at + o.dur)) + 0.5) * fps)));
    const r = await checkFonts({ ffmpeg, ass, size: `${Math.round(edl.canvas.w / 4) * 2}x${Math.round(edl.canvas.h / 4) * 2}`, duration: Math.max(...edl.overlays.map((o) => o.at + o.dur)) + 0.5, fps: 6 });
    report.edit = { ok: r.ok, selected: [...new Set(r.selected.map((s) => s.postscript))], foreign: r.foreign, missing: r.missing, log: r.log };
    report.ok &&= r.ok;
  }
  const canvas = { w: 1080, h: 1920, fps: 30 };
  const doc = new AssDocument({ w: canvas.w, h: canvas.h });
  const all = { canvas, overlays: [] };
  let t = 0;
  for (const s of captionStyles().values()) {
    const built = captionOverlays([...sample('Three million views honestly', t + 0.1), ...sample('यह सच है', t + 1.5)], { style: s.id, canvas, fps: 30, faceAt: () => null });
    built.overlays.forEach((o, i) => all.overlays.push({ ...o, id: `${s.id}-${i}` }));
    t += 2.6;
  }
  drawCaptions(doc, all, 30);
  const ass = join(dir, 'all-styles.ass');
  writeFileSync(ass, doc.toString());
  const r = await checkFonts({ ffmpeg, ass, size: '270x480', duration: t, fps: 8 });
  report.styles = { ok: r.ok, selected: [...new Set(r.selected.map((s) => s.postscript))], foreign: r.foreign, missing: r.missing, log: r.log };
  report.ok &&= r.ok;
  return report;
}
