import {
  KimoClient,
  type AiCredentials,
  type SessionSnapshot,
} from '@kimo/client';
import { renderSamples, sampleTimes } from '@kimo/compositor';

export const MAX_CHECK_PASSES = 3;
const settle = () => new Promise((resolve) => setTimeout(resolve, 900));

/**
 * The render check loop: render frames of the current cut in this tab, let
 * the AI check them for faults and fix what it finds live, then render and
 * check again, until a check comes back clean or after three passes.
 */
export async function checkCut(options: {
  sessionId: string;
  note: string;
  snapshot: () => SessionSnapshot | null;
  ai: AiCredentials | null;
  say: (line: string) => void;
}) {
  for (let pass = 1; pass <= MAX_CHECK_PASSES; pass++) {
    await settle();
    const snap = options.snapshot();
    if (!snap?.project.duration) return;
    const times = sampleTimes(snap.project);
    options.say(
      `rendering ${times.length} frames to check the cut · pass ${pass} of ${MAX_CHECK_PASSES}`,
    );
    const frames = await renderSamples(snap.project, snap.assets, times);
    if (!frames.length) {
      options.say(
        'could not render frames to check; the cut is ready to review',
      );
      return;
    }
    options.say(
      `rendered ${frames.length} of ${times.length} frames · checking them`,
    );
    const result = await new KimoClient().review(
      options.sessionId,
      { pass, note: options.note.slice(0, 2000), frames },
      options.ai,
    );
    if (result.clean || !result.applied) return;
  }
  options.say(
    `stopped after ${MAX_CHECK_PASSES} checks; the cut is ready to review`,
  );
}
