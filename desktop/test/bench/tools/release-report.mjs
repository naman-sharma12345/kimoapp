// JSON-only report assembly. Never decodes media, invokes a model or changes baselines.
import { readFile, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
const root = new URL('../', import.meta.url),
  json = async (path) => JSON.parse(await readFile(path, 'utf8')),
  baseline = await json(new URL('release-baseline.json', root)),
  ids = ['TH-1', 'TH-2', 'TUT-1', 'VLOG-1', 'POD-1', 'MUSIC-1'],
  best = ids.map(
    (id) =>
      baseline.rows
        .filter((r) => r.clip === id)
        .sort((a, b) => b.score - a.score)[0],
  );
if (best.some((r) => !r) || baseline.rows.length !== 9)
  throw Error('Incomplete measured baseline');
const n = (value, digits = 2) =>
    Number.isFinite(value) ? value.toFixed(digits) : 'unavailable',
  pct = (value) =>
    Number.isFinite(value) ? (value * 100).toFixed(2) + '%' : 'unavailable',
  repeat = (m) =>
    m.frame_match_coverage >= 0.95 ? n(m.repeated_frames, 0) : 'unverified',
  jitter = (m) =>
    m.camera_registration_coverage >= 0.95 ? n(m.jitter_px, 4) : 'unverified',
  safe = (value) =>
    value === true ? 'inside' : value === false ? 'outside' : 'unavailable';
let scores =
    '| Clip | Best tested template | Legacy reference | v0.4.0 fixture |\n|---|---|---:|---:|\n',
  critical =
    '| Clip | First speech s | Dead air | Repeats | Frame coverage | Jitter px | True peak dBTP | Caption safe | Current gates |\n|---|---|---|---|---|---|---|---|---|\n';
for (const row of best) {
  const aspect = row.metrics.aspect.replace(':', 'x'),
    native = new URL(
      `baselines/phase12-native-reference/${row.clip}/legacy-metrics-v4.json`,
      root,
    ),
    old =
      aspect === '16x9' && existsSync(native)
        ? native
        : new URL(
            `baselines/raw-v2-after/${row.clip}/${aspect}/legacy-metrics-v4.json`,
            root,
          ),
    before = await json(old),
    b = before.values,
    m = row.metrics,
    voice = m.first_speech_s != null,
    pair = (a, z) => `${a} → ${z}`;
  scores += `| ${row.clip} | ${row.template} | ${before.creator.score} | ${row.score} |\n`;
  critical += `| ${row.clip} | ${voice ? pair(n(b.first_speech_s), n(m.first_speech_s)) : 'N/A: no speech'} | ${voice ? pair(pct(b.dead_air_ratio), pct(m.dead_air_ratio)) : 'N/A: no speech'} | ${pair(repeat(b), repeat(m))} | ${pair(pct(b.frame_match_coverage), pct(m.frame_match_coverage))} | ${pair(jitter(b), jitter(m))} | ${pair(n(b.true_peak), n(m.true_peak))} | ${voice ? pair(safe(b.caption_safe), safe(m.caption_safe)) : 'N/A: no captions'} | ${row.gates.red ? 'red' : row.gates.unverified ? 'unverified' : 'green'} |\n`;
}
let text = `# v0.4.0 creator qualification

Release qualification on standard GitHub-hosted Windows runners, 2 November 2026.
The user explicitly accepted publication with the measured performance shortfall;
the four-minute budget is **not met**. No paid AI/SAM calls were made. The fully
reserved historical USD 5.49 ledger is unchanged.

## Every golden clip, best tested template

“Best” means highest measured score among the tested cases for that clip. All nine
templates were tested across six IDs, not all 54 clip/template combinations.
The legacy reference is the retained native-renderer benchmark for the v0.3.2
rendering path, not a newly installed v0.3.2 run. Its saved plan and measurement v4
differ from the new deterministic creator plan and v5/v6 measurement. These are
descriptive before/after numbers, not an isolated causal or provider-adherence
comparison. VLOG regresses against that reference; POD does not improve.

${scores}
Critical metrics below show legacy → creator. Unverified frame identity/jitter is
never zero. Natural source motion, static frames, grading and animated/follow
mappings limit physical measurement. Synthetic frame-ID, transform, alpha and
colour tests cover the compositor separately. Speech-free MUSIC metrics are N/A.

${critical}
## Actual review artifacts

These contain final.mp4, metrics.json, review.html, saved EDL and source credits.
They are selected evidence, not claims of professional editorial quality:

- [TH-1 clean shorts](https://github.com/naman-sharma12345/kimoapp/actions/runs/41463788275/artifacts/13151165057)
- [TH-2 punchy shorts](https://github.com/naman-sharma12345/kimoapp/actions/runs/41463788275/artifacts/13149404199)
- [TUT-1 explainer](https://github.com/naman-sharma12345/kimoapp/actions/runs/41463788275/artifacts/13151141209)

The six actual contact sheets and first-second sheets were inspected; retained
small evidence and CRC/SHA provenance are in baselines/phase12-reviews. See
[visual critiques](PHASE12-REVIEW.md). GitHub artifact retention is finite; the
committed measurements and JPEG evidence remain after those downloads expire.

## Performance exception

The 60.026633-second, 1920×1080 talking-head source was exported at 1080×1920
using x264 medium, four virtual CPU cores and no GPU. Latest total: **532.819 s
(8.88 min)** versus the 240 s budget. Whisper: 32.390 s, opaque base/overlay
composites:397.055 s, final x264 encode:82.918 s. Correct composition-through-
delivery total is **479.973 s** versus 90 s; the earlier counter omitted delivery.
The corrected counter now includes it. Plan/AI critic:0 s denotes the deterministic
offline fixture, not measured model latency or a live critic-loop performance pass.

Earlier totals were 1009.450 s and 840.243 s. These are real hosted measurements,
but the latest VM used EPYC 9V74 while the earlier runs used EPYC 7763; they do not
establish a controlled speedup on one physical laptop. Current bottlenecks remain
full-resolution colour/float geometry, intermediate passes and final CPU encode.
The performance workflow deliberately remains red when this budget is exceeded.

## Limits and next work

Saved deterministic plans replay real prepared media through the installed runtime;
they are explicitly not captured provider responses. No paid fallback exists.
This verifies offline integration, not that a model reliably chooses a strong hook,
accurate wording or the best b-roll. Natural golden critical gates remain unverified
where physical source matching cannot establish them; the short fixed-camera CI
fixtures and independent barcode tests have narrower, explicit scopes.

The sampled outputs still show captions over foreheads, duplicate hook/caption
copy, weak mid-question openings, imperfect podcast speaker framing and a largely
static tutorial. Sparse contact sheets cannot establish audio taste, audiovisual
sync or full-video smoothness. No listening claim is made from these images.
One-source music footage cannot demonstrate a sophisticated montage or beat sync.

Next priorities: trustworthy face/speaker localization, semantic hook selection,
better supplied b-roll, human transcript correction, multicam sync, and fusing
lossless/overlay/delivery passes without losing editable caches. User-key stock
providers, voice-cleanup models and macOS remain future work. Interactive upgrade
over an old user profile is the [documented manual test](../UPDATER.md);
automated updater parsing/asset hashes are a separate check. The installer is unsigned.

Credits for every distributed case remain beside its media and in
[raw dataset notices](clips/raw-v2/CREDITS.md). No full source media is bundled.
`;
const releaseProof = new URL(
  'baselines/phase12-release/release-summary.json',
  root,
);
if (existsSync(releaseProof)) {
  const p = await json(releaseProof);
  text += `\n## Published release proof\n\n[v0.4.0 release](${p.published_url}) · [passing Windows qualification](${p.run_url}).\n\n`;
  text += `${p.desktop_tests} desktop tests pass, zero skips; renderer/robustness/schema, installer installation, offline captions and both installed creator edits pass. Required root lint/typecheck/311 tests/build pass in run ${p.root_checks_run}. The broader web jobs retain their pre-existing bundle-budget failure; all repository CI is not claimed green.\n\n`;
  text +=
    '| Installed case | Score | Frame coverage | Repeats | Jitter px | Critical gates |\n|---|---:|---:|---:|---:|---|\n';
  for (const c of p.installed_cases)
    text += `| ${c.case} | ${c.score} | ${pct(c.frame_coverage)} | ${c.repeats} | ${n(c.jitter, 6)} | ${c.critical_pass ? 'green' : 'fail'} |\n`;
  text += `\nThe published installer is ${p.installer_bytes} bytes. Hosted download verification proves version/name/size/SHA512 in latest.yml and compares all three published assets with built bytes. Proof is in baselines/phase12-release/published-release-verification.json. Interactive upgrade of an old user profile remains the manual check, not an automated success claim.\n\n`;
  text += `Build commit: ${p.build_commit}; tag commit: ${p.tag_commit}. Their desktop trees are identical; the intervening change is only a CI preflight workflow.\n\n`;
  text +=
    'The SAM registration correction uses unchanged video bytes: all 106 eligible fits are now valid (jitter 0.004632px), because the mask encloses the actual ASS centisecond clock. It changes measurement, not the video. Short CI cameras are explicitly fixed; these green results do not certify the natural animated golden camera mappings above.\n\n';
  text +=
    'Final 1080/1440 renderer screenshots were visually inspected. Their preload, version label and quality values are mock fixtures, not native measurements. No local media/browser/GPU test or renderer build ran after the AMD driver report.\n';
}
await writeFile(new URL('FINAL.md', root), text);
await writeFile(new URL('phase12-score-table.md', root), scores);
console.log('Wrote measured FINAL.md and release score table');
