# App-owned picture rendering

The desktop pipeline converts the planner's native project into an EDL and owns the final picture, previews, review sheets and thumbnails. The engine executable remains a read-only toolbox. AI, captions, follow-up, manual, SAM and queued batch jobs share this route. No web application behavior changes.

The raw-v2 timeline companions in `test/bench/calibrate-raw.mjs` independently decode asset/frame barcodes from delivered H.264 for the twelve saved raw timelines. They preserve the actual clip timing, source rates, order and fixed cameras, using one-tenth canvas/source raster and generated pictures/silence. Run 41191170102 passes all twelve cases with zero wrong indices, repeats or skips. These companions establish mechanical frame selection; they do not replace full-resolution footage reviews, Creator Scores, audio measurements or insufficient-confidence natural-picture matching. Independent seven-rate tests additionally exercise speed changes and punches.

## EDL version 1

`edl.mjs` provides `validate`, `fromKimoProject`, `framePlan`, `applyEdits`, `toTimeline`, `toKimoProject` and `publicEdl`. The saved `edit.edl.json` is authoritative for manual editing. Native data is retained for resuming planner tools, and stripped from renderer IPC payloads. IPC accepts whitelisted operations on known clip IDs; it does not accept replacement source paths from the window.

Canvas dimensions are integers and FPS is a positive number or rational string. Sources have unique IDs and local paths. Video tracks are ordered bottom first. Their clips specify unique IDs, source IDs, nonnegative `in`/`at`, positive `out-in` and speed. Camera keyframes use clip-local seconds, normalized source centers and positive zoom. Audio tracks use the same source ranges, or an `asset` path with optional duration. Asset audio is probed before validation/rendering; its missing duration and ID are resolved privately. Relative audio paths resolve against the project directory. Text/image overlays specify `at`, positive `dur` and ordered layers.

Validation reports exact track/clip locations for unknown sources, invalid ranges, nonfinite values and overlaps on a video lane. Overlapping pictures belong on separate tracks. Native track overlaps are converted to explicit layers. Source ranges and external audio ranges are checked again against probed media. Unused source entries need not exist on disk. Only input files are read; output and temporary work stay in the project job directory.

Native trims, source speed, fit, position/scale curves, Bezier punches, rotation, opacity, text, caption word animators and linked audio are converted. Independently eased native transform curves are sampled on the output grid. Translation accounts for source crop and zoom. Unmapped properties emit warning ops and remain in retained native data. Native grade graphs, custom masks/blends, non-cut transitions and future voice/graphic chains are extension points; unsupported behavior is warned, not silently represented as implemented.

## Frame clock and composition

The main talking source sets the rational canvas rate. Output frame `n` selects `round((n/fps-at)*speed*sourceFps + in*sourceFps)` in JavaScript. A request at source EOF holds the last real frame. Deliberate half-speed or mixed-rate holds are part of the plan, distinct from unintended repeated frames.

The direct graph uses accurate source seeks, exact frame trims and explicit selection. Nonintegral mappings use a bounded decoder/encoder pipe that copies the chosen source frames with backpressure. Camera rectangles stay floating point and use the existing perspective/Lanczos path. Intermediate video stays 4:4:4 with alpha where needed. RGB conversion uses the BT.709 matrix as well as tags. SDR delivery converts once to 4:2:0 through the existing upload master. HDR tone mapping and creative look matching belong to the later colour phase and are not certified here.

At more than approximately 200 graph nodes or ten minutes, the compositor bakes 30-second track segments to lossless FFV1 and concatenates them. Transparent gaps and picture segments share codec level, pixel format and colour metadata. A stage limit also bounds direct graphs. Text uses per-frame ASS cues with exact on/off frames at the supported rates. Images and text respect their interleaved overlay order; alpha survives intermediate segments. Animated assets can be supplied as image/video sources. This phase does not generate the later graphics library.

Audio mixes separately at 48 kHz from matching EDL ranges, applies gain and available native envelopes/filters, and uses 10 ms equal-power clip-end fades. Audio is padded/trimmed to the picture frame clock. The existing upload master handles final loudness, H.264, AAC, GOP and bitrate settings. Silence avoids invalid infinite loudness correction values. Full voice chains, sidechain design and SFX selection remain later-phase work.

Progress comes from actual FFmpeg frames, with throughput and ETA. Workers have bounded thread pools and lower scheduling priority. Lossless intermediates are removed after successful delivery; failed delivery retains its diagnostic master. Each compositor call cleans only its own verified temporary directory. `KIMO_COMPOSE_KEEP_WORK=1` and `KIMO_COMPOSE_KEEP_MASTER=1` retain diagnostics deliberately.

## Validation and benchmark

`npm test` in `desktop/` exercises binary source-frame counters at 24000/1001, 24, 25, 30000/1001, 30, 50 and 60 fps; cuts, 2x, half speed and camera keys; direct/fallback equality; transparency/layer order; audio seams; quoted Windows paths; cancellation; real master encoding; and all pipeline modes. Network replies in integration tests are local fixtures and never paid.

The hidden `legacy_kimo_render` option is false by default and rejected unless `KIMO_BENCH_LEGACY=1`. Only the benchmark CLI enables it via `--legacy-kimo-render`. Electron exposes no legacy setting. The separate Phase 2 manual workflow runs full footage on GitHub-hosted standard Windows runners and can compare the identical native project. It also runs Electron smoke directly without an installer or release. Offline measurement rejects any fetch and verifies the spending ledger stays unchanged. Artifact restore takes maxima of cumulative ledger counters; it never replaces newer reservations with an old seed or adds duplicate reservations.

See `test/bench/RESULTS.md` and `test/bench/REMOTE-RUN.md` for measured results and outstanding acceptance. Synthetic correctness and successful smoke do not establish golden-clip Creator Score improvements or sustained local CPU percentages.

## Source-referenced camera measurement

Benchmark measurement version2 retains the old whole-picture result as content_motion_jitter_px. Canonical jitter_px estimates output translation relative to the spatially aligned expected source frame, so physical capture/object motion is present on both sides. A masked small-translation least-squares fit allows affine brightness differences, rejects weak/one-dimensional texture and large residuals, then reports SG7 high-frequency residual at a1080-pixel short side. A95% eligible-coverage requirement keeps missing registration unavailable. Animated mappings remain unmeasured. This is a bounded estimator, not proof of frame identity or a general optical-flow/face detector. Independent moving-source/brightness/caption fixtures and an actual decoded FFV1 injected-subpixel-shake fixture test both rejection and detection; the separate decoded camera-edge test remains0.2424px. Version1 and version2 Creator Scores must not be mixed.

Raw-v2 preparation/comparison runs only on standard hosted runners. Exact preparation artifacts can be reused by prepared_run; analyze_run remeasures saved final/native outputs after checking their hashes. Source files, separate music stems and full credit sidecars are retained. No paid AI fallback exists.

Strategy selection now estimates source/transform stacks and ASS passes around raster image layers. It no longer counts each caption/shape cue as a separate filter node. A150-cue actual FFmpeg fixture selects direct composition with decoded pixels identical to explicit fallback. A14-layer graph and a timeline over10minutes still select bounded fallback. This avoids unnecessary raw-frame piping and FFV1 intermediates for caption-heavy timelines; full-footage CPU percentages are not inferred from the fixture.
