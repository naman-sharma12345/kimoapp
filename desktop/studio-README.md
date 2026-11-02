# Creator Studio

Creator projects expose saved decisions in Home and Studio. Earlier projects keep
the existing viewer, chat, captions-only and SAM paths; explicitly re-run an old
project to create a creator plan. No project is silently migrated.

## Controls

- Home: nine template cards, aspect/caption overrides, auto/30/45/60/full length,
  look and music on/off/own file. Reset pills remove individual overrides. Only
  the selected preview plays; it pauses when hidden or reduced motion is set.
- Live feed: ten collapsible stages, operation summaries, render progress,
  critic findings and creator score. Score details show reasons and targets;
  unknown measurements remain unavailable. Fixture scores are not benchmark results.
- Timeline: V1, BROLL, GFX, CAP, VOICE, MUSIC and SFX always have lanes. Video hide
  and solo affect picture; audio mute and solo affect sound. V1/BROLL mute also
  mutes linked audio. Audio hide hides blocks without muting playback. Caption/
  graphic mute is disabled because those tracks have no audio.
- Camera diamonds drag or open framing/time controls. Captions expose text, style
  and word accents. Graphics/SFX support drag, delete and Ctrl+D duplicate;
  numeric time controls provide a keyboard alternative. Hatched pause markers
  restore adjacent source footage and linked voice, shifting downstream timing.
  A marker shared by several removals opens a chooser.
- Edit, Captions, Sound, Look, Export, Quality and YouTube pack share the inspector.
  Gain sliders audition retained dry stems through Web Audio and commit a mastered
  remix. Eight music tracks have separate play/select actions. Look has a
  synchronized original/output split. Before/after uses the previous delivery
  after an edit, otherwise the original source.
- Space, J/K/L, source-frame arrows, Shift+arrows (one second), C (caption), M
  (music), Ctrl+Z/Ctrl+Shift+Z, Ctrl+E (export) and ? work outside text inputs.

## Decisions, history and work selection

`studio:patch` is registered by `studio-ipc.mjs`, the entry point exercised by the
contract tests. Commands cover track, camera, caption, block, restore, edit,
template, captions, levels, music, look, undo, redo and regenerate. Local commands
validate fields/ranges, clone before mutation and validate the resulting EDL.
History persists up to 20 complete EDL snapshots; new edits discard the redo
branch. An inspector template change preserves canvas/story. Home template
selection resets creation overrides to that template's defaults.

Manual overrides retain source-content anchors. Generated IDs can change when a
hook is replaced; an edit follows matching source content or reports a visible
warning if its target was removed/rechunked. Old caption wording is never blindly
applied to another sentence. Pause restoration requires the original source
boundaries to remain adjacent rather than inserting footage before a new hook.

New hook and new b-roll picks are runtime AI actions using the existing AI access
gate and bounded planner ledger. They preserve a history baseline and append the
resulting EDL. Other named variations use local patches. Gain/caption/look/track/
history edits need no paid requests. The old benchmark allowance is untouched.

Content keys select retained base, overlay picture, dry stems and master passes.
Gain-only edits reuse stems, copy encoded picture and encode new AAC. Structural
sound changes rebuild audio; captions reuse the base composite. Camera, look and
story changes invalidate picture as needed. Actual base-render progress schedules
at most one small 360 px JPEG task at a time, no faster than every 500 ms. Slow
sources can produce previews less often; two-fps preview is not guaranteed.
Existing background worker limits still apply.

## Preview provenance

The eleven muted 3-second/12-fps WebMs are 10–21 KB each, below 400 KB. Nine are
template cards; two complete the eight-style caption gallery. The hash-verified
CC-BY-3.0 raw benchmark source is credited in Home, `THIRD_PARTY_NOTICES.md` and
`data/creator-previews.json`. Labels demonstrate styling, not dialogue or
endorsement. These previews do not demonstrate complete sound, b-roll or grading
behaviour. Full source footage is not bundled.

Rebuild from the existing raw source without downloading or calling AI:

```powershell
node desktop/test/bench/tools/creator-previews.mjs
node desktop/test/bench/tools/creator-previews.mjs --caption-only
```

The builder verifies source SHA-256 first. Its source records the raw-dataset
path and framing/caption parameters.

## Lightweight verification

```powershell
npm test --prefix desktop
npm run build:renderer --prefix desktop
node desktop/test/studio-ui.mjs
# Another terminal, while the fixture server is running:
node desktop/test/studio-ui-check.mjs
```

The browser fixture uses the real pure patch reducer behind a mock preload,
synthetic transcript/metrics, the credited preview and in-memory silent stems.
It makes no paid calls. The browser script captures 13 views at both 1440×900 and
1080×720 in `test/ui-shots/`, checks patches/history, keyboard caption edits,
gain commits, pause restoration, reduced motion and 4K document bounds. Native
OS playback/account/provider/installer behaviour is outside this fixture.

The actual 1.2-second FFmpeg regression verifies progressive preview delivery and
gain-only remix with identical encoded H264 picture. It is synthetic functional
coverage, not a natural-footage score, full benchmark or sustained CPU measurement.
Phase 12 adds installed hosted qualification separately from this fixture.

## Preview, failures and recovery

Creator edits now render at a 540-pixel short side using x264 ultrafast. The chip
`preview · full quality on export` identifies this delivery. Export queues the
full-resolution saved EDL with software x264 medium; it waits for completion
before copying the MP4. Preview and full-resolution pass caches are separate.

Critical repeats, jitter, encoded AAC true peak, caption safety, dead air and
first speech get one local repair per failing stage. A still-red result raises
an alert and stays visible in Quality. Missing evidence stays unverified. The
release UI fixture deliberately injects a red true-peak result to exercise that
state; its numbers are not a measurement of the sample media.

Interrupted creator projects retain the EDL and pass checkpoints. `resume edit`
continues matching saved work without resetting the planner allowance. Settings
shows cache size and `clean cache`; saved projects and input copies are kept.
The native job/tree stop and installed package checks run on hosted Windows.
