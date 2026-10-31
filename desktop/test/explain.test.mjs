// Phase 7 explainers: cue detection (en + hi/Hinglish), beat validation,
// deterministic family renders at four aspects, sync to the spoken word,
// layout/collision, the visual director (mocked AI, cache), asset sources
// (mocked network) and the EDL wiring.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { graphicJob, themeFor, softFrame } from '../graphics/renderer.mjs';
import { beatTiming, firstVisibleFrame, LEAD_FRAMES } from '../explain/timing.mjs';
import { reveal, entryFrames } from '../explain/families/common.mjs';

const W = (text, step = 0.4, t0 = 0) => text.split(' ').map((w, i) => ({ w, start: +(t0 + i * step).toFixed(3), end: +(t0 + i * step + step * 0.85).toFixed(3) }));

test('sync: an item is visible on its entry frame, not one frame later', () => {
  const fps = 30;
  assert.ok(reveal(1, 1, fps) > 0, 'visible on the entry frame');
  assert.equal(reveal(1 - 1 / fps, 1, fps), 0, 'hidden on the frame before');
  assert.equal(entryFrames(1 + 6 / fps, 1, fps), 7);
  assert.equal(reveal(1 + 6 / fps, 1, fps), 1, 'fully in after 7 frames');
});

test('sync: each item first shows within ±1 frame of onset − 2 frames (rendered)', () => {
  const fps = 30;
  const canvas = { w: 960, h: 540 };
  const words = W('there are three reasons first no users second too slow third ran out of money', 0.37, 0.53);
  const beat = { start_word_idx: 0, say_word_idx: 2, end_word_idx: 15, items: [{ text: 'No users', say_word_idx: 4 }, { text: 'Too slow', say_word_idx: 7 }, { text: 'Ran out of money', say_word_idx: 10 }] };
  const tm = beatTiming(beat, words, { fps, total: 20 });
  const job = graphicJob({ kind: 'ex_list', props: { mode: 'side', title: '3 reasons', items: beat.items.map((it, i) => ({ text: it.text, t: tm.items[i] })) }, canvas, fps, dur: tm.dur, theme: themeFor('auto') });
  for (const [i, it] of beat.items.entries()) {
    const target = Math.round(words[it.say_word_idx].start * fps) - LEAD_FRAMES; // absolute frame
    const f = firstVisibleFrame(tm.items[i], fps) + tm.startFrame;
    assert.ok(Math.abs(f - target) <= 1, `item ${i}: first frame ${f} vs target ${target}`);
    // the rendered pixels change exactly on that frame and not on the one before
    const local = f - tm.startFrame;
    const before = softFrame(job, local - 1);
    const at = softFrame(job, local);
    const prev = softFrame(job, local - 2);
    assert.notDeepEqual(at, before, `item ${i} drawn on its entry frame`);
    if (local - 2 >= 6) assert.deepEqual(before, prev, `nothing new on the frame before item ${i}`);
  }
});
