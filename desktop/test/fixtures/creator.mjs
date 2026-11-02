import { getTemplate } from '../../planner/templates.mjs';
import { defaultPlan } from '../../planner.mjs';
import { plannerContext, compilePlan } from '../../planner/compile.mjs';
import { buildTranscript, analyzeAudio } from '../../transcript.mjs';
export function studioFixture(path = 'C:/synthetic/studio.mkv') {
  const words = [
      'A',
      'clear',
      'idea.',
      'Then',
      'the',
      'details.',
      'A',
      'useful',
      'result.',
    ].map((w, i) => ({ w, start: 0.2 + i * 0.8, end: 0.65 + i * 0.8 })),
    samples = Float32Array.from({ length: 128000 }, (_, i) =>
      words.some((w) => i / 16000 >= w.start && i / 16000 < w.end)
        ? 0.1 * Math.sin(i * 0.1)
        : 0,
    );
  const file = {
      path,
      kind: 'video',
      width: 192,
      height: 128,
      duration: 8,
      fps: 25,
      audio: true,
    },
    transcript = buildTranscript({
      words,
      whisperLang: 'en',
      src: 'f0',
      analysis: analyzeAudio(samples),
    }),
    clips = [{ src: 'f0', file, duration: 8, kind: 'speech', transcript }],
    P = { width: 192, height: 128 },
    context = plannerContext({
      template: getTemplate('shorts-punchy'),
      files: [file],
      clips,
      P,
    }),
    plan = defaultPlan(context);
  plan.graphics = [
    { kind: 'hook_title', text: 'A clear idea', at: 0.1, dur: 1.5 },
  ];
  return compilePlan({ plan, context, files: [file], clips, P, fps: 25 }).edl;
}
