# Investigation notes

## 2 November 2026 — Phase 12 qualification fixes

- The first Windows qualification found FFmpeg missing from PATH for tests that
  intentionally use the command name. Keep explicit vendor binary variables and
  add that verified directory to the Actions PATH; do not skip those tests.
- Modern FFmpeg did not write the old rotate output tag into the test MP4. Create
  a real input display matrix with `-display_rotation 90`, assert that the probe
  sees it, then test baking the rotation. A local 0.2-second fixture proves 96×64
  becomes 64×96 with rotation zero.
- A genuine full-footage replay failed with Windows ENAMETOOLONG inside the mapped
  camera encoder. The outer graph was already bounded, but the per-clip geometry
  was still on argv. Put that exact expression in a filter file. A new synthetic
  expression larger than 32,767 characters now renders successfully.
- First four-core hosted measurement (41427786326, artifact 13133472651): transcript
  44.024 s, cached plan 0 s, compose 806.454 s, critic 0 s, total 1009.450 s.
  This FAILS the 90 s compose / 240 s total budgets. Preserve these numbers.
  Small JSON-only artifact extraction downloaded 0.07 MB; no footage render or
  whole-footage analysis was run on the user's PC.
- Optimize contiguous source-frame plans through one FFmpeg process, retaining
  exact pixel format, crop, timebase and frame count. Noncontiguous plans still
  use strict JS sampling; critical compose repair forces that path. The explicit
  CI profile can use filter threads; the foreground low-CPU defaults are unchanged.
  Independent decoded barcode oracles pass all seven rates, 2×/0.5× trims and camera
  keys in auto, bounded and strict modes (21 combinations). New timings must be
  measured before claiming the performance budget is met.

## 1 November 2026 — Phase 11 Studio

- No paid AI calls, full golden renders, new benchmark recordings or release.
  The fully reserved USD 5.49 ledger is unchanged. Tiny synthetic render checks
  and the explicitly requested 3-second preview assets are functional evidence.
- Real IPC contract tests exercise the main-process registration, including both
  regeneration jobs, all local command families and persistent undo/redo.
- Visual review caught a score popup clipped by its feed parent; move it to a
  focused portal with Escape/outside close. Inspector content now scrolls inside
  its pane at the minimum supported size.
- A preview candidate under a legacy TH-1 path was stale/mislabelled. Discard those
  generated assets. Rebuild all previews from the exact raw-v2 ProPublica source
  only after its complete SHA-256 matched the frozen provenance. Inspect actual
  poster/frames. Use template-name labels rather than unverified dialogue.
- The older compact public-EDL test exposed excessive camera payload on legacy
  projects. Send only scalar camera keys for creator projects; keep the legacy
  payload small. The regression then passes.
- Caption-source anchors avoid applying an old cap001 change to a regenerated
  hook. Missing/rechunked targets show a warning. Restoring a gap now uses adjacent
  quantized source bounds and shifts caption word times plus the full music bed.
- Overlapping leading/tail removal markers intercepted clicks. Put the tail at
  the actual edit end and group coincident markers into a chooser. Browser checks
  now restore the pause through the visible control.
- Stem slider preview state was resetting the commit sentinel. Commit from the
  persisted setting, while audition gain stays local. A keyboard arrow now reaches
  the actual levels reducer; the tiny FFmpeg check proves picture bytes unchanged.
- Windows socket enumeration twice failed to locate an owned fixture server while
  rebinding still reported EADDRINUSE. Switch to exact command-line/CIM process
  identification and stop only that server, then rebuild/restart. No blind repeats.
- The UI fixture generates silent WAV data in memory, requires no private user
  asset path, and uses synthetic quality numbers. Native playback/accounts and
  real-provider adherence remain outside this browser check. No CPU percentage or
  natural-footage quality improvement is claimed.

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

- The user subsequently approved up to USD 5 additional AI spending. The ledger retains the old USD 0.49 reservation and records an authorized aggregate reservation cap of USD 5.49. The live status endpoint identifies contributor pricing for build calls; review calls reserve full-model prices. This is not a billing statement.
- Full recordings moved to standard GitHub-hosted Windows runners. Record batches serialize and seed the latest cache/ledger/exact media artifact; replay and analysis modes never fall back to paid network calls. Artifact bundles are saved after each clip to preserve completed work. Local full renders remain stopped.
- Cache v2 normalizes nested escaped paths across machines while retaining tool-argument order, which the planner includes in later history. Synthetic cross-machine record/replay tests cover both cases. Downloaded projects can be relocated in memory for analysis without rewriting the original evidence. New analysis provenance includes final-video and project SHA256 hashes.
- After these changes, 39 desktop tests pass using bundled FFmpeg, including a 1.2-second NVDEC/NVENC synthetic fixture. GitHub run 40891215691 passed the combined lint/typecheck/test/build step. Its broader web jobs failed the existing landing bundle cap (166342 gzip bytes versus 120000) and timed out looking for the alternate vertical-export checkbox; no web product code is changed by the benchmark.

- Phase 2 remote unit CI passed on Windows but failed on Linux. The first attempt to collect the logs and a second bounded request timed out; the job produced about 3.6 million log lines. Replace raw Buffer deep equality assertion output with bounded diagnostics before rerunning. Preserve failing evidence; do not weaken frame matching to make it pass. The initial Electron smoke workflow launched a GUI executable without waiting; fix it to wait for process exit before interpreting its in-progress JSON.
- The second Linux run narrowed the remaining A/B mismatch to frames after transparent gaps. Those gaps were encoded with FFV1's default level while mapped segments used level 3; concat copy retained incompatible stream headers. Give every gap the same level-3 format. Windows Electron smoke now passes (41029000946), proving composed picture plus EDL and manual re-render at 24000/1001.

- Independent decoded-edge calibration found a one-frame camera lead: FFmpeg perspective's input counter begins at one while EDL camera arrays begin at zero. Sampling at `(in-1)` reduces observed residual from 2.1439 to 0.2424 px at a normalized 1080-pixel short side. Barcode expectations now use an independent formula, not the production frame planner. ASS vector backgrounds and explicit BT.709 frame metadata fix a missing hook background and a half-alpha green colour discrepancy.
- The user rejected final acceptance using the existing public substitutes and explicitly requires a new raw dataset. They have no footage to supply. Preserve all old evidence and the full USD 5.49 reservation; do not waive the dataset or start new paid calls. Research publicly licensed raw sources and keep source/licence/actual-content checks distinct.
- Linux FFmpeg 6 exposed two colour issues after explicit frame tagging. Setting BT.709 metadata immediately after normalization and every overlay fixed direct/fallback equality. The half-alpha green shape still decoded as 107 instead of approximately 128. Two metadata-only attempts did not fix that. Inspection of FFmpeg 6.1's `vf_subtitles.c` shows its ASS draw context uses `ff_draw_init` without a colour-space argument; render ASS colours on RGB frames and explicitly convert back to BT.709 4:4:4. Keep the measured colour assertion and both strategies; do not relax the expected green value. Validate that change on Linux as well as Windows.

- Cinestudy dedicated b-roll acquisition returned HTTP 429 twice (41093785376 and cooldown retry41096384912). Stop this route; no account/cookies/proxy bypass. Two other publisher-authorized raw camera rolls are already acquired. Vlog selection uses explicitly documented raw speech/context-shot excerpts from those rolls, pending selected-preview review.

- Raw-v2 measurement v3 clamps source-frame expectations to actual ffprobe frame counts, preserves planned final holds, uses an affine-photometric confidence cost, and keeps codec delivery separate from captured scene motion. Independent EOF and injected-repeat/skip fixtures pass. The confidence gate remains 95%; visually identical/static source pictures cannot establish unique frame identity and remain unavailable rather than zero. Source-referenced registration measures transform error separately from captured camera/subject motion.
- All twelve raw-v2 saved timelines passed the hosted barcode companion run 41191170102: 17,018 delivered frames, zero wrong asset/frame indices, zero unintended repeats/skips, zero network attempts and no ledger change. Generated small-raster pictures/silence are explicitly separate from natural-footage quality evidence. Do not keep retuning a natural matcher until static footage appears green, or use missing native landscape references as successful baselines.

- Measurement v4 corrects a camera-coverage denominator bug: the global matcher counts adjacent frame pairs, while SG7 registration counts output frames. A fully registered500-frame sequence has494 eligible centres and coverage100%, not494/493. The physical registration fits and95% gate stay unchanged. Saved v3 per-segment counts permit a transparent JSON-only correction with original SHA256 provenance; keep the original v3 files. Do not re-render footage or clamp invalid percentages merely to turn a gate green.
- A native-only longer export retry now skips completed references, retains exact saved projects/media and checks full VIDEO stream coverage. Native format durations can exceed the planned picture due to short tails; preserve and measure those tails. The earlier absolute-format-duration check was caught before completed retries and replaced. Current retry41193701206 is bounded to90minutes/export on standard hosted runners and makes no paid calls.

## 31 October 2026 (Phase 5, captions)

- FFmpeg's `subtitles` filter shapes text simply (libass `ASS_SHAPING_SIMPLE` here): Devanagari rendered स्त with a visible halant instead of the conjunct. The `ass` filter with `shaping=complex` forms it correctly with the same libass. The final text pass now uses `ass=…:shaping=complex`; existing Phase 2 compose tests stay green with the switch.
- `-ss` before a lavfi `color` input resets timestamps, so libass drew time 0; the font check renders the whole script at a low frame rate instead (every face in use gets selected and logged once).
- libass needs real files for `fontsdir`, so the licence texts live in `fonts/licenses/` (a `.txt` in the fonts dir is tried as a font and logs an error) and the fonts ship `asarUnpack`ed.
- Luckiest Guy is Apache-2.0, not OFL; Bangers (OFL) is the MrBeast lookalike. Inter was not needed: Geist covers the clean sans styles.
- Nothing looped twice without progress.

## 1 November 2026 (Phase 7, explainers)

Known gaps, left open on purpose:

- No keyed sources: GIPHY, Tenor, Pexels and Pixabay need API keys and are not wired. Pictures come from kimo's library, Openverse and Wikimedia Commons only.
- Openverse and Wikimedia are called directly from the app (no proxy or mirror). Openverse answered one search with a 504 once; the source treats it as no result for that query and the beat falls back to an icon card.
- Crowd sounds (ooh, laugh, laugh track) map to the nearest synthesised kit sound (ding, boing); there are no recorded crowd sounds.
- No music dip: the music is not ducked further while an explainer beat or its SFX plays (voice ducking from Phase 2 still applies).
- "Regenerate this part" re-runs the visual director and needs AI access (owner sign-in or an own key); without it the button reports the locked message.
- UI callouts need a target box (from a screenshot or the planner); there is no automatic detection of the UI element being talked about.
- Explain previews are a synthetic scene without the camera's make-room reframe, so top-mode panels at 9:16 sit over the fake head there; real edits reframe the speaker.
- The renderer browser check (`test/renderer-edl.mjs`) needs a local Chrome; it could not run in the agent sandbox this session (Playwright browser download refused), so the 14-clip fixture change was checked by the renderer build and unit tests only.

## 2 November 2026 — Phase 12 registration diagnosis

- Two short-smoke qualification attempts retained73.7 despite correct frame IDs.
  Stop rebuilding the installer to diagnose that unchanged measurement failure.
  Saved-output-only run41469131574 exposed one rejected frame:79/24s, RMSE10.1238
  but translation nearly zero. All other fits averaged0.7122 RMSE.
- EDL caption times3.291/3.292s leave an unrounded mask gap at3.291667s. The ASS
  writer floors to centiseconds, so the next caption is already visible at3.29s.
  Enclose the actual ASS clock in the measurement mask and retain95% coverage,
  RMSE6 and all physical thresholds. Add the concrete fractional-frame boundary
  regression. Saved video bytes do not need changing; no threshold retuning or
  calibration overlay is justified by this diagnosis.
- Opaque-cache optimization reduced hosted total to532.819s, but the composition
  counter originally omitted the82.918s final master. Correct composition through
  delivery is479.973s. The user explicitly accepted release with that documented
  performance gap; the performance workflow still fails rather than turning green.
- AMD driver errors ended all local media/browser/GPU tests, including tiny ones.
  Remove runtime startup/status GPU probes; decode defaults to CPU and hardware
  decode is explicit opt-in. No driver settings or registry were touched.