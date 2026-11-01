# Creator planning, Phase 10

New AI edits use `creator-engine.mjs`, not the native tool-planning loop. Nine
versioned templates live in `data/templates`. The UI selects these; historical
style names are resolved in `templates.mjs`. Selecting a template also selects
its usual aspect in Home, while the format control remains available.

`planner.mjs` sends one structured task with the selected template, user note,
indexed transcript sentences/takes/fluency, source word anchors, clip metadata
and six seeked 360 px keyframes. Metadata-only descriptions say so explicitly;
there is no additional description-model call. Inputs exceeding the proxy text
limit fall back without silently truncating evidence. One invalid response gets
one repair attempt; a second invalid answer, proxy failure or 60-second timeout
uses a deterministic plan. The prompt and schema ship in the application.

`validate.mjs` implements only the JSON Schema subset used by the shipped
schema and checks sentence/clip IDs, word ranges, take groups, camera ranges,
all-dropped stories and unsupported numeric claims. This is structural and
partial semantic validation, not a factuality proof. The prompt also requires
grounded titles, quotes and claims. The model cannot supply commands, media
paths, renderer graphs or arbitrary keyframes.

`compile.mjs` turns the plan into the app's cut plan and EDL, then runs the existing
camera, b-roll, graphics, local explainer, caption, sound and colour compilers.
It resolves source words after cuts rather than guessing output word offsets.
Imported music and locked user colour settings survive follow-ups. Montage
sources are split on bundled music bars, with bounded action ramps/whips and
no captions by default. Silent or untranscribed sources remain usable without
inventing speech. Template densities, pause limits, energy/static limits,
caption grouping, music mood/duck level, SFX cap and look drive real stages.
Shared crop/safe-area/transition/duck/peak algorithms retain the earlier phases'
fixed limits; template JSON records those defaults rather than enabling model
control of arbitrary renderer internals.

## Calls, caching and costs

`PlanCalls` is the only new planner/critic transport. It has no automatic HTTP
retries. Each edit permits at most three total model requests and two requests
containing images. A visual planner request counts against both caps; therefore
a fresh visual plan usually leaves one critic call, while a cached plan can
leave two. Critic repairs stop after at most two iterations and earlier on a
cap, error, no valid progress, or the template score target with no high issue.

An estimated reservation is written **before** each request to a unique
`creator-budget-<edit>.json`, including failed/time-out requests. Text-only
requests reserve $0.01 and visual requests $0.03, with a $0.09 estimated
reservation cap. These are explicit UI estimates, **not provider prices or a
guaranteed billing ceiling**; the proxy does not return exact per-request bills.
No additional AI service, account or SDK is introduced. The existing proxy's
visual `pick`/`review` endpoints carry the versioned task contract. Their older
generic task instructions can produce incompatible responses; validation,
repair and deterministic fallback handle that case. Live provider adherence
has not been tested with paid calls in this phase.

Responses are content-addressed under `cache/creator-responses`. Replay with
`KIMO_CREATOR_REPLAY=1` fails on a cache miss, with no paid fallback. Existing
Phase 1 tool-response recordings are **not** creator-plan responses. The old
fully reserved USD 5.49 benchmark ledger is unchanged and is never consulted,
reset or duplicated by these tests. All development responses were local mocks.

## Rendering and follow-ups

`render.mjs` stores a colour/camera/b-roll base, a caption/graphic picture pass,
and separate audio stems/master. Content and source size/mtime dependencies
choose the required passes. Caption patches reuse the base and audio; music
patches reuse the picture; title-only metadata needs no picture encode. Missing
or changed dependencies force the appropriate rebuild. Baked bases bypass a
second colour grade. Muxing copies video; delivery uses the existing high-quality
hardware encoder with its CPU fallback and background worker limits.

Follow-up chat emits atomic, validated RFC 6902 add/remove/replace plan patches.
The common requests for smaller/larger captions, no music/captions, more zooms
and removing a named section are local, with zero model calls. Other requests
use one capped model call. Invalid/unavailable patches preserve the saved edit.
`plan.json`, `plan-history.json` (last 20 snapshots), the complete EDL and native
project persist beside the export. Studio offers `undo plan edit`; undo is
offline and the previous delivery supplies the before/after comparison. Older
projects need one explicit re-run to create a plan before plan-based chat;
their manual EDL, captions-only and SAM-only paths remain available.

## Critic and limits

`critic.mjs` reads the rendered master, with captions visible, at the opening
0/0.5/1/2 seconds, three cuts ± one frame, three large graphics and the end.
Short edits repeat clamped samples to retain a 12–16-cell contact sheet. Images
are sparse seeks, never a whole-footage vision decode. The critic returns at
most five issues with severities and small validated patches. Its visual
judgements do not replace measured metrics. Music duck sampling is bounded to
the first ten seconds. Existing audio loudness/master and deterministic EDL
caption/cadence checks use the Phase 1 scoring function and unchanged weights.

Source-referenced pixel jitter, frame identity/coverage and clip Delta E are
currently unavailable in this lightweight review. It does not substitute
whole-picture source motion, assume zero repeats, or use a still's clipping
count as a full-program measurement. Missing applicable values score zero.
Thus the runtime can finish an export with **unverified** creator acceptance;
it never invents a passing score to stop the loop. Whole-footage and creator
score benchmark gates remain deferred under the user's no-benchmark instruction.

Run `npm run test:planner --prefix desktop`. It covers validation, one repair,
fallback, timeout/caps/durable reservation, atomic patches, network-free replay
for six **labelled synthetic** golden-ID fixtures, and a 1.2-second actual FFmpeg
render proving overlay-only/audio-only updates, AAC delivery and persistent
undo. These tests are not new recordings or benchmark results for the golden
footage. UI scripts use the existing Playwright/mock-preload harness; no packaged
installer or real account integration is claimed.
