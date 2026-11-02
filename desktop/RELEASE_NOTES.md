# kimo for Windows v0.4.0 — Creator edits

This release adds the creator pipeline and Studio controls to the Windows app:

- Own frame-exact compositor, transcript cuts and a float camera director.
- Nine templates, creator captions, graphics/b-roll and speech-synced explainer visuals.
- Voice/music/SFX finishing, colour matching and graded looks.
- Structured planner/critic, saved decisions, timeline edits and undo/redo.
- Reduced editing previews; full x264 medium delivery on export.
- Bounded critical-stage repairs, final AAC peak measurement, resumable checkpoints,
  VFR/rotation/HDR normalization and cache cleaning.
- Lossless opaque pass caches, retained alpha segments and bounded background work.

GPU probing no longer runs on startup or an engine-status refresh. Decode defaults
to CPU; hardware decode is opt-in with KIMO_HW_DECODE=auto. The optional small-copy
action can detect/use a hardware encoder. Final masters remain software x264.

## Measured before / after
| Clip | Best tested template | Legacy reference | v0.4.0 fixture |
|---|---|---:|---:|
| TH-1 | shorts-clean | 63.5 | 73.6 |
| TH-2 | shorts-punchy | 78.3 | 75.9 |
| TUT-1 | explainer | 53.6 | 63.5 |
| VLOG-1 | youtube-vlog | 79.2 | 66.9 |
| POD-1 | podcast-clips | 56.6 | 56.6 |
| MUSIC-1 | music-montage | 46.8 | 55.6 |

Best tested template for each of six golden IDs; all nine templates were tested.
The legacy column is the retained native-renderer reference for the v0.3.2 path,
not a fresh old-install run. Plans and measurement versions differ. These are
actual heuristic scores, not a controlled editorial-quality comparison or live
AI-provider adherence test. VLOG regresses and POD does not improve.

## Known limits

**Performance exception accepted by the user:** the four-core, no-GPU 60-second
portrait export takes 532.819 seconds (8.88 minutes), exceeding the four-minute
target. Whisper takes 32.390s; opaque composites 397.055s; final x26482.918s.
Composition through delivery is 479.973s against 90s. The performance gate remains
red. Earlier measured totals were 1009.450s and 840.243s on different hosted CPUs.
Preview rendering reduces editing load; full export still consumes CPU and disk.

Natural frame/jitter metrics for animated/follow camera mappings remain unverified,
not zero. Barcode/camera tests separately cover exact frame selection. Offline
CI fixtures use deterministic saved plans with network blocked, not captured
provider replies. Their centred camera isolates frame selection; they do not
showcase the camera director or prove model quality.

Outputs still need better hook selection, reliable face/speaker localization,
caption placement, human transcript correction and more purposeful b-roll. The
music case has only one underlying shot. Full visual critiques, critical metrics,
artifact links, dataset limitations and source credits are in desktop/test/bench/FINAL.md.
No new paid AI/SAM requests were made; the historical reservation ledger is unchanged.

Inputs longer than three hours are refused. The installer is unsigned. Automated
updater feed/size/hash verification is separate from the documented manual
v0.3.2 profile-and-restart upgrade test; an interactive old-install upgrade is not claimed.

CI-only test excerpt: *Tears of Steel* (c) Blender Foundation,
[source](https://mango.blender.org/), [CC BY 3.0](https://creativecommons.org/licenses/by/3.0/).
It is framed, captioned, graded and audio-finished for regression testing; the
full source clip is not installed. Other benchmark source credits accompany their
outputs and are linked in the final report.

## Release verification

[Windows qualification](https://github.com/naman-sharma12345/kimoapp/actions/runs/41472140170)
passes 203 desktop tests with zero skips, renderer/robustness/schema checks,
installation and offline captions. Installed creator fixtures score 81.2 and 80.4
with all critical gates green. The nine-template regression run also passes.
The published installer, blockmap and latest.yml were downloaded on the hosted
runner and verified against the built files, including feed size and SHA512.
No media/GPU testing ran locally after the reported AMD driver errors.
