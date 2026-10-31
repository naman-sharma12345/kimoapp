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

Before videos are native exports of the identical saved offline-control projects, with no paid calls. Evidence is under baselines/raw-v2-before/ID/ASPECT with full per-case credit sidecars. Actual native and initial app sheets plus first-second frames were inspected for the cases below. The final app render uses numeric native font weight and measurement-v3 corrections; its hashes/visual checks are recorded separately when collected. Original natural footage is preserved, including captured camera movement and static screen spans. Native TUT-1/VLOG-1/POD-1 landscape exports hit the1800-second cap; their failure JSON is retained instead of inventing missing comparisons.

### TH-1 indoor interview

1. Both native aspects start on the same downcast gaze and hand-to-face gesture.
2. This is a continuous source selection, without an independently chosen editorial hook.
3. Native Montserrat captions are heavy, outlined and immediately visible.
4. Initial app captions were visibly thinner; the numeric900weight mapping has been corrected for final verification.
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
14. The native landscape export hit the1800-second cap, so its full before image/score comparison is unavailable.
15. The saved input still includes facecam and full UI; the cropped result is an editorial limitation of the control.
16. These images do not establish complete narration intelligibility or listening quality.

### VLOG-1 raw event excerpts

1. This control concatenates six declared10-second excerpts from two raw camera rolls.
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
14. The native landscape export exceeded the1800-second cap; no missing before score is supplied.
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
14. The native landscape reference timed out after1800seconds and remains unavailable.
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
