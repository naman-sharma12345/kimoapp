// Text behind the subject: the big title sits behind the person. The picture
// comes from the existing SAM matte render (sam_text_behind, already smooth);
// this element only gives it an EDL kind, a layout box (for the restraint
// rules and caption yielding) and the source-time mapping. Nothing is drawn
// on the canvas here.
import { safeArea, unit } from '../kit.mjs';

export default {
  kind: 'text_behind',
  label: 'Text behind subject',
  defaults: { dur: 2.5 },
  external: 'sam_text_behind',
  layout(canvas, props) {
    const text = String(props.text ?? '').trim();
    if (!text) return null;
    const safe = safeArea(canvas);
    const u = unit(canvas);
    const w = Math.min(safe.x1 - safe.x0, text.length * 120 * u);
    const h = 260 * u;
    const box = { x: canvas.w / 2 - w / 2, y: canvas.h * 0.36 - h / 2, w, h };
    return { safeBox: box, box };
  },
  draw() {},
};
