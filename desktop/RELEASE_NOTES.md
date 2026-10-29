kimo for Windows 0.3.0: Meta SAM 3.1 (Segment Anything) inside kimo. Name a subject, and kimo tracks it through your clip.

**Subject tracking + smart reframe**
- SAM 3.1 tracks the main subject (a person by default, or anything you type: "dog", "skateboard", "red car")
- 9:16, 1:1 and 4:5 exports follow the subject with a smoothed, dead-zoned virtual camera instead of a centre crop
- Punch-in zooms centred on the subject (automatic, or placed by the AI editor)

**Background and cutout**
- Text behind the subject: big titles sit between the background and the person
- Background blur, solid colour or your own image, with the subject kept sharp
- Subject cutout as a transparent ProRes 4444 .mov

**Object blur**
- Blur every match for "face", "license plate", "logo" or any object you name

**In the editor**
- New *Subject effects · Meta SAM 3.1* panel: type an object, press *Show masks* to see SAM's masks on a frame, pick an effect, then run it alone (*SAM effect only*), before captions, or before a full AI edit
- The AI edit planner (Muse Spark) can call `sam_reframe`, `sam_text_behind`, `sam_background` and `sam_redact` itself
- Every SAM step shows live in the op log with timings (downscaled copy, tracking with progress, matte, render) and the preview updates after it
- Tracks are cached per clip and object, so trying another effect or text costs no new SAM call

**Privacy and cost**
- SAM features upload a downscaled copy (≤720p, no sound) of only the clip segment being processed to Meta through kimo's proxy, which deletes the upload afterwards. The rest of the clip and every render stay on your PC. No API key is in the app.
- Tracking-only uses 12 fps; masks follow the clip's frame rate (max 30 fps). One request covers up to 60 s.
