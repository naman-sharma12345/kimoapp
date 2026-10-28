import { test } from 'vitest';
import assert from 'node:assert/strict';
import {
  formatTimecode,
  getActiveCaptionWordCount,
  getAgentStepAtTime,
  getErrorCopy,
  getStageFrameAtTime,
  LOFI_WAVEFORM,
  VO_WAVEFORM,
} from './stage-logic';

test('formatTimecode formats 30fps timecodes accurately', () => {
  assert.equal(formatTimecode(0), '00:00:00:00');
  assert.equal(formatTimecode(4.4), '00:00:04:12');
  assert.equal(formatTimecode(4.8), '00:00:04:24');
  assert.equal(formatTimecode(7.2), '00:00:07:06');
});

test('seeded waveforms generate deterministic bar counts and ranges', () => {
  assert.equal(LOFI_WAVEFORM.length, 40);
  assert.equal(VO_WAVEFORM.length, 24);
  for (const h of LOFI_WAVEFORM) {
    assert.ok(h >= 25 && h <= 95);
  }
});

test('getAgentStepAtTime transitions across all self-edit phases', () => {
  assert.equal(getAgentStepAtTime(0.2, false).text, 'reading your footage');
  assert.equal(getAgentStepAtTime(0.2, false).tool, 'analyze_media');
  assert.equal(getAgentStepAtTime(1.0, false).text, 'cutting to the beat');
  assert.equal(getAgentStepAtTime(2.8, false).text, 'writing captions');
  assert.equal(getAgentStepAtTime(3.6, false).text, 'scoring with a lofi bed');
  assert.equal(getAgentStepAtTime(4.5, false).text, 'recording the voiceover');
  assert.equal(getAgentStepAtTime(5.3, false).text, 'grading the road warm');
  assert.equal(getAgentStepAtTime(6.1, false).text, 'ready. press play.');
  assert.equal(getAgentStepAtTime(6.1, false).tool, '');
  assert.equal(getAgentStepAtTime(6.1, false).statusIcon, 'check');
  assert.equal(getAgentStepAtTime(8.0, false).text, 'playing your cut');
  assert.equal(getAgentStepAtTime(8.0, false).tool, 'preview');
});

test('getStageFrameAtTime respects reducedMotion static snapshot', () => {
  const frame = getStageFrameAtTime(1.2, true);
  assert.equal(frame.playheadSec, 4.8);
  assert.equal(frame.scene, 'title');
  assert.equal(frame.agentStep.text, 'ready. press play.');
  assert.equal(frame.v1DawnVisible, true);
  assert.equal(frame.v1RoadVisible, true);
  assert.equal(frame.v1TitleVisible, true);
  assert.equal(frame.isRoadTrimmed, true);
  assert.equal(frame.fxBarVisible, true);
});

test('getStageFrameAtTime sequences clips, ripple trim, and playback scenes', () => {
  const empty = getStageFrameAtTime(0.1, false);
  assert.equal(empty.scene, 'empty');
  assert.equal(empty.v1DawnVisible, false);

  const drop = getStageFrameAtTime(1.1, false);
  assert.equal(drop.v1DawnVisible, true);
  assert.equal(drop.v1RoadVisible, true);
  assert.equal(drop.v1TitleVisible, true);
  assert.equal(drop.isRoadTrimmed, false);

  const trim = getStageFrameAtTime(2.1, false);
  assert.equal(trim.isRoadTrimmed, true);
  assert.equal(trim.showTrimBracket, true);

  const playRoadWarm = getStageFrameAtTime(6.4 + 3.8, false);
  assert.equal(playRoadWarm.scene, 'road');
  assert.equal(playRoadWarm.isWarmGraded, true);
  assert.equal(playRoadWarm.showGradeTag, true);
  assert.equal(playRoadWarm.showCaptions, true);

  const playTitle = getStageFrameAtTime(6.4 + 5.2, false);
  assert.equal(playTitle.scene, 'title');
  assert.equal(playTitle.showCaptions, false);
});

test('getActiveCaptionWordCount progresses karaoke words from 0.4s to 4.6s', () => {
  assert.equal(getActiveCaptionWordCount(0.2), 0);
  assert.equal(getActiveCaptionWordCount(0.4), 1);
  assert.equal(getActiveCaptionWordCount(2.5), 4);
  assert.equal(getActiveCaptionWordCount(4.6), 7);
});

test('getErrorCopy returns exact lowercase messages', () => {
  assert.equal(
    getErrorCopy('popup_closed').message,
    "github sign-in didn't finish. try again?",
  );
  assert.equal(
    getErrorCopy('network').message,
    "github sign-in didn't finish. try again?",
  );
  assert.equal(
    getErrorCopy('not_allowed').message,
    "this github account can't be used with kimo yet.",
  );
});
