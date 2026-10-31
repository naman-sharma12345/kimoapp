# Visual baseline review

30 October 2026 update: **The user requires a new raw dataset for final benchmark acceptance and has no footage to supply.** Existing public clips and all their before/after outputs remain legacy evidence. Phase 1 cloud run `40891223587` saved failed TH-1 and TH-2 recordings before timing out during TUT-1. Both artifacts are preserved locally, with exact prepared media and genuine response caches. This does not complete the requested six-clip AI baseline. Phase 2's six old offline compositor controls completed in `41027923346`; they cannot satisfy the new dataset requirement. Inspect actual contact sheets and hook frames before adding critiques here.

## Preserved TH-1 AI output: both aspects

Inspected the actual one-second contact sheets and ten first-second frames from the saved final videos. Small evidence and original hashes: [portrait](baselines/cloud-before-TH-1/9x16/provenance.json), [landscape](baselines/cloud-before-TH-1/16x9/provenance.json). Source licence/attribution remains in [CREDITS.md](CREDITS.md). These are failed Phase 1 record outputs, not successful replay evidence or completed Phase 2 renders.

1. The portrait first second places the speaker against the right edge; the crop gives his gesture room while sacrificing comfortable head room.
2. The hook box appears by the 0.1-second sample and crosses his forehead/eyes. Fast appearance alone does not make this a good hook treatment.
3. The landscape opening keeps the full figure readable and uses a calmer composition than the portrait crop.
4. Large yellow/white word captions have strong contrast, but their changing colour and scale compete with the documentary footage.
5. Portrait captions sit around the torso/middle rather than a consistent lower safe area; the opening title makes that frame especially crowded.
6. The original green identification bar is cut off in the portrait crop around seconds 2–8. Reframing needs to account for existing on-source graphics.
7. The wide version also places new captions over the original identification bar, so this is not solely an aspect-ratio issue.
8. The cut to the bookcase interview around 12 seconds creates a clear scene change; it is stronger than adding another small punch to the outdoor shot.
9. Long bookcase spans still feel visually repetitive in the sampled sheet. The saved maximum static span is 9.31 seconds against the six-second target.
10. The book-cover insertion is relevant to the subject, but the licensed source is already edited; its presence is not proof that the planner found fresh b-roll.
11. The portrait sheet shows a ghosted cover/interview transition around 30 seconds. Single sampled images cannot establish whether its motion is smooth.
12. Portrait output has a black frame with surviving caption text near 37 seconds. Picture and caption bounds need to share an intentional end.
13. Empty cells below the landscape sheet's final row are sheet padding, not evidence that the 54.22-second video ends with that much black.
14. Historical matching reports 21/27 repeated frames with only 50.5%/37.9% coverage (portrait/wide); animated mappings were skipped. Uniform remeasurement is required before comparing current counts.
15. The wide caption near 40 seconds visibly includes “IT'S UM…”, while the old filler estimate is zero. That conflict needs audio review; it is not evidence of perfect filler removal.
16. Recorded loudness is -14/-14.2 LUFS and true peak -1.5/-1.4 dBTP. Those numbers do not establish listening quality, click removal or sound-design quality.

![Original portrait first-second samples](baselines/cloud-before-TH-1/9x16/hook.jpg)

![Original landscape first-second samples](baselines/cloud-before-TH-1/16x9/hook.jpg)

The six requested golden baselines are **pending**. The live TH-1 AI run and its replay were stopped to restore PC responsiveness. TH-2, TUT-1, VLOG-1, POD-1 and MUSIC-1 outputs were not rendered or visually reviewed; neither was the 16:9 set. Source-media substitutions are described in clips/clips.json and CREDITS.md. These are not checked acceptance boxes.

## Supplemental five-second smoke critique

This completed captions-only render predates resource/GPU changes. It is a technical/visual smoke check, not a creator benchmark replacement.

1. Whisper places speech onset at zero; this measures timing rather than the strength of the opening.
2. The opening portrait crop cuts off both speakers before the woman moves farther into frame.
3. There is no independently authored hook title; the early text is dialogue captioning.
4. Large uppercase captions are legible against the footage.
5. Captions sit in the lower third. The conservative text envelopes cross the reserved right-side Shorts region.
6. The widest visible lines extend into that right-side region; exact raster bounds still require a more precise detector.
7. Keyword yellow is present, but this is the existing engine style rather than the future creator caption system.
8. Caption placement is repetitive rather than editorially composed shot by shot.
9. The single wide framing has no deliberate medium/tight alternation.
10. There is no b-roll, lower third, callout or intentional sound-design event in this smoke.
11. Dialogue loudness is close to the upload target and true peak stays below -1 dBTP.
12. LRA is only 1.2 LU; this short dialogue sample cannot establish long-form sound quality.
13. The output extends 0.333 seconds beyond the five-second source; the sheet shows the dark tail.
14. That tail contributes clipped luma and a failed delivery gate.
15. Matched source pairs show zero repeats, but 93.7% coverage is insufficient to certify the entire output.
16. A 74.1 score must not be treated as approval: safe-area, framing and delivery failures remain.

Opening the local review confirmed video playback, timeline seeking, offline operation and the corrected mobile layout. Review media lives in out/scratch/bench-smoke; the small contact sheet and metrics are committed under baselines/smoke-v0.3.2.

No real-footage before/after critique of the resource controls or NVENC master is claimed. Full golden recordings now run remotely; they do not establish local sustained responsiveness or GPU perceptual-quality sign-off.

## Saved-AI TH-1 landscape recompose review (legacy diagnostic)

Actual contact sheets and ten first-second samples were inspected for both outputs from41089587650. [Before sheet](baselines/composed-real-AI-TH-1/before/sheet.jpg), [after sheet](baselines/composed-real-AI-TH-1/after/sheet.jpg), [before first second](baselines/composed-real-AI-TH-1/before/hook.jpg), [after first second](baselines/composed-real-AI-TH-1/after/hook.jpg). Source attribution remains in CREDITS.md.

1. The after output restores the native project's black hook-background rectangle.
2. It appears across the speaker's chest in the early sampled frames.
3. Hook lettering on that bar is very small and has poor practical legibility.
4. Restoring geometry does not fix the planner's hook typography.
5. Large body captions remain the most prominent new graphic treatment.
6. They still overlap the source's green identification bar.
7. Existing source edits include an outdoor interview, bookcase footage and book-cover imagery.
8. Their presence cannot be credited as newly chosen app b-roll.
9. The source's cover transition remains visible in both sheets.
10. The later interview spans still have little framing variation.
11. A visible caption contains filler wording despite the automatic zero-filler estimate.
12. The after delivery gate passes and measured clipped luma falls.
13. Frame matching has only about69–71%coverage; counted repeats are not full-footage certification.
14. Whole-picture motion values include source/overlay changes and do not isolate camera jitter.
15. Uniform version1 score79.7→80.3 is a diagnostic observation, not certified causal improvement.
16. The preserved failed recording leaves before-video/project-state pairing uncertain; the new raw comparison must export both sides from the same saved state.

No full listening review is inferred from these stills. These outputs remain legacy evidence and do not close the user's new-raw-dataset acceptance.

## Raw-v2 native before review (31 October 2026)

Before videos are native exports of the identical saved offline-control projects, with no paid calls. Evidence is under baselines/raw-v2-before/ID/ASPECT with full per-case credit sidecars. Actual native and initial app sheets plus first-second frames were inspected for the cases below. The final app render uses numeric native font weight and measurement-v3 corrections; its hashes/visual checks are recorded separately when collected. Original natural footage is preserved, including captured camera movement and static screen spans. Native TUT-1/VLOG-1/POD-1 landscape exports hit the 1800-second cap; their failure JSON is retained instead of inventing missing comparisons.

### TH-1 indoor interview

1. Both native aspects start on the same downcast gaze and hand-to-face gesture.
2. This is a continuous source selection, without an independently chosen editorial hook.
3. Native Montserrat captions are heavy, outlined and immediately visible.
4. Initial app captions were visibly thinner; the numeric weight 900 mapping has been corrected for final verification.
5. Both versions retain the same yellow active-word and green keyword treatments.
6. Portrait centre cropping pushes the speaker's face against the right edge.
7. Parts of the head and hand leave that portrait crop.
8. The landscape view retains comfortable surrounding context and the publisher mark.
9. The first-second caption progresses from individual words to a short dialogue group.
10. Caption lines sit across upper chest/low face depending on gesture and crop.
11. The sampled full minute keeps one framing, with no deliberate punch/b-roll variety.
12. Several pauses remain visible as caption-free spans; rendering does not remove dead air.
13. Some source content is nearly static, making downsampled frame identity ambiguous.
14. The old matcher therefore cannot certify complete zero-repeat coverage for this case.
15. Contact-sheet black padding after the final occupied row is not a black video tail.
16. Still inspection does not establish complete listening quality or every inter-frame transition.

### TH-2 outdoor walk-and-talk

1. The source opens on a fence, a passing fairgoer and a cropped host's shoulder.
2. Both native and initial app versions preserve that weak opening.
3. The foreground host enters a clear view around two seconds into the selection.
4. Portrait cropping is especially tight and sometimes cuts the host's face or cap.
5. Wide framing gives the moving camera and surrounding fair more context.
6. Large source camera dips/turns are visible around the middle and late selection.
7. They must not be labeled compositor-induced shake merely because whole-image motion is high.
8. Captions are visible from the first second with active yellow and keyword green.
9. In portrait they can cover the mouth/neck as the captured camera position changes.
10. Initial app letter weight was lighter than native; numeric native weight is preserved for the final render.
11. The same source angle changes and dialogue order remain in both versions.
12. This offline control does not add a new hook, b-roll choice or pacing cut.
13. The previous one-repeat result is an expected EOF hold caused by fractional-frame duration rounding; the corrected matcher now uses the actual source frame count.
14. H264/BT709/AAC/CFR/GOP properties were present; the earlier delivery failure came from the separate whole-content motion check.
15. Natural gestures and background movement make this more observable than the static tutorial.
16. Full audio listening is not inferred from the sampled sheets and first-second frames.

### TUT-1 screen tutorial

1. The native portrait view retains the central Blender viewport and cube.
2. The original lower-right facecam is outside this centre crop.
3. Most side controls are also removed, limiting instructional clarity.
4. The viewport remains almost unchanged for much of the selected interval.
5. The preferences panel appears in the later middle portion.
6. The first-second strip already contains large dialogue captions.
7. Captions contrast against the grey UI but cover useful viewport space.
8. Visible native captions include fillers such as “UM” and “UH”.
9. Source cube/view rotation becomes clearer near the end of the selection.
10. Those source changes should not be mistaken for new compositor punch-ins.
11. No independent hook title, callout or editing-cadence improvement is present in this offline control.
12. Static source frames make exact frame identity ambiguous after downsampling.
13. Barcode calibration remains separate evidence and cannot turn missing natural-frame coverage into a pass.
14. The native landscape export hit the 1800-second cap, so its full before image/score comparison is unavailable.
15. The saved input still includes facecam and full UI; the cropped result is an editorial limitation of the control.
16. These images do not establish complete narration intelligibility or listening quality.

### VLOG-1 raw event excerpts

1. This control concatenates six declared 10-second excerpts from two raw camera rolls.
2. It opens with the same awkward fence/shoulder view as the host source.
3. The first second includes active captions but no authored hook.
4. At roughly ten seconds it switches to the microphone interview.
5. The portrait crop often places people against opposite frame edges.
6. Some guest gestures and costume details are cut off.
7. Later input boundaries change the camera position and source context.
8. Around the forty-second area the view moves toward the timber building.
9. Chapel interiors and the costumed group provide real contextual footage.
10. The final excerpt visibly moves back toward foliage outside.
11. Exposure and colour vary with the captured outdoor/interior lighting.
12. Large native captions remain repetitive over these different source compositions.
13. Joins are benchmark preparation choices, not evidence of fresh AI story selection.
14. The initial native landscape export exceeded 1800 seconds; its full recovered reference now retains both participants and the building/chapel context.
15. Full Cinestudy credits and required hashtags accompany the evidence.
16. Sound transitions and complete listening quality are not judged from the stills.

### POD-1 two-person outdoor interview

1. The native portrait crop places the interviewer partly outside the left edge.
2. The guest is frequently outside or against the right edge.
3. Much of the centre is empty background between the participants.
4. The first caption is conversational filler, not a strong editorial hook.
5. The held microphone stays visible through many sampled cells.
6. Guest gestures enter the crop, but a comfortable two-person composition is lost.
7. Native captions are strongly outlined and visibly heavy.
8. Yellow active words and green keywords are present.
9. Some longer caption groups cross near the reserved portrait side region.
10. Source camera adjustments and passers-by remain visible.
11. There is no deliberate shot/reaction alternation in this control.
12. This is an outdoor podcast/documentary source, not a studio multicamera edit.
13. Its full-width prepared source contains both people; portrait framing is the limitation.
14. The initial native landscape reference timed out; the full retry preserves both speakers in landscape with much better spatial context than portrait.
15. A successful numeric delivery gate would not make that portrait composition good.
16. Complete dialogue listening and speaker attribution are not inferred from images.

### MUSIC-1 independent video and music stem

1. Both native aspects show the same continuous aerial wave/rock source.
2. The portrait crop concentrates on the central breaking wave and rock surface.
3. Landscape retains more coastline context and horizontal wave structure.
4. The first-second cells contain continuous foam movement.
5. Full sheets show recurring waves evolving across the selected twenty seconds.
6. There are no source dialogue captions or new text graphics.
7. No deliberate picture cut or punch sequence is authored in this control.
8. The source video is silent; audio comes from a separately imported CC0 composer stem.
9. This is a declared manual soundtrack fixture, not an AI music-match decision.
10. The native before exports completed in both aspects.
11. Aerial capture/wave motion is distinct from compositor-induced camera shake.
12. Bright foam and dark rocks provide useful colour/range stress.
13. Empty contact-sheet cells after the twentieth sample are layout padding.
14. Before/after loudness and timing are measured from each final audio stream.
15. These images do not establish subjective soundtrack fit or complete listening quality.
16. Pexels and composer attribution, licences and exact source/stem hashes are retained.

## Raw-v2 final app render review (31 October 2026)

These observations use the actual final contact sheets and ten first-second frames from current-code run `41189542616`, with small stripped previews briefly played muted and sought at three positions. They do not assert full listening quality or complete video playback. Exact metrics, output hashes and artifact proofs are retained with the after evidence. Static or ambiguous natural pictures remain unavailable for strict frame-identity acceptance even when the separate barcode companion passes.

### TH-2 final app: outdoor walk-and-talk

1. The actual final first second still opens on a passer-by, fence and part of the host's shoulder.
2. Portrait framing removes the host's face for most of that opening; a correct renderer cannot repair this saved editorial choice.
3. The host's face becomes clear around two seconds, then frequently presses against the portrait edges.
4. Landscape keeps more fairground context and allows the camera's movement more room.
5. The full sheet preserves the same location turns and dialogue order as the native reference.
6. Around seconds fourteen and eighteen the portrait captions cross the host's mouth or lower face.
7. Later source reframing sometimes leaves only part of the host's face inside portrait.
8. Final captions retain yellow active words and green keywords with black outlines.
9. The app's letter strokes remain visibly lighter than the native render despite preserving the numeric weight request; exact text raster parity is not established.
10. Caption groups, timing and first-second word reveal are present in both aspects.
11. The control adds no new hook title, story cut or alternate framing decision.
12. Both final aspects have zero observed repeats/skips at 99.907% natural frame-match coverage.
13. Source-referenced camera residuals are 0.00850/0.00873 px for portrait/landscape; captured handheld movement remains visible.
14. Both app delivery gates pass; uniform version 4 Creator Scores rise 78.3→78.6 and 72.6→73.6.
15. Both ten-second preview strips played and sought without media/page errors or HTTP requests; browsers were closed.
16. Those bounded muted checks do not establish full dialogue intelligibility, soundtrack quality or every natural frame transition.

### TUT-1 final app: Blender tutorial

1. The actual portrait sheet keeps the cube and central viewport but loses the source facecam.
2. Landscape preserves the full interface and the lower-right facecam throughout the sampled selection.
3. The first second begins mid-explanation, with word captions already appearing and no authored tutorial hook.
4. Most of the first forty-seven seconds show a largely unchanged cube and viewport.
5. The preferences window appears around seconds forty-eight to fifty-eight.
6. View/cube rotation becomes clearer over the closing ten seconds.
7. Those movements are source operations, not added camera punches or editing variety.
8. White/yellow/green captions are outlined and readable against the grey viewport.
9. Long landscape caption groups occupy much of the lower interface and compete with the facecam region.
10. Visible caption fillers such as “UM” and “UH” remain; this control does not perform a new editorial clean-up.
11. App strokes remain lighter than native; exact native variable-font rendering is not certified.
12. Natural frame matching covers only 8.00%/7.83% in portrait/landscape, so the 4/0 repeat candidates are not certified whole-video counts.
13. The independent saved-timeline barcode companions pass every delivered frame in both aspects; this remains separate from natural-picture matching.
14. Estimated source-referenced camera residuals are 0.00551/0.00360 px; Creator Score is 54.7 in both aspects.
15. The native portrait score is 54.5; native landscape timed out and no full before comparison is invented.
16. Both ten-second preview strips decode/play/seek without errors or HTTP; muted partial playback does not establish full narration quality.

### TH-1 final app: indoor interview

1. The actual first second keeps the speaker's downcast gaze and hand-to-face gesture.
2. This begins mid-dialogue and supplies no independently chosen hook title.
3. Portrait continues to cut the right side of the head and some gestures.
4. Landscape retains the body, background context and original publisher mark.
5. The dialogue caption reveal is already active during the opening gesture.
6. Yellow active words and green keywords remain visible on white outlined text.
7. App letter strokes still look lighter than the native variable-font raster; numeric weight preservation is not pixel-identical text rendering.
8. Portrait captions sometimes cross near the chin or upper chest, while landscape lines use much of the lower width.
9. The full sampled minute stays on the same angle without new punches, b-roll or cut-cadence decisions.
10. Caption-free spans and hesitations remain in this offline control.
11. Both final aspects have zero repeat/skip candidates, but only 64.72%/29.56% natural matching coverage; these are not certified whole-video zero counts.
12. Source-referenced residual jitter is 0.00853/0.00759 px with 99.94% camera-registration coverage.
13. Delivery passes in both final app aspects.
14. Uniform version 4 portrait Creator Score declines 63.5→62.9 while landscape rises 62.7→62.9; an across-the-board improvement is not claimed.
15. Both ten-second strips briefly play and seek without errors or HTTP; all owned browser processes close.
16. Complete dialogue listening and exact identity of visually static source frames remain outside those bounded visual checks.

### MUSIC-1 final app: waves with a separate music stem

1. Both actual final aspects show the same continuous wave/rock shot selected in the frozen inputs.
2. Portrait focuses on the central rock and breaking white foam; landscape retains more of the coastline.
3. The first-second frames show evolving foam and water, with no authored hook graphic.
4. Full sheets show recurrent waves across the twenty-second selection rather than an added edit sequence.
5. There are no new captions, titles, image inserts or deliberate picture cuts in this manual control.
6. The source video is silent; the output uses the separately imported CC0 composer stem.
7. This demonstrates the saved manual audio/picture route, not an AI music-selection decision.
8. Bright foam and dark rock remain visibly distinct in the sampled final images.
9. The overall view and source ordering agree with the native reference in both aspects.
10. The contact-sheet empty cells after the twentieth sample are layout padding.
11. Both app finals have zero observed repeats/skips, at 100% portrait and 98.40% landscape frame-match coverage.
12. Estimated source-referenced residuals are 0.00997/0.00974 px; the original aggregate coverage had a one-frame denominator error and is corrected from saved registration counts in the final report.
13. Both app delivery gates pass; measured audio is −14 LUFS and −1.5 dBTP.
14. Uniform scores rise 34.3→46.9 and 46.8→46.9; the native portrait's low matching confidence contributes to its conservative score.
15. Both ten-second strips play and seek without errors or HTTP; browsers close afterward.
16. Muted partial playback and loudness values do not certify complete soundtrack fit, listening quality or human perception of every transition.

### VLOG-1 final app: six raw event excerpts

1. The actual first second retains the host source's awkward fence, passer-by and cropped shoulder.
2. The first ten seconds become a close host view; there is no newly authored hook title.
3. At roughly ten seconds the selection switches to the outdoor microphone interview.
4. Portrait repeatedly pushes participants or gestures outside opposite frame edges.
5. Landscape keeps the two-person relationship and fairground surroundings much more clearly.
6. Around twenty and thirty seconds the prepared input boundaries change camera position and emphasis.
7. The later building/chapel approach supplies real context, followed by the costumed group inside.
8. The closing samples move back toward foliage, matching the frozen sixth input.
9. Exposure and colour vary with the original outdoor/interior lighting.
10. Captions retain active yellow and keyword green, with app strokes still lighter than native.
11. Some longer groups compete with costume/gesture details; technical smoothness does not establish good caption placement.
12. These joins are declared benchmark preparation choices from two camera rolls, not six independent originals or new AI story decisions.
13. Both final aspects have zero observed repeats/skips at 99.17% frame-match coverage; residuals are 0.00699/0.00748 px.
14. Both app delivery gates pass; portrait Creator Score rises 72.2→80.0 and the recovered landscape comparison rises 79.2→80.3.
15. Both ten-second strips briefly play and seek without errors or HTTP, and the browser closes.
16. Muted partial playback does not certify every join's sound quality, full intelligibility or complete human-perceived continuity.

### POD-1 final app: two-person outdoor interview

1. The actual opening portrait crop leaves the interviewer partly outside the left edge and the guest mostly beyond the right edge.
2. Empty background occupies much of the centre of that portrait composition.
3. Landscape preserves both speakers, their microphone and the fairground context.
4. The first-second captions begin with “YOU KNOW”, followed by the existing explanation, without a deliberate hook.
5. The full sheet shows the guest's costume, medals and gestures, but portrait loses many of those details.
6. Passers-by and captured camera adjustments remain in the background.
7. This is an outdoor conversation, not a studio multicamera podcast.
8. There is no new reaction-cut sequence or speaker-aware reframe in this offline control.
9. Large white/yellow/green caption groups remain readable, but their changing widths compete with bodies and hands.
10. Some sampled caption groups contain “UH” and other fillers; rendering does not clean the dialogue.
11. The app's native weight request is preserved, while letter strokes still look lighter than the engine's raster.
12. Both final aspects have zero observed repeats/skips at 99.79% frame-match coverage.
13. Source-referenced residuals are 0.00659/0.00660 px and both app delivery gates pass.
14. Portrait Creator Score rises 56.6→72.3; the recovered landscape comparison declines 73.0→72.3, so improvement is not claimed for every aspect.
15. Both short strips play and seek without media/page errors or HTTP, with owned browsers closed afterward.
16. These bounded muted checks do not establish complete dialogue intelligibility or subjective podcast editing quality.
