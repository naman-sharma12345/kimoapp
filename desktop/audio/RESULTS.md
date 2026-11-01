# Phase 8 lightweight checks — 1 November 2026

The user requested implementation and a quick working check, explicitly excluding
benchmarks. No golden-clip runs, full footage renders, paid AI calls or releases
were performed. This is smoke evidence, not real-footage sound-quality acceptance.

| Six-second synthetic audio fixture   | Actual result                            |
| ------------------------------------ | ---------------------------------------- |
| Master integrated loudness           | −14.01 LUFS                              |
| Master true peak                     | −6.82 dBTP                               |
| Loudness range                       | 0.5 LU — outside the requested 4–9 range |
| DC offset                            | 0.000001                                 |
| Stereo correlation                   | 0.99935 over the six-second fixture      |
| Synthetic speech/noise ratio         | 40.45 dB input → 50.79 dB processed      |
| 6 kHz / 140 Hz spectral ratio change | +1.59 dB; fixture was not dulled         |
| Stem-only podcast remix              | −16.01 LUFS                              |
| Editorial room-tone fill             | One verified speech-free 20 ms gap       |

The test verifies exact-duration retained stems, imported short-music looping,
relative SFX gain, cache reuse, all conditional voice filters (with the documented
strong-hiss fallback), deterministic planning, source-handle protection, CC0
metadata/library size limits, and interception of the native final mixer.
Seven audio tests pass. Twenty existing EDL/resource/encoder checks and three
short synthetic pipeline checks also pass. The encoder test used software decode
with NVENC after this FFmpeg build rejected its CUDA format conversion; no long
local render was used.

Studio keyboard import and MUSIC-lane drop pass using the browser bridge fixture,
with no page errors. The screenshot is
`docs/screens/phase-08-music-import.png`; the preview is intentionally empty because
that fixture provides no video. The bridge is mocked, so the actual OS file picker
and a packaged installer were not exercised. Agent-browser repeatedly lost its
session; the existing Playwright/Chrome tooling completed this small UI check.

Repository lint, typecheck and production build pass. All 311 existing web tests
pass on bundled Node 24.22.1. The initial Node 26 run failed existing localStorage
tests; switching the test runtime resolved those environment failures without web
source changes. The desktop renderer production build also passes.

The installed BtbN FFmpeg's `anlmdn` filter crashes with Windows code 3221226356.
The app now checks that filter on a tiny disposable input, caches capability, and
uses a reported additional gentle FFT denoiser when unavailable.

Deferred by the user's instruction: golden benchmarks, music/SFX human listening,
whole-program stereo correlation, representative LRA 4–9 acceptance, measured
real-footage duck depth, sustained CPU/lag measurements, and subjective voice
quality. Original synthesized assets satisfy the offline library shape and size;
their artistic quality has not been signed off by a listener.
