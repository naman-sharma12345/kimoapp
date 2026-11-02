# Creator benchmark results

## Phase 12 — release qualification, 2 November 2026

The user explicitly approved publication after correctness checks, with the
performance gap documented. The full-export budget remains FAILED; it was not
relaxed. Full media/installer work runs on standard GitHub-hosted Windows VMs.
After the AMD driver report, every local media/browser/GPU test stopped, including
tiny fixtures. Only file, JSON, image inspection and Git operations continue locally.
No paid AI/SAM requests; the fully reserved USD 5.49 historical ledger is unchanged.

| Hosted performance run | Whisper s | Opaque compose passes s | Final encode s | End-to-end s | Budget |
| --- | ---: | ---: | ---: | ---: | --- |
| 41427786326, initial FFV1 | 44.024 | 806.454 | not separately retained here | 1009.450 | fail |
| 41440304538, bounded filter threads | 43.846 | 636.738 | 137.090 | 840.243 | fail |
| 41442585685, lossless opaque x264 caches | 32.390 | 397.055 | 82.918 | 532.819 | fail |

Four virtual CPU cores, source 60.026633s at 1920×1080, full 1080×1920 delivery,
software x264 medium and no GPU. The latest VM used EPYC 9V74, earlier EPYC 7763;
this is not a controlled comparison on one physical laptop. Correct composition
through delivery is 397.055 + 82.918 = 479.973s against 90s. The counter now includes
creator_delivery; old raw metrics keep their original excluded-delivery number.
Plan/AI critic0s denotes the deterministic fixture, not measured model latency.
Actual critical/audio checks and preprocessing remain included in total time.

The initial nine-case full replay41442412531 passed and produced the committed
release-baseline.json. Scores: shorts-clean73.6, shorts-punchy75.9, talking65.9,
vlog66.9, tutorial63.3, podcast56.6, documentary64.3, explainer63.5, montage55.6.
Full-golden physical frame/jitter evidence remains unverified for unsupported
animated/follow mappings; no zero is substituted. Delivery and narrative checks
are distinct from physical identity. See FINAL.md for all six legacy→creator
comparisons, source-specific critical metrics, artifact links and honest gaps.

Measurement v6 reproduces each saved colour LUT by content key and SHA256 before
source registration, retaining the 95% confidence/coverage and fit limits. Hidden
caption overlays must not mask reference pixels. An injected nonlinear-grade
repeat/skip fixture verifies faults are still detected. Normal archived-output
remeasurement checks exact final-video SHA256 against the committed baseline and
the existing >3-point regression threshold; it does not silently rerender footage.

Local verification before the AMD report: root lint/typecheck,311 tests/build;
198 desktop passes with one hosted-only skip; renderer build and four critical/
cache screenshots. Latest completed tiny opaque-cache regression37/37 passed,
including all7rates, alpha gaps, zero A/B mean RGB difference and0.2504px observed
camera residual. Further regression, full robustness, installed creator smokes
and screenshots run on hosted Windows; record their final run below.

## Phase 11 Studio — 1 November 2026

Nine-template Home, ten-stage live feed, creator score details, seven timeline
tracks, seven inspector tabs and persistent manual/variation history are wired
through the desktop IPC. Verification follows the user's lightweight-check
instruction: no paid AI calls, full-footage benchmark, installer or release.

| Functional check        | Evidence                                                                        |
| ----------------------- | ------------------------------------------------------------------------------- |
| Desktop regressions     | 193/193 pass, zero skips, one test worker                                       |
| Actual tiny FFmpeg edit | Progressive base JPEG emitted; gain change selects remix only                   |
| Gain-only delivery      | Encoded H264 elementary stream hash unchanged; new AAC retained                 |
| IPC commands            | Local patches, both regeneration jobs, persisted undo/redo and atomic rejection |
| Source-safe edits       | Caption follows matching source despite changed IDs; missing target warns       |
| Restore pause           | Adjacent source bounds, shifted caption words and extended music bed            |
| Preview assets          | Eleven 3-second/12-fps loops, 10,764–20,024 bytes each; source hash checked     |
| Browser views           | Home, three live moments, timeline, seven tabs and score details at both sizes  |

Screenshots in `../ui-shots/phase-11-*.png` use a mock preload with the real pure
patch reducer and synthetic transcript/quality values. Their scores are not
benchmark results. Preview labels are not dialogue or endorsement; full attribution
is in `../../THIRD_PARTY_NOTICES.md` and `../../data/creator-previews.json`.
Provider/account/installer/native OS playback and sustained CPU/lag acceptance
remain unmeasured. The USD 5.49 historical reservation ledger is unchanged.
See `../../studio-README.md` for behaviour, test commands and limits.

## Phase 10 planner — 1 November 2026

Structured plans, nine templates, deterministic compilation, bounded cached
critic calls, minimal render passes and persistent plan undo are implemented.
The user's standing no-benchmark/no-heavy-local-render preference is preserved.
No new golden recording, paid AI/SAM request, installer or release was run.

| Lightweight verification               | Evidence                                                                           |
| -------------------------------------- | ---------------------------------------------------------------------------------- |
| Templates / schema / repair / fallback | All nine templates compile; one repair then deterministic fallback                 |
| Call caps / timeout / reservations     | Three total requests, two image requests; reservations persist failures            |
| Cache-only replay                      | Six golden IDs with explicitly synthetic transcript-shaped responses; misses fail  |
| Actual 1.2-second FFmpeg edit          | Plan → rendered critic frames → AAC stereo 48 kHz delivery                         |
| Smaller captions                       | Only overlay pass rerendered; base and audio reused                                |
| No music                               | Only audio rebuilt; picture reused                                                 |
| Undo                                   | Previous plan restored offline; no additional model request                        |
| Studio mock bridge                     | Nine templates, format mapping, chat patch, keyboard undo and previous-edit toggle |
| Creator benchmark acceptance           | Unverified; unavailable pixel/Delta E metrics remain null and score zero           |

Development responses are mocked; estimated reservations in the fixture are not
actual AI charges. The old USD 5.49 ledger and prepared-media/cache artifacts are
unchanged. Existing Phase 1 tool-call caches cannot be reinterpreted as new plan
responses. No real-footage before/after score improvement is asserted.

Actual existing Phase 9 stills were inspected again; four editorial notes per
case and their limits are in [REVIEW-P9.md](REVIEW-P9.md). The new synthetic
contact sheet was also inspected. Full footage, runtime proxy adherence and
creator-score gates remain outside this lightweight verification.

Synthetic evidence: [smoke.json](baselines/phase10-planner/smoke.json) and
[actual contact sheet](baselines/phase10-planner/contact.jpg). The fixture scores
57.7/100, with acceptance **false**; this is not a golden result. All eight new
planner checks pass. Root lint/typecheck, 311 web tests, web/renderer builds and
the browser bridge check pass. An existing denoiser probe failure found in the
184/185 desktop regression run was fixed; all seven audio tests and the affected
caption/planner checks then passed. No skipped tests.

Implementation details and reproduction: [planner/README.md](../../planner/README.md).

## Phase 9 colour finish — 1 November 2026

Implemented app-owned colour analysis, soft correction/WB, shot matching, seven
CC0 looks, per-clip 33³ LUTs, adaptive finish and Studio controls. Native auto_grade
is intercepted. The existing user preference against full benchmarks and heavy
local renders is preserved: only tiny fixtures and existing still tiles were used.
No paid AI/SAM call, full golden render, installer or release was run.

| Lightweight check                             | Actual result                      |
| --------------------------------------------- | ---------------------------------- |
| Colour tests                                  | 7 pass                             |
| Actual chart output clipped luma, all 7 looks | 0%                                 |
| Representative actual skin patch hues         | 123° ±8° gate passes               |
| Compositor A/B mean RGB difference            | 0                                  |
| Tiny delivery patch mean RGB drift            | 1.34 levels                        |
| Delivery primaries/transfer/matrix/range      | BT.709 / BT.709 / BT.709 / limited |
| Existing still tiles, six cases × seven looks | 0% clipped luma in all 42          |
| Full VLOG-1 clip_delta_e <4                   | Unmeasured; not a pass             |
| Full-frame/all-footage clipping <0.5%         | Unmeasured; not a pass             |

Independent CIEDE2000 pairs, identity at zero, actual FFmpeg LUT paths containing
spaces/apostrophes, skin guards, conservative mid-tones, screen preservation,
explicit primaries, cache, optional finish and the generic HDR graph are covered.
Nineteen existing EDL/transition/mask/audio/pipeline checks pass. Repository
lint/typecheck, 311 web tests on Node 24, web build and desktop renderer build pass.
The browser colour picker/keyboard slider/persistence check passes via its mock
bridge; no packaged Electron acceptance is implied.

Actual still review found and corrected over-brightening before final acceptance
of the small checks. Remaining visual caveats and source credits are retained in
[the review](baselines/phase09-color/REVIEW.md), with
[the still matrix](baselines/phase09-color/stills.webp) and
[metrics](baselines/phase09-color/still-metrics.json). These results do not establish
temporal match, recovered sensor highlights, HDR camera quality or sustained CPU
performance. Float colour correction is dithered at the existing 8-bit camera-warp
boundary, and overlays are finished afterwards. Prior benchmark history follows.

1 November 2026 (Phase 7): **explainers implemented (cue detection, visual director, families, assets, sound kit, controls, key lockdown); real-footage numbers and the EXPLAIN-1 bench are deferred**, as for Phases 3-6. No EXPLAIN-1 or golden-clip run, no beat-to-word sync, face-overlap or visual-share numbers on real footage, no Creator Score, no paid AI/SAM call. Evidence is limited to 163/163 desktop unit tests on hosted Windows + Linux (`41246970470`) and locally, the Windows Electron smoke `41246983535` (explain self-test on the offscreen Chromium window: 8 families drew, deterministic frame, entry-frame sync on a synthetic list, sound kit synthesised, beat edit round-trip) and the regenerated soft-canvas previews inspected by eye. None of these is a golden-clip result. Caveats: [EXPLAINERS.md](../../EXPLAINERS.md) and NOTES.md (Phase 7).

1 November 2026 (Phase 6): **motion-graphics kit and b-roll placement implemented; real-footage bench numbers are deferred** at Naman's instruction (don't go deep on tests or benchmarks). No VLOG-1/TUT-1 run, no b-roll share or max_static_s on real footage, no Creator Score, no paid AI/SAM call. Evidence is limited to 148/148 desktop unit tests on hosted Windows + Linux (`41234653698`), the Windows Electron smoke `41235183276` (graphics rendered by the offscreen Chromium window, deterministic, composite rendered) and a soft-canvas gallery of every element at 9:16 and 16:9 inspected by eye. None of these is a golden-clip result. Caveats are listed in [GRAPHICS.md](../../GRAPHICS.md).

31 October 2026 (Phase 5): **kimo's own caption engine implemented; real-footage caption bench numbers are deferred** at Naman's instruction ("Dont go too much into testing and benchmarks just make it better"). No TH-1 per-style 6-second renders, no side-by-side against the old engine captions, no Creator Score, no paid AI/SAM call. What was checked: caption unit tests on synthetic words (grouping, numbers with units, punctuation/pause breaks, one-frame lead, no overlaps, minimum durations, one accent per chunk, safe area, below-chin placement, mouth never covered, yielding to hook titles, ASS escaping, Windows `fontsdir` escaping through a real libass run in a directory with a quote, comma and brackets, auto-contrast and the cached-base caption re-render), and the 11 generated style previews (`desktop/data/caption-styles/previews/`, synthetic background and silhouette) looked at for clipping and wrong fonts. Hosted desktop unit CI `41224602555` passes 138/138 on Windows and Linux. Windows Electron smoke `41224602938` (Phase 02 compositor validation, golden matrix off, no installer/release) passes on main `b13fc22`: the captions-only edit of the TTS clip produced 6 kimo caption chunks from the transcript words (no engine captions, no second whisper run), and libass selected only bundled faces for that edit and for all 11 styles with Latin and Devanagari words (no fallback, no missing glyphs). The smoke's caption stats (min word 0.333 s, safe, 0 face overlap) come from one 4-second synthetic clip with no measured face and are not golden-clip results.

31 October 2026 (Phase 4): **camera director implemented; real-footage benchmark numbers are deferred** at Naman's instruction ("Dont go too much into testing and benchmarks just make it better"). No golden-clip run, no Creator Score, no energy-grid video, no paid AI/SAM call. framing_variety, max_static_s, repeats at jump cuts, face-in-crop and jitter were checked only on synthetic EDLs and FFmpeg fixtures in unit tests (the decoded float-camera edge fixture reads 0.2504 px at a 1080-px short side under the new eased/log-zoom/soft-clamp model); none of these are golden-clip results. Hosted desktop unit CI `41217625493` passes 125/125 on Windows and Linux; Windows Electron smoke `41217708535` passes on main `884b567`.

31 October 2026 (Phase 3): **transcript cut planner implemented; real-footage benchmark numbers are deferred** at Naman's instruction ("Dont go too much into testing and benchmarks just make it better"). No golden-clip run, no Creator Score, no paid AI/SAM call. dead_air_ratio, filler_count, repeat_takes and first_speech_s were checked only on synthetic tone+silence fixtures (unit tests) and as plan-level metrics on the one TTS clip of the Windows Electron smoke `41213203235` (4.88 s → 4.34 s, 0 fillers, 0 repeat takes, first speech 0.05 s); these are not golden-clip results and say nothing about real footage. Hosted desktop unit CI `41213165101` passes 106/106 on Windows and Linux. The TH-1 joins listening pass (`joins-wav.mjs`) has not been done.

31 October 2026 (completion pass): **Phase 2 implementation is complete; real-footage benchmark numbers are deferred** at Naman's instruction ("Dont go too much into testing and benchmarks just make it better. complete phase 2 first fully."). No golden-clip, Creator Score, repeated-frame or jitter campaign was run in this pass, no paid AI/SAM call was made, and no new numbers are claimed for real footage. What changed: dip/whip/zoom transitions, rect/ellipse clip masks, translucent-frame-only opacity, MUSIC sidechain ducking under VOICE, SFX placement, VOICE/MUSIC/SFX roles, stricter EDL validation and op-bound compose progress (see desktop/COMPOSITOR.md). Light verification only: 88/88 desktop tests pass locally on synthetic fixtures (including a 16 dB duck measuring 15.9 dB and both strategies agreeing on transition/mask frames); hosted desktop unit CI `41208291033` (branch) and `41208564274` (main push) pass 88/88 on Windows and Linux, and the real Windows Electron smoke `41208574755` (Phase 02 compositor validation, golden matrix off, no installer/release, no paid calls) passes its saved-EDL, composed-picture and manual re-render assertions on main `2315c81`. The acceptance items for real-footage repeats = 0, jitter < 0.5 px and Creator Score versus baseline stay open until a benchmark run is requested.

31 October 2026: Phase 2 implementation is pushed through `9fa6f21`. All **80 desktop tests pass on hosted Windows and Linux**, and real Electron smoke `41189545211` passes without an installer/release. The six replacement raw cases are prepared once, hash-frozen and source-reviewed. [Exact prepared manifest](clips/raw-v2/prepared-manifest.json), [source review](clips/raw-v2/REVIEW.md), [full credits](clips/raw-v2/CREDITS.md) and [verified full-archive backups](clips/raw-v2/archive-backups.json) are retained.

Final current-code rerun: **41189542616**, reusing the exact prepared bytes and saved projects/native reference videos from `41101109503`. It changes no editorial/planner decisions and makes no paid calls. Measurement version 3 corrects planned EOF holds, uses affine-photometric matching with a stricter uniqueness ratio, and keeps codec delivery separate from whole-content motion. Speech words are reused only after the original output hash or exact decoded audio PCM hash is verified unchanged. Native TUT-1, VLOG-1 and POD-1 landscape references exceeded 1800 seconds and remain unavailable. Final values and visual acceptance are pending collection; this paragraph does not mark Phase 2 complete.

The existing aggregate USD 5.49 reservation remains unchanged. No full-footage rendering or analysis runs on the user’s PC. Required root lint/typecheck/300 tests/build passes; the later pre-existing landing bundle-budget failure remains separate from these checks.

30 October 2026: **Phase 2 acceptance requires a new raw dataset, as explicitly chosen by the user.** The user has no footage to supply; public sources are being checked against the original six case requirements. Existing source bytes, caches, ledgers and outputs remain legacy evidence. Remote run `41027923346` completed all six old controls in both aspects; its early smoke harness failed, and later smoke runs passed. The controls are not replays of the missing Phase 1 AI edits and cannot satisfy the new dataset requirement. No golden zero-repeat, jitter or score-improvement claim is made.

Current bounded local validation: **75/75 desktop tests pass**. Seven frame rates use independent source-index expectations, including trims, 2x/0.5x and punches. An independent decoded static-edge test measures **0.2424 px residual camera jitter**, normalized to a 1080-pixel short side, after correcting perspective's one-based input counter. This is a controlled fixture measurement, not a whole-footage result. Native background geometry, half-alpha colour and exact on/off frames are checked. The renderer build and keyboard-caption IPC browser check pass. A preserved real TH-1 project's timeline payload shrank from 207376 to 11468 JSON bytes with the same timeline projection; full authoritative EDL data stays on disk.

Hosted unit run `41086873409` also passes all 72 tests on Windows and Linux. The combined required root lint/typecheck/test/build step passes in `41086873461`; broader existing web budget/browser gates remain separate. Raw-source inspection `41086477761` downloaded and hashed three new candidates: the indoor single-camera interview and the screen capture with facecam remain provisional; the two-person interview was rejected for pre-existing multicamera cuts. See [actual candidate inspection evidence](clips/raw-v2/REVIEW.md). Corrected TH-1/TUT-1 previews, actual sheets and first-second checks completed in41089581693. All six raw-v2 preparation artifacts have now uploaded in41099499282; both-aspect comparisons remain in progress. Phase 1 source/cache artifacts were preserved in run `41086877223` before expiry; this does not reset the full USD 5.49 reservation or authorize more AI calls.

Windows and Linux unit CI passed in run `41029430331`. Windows Electron smoke `41029000946` passed at 24000/1001, saved an EDL, composed picture, and completed a manual trim re-render. Local tiny-fixture tests also cover alpha images, text/image layer order, external audio assets and output colour conversion; final verification follows subsequent edits. The required root lint/typecheck/test/build step passed in `41028998366`; its broader verify job failed the existing web bundle budget afterward.

The initial Linux fallback test found incompatible FFV1 gap headers; the corrected run above passes without weakening frame assertions. The initial Electron workflow read an in-progress report before waiting for its GUI executable; the corrected smoke passes. First-run legacy measurements must be remeasured with the latest identical delivery checks and per-output transcripts before comparing Creator Scores.

29 October 2026. **The full Phase 1 baseline is incomplete.** Two long local benchmark processes were stopped when the user reported severe PC lag. No golden score or visual critique is invented for unfinished output. The user's follow-up requests added scheduling safeguards and high-quality GPU master encoding; those changes were checked with lightweight tests, not another full render.

## Golden baseline status

Source behavior: desktop v0.3.2, commit `b0c90974257e8795c292622c4c30defef1457db1`, default style. The six cases download and verify four pinned licensed sources and prepare 13 input segments.

| Clip    | 9:16 baseline                                                                       | 16:9 baseline | Creator Score |
| ------- | ----------------------------------------------------------------------------------- | ------------- | ------------- |
| TH-1    | Interrupted during real engine export; replay reached caption/lint work before stop | Not run       | Unavailable   |
| TH-2    | Not run                                                                             | Not run       | Unavailable   |
| TUT-1   | Not run                                                                             | Not run       | Unavailable   |
| VLOG-1  | Not run                                                                             | Not run       | Unavailable   |
| POD-1   | Not run                                                                             | Not run       | Unavailable   |
| MUSIC-1 | Not run                                                                             | Not run       | Unavailable   |

Seven genuine AI build-response cache files are committed under their input-content namespace. A complete golden replay is not claimed. Unit tests verify that replay misses, corrupt entries and foreign endpoints fail without an upstream request. The interrupted legacy recorder did not flush its original in-memory cost counter, so `cache/spend.json` conservatively reserves the full USD 0.49 allowance; this is **not** a billing statement. No new paid recording was started after interruption.

## Supplemental completed smoke (before resource/GPU changes)

This is the existing five-second `desktop/test/sam-person.mp4` through the real `runEdit()` captions pipeline, not a substitute for the six golden cases. Evidence: [metrics](baselines/smoke-v0.3.2/metrics.json), [contact sheet](baselines/smoke-v0.3.2/sheet.jpg).

| Metric                            |                                                 Measured |
| --------------------------------- | -------------------------------------------------------: |
| Creator Score                     |                                               74.1 / 100 |
| Input / output duration           |                                          5.000 / 5.333 s |
| First speech                      |                                                   0.00 s |
| Internal dead-air ratio           |                                                    0.00% |
| Filler / repeat takes             |                                                    0 / 0 |
| Median shot / max static          |                                          2.667 / 5.000 s |
| Framing variety                   |                                                        1 |
| Camera jitter                     |                                            0.24 px/frame |
| Repeated / skipped source frames  |                                0 / 0 among matched pairs |
| Source-match coverage             | 93.70%; insufficient for green zero-repeat certification |
| Shortest caption lifetime         |                                                  0.589 s |
| Estimated caption safe area       |                                                     Fail |
| Estimated caption/subject overlap |                                                    0.00% |
| Loudness / true peak / LRA        |                          -14.1 LUFS / -1.8 dBTP / 1.2 LU |
| SFX per minute                    |                                                        0 |
| Full-range clipped luma           |                                                    7.29% |
| Delivery gate                     |                                                     Fail |

Music ducking and adjacent-clip colour matching were unavailable. The page played and sought through timeline blocks directly from disk, made zero HTTP requests, and had no page overflow at 390px after a layout fix. Local artifacts were moved outside OneDrive to `%LOCALAPPDATA%/kimo/bench/out/scratch/bench-smoke/`: `review.html`, `final.mp4`, `sheet.jpg`, `strip.mp4`.

## Resource controls and hardware master

| Item                                | Before               | Implemented control / evidence                                        |
| ----------------------------------- | -------------------- | --------------------------------------------------------------------- |
| Local full benchmark concurrency    | Two jobs overlapped  | Cross-process benchmark/edit locks; simultaneous-job rejection tested |
| Background worker priority          | Default scheduling   | Below normal; actual child process priority checked                   |
| App-owned FFmpeg pools              | Automatic            | 1 thread by default; opt-in cap 2; 1 filter thread                    |
| Direct bench Whisper                | 4 threads            | 1 thread by default; opt-in cap 2                                     |
| Master encode                       | libx264 CPU          | NVENC / QSV / AMF preferred, bounded CPU fallback                     |
| Local RTX 4050 hardware path        | No GPU upload master | NVDEC/CUDA + NVENC verified on a 1.2-second synthetic clip            |
| Real-footage CPU/quality comparison | Not available        | Pending; no percent improvement claimed                               |

Validation: 34 desktop tests pass on Node 20 with bundled BtbN FFmpeg, including the actual NVDEC/NVENC smoke. 300 existing web/API tests, web typecheck and production build passed before the desktop resource follow-up. Final lint is recorded in PHASE_LOG.md. No release was cut.

## Genuine saved-AI landscape diagnostic (legacy source)

Run41089587650 recomposed the genuine saved Phase1 TH-1 project without AI calls. Both sides were measured with the same version1 harness. Evidence: [hashes and scope](baselines/composed-real-AI-TH-1/comparison.json), [before](baselines/composed-real-AI-TH-1/before/metrics.json), [after](baselines/composed-real-AI-TH-1/after/metrics.json).

| Version1 diagnostic         | Original export | App compositor |
| --------------------------- | --------------: | -------------: |
| Creator Score               |            79.7 |           80.3 |
| Frame-match coverage        |          71.12% |         69.07% |
| Observed repeats / skips    |         129 /85 |        139 /94 |
| Whole-picture motion jitter |            0.11 |           0.89 |
| Clipped luma                |          5.394% |         0.749% |
| Delivery gate               |            Fail |           Pass |

These are insufficient-coverage diagnostics, not zero-repeat or camera-jitter acceptance. The original failed recording does not prove that the saved project state produced its last successful native export, so the score change is not certified as a compositor-only causal effect. The raw-v2 comparison explicitly exports both renderers from the identical saved project. Measurement version2 separately retains whole-picture motion and adds source-referenced camera registration; never mix version1 and version2 scores. The full USD5.49 reservation remains unchanged.
