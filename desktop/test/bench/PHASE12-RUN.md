# Phase 12 durable run state

User requested Phase 12 and a push on 2 November 2026. Scope includes v0.4.0
release from the supplied brief. Implement and verify before publishing. No paid
AI/SAM calls; never change the fully reserved historical USD 5.49 ledger. Replay
misses fail. Full media and installer work runs only on standard GitHub runners,
not this user's PC. Local tests use tiny synthetic media. Do not edit the engine
repository or change web behaviour. Fetch/rebase before every normal push.

Starting main: dd38f427e7a903ab58bfceddb3443b6500d322e1 (Phase 11).
Current implementation is uncommitted: bounded critical gates/retry, true preview
render until export, software master, input normalization, process-tree stop,
checkpoint resume (preserves edit call allowance), partial cache recovery, cache
size/clean UI, bounded analysis pool. New release-quality tests and expanded tiny
Studio test cover these. Targeted tests are in progress; no release/CI dispatch yet.

Remaining: hosted robustness matrix, strict replay smoke and report artifacts,
manual full benchmark with >3 point regression gate, four-core performance run,
docs/GIF/credited before-after/FINAL, version+lock bump, all checks, build/install
smoke and release with verified installer/blockmap/latest.yml hashes. Use honest
unknowns; do not relabel the old Phase 2 identical-EDL comparison as v0.4.0 AI
editorial improvement. Existing prepared raw bytes are in run 41099499282 (six
raw-v2-prepared-* artifacts), still available as checked. Latest published release
is v0.3.2. CLI helper outside the repo at LOCALAPPDATA/kimo/bench/control-gh.mjs
uses saved Git credentials without printing them and supports workflow dispatch.
GitHub connector has no dispatch/publish capability, so CLI is needed for those.
