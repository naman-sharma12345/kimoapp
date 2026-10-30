# Creator benchmark results

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
