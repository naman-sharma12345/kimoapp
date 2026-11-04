# kimo v0.5.0 — Kimo v8.12.1 engine, faster exports

This release updates the bundled Kimo engine and speeds up export rendering.
It carries forward v0.4.3's incremental-update mechanism unchanged (cached-base
block reconstruction with explicit consent before any full-download fallback).

## Engine

- Bundled engine updated to **Kimo v8.12.1** (from the v6 line).
- Fixes a variable-frame-rate (VFR) clip handling bug in the engine update.
- Fixes an audio `finish_audio` compression-strength regression from the same update.

## Export speed

- Footage is analyzed with one decode pass instead of two.
- Independent clip segments and, on long exports, independent 30s render
  stages now render in parallel instead of strictly one after another.
- Fixed a `framePlan()` rounding bug that could silently route ordinary clips
  onto the slow per-frame compositor instead of the fast direct path; the same
  bug could also repeat a source frame (a visible stutter) in the slow path's
  own output. Both are fixed.
- Swapped the lossless intermediate codec used while composing a clip's picture
  segment (ffv1 → ffvhuff); verified frame-for-frame identical output.
- **Measured on a 127s/6-clip timeline on a 4-core machine with no GPU:
  roughly 2.7x faster than the pre-update baseline.**
- **Measured on a real 700s/21,184-frame/720p/30fps export on the same
  machine: roughly 22% faster again (on top of the above) from the lossless
  codec swap alone**, after the other fixes above were already in place.
- Exports over 600s no longer need an unbounded amount of scratch disk: each
  render stage's temporary files are now deleted as soon as that stage's
  output is written and frame-count verified (previously a ~700s export could
  need 20GB+ of free disk).
- GPU encode/decode auto-detection (NVENC/Quick Sync/AMF) is unchanged by this
  release. **It has not been tested on real GPU hardware** — all the timings
  above were measured on a GPU-less machine.

## Verification

136 desktop unit/bench tests pass, including two new tests proving the
ffv1→ffvhuff swap produces byte-identical decoded output on real footage and
on synthetic alpha content. Timings above are from development-machine
benchmarks, not the hosted Windows qualification run; that run (and its
machine-readable evidence) happens when this release is built and published.

[Machine-readable evidence from the previous release](https://github.com/naman-sharma12345/kimoapp/tree/main/desktop/distribution/evidence/0.4.3).
