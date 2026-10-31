// Read small collected evidence only; this command never decodes or renders footage.
import { join, resolve } from 'node:path';
import { existsSync } from 'node:fs';
import { ROOT, readJson, writeJson, hashFile } from './io.mjs';

const input = process.argv[2];
const output = process.argv[3];
if (!input || !output)
  throw new Error('Usage: node raw-summary.mjs EVIDENCE_ROOT OUTPUT_JSON');
const frozen = await readJson(
  join(ROOT, 'clips/raw-v2/prepared-manifest.json'),
);
const rows = [];
const currentMetrics = (dir, target) =>
  readJson(
    join(
      dir,
      existsSync(join(dir, `${target}-metrics-v4.json`))
        ? `${target}-metrics-v4.json`
        : `${target}-metrics.json`,
    ),
  );
for (const clip of frozen.cases)
  for (const aspect of ['9x16', '16x9']) {
    const dir = join(resolve(input), `${clip.id}-evidence`, aspect);
    const row = {
      clip: clip.id,
      aspect,
      scope:
        'Version-4 identical-project offline renderer comparison; not an AI editorial replay',
    };
    try {
      const run = await readJson(join(dir, 'run.json'));
      const expected = clip.segments.map((s) => s.sha256);
      if (clip.musicSha256) expected.push(clip.musicSha256);
      if (
        run.dataset !== 'raw-v2' ||
        JSON.stringify(run.sourceHashes) !== JSON.stringify(expected)
      )
        throw new Error('Run does not use the frozen prepared bytes');
      if (
        run.networkAttempts !== 0 ||
        run.reservedUsdDelta !== 0 ||
        !run.composed
      )
        throw new Error('Offline/compositor invariant failed');
      row.commit = run.commit;
      row.outputSha256 = run.finalHash;
      const after = await currentMetrics(dir, 'compose');
      if (after.version !== 4)
        throw new Error(
          'Current camera aggregation measurements require version 4 on both sides',
        );
      const metrics = (m) => ({
        score: m.creator.score,
        repeats: m.values.repeated_frames,
        skips: m.values.skipped_frames,
        frameCoverage: m.values.frame_match_coverage,
        jitter: m.values.jitter_px,
        cameraCoverage: m.values.camera_registration_coverage,
        wholePictureMotion: m.values.content_motion_jitter_px,
        delivery: m.values.delivery_ok,
        frameGate: ['repeated_frames', 'skipped_frames'].every(
          (name) => m.checks.find((c) => c.name === name)?.status === 'pass',
        ),
        jitterGate:
          m.checks.find((c) => c.name === 'jitter_px')?.status === 'pass',
      });
      row.after = metrics(after);
      try {
        const native = await readJson(join(dir, 'legacy-run.json'));
        if (
          !native.sameProject ||
          (await hashFile(join(dir, 'project.kimo.json'))) !==
            native.projectHash
        )
          throw new Error('Native baseline project hash mismatch');
        const before = await currentMetrics(dir, 'legacy');
        if (before.version !== 4)
          throw new Error('Native measurement version mismatch');
        row.before = metrics(before);
        row.nativeSha256 = native.finalHash;
        row.scoreDelta = row.after.score - row.before.score;
      } catch (e) {
        row.baselineUnavailable = e.message;
      }
    } catch (e) {
      row.unavailable = e.message;
    }
    rows.push(row);
  }
await writeJson(resolve(output), {
  dataset: 'raw-v2',
  preparedRun: frozen.run,
  rows,
  limitations:
    'Recorded hashes are artifact attestations; this small-evidence summary does not itself decode or verify full video bytes. Missing data never counts as a pass. Visual/audio review remains separate.',
});
console.log(
  JSON.stringify(
    rows.map((r) => ({
      clip: r.clip,
      aspect: r.aspect,
      before: r.before?.score ?? null,
      after: r.after?.score ?? null,
      repeats: r.after?.repeats ?? null,
      coverage: r.after?.frameCoverage ?? null,
      jitter: r.after?.jitter ?? null,
      unavailable: r.unavailable || r.baselineUnavailable || null,
    })),
    null,
    2,
  ),
);
