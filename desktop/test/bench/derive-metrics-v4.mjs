// JSON-only correction of saved v3 aggregate camera counts. Never decodes or renders footage.
import { basename, resolve } from 'node:path';
import { readJson, writeJson, hashFile, ROOT } from './io.mjs';
import { aggregateRegistration } from './registration.mjs';
import { assessMetrics, creatorScore } from './metrics.mjs';
import { join } from 'node:path';

const [source, output, id] = process.argv.slice(2);
if (!source || !output || !id || resolve(source) === resolve(output))
  throw new Error(
    'Usage: derive-metrics-v4.mjs SOURCE_JSON SEPARATE_OUTPUT_JSON RAW_CASE_ID',
  );
const m = await readJson(source);
if (m.version === 4) {
  await writeJson(output, m);
} else {
  if (m.version !== 3)
    throw new Error('Only original version3 counts can be corrected');
  const cases = await readJson(join(ROOT, 'clips/raw-v2/clips.json'));
  const clip = cases.clips.find((c) => c.id === id);
  if (!clip) throw new Error('Unknown raw case');
  const details = m.values.frame_match;
  const compared = details.reduce((n, d) => n + (d.compared ?? 0), 0);
  const coverage = m.values.frame_match_coverage;
  if (!(compared > 0 && coverage > 0))
    throw new Error(
      'No saved counts to establish the original global frame denominator',
    );
  const pairs = compared / coverage;
  if (Math.abs(pairs - Math.round(pairs)) > 1e-6)
    throw new Error('Saved frame denominator is not integral');
  const totalFrames = Math.round(pairs) + 1;
  for (const d of details)
    if (d.camera) {
      if (
        d.camera.eligible !== Math.max(0, d.total - 6) ||
        d.camera.measured > d.camera.eligible
      )
        throw new Error('Invalid saved per-segment registration counts');
    }
  const corrected = aggregateRegistration(details, totalFrames);
  const originalCoverage = m.values.camera_registration_coverage;
  m.values = { ...m.values, ...corrected };
  const spec = await readJson(join(ROOT, 'creator-spec.json'));
  const weights = await readJson(join(ROOT, 'score.json'));
  const flags = {
    speech: clip.speech,
    music: m.events.some((e) => e.kind === 'music' || e.music),
  };
  const jitterCheck = assessMetrics(m.values, spec, flags).find(
    (c) => c.name === 'jitter_px',
  );
  m.checks = m.checks.map((c) => (c.name === 'jitter_px' ? jitterCheck : c));
  const priorScore = m.creator.score;
  m.creator = creatorScore(m.values, weights, flags);
  m.version = 4;
  m.correction = {
    sourceFile: basename(source),
    sourceSha256: await hashFile(source),
    sourceVersion: 3,
    method:
      'Saved adjacent-pair comparison counts reconstruct total output frames (+1); reaggregate unchanged SG7 registration counts with a frame denominator. No decoding, new fits, threshold relaxation or image changes.',
    totalFrames,
    originalCoverage,
    correctedCoverage: corrected.camera_registration_coverage,
    scoreBeforeCorrection: priorScore,
  };
  m.evidence.camera +=
    ' Version4 corrects only the aggregate frame denominator from the original saved registration counts; the original version3 file is retained separately.';
  await writeJson(output, m);
}
