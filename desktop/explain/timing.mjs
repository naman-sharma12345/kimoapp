// Phase 7.4 timing: when an explainer visual and each of its items appear,
// on the frame grid of the output timeline. Browser-safe, no I/O.
//
//   * an item enters LEAD_FRAMES (2) frames before its word onset (reads as
//     in sync); its entry frame is round(onset * fps) - 2, and the family
//     draws it on that exact frame (families/common.mjs entryFrames);
//   * items closer than STAGGER_FRAMES are pushed apart to a 3-frame stagger;
//   * the visual leaves 0.3-0.6 s after its last word or at the end of that
//     sentence, whichever is later (capped), and never after the next beat
//     starts; every item stays at least MIN_ITEM_S on screen;
//   * the camera "make room" move starts CAMERA_LEAD_FRAMES (6) before the
//     visual and eases back after it.
export const LEAD_FRAMES = 2;
export const STAGGER_FRAMES = 3;
export const MIN_ITEM_S = 0.8;
export const TAIL_S = 0.45;
export const CAMERA_LEAD_FRAMES = 6;
export const CAMERA_EASE_FRAMES = 10;

const r4 = (n) => +Number(n).toFixed(4);
export const toFrame = (t, fps) => Math.round(t * fps + 1e-9);
/** Entry frame of an item spoken at onset (seconds). */
export const entryFrame = (onset, fps) => Math.max(0, toFrame(onset, fps) - LEAD_FRAMES);

/**
 * Times for one beat. beat: {start_word_idx, end_word_idx, say_word_idx,
 * items: [{say_word_idx}]}, words: output-timeline words [{start, end}].
 * opts: {fps, total, nextAt (next beat's start, s), sentenceEnd (s), lead (s)}.
 * Returns {at, dur, startFrame, endFrame, items: [t relative to at], entries
 * (absolute frames), say (absolute s of the key word)}.
 */
export function beatTiming(beat, words, { fps, total = Infinity, nextAt = Infinity, sentenceEnd = null, lead = 0 } = {}) {
  const n = words.length;
  const idx = (i, d) => (Number.isInteger(i) && i >= 0 && i < n ? i : d);
  const s = idx(beat.start_word_idx, 0);
  const say = idx(beat.say_word_idx, s);
  const e = Math.max(say, idx(beat.end_word_idx, say));
  const itemIdx = (beat.items ?? []).map((it) => idx(it.say_word_idx, null));
  const raw = itemIdx.length ? itemIdx.map((k, i) => entryFrame(words[k ?? (i === 0 ? say : itemIdx[i - 1] ?? say)].start, fps)) : [entryFrame(words[say].start, fps)];
  // 3-frame stagger when words are too close to read apart
  const entries = [];
  for (const f of raw) entries.push(entries.length ? Math.max(f, entries.at(-1) + STAGGER_FRAMES) : f);
  // lead: seconds the visual needs before its first item (the stat count-up lands on its word)
  const startFrame = Math.max(0, Math.min(entryFrame(words[s].start, fps), entries[0] - Math.round(lead * fps)));
  const lastWordEnd = Math.max(words[e].end, words[say].end);
  let leave = lastWordEnd + TAIL_S;
  if (sentenceEnd != null && sentenceEnd > leave) leave = Math.min(sentenceEnd + 0.3, lastWordEnd + 2.5);
  leave = Math.max(leave, entries.at(-1) / fps + MIN_ITEM_S);
  leave = Math.min(leave, nextAt - 1 / fps, total);
  const endFrame = Math.max(startFrame + 2, toFrame(leave, fps));
  const at = startFrame / fps;
  return {
    at: r4(at),
    dur: r4((endFrame - startFrame) / fps),
    startFrame,
    endFrame,
    entries,
    items: entries.map((f) => r4((f - startFrame) / fps)),
    say: words[say].start,
  };
}

/** Item times of a beat relative to its own start, from absolute onsets (manual beats, tests). */
export function relativeItemTimes(onsets, at, fps) {
  const a = toFrame(at, fps);
  const out = [];
  for (const o of onsets) {
    const f = Math.max(a, entryFrame(o, fps));
    out.push(out.length ? Math.max(f - a, Math.round(out.at(-1) * fps) + STAGGER_FRAMES) / fps : (f - a) / fps);
  }
  return out.map(r4);
}

/** First frame (index from the visual's start) on which an item at itemT is drawn. */
export const firstVisibleFrame = (itemT, fps) => Math.ceil(itemT * fps - 1e-6);

/** Window of the camera "make room" move for a beat: starts 6 frames early, eases back after. */
export function makeRoomWindow(timing, fps) {
  return { from: Math.max(0, (timing.startFrame - CAMERA_LEAD_FRAMES) / fps), in: CAMERA_EASE_FRAMES / fps, to: timing.endFrame / fps, out: CAMERA_EASE_FRAMES / fps };
}
