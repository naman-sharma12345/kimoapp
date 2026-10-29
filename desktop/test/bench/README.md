# Creator benchmark

Phase 1 measures the desktop pipeline. Planner, caption, camera and audio decisions are unchanged. The user's follow-up request to reduce PC lag adds the background scheduling controls below. `creator-spec.json` holds the targets and `score.json` their category weights. Uses Node 20+ and the same `runEdit()` that Electron calls.

```sh
cd desktop
npm ci
npm test
npm run bench:fetch
npm run bench -- --clips TH-1,VLOG-1 --template shorts-punchy --aspect 9:16 --label my-run --replay-cache
```

Replay is the default, including when `--replay-cache` is omitted. A missing/corrupt entry fails the clip, sets a nonzero exit code and records failure in RESULTS.md. There is no fallback to paid requests. Unit tests use synthetic media/local fake responses; CI never runs the paid bench.

To deliberately record once:

```sh
npm run bench -- --template default --aspect both --label v0.3.2 --record-cache
```

The aggregate record budget is capped at USD 0.49 in `cache/spend.json`. It reserves an upper bound before each call, using full-model prices, a byte-per-input-token bound, system-prompt allowance, full output allowance and image allowance. The proxy does not return billing usage/model identity. This is a conservative guard, not a verified bill. Reservations persist across clips, failures and restarts; do not delete the ledger to evade the phase budget. `--max-usd` may lower the cap. SAM recording is disabled because tracking can alone exceed this phase's budget; previously captured upload/SSE/delete responses can replay through the same transport. No API keys are stored.

`default` maps to v0.3.2's `auto` style; `shorts-punchy` maps to its `energetic` style. These are bench aliases, not new creator templates. `--mode captions` explicitly measures the offline captions-only pipeline and is labeled separately. `--aspect both` runs 9:16 and 16:9 without changing source frame rates.

Tools are discovered in `desktop/vendor` or the standard installed Windows app. Overrides: `KIMO_BENCH_VENDOR`, `KIMO_MCP_BIN`, `KIMO_FFMPEG`, `KIMO_FFPROBE`, `KIMO_WHISPER_BIN`, `KIMO_WHISPER_MODEL`. Tests can use FFmpeg/FFprobe from PATH; CI requires them. Neither the engine repository nor installed binaries are modified.

On Windows the data directory is `%LOCALAPPDATA%/kimo/bench`; override with `KIMO_BENCH_DATA`. Downloads, prepared clips, `out/` and transcripts live there to avoid source-folder cloud sync. On other platforms the default remains this bench directory. Source manifests, JSON response cache and small baseline evidence remain in the repository. All output paths below are relative to the data directory.

`clips/clips.json` pins original URLs and SHA256 bytes, credits, licenses and segment selections. `fetch-clips.mjs` verifies originals before preparing media, including cache hits. Large media is Git-ignored. Dataset substitutions are explicit in the manifest and CREDITS.md. The existing `desktop/test/sam-person.mp4` remains unchanged.

Outputs: `out/<label>/<clip>-<aspect>/final.mp4`, `project.kimo.json`, `ops.jsonl`, `metrics.json`, `words.json`, `sheet.jpg`, `strip.mp4`, `review.html`, plus pipeline/run provenance. HTML uses inline CSS/JS and local media links: open it directly from disk offline. Timeline blocks seek the video. Dated summaries append to RESULTS.md; failed jobs never get fabricated scores. Use a new label for replay comparisons because rerunning a label replaces artifacts.

```sh
# Recompute measurements and review artifacts without rerunning the editor:
npm run bench -- --clips TH-1 --aspect 9:16 --label v0.3.2 --analyze-existing
```

Cache files contain normalized responses and integrity hashes, not full media/image requests. They are namespaced by SHA256 of input media hashes; filenames are SHA256 of endpoint, method and normalized body. Stable aliases remove run labels and machine paths. `run.json` records input hashes. Local transcription caches by final-media and Whisper-model hashes, and always transcribes final audio.

Measurement limits are included with every result:

- Filler context/repeated takes are transcript heuristics; Whisper timestamps are estimates.
- Caption geometry uses engine caption membership and conservative font envelopes. Subject overlap uses a labeled skin/centre heuristic. Animated/rotated text is unavailable instead of passed.
- Source-frame matching uses grayscale MAD within +/-3 frames and EDL mapping, excluding intentional cuts. Unsupported animation lowers coverage; less than 95% matched pairs cannot earn a green zero-repeat result. Scene cuts are cross-checked with `scdet`; freeze diagnostics stay separate from genuinely static footage.
- Colour continuity is CIEDE2000 between sampled per-clip midtone means. Clipping counts all full-range luma pixels/frames with FFmpeg LUT/signalstats.
- Ducking measures isolated music-stem RMS under speech versus gaps through `measureDuckDepth`. Without a retained stem it is unavailable, or inapplicable when no music exists.
- Delivery combines `qualityChecks()` with metadata, AAC bitrate, IDR/closed-GOP checks and per-frame CFR timestamps. Bitrate warnings retain the app's simple-footage policy.
- Unavailable applicable metrics score zero. Speech-free groups are excluded with weights renormalized. Delivery remains a separate gate. Scores never replace visual review.

Do not begin Phase 2 or cut a release from an incomplete checklist. See BASELINE.md and NOTES.md for observations.

## Resource safeguards

One benchmark can run at a time, and one expensive `runEdit()` can run across app/bench processes. Cross-process locks recover killed owners without removing live owners' markers. Media workers run below normal scheduling priority, leaving foreground applications preferred access to the CPU. App-owned FFmpeg decoders/encoders default to one CPU thread, each filter pool uses one, and recognized Rayon/OpenMP/BLAS pools are bounded. `KIMO_WORKER_THREADS=2` can opt into two threads on machines with sufficient headroom; higher values are capped. Direct bench Whisper transcription uses the same limit; the black-box engine controls its own internal Whisper invocation.

Tests run one file at a time. Analysis stdout is capped at 96 MiB per subprocess; oversized jobs fail instead of growing without limit. Scheduling controls preserve encode quality settings but may increase processing time. The user's later quality/CPU request also adds high-quality hardware upload-master encoding, with NVDEC/CUDA on compatible NVIDIA paths and bounded CPU fallbacks. The compositor/intermediate export remains CPU-based. See `../../PERFORMANCE.md` for settings and limitations. These are not guarantees of GPU utilization, memory usage or zero desktop lag.

The full baseline was interrupted at the user's request because the PC became sluggish. It was not restarted after these changes. Only lightweight synthetic tests validate the resource controls; no measured end-to-end lag reduction is claimed yet.
