# Responsive rendering

The upload master now prefers the available hardware encoder: NVIDIA NVENC, Intel Quick Sync, then AMD AMF. On NVIDIA, compatible 8-bit H.264 intermediates use NVDEC and a CUDA NV12 surface filter to keep decode/encode frames on the GPU. Quality settings use NVENC P6/HQ, VBR with CQ 18, quarter-resolution multipass, adaptive quantization and 20-frame lookahead, with 32 encoder surfaces. The master keeps the existing resolution, source frame rate, YouTube bitrate targets, H.264 High, closed GOPs, BT.709 and AAC 384k/48 kHz stereo. 4K above 30 fps uses level 5.2.

These settings follow [NVIDIA's FFmpeg quality guidance](https://docs.nvidia.com/video-technologies/video-codec-sdk/13.1/ffmpeg-with-nvidia-gpu/). They are a quality target, not a claim of perceptual equivalence on every clip.

If hardware decoding fails, the app retries GPU encoding with bounded software decoding. If the hardware encoder fails, it uses the existing high-quality CPU encode with limited app-owned threads. Cancellation never starts another attempt. Failed hardware attempts are reported in the live activity feed. A detected encoder is cached for the process rather than probed for every master.

Media subprocesses run below normal scheduling priority; the Electron UI is not demoted. App-owned FFmpeg decode/encode pools default to one CPU thread, and filter pools use one. Supported Rayon/OpenMP/BLAS environment pools are also bounded. `KIMO_WORKER_THREADS=2` opts into a little more throughput on machines with enough CPU headroom; higher values are capped at two. The bundled engine still controls its own helper arguments; these limits cannot promise a fixed total CPU percentage across that black box. See [Node priority documentation](https://nodejs.org/api/os.html#priority-constants).

Cross-process locks allow one expensive edit and one benchmark at a time. Dead owners recover safely. The app queue claims its job before awaiting engine import, closing a race that could start two edits. Benchmark SIGINT/SIGTERM cancels its active edit, analysis and transcription before releasing its lock. Analysis output buffers are bounded and unit test files run serially.

On Windows, generated benchmark downloads, prepared media, transcripts and renders default to `%LOCALAPPDATA%/kimo/bench`, outside the OneDrive source checkout. Small manifests, cache responses and committed evidence remain in Git. `KIMO_BENCH_DATA` can select another local disk. This avoids pushing large temporary files through source-folder cloud sync; the existing generated files were relocated there without re-encoding.

Phase 2 replaces the engine's picture renderer with the app-owned compositor described in [COMPOSITOR.md](COMPOSITOR.md). Its frame mapping, floating-point transforms, ASS text and lossless intermediates use bounded CPU workers. NVENC accelerates master compression; it does not move those filters, Whisper or audio mixing onto the GPU. A complete GPU compositor would require separate renderer work and real-footage validation. No low-quality proxy is substituted for the final master.

On the local RTX 4050 laptop, a 1.2-second synthetic test verified NVDEC/CUDA + NVENC, H.264 High/yuv420p, dimensions, CFR, IDR/closed GOPs, BT.709 and AAC 48 kHz stereo. Queue, worker priority, thread limits, lock recovery, GPU fallback and cancellation have automated coverage. This test does not establish real-footage CPU percentages, visual quality or responsiveness under a sustained render. The full bench was stopped after the user reported lag and was not restarted.

These app changes take effect in the next desktop build. No installer/release was produced in this phase.
