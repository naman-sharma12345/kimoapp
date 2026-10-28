import { test } from 'vitest';
import assert from 'node:assert/strict';
import {
  computePlayheadState,
  REDUCED_MOTION_PLAYHEAD_PROGRESS,
  stepOfflineStatus,
  formatErrorDigest,
} from './system-state-logic';
import type { OfflineStatusState } from './system-state-logic';

test('computePlayheadState parks playhead in the gap when reducedMotion is true', () => {
  const state = computePlayheadState(450, true);
  assert.equal(state.progress, REDUCED_MOTION_PLAYHEAD_PROGRESS);
  assert.equal(state.isInGap, true);
  assert.equal(state.isOverClip, false);
  assert.equal(state.noMediaOpacity, 1);
});

test('computePlayheadState sweeps linearly over 3000ms and pauses for 600ms', () => {
  const start = computePlayheadState(0, false);
  assert.equal(start.progress, 0);
  assert.equal(start.isOverClip, true);
  assert.equal(start.isInGap, false);

  const midGap = computePlayheadState(1800, false); // 1800 / 3000 = 0.60 (in gap 0.47..0.72)
  assert.equal(midGap.isInGap, true);
  assert.equal(midGap.isOverClip, false);

  // Check 2-frame flicker at 60ms step inside gap:
  // gap starts at 0.47 * 3000 = 1410ms.
  // step 0: 1410..1469ms -> opacity 1
  // step 1: 1470..1529ms -> opacity 0.4
  // step 2: 1530..1589ms -> opacity 1
  const step0 = computePlayheadState(1420, false);
  const step1 = computePlayheadState(1480, false);
  const step2 = computePlayheadState(1540, false);
  assert.equal(step0.noMediaOpacity, 1);
  assert.equal(step1.noMediaOpacity, 0.4);
  assert.equal(step2.noMediaOpacity, 1);

  const pauseState = computePlayheadState(3300, false);
  assert.equal(pauseState.progress, 1);
  assert.equal(pauseState.isOverClip, true);
});

test('stepOfflineStatus counts down from 4s to reconnecting and loops cleanly', () => {
  let state: OfflineStatusState = { phase: 'countdown', secondsRemaining: 4 };
  state = stepOfflineStatus(state);
  assert.deepEqual(state, { phase: 'countdown', secondsRemaining: 3 });
  state = stepOfflineStatus(state);
  assert.deepEqual(state, { phase: 'countdown', secondsRemaining: 2 });
  state = stepOfflineStatus(state);
  assert.deepEqual(state, { phase: 'countdown', secondsRemaining: 1 });
  state = stepOfflineStatus(state);
  assert.deepEqual(state, { phase: 'reconnecting', secondsRemaining: 0 });
  state = stepOfflineStatus(state);
  assert.deepEqual(state, { phase: 'countdown', secondsRemaining: 4 });
});

test('formatErrorDigest formats digest and message cleanly', () => {
  const formatted = formatErrorDigest({
    message: 'frame buffer allocation failed at 00:01:14:08',
    digest: 'kimo_500_8841a9',
  });
  assert.equal(
    formatted,
    'digest: kimo_500_8841a9\nmessage: frame buffer allocation failed at 00:01:14:08',
  );
});
