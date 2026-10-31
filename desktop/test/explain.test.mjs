// Phase 7 explainers: cue detection (en + hi/Hinglish), beat validation,
// deterministic family renders at four aspects, sync to the spoken word,
// layout/collision, the visual director (mocked AI, cache), asset sources
// (mocked network) and the EDL wiring.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { reveal, entryFrames } from '../explain/families/common.mjs';

// eslint-disable-next-line no-unused-vars
const W = (text, step = 0.4, t0 = 0) => text.split(' ').map((w, i) => ({ w, start: +(t0 + i * step).toFixed(3), end: +(t0 + i * step + step * 0.85).toFixed(3) }));

test('sync: an item is visible on its entry frame, not one frame later', () => {
  const fps = 30;
  assert.ok(reveal(1, 1, fps) > 0, 'visible on the entry frame');
  assert.equal(reveal(1 - 1 / fps, 1, fps), 0, 'hidden on the frame before');
  assert.equal(entryFrames(1 + 6 / fps, 1, fps), 7);
  assert.equal(reveal(1 + 6 / fps, 1, fps), 1, 'fully in after 7 frames');
});
