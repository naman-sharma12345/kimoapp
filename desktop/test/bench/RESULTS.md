# Creator benchmark results

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
