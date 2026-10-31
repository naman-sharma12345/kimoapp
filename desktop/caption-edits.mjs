// Studio edits on kimo caption chunks (EDL caption_word_group overlays with
// props.engine 'kimo-captions'). Pure (no Node imports): edl.mjs, which the
// renderer bundles, routes caption ops here.
export const CAPTION_ENGINE = 'kimo-captions';
const isDevanagari = (s) => /\p{Script=Devanagari}/u.test(s);
const r3 = (n) => +Number(n).toFixed(3);
const rate = (fps) => {
  if (typeof fps === 'number') return fps;
  const [a, b = 1] = String(fps).split('/').map(Number);
  return a / b;
};
const q = (t, fps) => Math.round(t * fps) / fps;
export const isCaptionChunk = (o) => o?.props?.engine === CAPTION_ENGINE;

/** Word boundaries (onsets and ends, output seconds) that caption drags snap to. */
export function captionBounds(edl) {
  const set = new Set();
  for (const [, s, e] of edl.captions?.words ?? []) {
    set.add(r3(s));
    set.add(r3(e));
  }
  return [...set].sort((a, b) => a - b);
}
export const snapTo = (bounds, t, within = 0.3) => {
  let best = t;
  let d = within;
  for (const b of bounds)
    if (Math.abs(b - t) < d) {
      d = Math.abs(b - t);
      best = b;
    }
  return best;
};

/**
 * Studio edit of one caption chunk (edit_caption / move_clip / trim_clip):
 * moves and trims snap to word boundaries and never overlap the neighbours;
 * a text edit keeps the word timings when the word count matches, else
 * spreads the new words over the chunk by length. Marks the chunk edited.
 */
export function editCaptionChunk(edl, o, op) {
  const fps = rate(edl.canvas.fps);
  const frame = 1 / fps;
  const caps = edl.overlays.filter((x) => x.props?.engine === CAPTION_ENGINE).sort((a, b) => a.at - b.at);
  const i = caps.indexOf(o);
  const prevEnd = i > 0 ? caps[i - 1].at + caps[i - 1].dur : 0;
  const nextStart = i + 1 < caps.length ? caps[i + 1].at : Infinity;
  const bounds = captionBounds(edl);
  const p = o.props;
  if (op.tool === 'edit_caption') {
    const tokens = String(op.args.text ?? '').trim().split(/\s+/).filter(Boolean).slice(0, 40);
    if (!tokens.length) throw new Error('caption text cannot be empty');
    if (tokens.length === p.words.length) p.words = p.words.map((w, k) => ({ ...w, w: tokens[k], lang: isDevanagari(tokens[k]) ? 'hi' : undefined }));
    else {
      const t0 = p.words[0]?.at ?? o.at;
      const end = o.at + o.dur;
      const weights = tokens.map((t) => [...t].length + 1);
      const sum = weights.reduce((a, b) => a + b, 0);
      let t = t0;
      p.words = tokens.map((w, k) => {
        const at = q(t, fps);
        t += ((end - t0) * weights[k]) / sum;
        const snapped = k ? snapTo(bounds, at, 0.12) : at;
        return { w, at: r3(Math.max(t0, Math.min(end - frame, snapped))), lang: isDevanagari(w) ? 'hi' : undefined, ...(p.words.find((x) => x.w.toLowerCase() === w.toLowerCase() && x.accent) ? { accent: true } : {}) };
      });
      for (let k = 1; k < p.words.length; k++) if (p.words[k].at < p.words[k - 1].at) p.words[k].at = p.words[k - 1].at;
      p.words.forEach((w, k) => (w.until = k + 1 < p.words.length ? p.words[k + 1].at : r3(end)));
    }
    const per = p.lines?.length > 1 ? Math.ceil(p.words.length / 2) : p.words.length;
    p.lines = p.lines?.length > 1 && p.words.length > 1 ? [per, p.words.length - per] : [p.words.length];
    p.text = p.words.map((w) => w.w).join(' ');
  } else if (op.tool === 'move_clip') {
    const firstLead = (p.words[0]?.at ?? o.at) - o.at;
    let start = snapTo(bounds, op.args.start + firstLead) - firstLead;
    start = q(Math.max(prevEnd, Math.min(start, nextStart - o.dur)), fps);
    const d = start - o.at;
    o.at = r3(start);
    p.words = p.words.map((w) => ({ ...w, at: r3(w.at + d), until: r3(w.until + d), ...(w.start != null ? { start: r3(w.start + d), end: r3(w.end + d) } : {}) }));
    if (p.visible) p.visible = p.visible.map((v) => r3(v + d));
  } else if (op.tool === 'trim_clip') {
    let end = snapTo(bounds, o.at + op.args.duration);
    end = q(Math.max(o.at + frame, Math.min(end, nextStart)), fps);
    o.dur = r3(end - o.at);
    p.words = p.words.filter((w) => w.at < end - frame / 2);
    if (!p.words.length) throw new Error('caption trimmed to nothing; delete it instead');
    p.words.forEach((w, k) => (w.until = r3(Math.min(end, k + 1 < p.words.length ? p.words[k + 1].at : end))));
    let left = p.words.length;
    p.lines = (p.lines ?? [left]).map((n) => {
      const m = Math.min(n, left);
      left -= m;
      return m;
    }).filter((n) => n > 0);
    p.text = p.words.map((w) => w.w).join(' ');
  } else throw new Error(`Unsupported caption edit: ${op.tool}`);
  p.edited = true;
  return o;
}

