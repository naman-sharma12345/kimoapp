# Camera language (Phase 4)

The frame keeps changing with intent: a jump cut becomes a framing change, a big word gets a push, a new section opens wide. The app's **camera director** (`camera.mjs`) writes camera keyframes into the EDL; the compositor samples them per output frame and renders them through the float-subpixel crop (`sam.mjs` `rectFilter`, Lanczos scale). There is no `zoompan` anywhere. kimo's `add_punch_ins` / `add_smart_punch` are no longer offered to the planner; `set_property` scale/x/y on the A-roll is overridden by the director.

## Framing vocabulary

| Name | Zoom vs. fit | Eye line (from top of crop) | Use |
|---|---|---|---|
| wide | 1.00 | ~38 % | section openers, context, calm beats |
| wide+ | 1.05 | ~37 % | the calm (energy 1–2) alternation partner of wide |
| medium | 1.15 (1.12–1.18) | 33–36 % | default talking |
| tight | 1.33 (1.28–1.38) | 30–33 % | emphasis, punchlines |
| extreme | 1.6 (1.5–1.7) | 30 % | at most two per minute, the biggest beat (energy 5) |

Head placement uses, in order: cached SAM person tracks for that exact file (never a new SAM call), a local motion heuristic (`camera-probe.mjs`: tiny grey frames, the moving head-sized blob above a body, gated so frame-wide motion is rejected), else frame centre with the eyes on the upper third. Medium never crops the hairline; tight may trim the forehead but the eyes stay at or below 28 % and the chin stays in frame (the zoom backs off if the head is too big). Gaze (head offset from the body centre) puts the face on a third with look room ahead; otherwise it is centred. A narrow crop from a wider source (9:16 from 16:9) follows the subject: `gimbalPath` with a 4 %-of-width dead zone and 18 %/s speed limit, then a zero-phase critically damped spring.

## Director

Inputs: the Phase 3 cut plan (A-roll clips by id, `needs_cover` / micro-jump forced joins, `screen_punch` clips), transcript words (clause boundaries, podcast speakers), judgment emphasis words and chapters, the style's energy (energetic 5; auto 5 vertical / 3 landscape; podcast and tutorial 4 vertical / 3 landscape; documentary 2; cinematic 1) and the head tracks.

- **Shots** are visible camera shots: cuts, b-roll exits (the A-roll comes back wide), chapter starts, podcast speaker changes. Framing is chosen per shot: energy 5 `medium → tight → medium → wide → tight`, 4 `medium → tight → medium → wide`, 3 `wide ↔ medium`, 1–2 `wide ↔ wide+`; never the same framing twice across a jump cut. A micro-jump join forced by Phase 3 always changes zoom by ≥ 0.1.
- **Emphasis**: a cubic push of +0.08 starting 0.6–1.2 s before the word, landing on its onset; at energy ≥ 4, numbers/punchlines/claims/contrasts snap to tight (or extreme) over 5 frames with expo-out and hold. Energy 3 pushes numbers and claims to tight.
- **Openers** (energy ≤ 3) breathe: a 1.5–3 s sine push of +0.04.
- **Static budget**: shorts 3 s, landscape 6 s. A longer static span gets a snap framing change (energy ≥ 4) or a slow push/pull at the latest clause boundary (comma, "and", "but", "so", Hindi "aur/lekin/par/toh") inside the budget.
- **Podcast**: the speaker's single after > 1.2 s of talk, the two-shot on overlaps and laughter, ≥ 1.5 s per shot, cuts anticipated 4 frames. Without separate person tracks the singles are the left/right halves of the two-shot.
- **Screen recordings** (Phase 3 `screen_punch`): the active region (changed-pixel box per second) gets a 10-frame cubic punch-in sized so it fills ~62 % of the frame, pans between regions and pulls back before the cut when there is room (the tutorial-reel move).
- **No motion across cuts**: keys reset at every cut and every move lands at least one frame before it; in-clip shot changes are hard `hold` steps. `motionAcrossCuts(edl)` checks the invariant.
- **micro_drift** (Perlin, 0.15 %, 0.2 Hz) only when the planner asks for it at energy ≤ 2; its high-frequency residual is far below 0.5 px (unit-tested).

## Sampling, smoothness and limits

Easing library: linear, sine-in-out, cubic-in-out, expo-out (and expo-in for zoom-throughs), back-out (graphics only; the camera maps it to a non-overshooting ease), and a critically damped spring. Keys are sampled per output frame (`t = n/fps`), zoom in log space, then converted to a float crop and soft-clamped to the source with a 2 % exponential band.

Upscale cap: the zoom is capped where the crop would fall below 0.75 × the output resolution (4K sources reach 2×, 1080p on 1080p ≈ 1.33×). Judgment call: when the fit itself is already below 0.75× (1080p on a 9:16 canvas, 720p sources), the cap floors at 1.25 so framing changes stay visible; tighter framings are limited there and a warning op ("tight punch limited: source is 1080p") is shown.

## Transitions, J/L-cuts and speed ramps

Cuts by default. Chapter starts get a whip (7 frames, horizontal motion blur, plus a `whoosh` marker on `edl.markers` for the sound phase; no SFX file is bundled) at energy ≥ 4 or a dip (12 frames) at energy ≤ 2. Zoom-through (8 frames) scales both sides with expo easing and adds a Gaussian (radial-ish) blur on its strongest frames; dip to white lifts the picture with a per-frame geq only on its own frames. Every b-roll entry and exit gets J/L-cut sound: the b-roll's own audio leads in and trails out by 8 frames with matching fades (when it has sound and handles). Planner `jcut`/`lcut` at a cut between two different cameras moves the picture cut and keeps the sound cut; same-speaker jump cuts keep sync.

Speed ramps are planner-requested on b-roll/action only (never speech): 1 → min → 1 with a sin² bell; the clip keeps its timeline length and consumes less source. When the source has fewer than 2× the canvas fps, the ramped range is interpolated once with `minterpolate=mi_mode=mci:mc_mode=aobmc:vsbmc=1` at an integer multiple of the source rate (original frames stay exact). Ramped clips lose their own sound.

## Planner tools

`camera_style(energy, pattern, micro_drift)`, `camera_emphasis(at|sentence+word, kind)`, `camera_hold(from, to)`, `transition(at, kind, color)`, `speed_ramp(clip, at, dur, min_speed)`. The deterministic director always runs; tools only override. Overrides and director inputs ride on `edit.edl.json` as `camera_plan` (follow-ups and manual re-renders re-run the director); `camera_report` holds counts and `framing_variety_30s`, `max_static_s` and `repeats_at_jumps`. Dense data (`follow`, words) stays off renderer IPC.

## Status

Implemented and unit-tested on synthetic fixtures (easing, log zoom, soft clamp, upscale cap, framing rules, the no-motion-across-cuts invariant, director patterns, budget, podcast, screen punches, follow, drift, ramps and transition nodes on real FFmpeg). Golden-clip bench numbers (framing variety, jitter, face-crop checks on TH-1/TH-2/POD-1/VLOG-1) and the energy-grid review video are deferred by Naman's instruction; nothing here claims them.
