# First raw-candidate inspection

These are source-selection observations, not final before/after render critiques. Sources were acquired on hosted Windows in run `41086477761`, matched to published SHA1 when supplied, and SHA256-pinned in `candidates.json`. TH-1/TUT-1 were reinspected using those exact bytes in `41089581693`. Public-source attribution is below. Originals remain in those artifacts; large media is not committed.

The first contact-sheet harness applied its time limit after tiling. That bug is corrected with a trim before sampling: the current TH-1/TUT-1 sheets contain 12/15 samples from the requested 60/75 seconds, with unused cells black. Their ten-frame first-second sheets were also inspected. Small 640×360 previews played briefly and sought to three positions each in one owned headless Chrome instance, with no video/page errors or HTTP requests; the browser was closed afterward. This is not a full listening review or a final compositor render. Offline Whisper also detected speech; compact audio summaries are retained while complete word timings remain in the artifact/cache.

## TH-1: provisional single-camera interview

- Proposed interval: source 70–130 seconds; 1920×1080 source picture.
- The publisher description explicitly identifies an unedited single-camera recording.
- The corrected selected-interval cells show one consistent indoor camera position.
- The subject stays seated in a medium close-up with headroom.
- Face and hand motion are visible between source samples.
- The background is soft and mostly static; a whole-image motion score needs source compensation.
- A small publisher mark is already present in the lower right.
- The first-second sheet shows a hand lowering from the face; that opening gesture should not be mistaken for compositor motion.
- Source lighting and colour appear consistent in the inspected cells.
- Local Whisper returned 161 word-timing entries; this does not certify filler counts or complete intelligibility.
- Commons declares CC BY 3.0 but its external licence review is pending; resolve that before final adoption or use another verified source.
- Status: provisional candidate, not accepted golden data.

Evidence: [contact sheet](review/TH-1/candidate-sheet.jpg), [first second](review/TH-1/candidate-first-second.jpg), [original hashes and metadata](review/TH-1/provenance.json).

Playback: [seek screenshot](review/TH-1/playback-seek.png), [player checks](review/TH-1/playback-check.json), [ASR summary](review/TH-1/candidate-audio-summary.json). The preview is 60.026633 seconds; seeks at 2, 30 and 59 seconds decoded successfully.

## TUT-1: provisional screen capture with facecam

- Proposed interval: source 60–135 seconds; 1920×1080 source picture.
- The official Blender Studio page identifies the lesson as free and CC BY 4.0.
- A facecam is actually visible in the lower-right corner.
- The screen shows a Blender viewport, side controls and timeline.
- Cursor movement and changing controls appear in the relevant sampled cells.
- The viewport remains largely static for substantial stretches.
- The facecam contributes continuous small subject motion but occupies little of the overall frame.
- A portrait centre crop would lose the facecam and side controls; final framing needs actual review.
- No large added narration captions appear in the inspected source cells.
- The inspected first-second frames show face motion with the same screen arrangement.
- Local Whisper returned 259 word-timing entries; coarse still sampling and brief playback do not certify every pause or exclude an edit between samples.
- Status: provisional candidate; raw continuity, audio and source-match measurability remain pending.

Evidence: [contact sheet](review/TUT-1/candidate-sheet.jpg), [first second](review/TUT-1/candidate-first-second.jpg), [original hashes and metadata](review/TUT-1/provenance.json).

Playback: [seek screenshot](review/TUT-1/playback-seek.png), [player checks](review/TUT-1/playback-check.json), [ASR summary](review/TUT-1/candidate-audio-summary.json). The preview is 75 seconds; seeks at 2, 37 and 74 seconds decoded successfully.

## POD-1: rejected source

The ConversationEDU interview with Steve Wozniak is CC BY 3.0, but the sampled source switches between a two-person wide shot and a close-up. These are pre-existing camera edits. It fails the user's new raw-dataset requirement and must not be relabeled as raw or used for final acceptance. Keep its hash and inspection images to explain the rejection.

Evidence: [contact sheet](review/POD-1/candidate-sheet.jpg), [first second](review/POD-1/candidate-first-second.jpg), [original hashes and metadata](review/POD-1/provenance.json).

## Credits

TH-1: ProPublica, _Unedited: ProPublica Interviews President Biden, September 2023_, [source page](https://commons.wikimedia.org/wiki/File:Unedited-_ProPublica_Interviews_President_Biden,_September_2023.webm), [CC BY 3.0](https://creativecommons.org/licenses/by/3.0/). Inspection images are time samples, resized and tiled with timestamps. Test use does not imply endorsement.

TUT-1: Dillon Gu / Blender Studio, _Basics of Blender — Minecraft Animation Workshop_, [official lesson](https://studio.blender.org/training/minecraft-animation-workshop/5a85e79423b3640e67115ba1/), [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/). Inspection images are time samples, resized and tiled with timestamps.

Rejected POD-1: ConversationEDU, _Interview with Steve Wozniak_, [source page](https://commons.wikimedia.org/wiki/File:Interview_with_Steve_Wozniak.webm), [CC BY 3.0](https://creativecommons.org/licenses/by/3.0/). Inspection images are time samples, resized and tiled with timestamps.

## MUSIC-1: provisional continuous b-roll with independent bed

- Selected source interval is the first20seconds of the4K25Pexels wave shot.
- Actual selected contact sheet and ten first-second frames were inspected.
- Aerial camera movement follows waves breaking on a rocky shore.
- Continuous wave evolution is visible; inspected samples do not show a montage.
- The source has no audio stream, independently confirmed by ffprobe.
- A separately acquired composer-published CC0 track is available as a real audio stem.
- The selected Ending.wav is44.651179seconds at44.1kHz stereo.
- Source video, composer archive and chosen track SHA256 hashes are pinned.
- Brief preview playback and seeks at2,10and19seconds decoded without browser errors.
- No preview HTTP requests were made; the owned browser was closed.
- The inspected source preview is silent and does not establish music timing or mix quality.
- Physical aerial motion must not be counted as compositor-induced camera jitter.
- Final soundtrack fixture, native comparison and full-output review remain pending.

Evidence: [source sheet](review/MUSIC-1/candidate-sheet.jpg), [first second](review/MUSIC-1/candidate-first-second.jpg), [source provenance](review/MUSIC-1/provenance.json), [music provenance](review/MUSIC-1/music-provenance.json), [playback proof](review/MUSIC-1/playback-check.json). Full credits are in [CREDITS.md](CREDITS.md).

## Cinestudy source-pack inspection

The user approved the publisher's custom permission with full credits and hashtags. Actual350-second prefix sheets and first-second frames were inspected for HOST and INTERVIEW. HOST contains outdoor handheld two-host selfie footage; foreground face placement and physical motion vary. INTERVIEW contains genuine microphone interviews and camera reframing, plus walkaway, exterior and chapel context shots. Neither prefix is itself a golden case. Selected TH-2/POD-1/VLOG-1 intervals require dense preview/audio review before acceptance. Files are public Drive playback renditions, not camera-original containers. Dedicated BROLL remains unavailable after two HTTP429 responses; no further retry or access bypass is planned.

Evidence: [host sheet](review/CINE-HOST/candidate-sheet.jpg), [host first second](review/CINE-HOST/candidate-first-second.jpg), [interview sheet](review/CINE-INTERVIEW/candidate-sheet.jpg), [interview first second](review/CINE-INTERVIEW/candidate-first-second.jpg). The full required [credits and hashtags](CREDITS.md) apply to these inspection derivatives as well.
