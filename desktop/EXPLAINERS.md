# Explainers: the screen shows what is said (Phase 7)

kimo's visual director listens to the transcript and puts a diagram, number, picture or small gag on screen exactly when the speaker says the thing it explains. Everything renders on the PC through the same graphics kit as Phase 6.

## Pipeline

1. **Cues** (`explain/detect.mjs`): enumerations ("three reasons… first… second…"), numbers with units and currencies (₹, lakh/crore, %), comparisons, steps, dates, definitions, places, quotes, questions, code, humour and serious moments, in English and Hindi/Hinglish. Works without AI.
2. **Director** (`explain/director.mjs`): with AI access, a cached two-pass model decision through the locked proxy (pass 1 explains each cue, pass 2 picks among up to 3 asset candidates), at most 4 model calls per video. Without AI it runs **cue-only**: deterministic families from the cues, icon cards instead of fetched pictures.
3. **Validation** (`explain/validate.mjs`): density caps, emoji caps, kind variety, the per-kind switches and the licence-safe switch.
4. **Timing** (`explain/timing.mjs`): each item appears 2 frames before its word (±1 frame), on its entry frame and not one frame later.
5. **Layout** (`explain/layout.mjs`, `panel.mjs`): side / top / overlay / full / pip. The camera makes room (reframe keys) so the face stays clear; full-screen time is capped at 25 % of the runtime; long full-screen beats become pip with a speaker bubble. Phase 6 graphics yield to explainers.
6. **EDL** (`explain/plan.mjs`): `ex_*` graphic overlays, bubbles and rings, SFX on their own bus under the voice, captions skip their accent while a beat is up, attributions and metrics in `edl.explain`.

## Families

list, flow, timeline, stat, chart (bar/line), compare, definition, map (bundled offline gazetteer), icon / brand, name card, code, UI callout, quote, metaphor, question, image, meme (own formats, no copyrighted templates), post card, pip ring. Previews: `explain/previews/kimo-16x9.png` and `kimo-9x16.png` (synthetic scene, soft canvas, not shipped), regenerated with `node test/bench/explain-previews.mjs`.

## Assets and licences

- Sources: kimo's own library, Openverse and Wikimedia Commons (keyless, called directly), screenshots of public URLs in a sandboxed host, opt-in AI images. Only CC0, public domain and CC BY are accepted; CC BY assets get an on-screen credit.
- A 2 GB LRU cache and a per-video search cap (25) keep it bounded; a re-run hits the cache.
- Every saved export gets an `ATTRIBUTIONS.txt` beside it and the credits in the YouTube description.
- **Licence-safe only** (Home switch): nothing fetched, no screenshots, no AI images; only kimo's own library and drawn families.

## Sound kit

Ticks, pops, whooshes and gags (record scratch, boing, ding, bass drop, error buzz) are synthesised with FFmpeg on the PC (kimo's own sounds, CC0). At least 0.5 s apart; gags win over ticks; levels sit under the voice.

## Controls

- **Home → explain with visuals** (AI edits): on/off, density light / normal / rich, per-kind switches (diagrams, images, memes, emoji, screenshots, b-roll, sound gags, AI images) and licence-safe only. Saved per project.
- **Chat**: "no memes", "make that a timeline", "show a chart of the revenue" and similar become plan patches; a user-asked visual takes its moment.
- **Timeline**: explainer beats are blocks on the GFX track with a tick for each item. Selecting one opens the beat editor: title, items (one a line, they stay on their words), text for single-text beats, shape (list / flow / timeline), layout, delete (takes the bubble and ring with it) and **regenerate this part** (re-runs the director on that range; needs AI access).

## Checks

- Unit tests (`test/explain.test.mjs`): sync to the word on rendered frames, pip compositing with real FFmpeg, layout/face clearance, licence-filtered and cached sources (mocked network), sound kit, director with a mocked model and cache, beats → EDL, chat patches and timeline edits, and the public EDL fields.
- Windows Electron smoke: `explain/selftest.mjs` renders the families through the app's active graphics backend, checks determinism and entry-frame sync, synthesises the sound kit and round-trips a beat edit; it is part of `report.ok`.

## Known gaps

See `test/bench/NOTES.md` (Phase 7): no keyed sources (GIPHY, Tenor, Pexels, Pixabay), Openverse/Wikimedia called directly, crowd sounds mapped to the nearest synth sound, no music dip under beats, regenerate needs AI access, UI callouts need a target box. Real-footage numbers (EXPLAIN-1 bench) are deferred.
