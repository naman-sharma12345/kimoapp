# Phase 1 continuation state

Updated 29 October 2026. **Phase 1 is not complete.** The framework and resource follow-up are pushed; real golden recordings, replay verification and the final visual critiques remain in progress. Keep the user’s PC free of full renders.

## Active recording

- GitHub run **40891223587**, workflow `phase01-baseline.yml`, checked out commit `234d748`.
- Record inputs: `clips=TH-1,TH-2,TUT-1`, `aspect=both`, `label=v0.3.2-baseline`.
- Last observed: `record TH-1` in progress, no failed steps and no completed artifacts. Verified media preparation succeeded. Do not cancel/restart merely because the real editor is slow.
- Each completed clip uploads `phase01-40891223587-<clip>`, containing `data/` (exact prepared inputs and selected outputs), `repo/cache/` (responses and cumulative ledger), `repo/RESULTS.md`, and `bundle.json` with the original data root. Download completed clips promptly to `%LOCALAPPDATA%/kimo/bench/remote/40891223587/<clip>`.
- Earlier run `40890534861` failed workflow parsing. `40890736929` was cancelled during media preparation; its record steps never ran. Do not count either as a baseline.

## Budget and access

The user explicitly approved **USD 5 additional** AI spending in this chat. `cache/spend.json` records an aggregate reservation cap of **USD 5.49**, retaining the interrupted legacy run’s USD 0.49 reservation. The root checkout ledger does not yet include this active cloud run. Never start another paid batch from that stale ledger or reset the counter. Reservations are upper bounds, not verified billing. Record batches must remain sequential and seed the latest completed cloud ledger/cache.

GitHub’s connector lacks workflow dispatch. Existing Git credentials work through this local helper (no token is printed or written):

```powershell
node "$env:LOCALAPPDATA/kimo/bench/control-gh.mjs" run view 40891223587 --json status,conclusion,jobs
node "$env:LOCALAPPDATA/kimo/bench/control-gh.mjs" api repos/naman-sharma12345/kimoapp/actions/runs/40891223587/artifacts
node "$env:LOCALAPPDATA/kimo/bench/control-gh.mjs" run download 40891223587 --name phase01-40891223587-TH-1 --dir "$env:LOCALAPPDATA/kimo/bench/remote/40891223587/TH-1"
```

The helper supports ordinary `gh` arguments and sets the repository/account from saved Git credentials. Do not expose credentials. Running-job log downloads return 404; the temporary unsigned browser view also requires sign-in to read logs. That tab was closed. Prefer API step/artifact status and completed-job logs rather than repeatedly trying those unavailable log surfaces.

## Finish the work

1. Collect the first three clip artifacts, inspect their `failure.json`, `run.json`, metrics and real ops, and preserve all genuine response entries. Merge caches without deleting the seven old v1 entries. The latest record artifact holds the most current cumulative ledger.
2. After the first record job finishes, dispatch remaining `VLOG-1,POD-1,MUSIC-1` in record mode, seeding the latest first-job artifact. Use the same baseline label and the authorized cap. Both aspects are supported; POD-1’s specified primary case is landscape. Keep the paid budget sequential even though replay jobs can run concurrently.
3. Dispatch cache-only replay jobs with a new label such as `v0.3.2-replay`, one clip per job if useful. Seed each from that clip’s original record artifact so the exact prepared source bytes survive across machines. A cache miss must fail without paid fallback; diagnose genuine volatile request fields or cache defects rather than fabricating responses. Record zero requests, cache completeness, source hashes and output hashes. Replays may reveal nondeterminism; document it honestly.
4. The current workflow also supports `mode=analyze`: seed a record artifact, retain its original label, and recompute metrics/reviews without editing or paid requests. `restore-run.ps1` writes the old root marker; `run.mjs --analyze-existing` resolves the downloaded final/project locally and relocates source paths in memory. Use the same measurement code for all final rows. The original active run predates the newer duck-envelope estimate and unknown-caption-geometry handling, so its scores need uniform remeasurement. Keep original video/project bytes and provenance.
5. Open actual `sheet.jpg` and ten-sample first-second `hook.jpg` images with vision, inspect the final audio transcript and ops, verify offline playback/seek, and write an honest **10–20 line critique per golden clip**. Do not reuse the five-second smoke as a golden baseline. Keep dataset substitutions and measurement limits visible. Bad scores are expected; Phase 1 measures them.
6. Complete `RESULTS.md`, `BASELINE.md` and the desktop Phase 01 section of `docs/PHASE_LOG.md`. Commit JSON caches and small evidence, keeping large media outside Git. Preserve attribution with shared artifacts. Download our artifacts and remove them only after dependent replay/record jobs have restored their seeds; never delete unrelated artifacts. Keep durable local copies first.
7. Run required validation, fetch/rebase `origin/main` before each normal push, push main without force and verify the remote head. Do not start Phase 2, tag a release or build an installer. Only then mark Phase 1 complete and disable the continuation heartbeat.

Manual workflow dispatch example (replace seed with the actual latest artifact):

```powershell
node "$env:LOCALAPPDATA/kimo/bench/control-gh.mjs" workflow run phase01-baseline.yml --ref main -f clips=VLOG-1,POD-1,MUSIC-1 -f mode=record -f aspect=both -f label=v0.3.2-baseline -f seed_run=40891223587 -f seed_artifact=phase01-40891223587-TUT-1
```

The standard runner is remote; no full edit is running locally. Resource/GPU changes do not yet establish sustained local responsiveness or perceptual quality on real footage. Keep those separate from Phase 1’s benchmark acceptance.

## Validation and continuation

All 39 desktop tests passed locally with bundled Windows FFmpeg, including a 1.2-second NVDEC/NVENC synthetic fixture. The new hook contact-sheet graph also ran successfully with that FFmpeg. GitHub’s desktop unit job passed on Windows/Linux after the portability changes. GitHub run `40891215691` passed the combined lint/typecheck/test/build step; broader web checks failed the landing bundle cap (166342 gzip bytes against 120000) and an alternate-export-checkbox browser timeout. No web product code is changed by the benchmark. Check the latest CI when finalizing.

Heartbeat `finish-phase-1-remote-benchmark` continues this task in the same chat every 15 minutes, quietly while nothing changes. It must be disabled when the requested phase is genuinely complete. Inspect its saved full fields before updating it; preserve fields the user did not ask to change.
