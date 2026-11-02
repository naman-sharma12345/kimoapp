# v0.4.0 creator qualification

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

| Clip | Best tested template | Legacy reference | v0.4.0 fixture |
|---|---|---:|---:|
| TH-1 | shorts-clean | 63.5 | 73.6 |
| TH-2 | shorts-punchy | 78.3 | 75.9 |
| TUT-1 | explainer | 53.6 | 63.5 |
| VLOG-1 | youtube-vlog | 79.2 | 66.9 |
| POD-1 | podcast-clips | 56.6 | 56.6 |
| MUSIC-1 | music-montage | 46.8 | 55.6 |

Critical metrics below show legacy → creator. Unverified frame identity/jitter is
never zero. Natural source motion, static frames, grading and animated/follow
mappings limit physical measurement. Synthetic frame-ID, transform, alpha and
colour tests cover the compositor separately. Speech-free MUSIC metrics are N/A.

| Clip | First speech s | Dead air | Repeats | Frame coverage | Jitter px | True peak dBTP | Caption safe | Current gates |
|---|---|---|---|---|---|---|---|---|
| TH-1 | 0.03 → 0.03 | 9.41% → 0.00% | unverified → unverified | 29.44% → 0.00% | 0.0115 → unverified | -1.50 → -1.50 | outside → inside | unverified |
| TH-2 | 0.00 → 0.00 | 5.12% → 0.00% | 0 → unverified | 99.35% → 0.00% | 0.0153 → unverified | -1.30 → -1.50 | outside → inside | unverified |
| TUT-1 | 0.00 → 0.00 | 15.23% → 2.47% | unverified → unverified | 7.78% → 0.00% | 0.0037 → unverified | -1.50 → -1.40 | outside → inside | unverified |
| VLOG-1 | 0.00 → 0.00 | 0.00% → 0.00% | 0 → unverified | 98.69% → 0.00% | 0.0082 → unverified | -1.50 → -1.50 | outside → inside | unverified |
| POD-1 | 0.00 → 0.00 | 19.33% → 2.58% | unverified → unverified | 79.20% → 0.00% | 0.0092 → unverified | -1.50 → -2.30 | outside → inside | unverified |
| MUSIC-1 | N/A: no speech | N/A: no speech | 0 → unverified | 98.00% → 0.00% | 0.0107 → unverified | -1.50 → -1.50 | N/A: no captions | unverified |

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

## Published release proof

[v0.4.0 release](https://github.com/naman-sharma12345/kimoapp/releases/tag/v0.4.0) · [passing Windows qualification](https://github.com/naman-sharma12345/kimoapp/actions/runs/41472140170).

203 desktop tests pass, zero skips; renderer/robustness/schema, installer installation, offline captions and both installed creator edits pass. Required root lint/typecheck/311 tests/build pass in run 41472137369. The broader web jobs retain their pre-existing bundle-budget failure; all repository CI is not claimed green.

| Installed case | Score | Frame coverage | Repeats | Jitter px | Critical gates |
|---|---:|---:|---:|---:|---|
| SAM-PERSON-shorts-punchy | 81.2 | 100.00% | 0 | 0.004748 | green |
| TH-2-youtube-talking | 80.4 | 99.45% | 0 | 0.006525 | green |

The published installer is 369147721 bytes. Hosted download verification proves version/name/size/SHA512 in latest.yml and compares all three published assets with built bytes. Proof is in baselines/phase12-release/published-release-verification.json. Interactive upgrade of an old user profile remains the manual check, not an automated success claim.

Build commit: fe936a4673359a39a2601021b9c715a280428cb8; tag commit: 3bd644287c11418b120f4a464ef66a536e42140e. Their desktop trees are identical; the intervening change is only a CI preflight workflow.

The SAM registration correction uses unchanged video bytes: all 106 eligible fits are now valid (jitter 0.004632px), because the mask encloses the actual ASS centisecond clock. It changes measurement, not the video. Short CI cameras are explicitly fixed; these green results do not certify the natural animated golden camera mappings above.

Final 1080/1440 renderer screenshots were visually inspected. Their preload, version label and quality values are mock fixtures, not native measurements. No local media/browser/GPU test or renderer build ran after the AMD driver report.
