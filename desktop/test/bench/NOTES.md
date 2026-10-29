# Investigation notes

## 29 October 2026

- Baseline source: commit `b0c90974257e8795c292622c4c30defef1457db1`, desktop 0.3.2, read-only kimo-mcp 6.0.0 (`3621dcfa35ac`). The installed Windows app supplied BtbN FFmpeg, Whisper and the small quantized model. No engine/planner behavior changed.
- Wikimedia throttled the first download attempt (HTTP 429). A second attempt used its download query for affected files. Four complete originals were SHA256-pinned and validated by the committed downloader. No further blind retries.
- The web test alias's trailing slash failed resolution on Windows. Changed only the test alias to `@` and normalized separators. Node 26 also caused jsdom/localStorage errors; Node 24 passes those tests. No web runtime change.
- Repository-wide Prettier initially rejected existing README.md and DECISIONS.md formatting. Formatted those files for the required lint check.
- The proxy omits deployed model identity and token usage. The bench reserves full-model upper-bound costs and stops at USD 0.49 rather than asserting an unverifiable bill or exceeding the phase cap. Incomplete recordings/cache misses stay visible in RESULTS.md.

- The user reported severe PC lag while a live baseline and a replay were running together. Both process trees were terminated immediately. Nine agent-browser helper/browser trees created during local report verification were also terminated; the CLI had failed to retain the expected browser session. No unrelated browser or app was closed.
- The user then explicitly requested reducing lag. Added cross-process single-job guards, below-normal media worker priority, bounded FFmpeg/filter/Rayon/OpenMP/BLAS threads, bounded analysis buffers, serial unit tests and a fix for the desktop queue's asynchronous engine-load race. The engine binary is still read-only; editing decisions and encode quality settings are unchanged. No further heavy render was started locally.
- The original recorder was launched before durable per-request ledger writes were implemented. Its interrupted run did not flush its in-memory spend counter. Conservatively reserve the whole USD 0.49 allowance so no subsequent call can exceed the supplied phase budget. Seven genuine build-response cache entries survived. Their billing cost is unknown; do not invent an exact spend.

- The user then requested high-quality rendering with minimum CPU usage. Local hardware inspection found an NVIDIA RTX 4050 Laptop GPU and AMD Radeon 780M. The upload master now prefers NVENC/QSV/AMF, with a high-quality preset and CPU fallback; this is an explicitly requested extension beyond Phase 1's observation-only scope.
- NVIDIA GPU decode initially failed because the bundled FFmpeg tried inserting an unsupported software format conversion. Merely forcing the CUDA output format did not resolve it. An explicit CUDA NV12 surface filter fixed the path; a 1.2-second synthetic clip then verified NVDEC/CUDA + NVENC and delivery metadata. Full real-footage visual/CPU comparisons remain pending.
- The engine's read-only `export` schema exposes CRF, range and an opt-in low-memory mode, but no hardware encoder selector. The CPU compositor/intermediate export cannot be moved to the GPU by toggling the master encoder. No unsupported engine flags or global machine settings were changed.

- The source checkout is under OneDrive. Generated benchmark media/downloads/transcripts/renders were moved with checked native filesystem paths to LocalAppData; the bench now defaults there, avoiding new large temporary media in cloud sync. User source files and repository assets were not moved.
