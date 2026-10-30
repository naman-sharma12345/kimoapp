# Phase 2 continuation state

Updated 30 October 2026 (India). The user explicitly requested Phase 2; this supersedes the earlier instruction to wait for Phase 1. Phase 1 remains incomplete and is not represented as complete.

## Preserved Phase 1 evidence and budget

Run 40891223587 ended cancelled. TH-1 and TH-2 record steps failed; both uploaded artifacts. TH-1 is downloaded under LocalAppData/kimo/bench/remote/40891223587/TH-1. TH-2 download is in progress at the same sibling path; retry if incomplete. Keep exact prepared media, response caches and original outputs. The old packager omitted SAM-derived media, so those native projects cannot be silently substituted with original inputs.

TH-1 artifact ledger reserves USD 1.3467694 cumulatively (30 network requests, count is a minimum). The TH-2 artifact is newer and must be collected before any more paid work. Root cache/spend.json is stale. The user authorized only USD 5 additional, aggregate reservation cap USD 5.49 including the old USD 0.49. Never reset or duplicate this allowance. No additional paid recordings are authorized beyond that total. Phase 2 validation makes zero network calls and checks the ledger stays byte-identical.

The old Phase 1 heartbeat was deleted when Phase 2 began. Do not restart it or dispatch paid batches automatically.

## Phase 2 implementation and checks

App-owned version-1 EDL, source-frame mapping, floating-point camera compositor, ASS text, separate audio, timeline IPC and runEdit routes are implemented. Tiny synthetic tests pass on bundled Windows FFmpeg: 59 tests, seven frame rates, 2x/0.5x, fractional cuts, A/B intermediate strategy equivalence, cancellation, quoted paths, tone seams and delivery frames. Full real-footage renders must run on standard GitHub-hosted Windows runners, not this PC. The upload master still prefers supported hardware encoding; picture composition itself uses bounded CPU workers.

Workflow phase02-compositor.yml runs all six prepared golden clips at both aspects, plus a real Electron smoke without installer/release. No AI/SAM network permitted. Captions-only editorial control (music uses non-AI SAM-mode route with no SAM request) is deliberately different from the incomplete Phase 1 AI edits. Optional native picture reference uses the identical saved project, benchmark only, with a 10-minute timeout. A failed native comparison stays an unavailable metric, never an invented score improvement.

After dispatch, record the actual run ID here. Collect artifacts promptly, inspect actual sheets/hook frames and metrics, fix any real failures, extend source-frame measurement where needed, and document limitations. Complete RESULTS.md and docs/PHASE_LOG.md honestly; do not tick unmeasured visual, jitter or score acceptance. Required root lint/typecheck/test/build run in normal push CI. Existing broader web bundle-cap/browser issues are outside this desktop change. Fetch/rebase origin/main before each normal push, never force, verify remote SHA. No release or next phase.

GitHub helper (uses saved credentials only in memory):

```powershell
node "$env:LOCALAPPDATA/kimo/bench/control-gh.mjs" workflow run phase02-compositor.yml --ref main
node "$env:LOCALAPPDATA/kimo/bench/control-gh.mjs" run list --workflow phase02-compositor.yml --limit 3
```
