[Download the recommended small setup (225 KB)](https://github.com/naman-sharma12345/kimoapp/releases/download/v0.5.0/kimo-Online-Setup-0.5.0.exe) · [Fast CDN mirror](https://downloads.getkimo.tech/desktop/v0.5.0/kimo-Online-Setup-0.5.0.exe)

The small setup supports incremental updates. Verified v0.4.3 → v0.5.0: **74.09 MB downloaded, 295.60 MB reused**, saved project preserved, exact final SHA-512 verified. Re-running on v0.5.0 skips download and reinstall even without a cache. A fresh installation still downloads the full app once; an unavailable delta requires approval before full-download fallback (silent setup stops).

The tested launcher is **225,068 bytes**, SHA-256 `b49d1adbef8ffcb1d1d5dd2dc3c3895ab4a474b4bd8719781388c2d3ba2b2e18`. Hosted upgrade took 32.08 seconds and recovered a dropped CDN connection using GitHub ranges; that is a runner measurement, not a user speed guarantee. The original full installer, blockmap and update feed are unchanged.

[Native setup qualification](https://github.com/naman-sharma12345/kimoapp/actions/runs/41787901835) · [Detailed delivery record](https://github.com/naman-sharma12345/kimoapp/blob/main/desktop/distribution/ONLINE-0.5.0.md)

---

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
