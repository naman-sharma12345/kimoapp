kimo for Windows 0.3.1: smooth, gimbal-like camera moves and a cleaner text-behind look.

**Smooth camera (no more jitter)**
- The follow-reframe and punch-ins are cut with sub-pixel precision (bicubic, every frame its own exact float window) instead of whole/even-pixel crops that stepped 3-7 px at a time
- The subject path is smoothed like a gimbal: outlier filter, dead zone (the camera holds still while the subject moves a little), speed limit, and heavy zero-phase easing; the 12 fps track is interpolated with a smooth spline
- Punch-ins ease in and out (0.45 s) instead of jumping
- Videos keep the footage's own frame rate (a 24 fps clip is no longer put on a 30 fps canvas, which repeated every 4th frame), constant frame rate, no duplicated or dropped frames
- SAM-only edits take the picture frame for frame from the SAM render, with kimo's finished audio

**Text behind the subject**
- The title is placed from the subject's matte, so the head overlaps the lower part of the letters and the word stays readable
- Mask edges are softened in space and across neighbouring frames, so cut-out edges don't shimmer
- Big upscales from small footage get a light sharpen after the lanczos scale

**Measured**
- New *camera smoothness* check in the quality panel and the op log: residual shake in px per frame (at 1080 px) and repeated frames; a SAM render that shakes is re-rendered once with stronger smoothing

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
