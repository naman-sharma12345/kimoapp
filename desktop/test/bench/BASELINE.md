# Visual baseline review

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
