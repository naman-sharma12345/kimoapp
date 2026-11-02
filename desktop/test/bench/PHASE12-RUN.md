# Phase 12 durable run state

User requested Phase 12 and a push on 2 November 2026. Scope includes v0.4.0
release from the supplied brief. Implement and verify before publishing. No paid
AI/SAM calls; never change the fully reserved historical USD 5.49 ledger. Replay
misses fail. Full media and installer work runs only on standard GitHub runners,
not this user's PC. Local tests use tiny synthetic media. Do not edit the engine
repository or change web behaviour. Fetch/rebase before every normal push.

Starting main: dd38f427e7a903ab58bfceddb3443b6500d322e1 (Phase 11).
Runtime implementation is committed in 71800db: bounded critical gates/retry, true preview
render until export, software master, input normalization, process-tree stop,
checkpoint resume (preserves edit call allowance), partial cache recovery, cache
size/clean UI, bounded analysis pool. New release-quality tests and expanded tiny
Studio test cover these, including encoded AAC peak measurement/correction, resumed
budget preservation and a genuine reduced preview. Latest targeted run: 15 pass,
one hosted-only robustness test skipped locally. Earlier full desktop run: 198
pass, one hosted-only skip. Root lint/typecheck/311 tests/build pass; renderer
build and four Phase 12 screenshots pass and were visually reviewed.

Qualification/version/workflows are committed in ed554c3e5ecd6d9ba95d66ab5b28350eb1a7c65d.
Main pushed normally and SHA verified. v0.4.0 is a candidate, NOT published yet.
Hosted runs dispatched once (no paid calls):

- Windows installer/unit/schema/renderer/installed replay smoke, release=false: 41427773769.
- All nine template cases on six frozen raw-v2 IDs, initial baseline_mode=true: 41427780123.
- Four-core, no-GPU, cold Whisper 60-second talking-head performance: 41427786326.
- Automatic desktop unit matrix: 41427727850; web checks: 41427727688.

First-run results: Windows 41427773769 failed because some tests needed FFmpeg
on PATH and the rotation fixture used an obsolete metadata-tag command. Both
fixed. Full 41427780123 had shorts-clean / shorts-punchy failures from Windows
ENAMETOOLONG in mapped camera geometry. Two completed passing summaries (TH-1
talking/documentary) preserved outside OneDrive under LOCALAPPDATA/kimo/phase12/
initial-baseline, artifact IDs 13133832254 / 13133892804. The run was cancelled
after preserving those, to replace the known-bad renderer build.

Performance 41427786326 completed but FAILED budgets: transcript44.024s,
compose806.454s,total1009.450s on four EPYC virtual cores. JSON-only extraction
from artifact13133472651 is preserved in baselines/phase12-performance-before.
New exact contiguous-frame FFmpeg path avoids the JS pixel pipe, CI filters can
use the explicit thread budget, and geometry is in files. Auto/B/strict decoded
frame-ID checks all pass across seven rates (21 combinations), including trims,
2x/.5x and camera keys. Colour/resource checks13/13 pass, with zero A/B mean RGB
difference. New qualifying runs still need dispatch after pushing these fixes.

Replacement qualification on 43c8ae04fcf73ecc9505a4e7ca2e61f04d9b41e8:
- Windows release=false: 41440293194 (job125260171137).
- Initial nine-case baseline: 41440298549.
- Four-core performance: 41440304538 (job125260209325).
Dispatched once, after confirming the original full run was completed/cancelled.
Do not dispatch duplicates; collect these results next.

Do not duplicate active replacement runs. Poll actual jobs/logs and fix real failures within
scope. CI saved-plan replay uses deterministic structured fixtures, NOT recorded
provider responses; this is explicit in metrics and must remain explicit in docs.
No model requests occur and any fetch in that replay is rejected. Static centred
camera in the two short CI fixtures isolates natural source-frame selection;
separate barcode/camera tests cover animated cameras. Full golden template cases
retain their actual camera; ambiguous/unsupported measurements stay unavailable.
Never lower coverage or claim missing pixel metrics passed.

Remaining: collect hosted robustness matrix, strict replay smoke/report artifacts,
commit genuinely measured initial release-baseline.json, then run normal full
replay with the >3 point regression gate; collect four-core performance run,
docs/GIF/credited before-after/FINAL, final checks, publish only after qualification
and verify remote installer/blockmap/latest.yml hashes. Version+lock already 0.4.0.
Use honest
unknowns; do not relabel the old Phase 2 identical-EDL comparison as v0.4.0 AI
editorial improvement. Existing prepared raw bytes are in run 41099499282 (six
raw-v2-prepared-* artifacts), still available as checked. Latest published release
is v0.3.2. CLI helper outside the repo at LOCALAPPDATA/kimo/bench/control-gh.mjs
uses saved Git credentials without printing them and supports workflow dispatch.
GitHub connector has no dispatch/publish capability, so CLI is needed for those.

User reported AMD driver errors from testing. ALL further media/browser/GPU
tests, including tiny fixtures, must run on hosted runners. No FFmpeg/Whisper
processes remained locally when checked. Do not repeat local media tests.
Set KIMO_HW_DECODE=off for hosted no-GPU qualification; runtime also supports
that explicit CPU-only switch. No driver settings/restarts/registry changes.

Windows replacement41440293194 passed unit/robustness/UI/build/install/legacy
smoke but creator SAM gate failed:66.2, frame/jitter unavailable. Its supposedly
fixed camera still retained independent follow/drift. Fix removes those and
relayouts captions at bottom; this is fixture-only and must remain disclosed.
Preserved JSON/JPEG/proof from qualification artifact13139072594 in
LOCALAPPDATA/kimo/phase12/windows2 (only0.52MB downloaded, no installer).

Opaque intermediates are now x264 ultrafast CRF0 4:4:4 (lossless samples), alpha
segments remain FFV1. Tiny regression batch completed before the AMD report:
37/37pass, zero skips; frame IDs at seven rates, alpha gaps, exact A/B pixels,
colour mean A/B difference0, measured camera residual0.2504px, actual preview
and encoded-picture-preserving remix. Further qualification is hosted-only.

Candidate002deea28db7fe378c41a21125c225a688471674 (lossless caches, fixed CI
camera, explicit no-GPU decode) Windows release=false41442099649; initial full
baseline41442412531. Previous full41440298549 confirmed completed/cancelled;
its rendered review artifacts13140167572/13140662153 remain preserved remotely.
Do not repeat local tests. Performance41440304538 (old FFV1) reached measurement;
collect it, then dispatch exactly one performance replacement on the new code.

Performance41440304538 completed FAIL (four-core FFV1): transcript43.846s,
compose636.738s,total840.243s. Artifact13140927705 extracted JSON-only to
LOCALAPPDATA/kimo/phase12/performance-threaded. Replacement41442585685 runs
lossless opaque caches on002deea; do not duplicate. Plan/critic=0 here denotes
the explicitly offline deterministic fixture, not measured paid AI latency.

Crash checkpoints expanded to started/transcript/plan/camera before compile,
preserving the edit ID and allowance even if a crash predates a compiled EDL.
New hosted regression seeds a completed plan/transcript with exhausted allowance
and verifies both are reused. No new local media execution. This and published
asset-download verification still need pushing/hosted checks.

User explicitly approved publishing after remaining correctness checks pass WITH
the measured performance gap documented (2 November). Do not claim that gate
passed. Latest lossless run41442585685 FAIL: transcript32.390s, compose397.055s
(old counter excluded final encode), total532.819s =8.9minutes. Artifact13141595602
JSON preserved in LOCALAPPDATA/kimo/phase12/performance-lossless. New counter
also includes creator_delivery (x264 master); report that correction honestly.

All9 full template cases +report41442412531 SUCCESS on002deea. Initial measured
baseline from artifact13144865692 is now release-baseline.json, with extraction
proof in baselines/phase12-initial. Preserve these actual scores even if low.
Need normal threshold run; an analyze_run input now remeasures saved exact outputs
without rerendering. New v6 references reproduce the recorded colour LUT by key
and SHA256, retaining the same95%/fit thresholds. Independent follow/drift is
explicitly unsupported in physical full-golden measurements. Short fixed fixture
has neither, allowing measurement. Unit grade test must still catch injected
repeats/skips. Windows41442099649 failed73.7 because nonlinear grade invalidated
ungraded registration; repeats0 at100%coverage. Its artifact13141188418 smalls
preserved in LOCALAPPDATA/kimo/phase12/windows3. Never relax confidence for green.

Latest normal regression41463788275 SUCCESS onca1a762: nine templates all
scores identical to initial calibration, all9 final-video SHA256 hashes match.
Measured v6 baseline now committed-candidate release-baseline.json; v5 original
retained in baselines/phase12-initial. Report artifact13151361431, proof under
baselines/phase12-regression. Three new review links updated in FINAL generator.

Windows41463186835 unit/robustness/renderer/build/install passed; SAM73.7 still
failed jitter coverage99/106=93.396%, despite grade-aware mean MAD0.612 (down
from5.103) and mean fit RMSE0.713. Its hidden captions were still masking source
pixels. New fix skips non-rendered overlays in measurement events, retaining95%
threshold. Artifact13150642846 small evidence preserved LOCALAPPDATA/kimo/phase12/
windows4. Need strict installed smoke on the final source; do not publish on red.

User's AMD report also prompted CPU-default decode and removal of GPU probing
from startup/status. Settings copy now says GPU checked only for small copy.
Only explicit small-copy action detects hardware encoders. Hosted qualification
sets hardware decode off. No local media/browser/build commands after that report.
Windows workflow now uploads small kimo-renderer-build artifact for committing
built assets without running Vite on the user's PC. Publication requires successful
full_bench_run41463788275 and validates downloaded published assets on the runner.

Ready candidate docs/evidence: six actual first-second/contact sheets inspected,
10-line critiques each in PHASE12-REVIEW.md, FINAL/RESULTS/release notes, pickerGIF
and credited raw/creator first-second sheets. CPU/codec and zero paid-call limits
remain explicit. User accepted the failed performance budget only, not false
correctness results. Ledger Git blob unchanged f33b9339c1459b02a4d3633b6dad989ffdf6d8db.