# Responsive rendering

The upload master now prefers the available hardware encoder: NVIDIA NVENC, Intel Quick Sync, then AMD AMF. On NVIDIA, compatible 8-bit H.264 intermediates use NVDEC and a CUDA NV12 surface filter to keep decode/encode frames on the GPU. Quality settings use NVENC P6/HQ, VBR with CQ 18, quarter-resolution multipass, adaptive quantization and 20-frame lookahead, with 32 encoder surfaces. The master keeps the existing resolution, source frame rate, YouTube bitrate targets, H.264 High, closed GOPs, BT.709 and AAC 384k/48 kHz stereo. 4K above 30 fps uses level 5.2.

These settings follow [NVIDIA's FFmpeg quality guidance](https://docs.nvidia.com/video-technologies/video-codec-sdk/13.1/ffmpeg-with-nvidia-gpu/). They are a quality target, not a claim of perceptual equivalence on every clip.

If hardware decoding fails, the app retries GPU encoding with bounded software decoding. If the hardware encoder fails, it uses the existing high-quality CPU encode with limited app-owned threads. Cancellation never starts another attempt. Failed hardware attempts are reported in the live activity feed. A detected encoder is cached for the process rather than probed for every master.

Media subprocesses run below normal scheduling priority; the Electron UI is not demoted. As of v8.13, an export is foreground work the user is actively waiting on, so by default App-owned FFmpeg decode/encode and filter pools (and the supported Rayon/OpenMP/BLAS environment pools) scale to the machine, via `os.availableParallelism()`, leaving one core free for the UI. That had been the single biggest render-speed bug in the app: every export-path FFmpeg call was forced to `-threads 1`/`-filter_threads 1`/`-filter_complex_threads 1` unconditionally, so a render used one core out of however many the PC has, regardless of its size.

`KIMO_PERFORMANCE_PROFILE` is the user-visible choice between the two behaviours:
  - unset, or `fast` (the new default): scale to the machine as above.
  - `background` (aliases `low-cpu`/`low_cpu`): the old pre-v8.13 default — caps at 1-2 threads, for someone who wants to keep using the PC for something else heavy while a render runs in the background.
  - `ci`: unchanged — every core, for hosted test/bench runners.

`KIMO_WORKER_THREADS=N` still requests an explicit thread count; it is now honoured up to the machine's own ceiling instead of being capped at two. The bundled engine still controls its own helper arguments; these limits cannot promise a fixed total CPU percentage across that black box. See [Node priority documentation](https://nodejs.org/api/os.html#priority-constants).

A settings toggle in the desktop UI for `KIMO_PERFORMANCE_PROFILE` (today it's an environment variable only) is the natural next step so "fast" vs "keep my PC free" is a checkbox, not an env var; not done in this pass.

Cross-process locks allow one expensive edit and one benchmark at a time. Dead owners recover safely. The app queue claims its job before awaiting engine import, closing a race that could start two edits. Benchmark SIGINT/SIGTERM cancels its active edit, analysis and transcription before releasing its lock. Analysis output buffers are bounded and unit test files run serially.

On Windows, generated benchmark downloads, prepared media, transcripts and renders default to `%LOCALAPPDATA%/kimo/bench`, outside the OneDrive source checkout. Small manifests, cache responses and committed evidence remain in Git. `KIMO_BENCH_DATA` can select another local disk. This avoids pushing large temporary files through source-folder cloud sync; the existing generated files were relocated there without re-encoding.

Phase 2 replaces the engine's picture renderer with the app-owned compositor described in [COMPOSITOR.md](COMPOSITOR.md). Its frame mapping, floating-point transforms, ASS text and lossless intermediates use bounded CPU workers. NVENC accelerates master compression; it does not move those filters, Whisper or audio mixing onto the GPU. A complete GPU compositor would require separate renderer work and real-footage validation. No low-quality proxy is substituted for the final master.

On the local RTX 4050 laptop, a 1.2-second synthetic test verified NVDEC/CUDA + NVENC, H.264 High/yuv420p, dimensions, CFR, IDR/closed GOPs, BT.709 and AAC 48 kHz stereo. Queue, worker priority, thread limits, lock recovery, GPU fallback and cancellation have automated coverage. This test does not establish real-footage CPU percentages, visual quality or responsiveness under a sustained render. The full bench was stopped after the user reported lag and was not restarted.

These app changes take effect in the next desktop build. No installer/release was produced in this phase.


## Ideas studied from other editors (citations, not code)

Kimo is MIT-licensed. The projects below are GPL (MLT/Kdenlive/Shotcut) or
proprietary (Premiere, Resolve); nothing was copied from any of them -- these
are techniques and citations only, reimplemented from scratch where adopted.

- **Proxy editing** (Kdenlive, built on the MLT framework; Olive). Edit against
  a small, fast-to-decode stand-in for each source clip, and only touch the
  full-resolution original for the final export. Kdenlive's own docs recommend
  this as the first fix for a laggy timeline
  (https://docs.kdenlive.org/en/project_and_setup/proxy_clips.html). Kimo's
  compositor already works frame-exact against the original source for every
  preview and export; a proxy mode (smaller intermediate during editing,
  original-resolution only on final export) is the single biggest structural
  change left on the table here -- see "what's untested / next" below.
- **GPU-resident decode-filter-encode, no CPU round trip** (NVIDIA's own FFmpeg
  guidance: https://docs.nvidia.com/video-technologies/video-codec-sdk/13.1/ffmpeg-with-nvidia-gpu/index.html;
  FFmpeg's own HWAccelIntro: https://trac.ffmpeg.org/wiki/HWAccelIntro).
  Decode with NVDEC, filter on a CUDA/NV12 surface, encode with NVENC, so a
  frame never crosses into system memory and back. `encodingAttempts()` in
  encoding.mjs already takes this path for the 8-bit H.264-in, H.264-out case
  (hwaccel cuda decode + scale_cuda filter + NVENC); this pass is what makes
  it actually get *picked* (GPU detection was built but never called).
- **GPU-resident compositing** (Olive: "Olive's compositing/rendering pipeline
  is 100% OpenGL" -- https://github.com/olive-editor/olive/issues/633; the
  public descriptions of Premiere's Mercury Playback Engine and Resolve's GPU
  pipeline describe the same shape: effects and color run as GPU shaders, not
  CPU filters). Kimo's own compositor (desktop/COMPOSITOR.md, PERFORMANCE.md
  "Phase 2") runs its frame mapping, transforms and text on bounded CPU
  workers by design, with NVENC only accelerating the final compression step.
  Moving the compositor itself onto the GPU is out of scope for this pass (it
  is a renderer rewrite, not a config/threading fix) but is the next-biggest
  lever after proxy editing for closing the remaining gap to Premiere/Resolve.
- **Parallel segment encoding** (the general technique behind most NLEs'
  background "render farm" exports, and FFmpeg's own documented pattern of
  splitting a long encode into independent segments across processes, then
  concatenating or stitching the results -- see FFmpeg's concat demuxer docs,
  https://ffmpeg.org/ffmpeg-formats.html#concat). compose.mjs already renders
  independent caption/graphics segments to separate intermediate files and
  concatenates them; the segments are not currently rendered in parallel
  with each other (one ffmpeg process at a time, now with more threads each).
  Running independent segments as separate OS processes rather than
  separate threads inside one ffmpeg process is a further lever not taken in
  this pass -- noted, not implemented, given the time box.
- **Single filter graph over per-frame pipes** (general FFmpeg filtergraph
  practice: https://ffmpeg.org/ffmpeg-filters.html). compose.mjs already
  builds one `-filter_complex_script` per segment rather than a JS-side
  per-frame loop; the remaining per-frame JS work is in the RGBA pipe-based
  raw-frame compositor path used for SAM effects and a few camera/fx cases
  (search `spawnRgbaPipe`/`encoder.stdin.write(frame)` in compose.mjs), not
  the main picture-composite path. Collapsing those into pure filtergraph
  expressions where ffmpeg's own filters (overlay, zoompan, geq) can express
  the same transform is flagged for follow-up, not done in this pass.
