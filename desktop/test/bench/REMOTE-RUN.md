# Phase 2 continuation state

Updated 30 October 2026. User requested completing desktop Phase 2 on main, normal push only. Phase 1 remains incomplete. Do not start a later phase or build a release. User requires a new raw dataset and has no footage. User explicitly approved Cinestudy with all credits and hashtags; no further permission question is pending.

## Current code and acceptance

Latest verified pushed main: 574a672becd5f9b3b8bf84da22c8edf51463d9d3. Raw preparation/comparison is running in41099499282 (dbf54a023c23ffe10c73875f8b8cafdf65ee8648). First TH-1/TH-2/TUT-1 prepared artifacts succeeded. Current follow-up adds tested source-referenced camera measurement version2 and exact-artifact reuse/reanalysis. Final Phase 2 acceptance is still pending all six raw cases, both aspects, actual output reviews, measured frame identity/jitter and score comparison. Do not turn unavailable metrics into a pass.

75 desktop tests pass locally after3 independent source-registration checks; previous72 desktop tests pass on hosted Windows AND Linux (41086873409, 41089576804, 41091053438); real Electron smoke 41089587650 passes. Required combined root lint/typecheck/test/build step passes; existing subsequent web bundle-budget/browser gates fail independently. Synthetic decoded camera residual is 0.2424 px at 1080 short-side normalization, versus 2.1439 before correcting perspective's one-based input counter. This is a controlled calibration, not a natural-footage result. Lean EDL IPC is 11468 bytes versus 207376 for the true TH-1 project with identical timeline.

All picture modes use app-owned EDL/compose; native renderer is benchmark-only. RGB ASS drawing plus explicit BT.709 4:4:4 conversion fixes FFmpeg 6 matrix/alpha issues. No engine binary/repo or web runtime changes. Built desktop renderer is committed. Avoid formatting all of sam.mjs.

## Budget, preserved source and local lag

No paid AI calls: total authorized reservation cap USD 5.49 is fully reserved. Root cache/spend.json conservatively includes USD 3.2899157 unrecovered TUT spend on top of USD 2.2000843 confirmed TH-2 reservations. Never reset, independently duplicate or raise this allowance. All Phase 2 comparisons prohibit fetch and assert byte-identical ledger. Source acquisition and hosted local Whisper make no paid calls.

Preserved original seed run 41086877223 succeeded: phase01-41086877223-TH-1 id12991034101 and TH-2 id12991921860 expire 6 November at 16:06 UTC. Use this instead of expiring 40891223587. Exact local originals are at LocalAppData/kimo/bench/remote/40891223587/{TH-1,TH-2}. Old packager omitted some SAM-derived media; never substitute originals silently. Old Phase 1 heartbeat was deleted; do not recreate it unasked.

No full-footage renders or analysis on this PC. Standard GitHub-hosted Windows only; bounded workers. Local checks may use tiny synthetic fixtures and small already-created previews/stills. Keep large generated files outside OneDrive. Own headless Chrome preview checks must close the browser finally. Do not resume native physical computer control after the earlier Escape.

## Raw source acquisition (all large files remain hosted)

- TH-1 and TUT-1 exact original bytes: initial 41086477761, corrected interval inspection 41089581693. TH-1 id12993796026, TUT-1 id12994400114. Actual corrected sheets and first second inspected, small previews briefly played and sought at three positions, proof committed. TH-1 unedited ProPublica indoor source 70–130s; Commons CC BY3.0 external review pending. TUT-1 official free Blender CC BY4.0 source 60–135s with actual facecam lower right. Screen is largely static, portrait crop loses controls/facecam.
- ConversationEDU POD candidate is rejected due to baked multicamera cuts; keep its rejection evidence.
- MUSIC-1 source acquisition 41091058004, artifact12994870635. Pexels Michal Marek continuous 4K25 wave shot, source has no audio. Separate CC0 Juhani Junkala Ending.wav bed; video/ZIP/track hashes pinned. Actual sheet/first second/brief seek playback inspected. No mix accepted yet. Evidence under raw-v2/review/MUSIC-1.
- User-approved Cinestudy source packs acquired in 41093785376: CINE-HOST id12996075664, CINE-INTERVIEW id12994239644. Anonymous public Drive playback renditions capped at1080p, stream-copied 0–360s prefixes; NOT multi-GB camera-original containers. Exact SHA256 pinned, actual 350s sheets and first-second frames inspected. Full publisher credits plus #CINESTUDY #SONNYBOO #SABOROSS must accompany every derived clip/output sidecar.
- YouTube route was sign-in blocked in41093077452; stopped, no cookies/accounts/proxy bypass. Public Drive is separately publisher-authorized.
- Dedicated CINE-BROLL returned HTTP429 in41093785376 and one cooldown retry41096384912. Both failure artifacts are credits-only, no media. STOP further retries and do not bypass. Use acquired raw camera-roll cutaways or another authorized source.

## Selected raw-v2 preparation/comparison

New raw-v2/clips.json stages six selections; do not overwrite version1 clips/clips.json or paid-cache namespace. They remain pending exact selected-preview review:
TH-1 70+60; TH-2 host270+45; TUT-1 60+75; POD-1 interview80+60; MUSIC-1 waves0+20 plus separate bed; VLOG-1 six 10-second excerpts: host270, interview80,230,250,260,330. Vlog files are explicitly separate prepared shot excerpts from two event camera rolls, not six independent camera originals or a split finished montage. Check actual continuity and boundaries before acceptance; dedicated b-roll was unavailable.

prepare-raw.mjs requires standard hosted runner, verifies source hashes, preserves source fps, prepares 1080p H264 CRF18 /48k AAC, stores hashes/metadata/word timings, source previews, sheets/first-second and credits. raw-compositor.yml prepares once, reuses exact artifact bytes and runs phase02.mjs with BENCH_DATASET=raw-v2; namespace out/phase02-raw-v2. MUSIC builds a declared manual soundtrack fixture through actual MCP import/add_clip/finish_audio/save_project then runEdit manual. Other cases use offline captions controls, NOT missing Phase1 AI replays. Native references use the identical saved project with30minute cap. Missing native results remain unavailable.

## Latest genuine saved-AI diagnostic

41089587650 completed genuine TH-1 landscape recomposition, zeroAI calls. Small evidence id12995460233 downloaded fully to LocalAppData/kimo/bench/remote/41089587650/real-AI-TH-1-evidence/TH-1-16x9. Full artifact12995185575. Actual before/after sheets and first second inspected. Restored black hook background; hook text remains tiny. Existing documentary edits, lower-third overlap and filler remain source/editorial limitations.
Uniform current diagnostic scores before79.7/after80.3; raw match coverage .711/.691, repeats129/139, skips85/94, whole-image jitter .11/.89. These do NOT pass acceptance; source editing/grades/static footage confound matching. Original before export may predate saved project modifications: cannot claim compositor-only causal score gain from it. New raw comparisons export both from the same saved project.

## Helpers and remaining work

GitHub plugin has workflow jobs/artifacts/log tools. CLI helper LocalAppData/kimo/bench/control-gh.mjs supports dispatch/download using credentials only in memory; never print secrets/signed URLs. extract-evidence-gh.mjs selects small JSON/JPG and candidate previews; extract-source-evidence-gh.mjs excludes large350s previews. Both verify ZIP CRC and SHA manifests. download-archive-gh.mjs resumes4MiB hash-checked chunks and verifies GitHub final archive SHA, below-normal priority. Completed old full archives12965704871/12966980298/12967150616 retained; POD12968304767 partial, no active downloader. Old full controls41027923346 all six/both aspects are legacy diagnostic only. Corrected first-three41036577331 and quick41037133662 evidence also preserved.

Next: collect run41099499282 prepared/comparison artifacts; source-selected previews and output reviews are still required. After the current version2 measurement is pushed, remeasure both sides from the exact artifacts using prepared_run=41099499282 and analyze_run=41099499282. collect exact prepared hashes, selected source previews and all output evidence promptly. Inspect real contact sheets and first-second frames; write honest10–20line critiques per clip, do playback checks without claiming full listening from stills. Improve measurement only with independent meaningful tests, never loosen thresholds to make green. Whole-image jitter confounds natural capture motion; static frame identity can be unavailable. Complete RESULTS.md, BASELINE.md, docs/PHASE_LOG.md honestly. Fetch/rebase origin/main before every normal push, verify remote SHA, noforce. Do not declare complete while mandatory acceptance remains unmeasured.
