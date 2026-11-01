# Colour and finish — Phase 9

The desktop compositor owns colour. The compatible `auto_grade` tool is intercepted
by `picture-tools.mjs`; it configures this stage without calling the native grader.
User-picked settings are locked against planner overrides and survive manual edits
and follow-ups. No AI calls, new services or runtime libraries are introduced.

## Pipeline

1. `analyze.mjs` seeks approximately twelve frames per footage clip, decodes RGB
   at 480 pixels wide and skips black/white/fade-like samples. It measures luma
   percentiles, clipping, mid-tone/skin chroma, saturation and contrast. Low-saturation
   pixels excluding skin supply a bounded grey-world white-balance estimate.
   Low contrast, low saturation and a low white point mark `log_like` heuristically.
   Source signatures, clip range, colour metadata and cached face/mask inputs form
   the analysis cache key; there is no whole-file hashing or full-video decode.
2. Cached SAM person masks are read without making SAM calls. Otherwise a cached
   head box bounds the YCbCr skin classifier (Cb 77–127, Cr 133–173). Without a
   trustworthy region, skin analysis is explicitly unavailable. Expired mask/head
   coverage is not extrapolated. Source rotation is respected when sampling.
3. `lut.mjs` generates one red-fastest 33³ `.cube` per clip. The transform combines
   bounded white balance, a monotonic soft-toe/shoulder exposure curve, optional
   generic flat-profile contrast/saturation, shot matching and the selected look.
   Skin median targets roughly 46%; untracked mid-tones stay near their original
   exposure. A per-pixel skin highlight guard avoids washing out pale faces.
   Known screen recordings keep their exposure and white balance.
4. The longest usable A-roll clip is the reference. Other clips shift their
   sampled skin or mid-tone chroma/exposure toward it, with bounded changes and
   35% matching strength on b-roll. Predicted primary ΔE2000 values are reported
   with their basis. Different subjects/backgrounds are not calibrated colour
   targets; a small scene-average ΔE does not prove a good match.
5. Seven JSON looks live in `data/looks/`: clean, warm-creator, mkbhd-crisp,
   cinematic-teal-orange, vlog-bright, moody-doc and kimo. Lift/gamma/gain,
   contrast and hue-dependent saturation define their character. Skin receives
   40% of look strength and a soft hue guard around 123° ±8°. Teal/orange caps
   creative strength at 0.6. Zero overall strength is an identity LUT. Explicit
   existing primaries are folded into the same LUT; native grade graphs remain
   unused. These are restrained original looks, not third-party film emulations.
6. Tagged inputs become BT.709 float RGB. PQ/HLG have a generic Mobius SDR path;
   missing metadata defaults to BT.709. Tetrahedral `lut3d` applies the grade in
   float. The colour pass has one explicit full-to-limited conversion using zscale
   error diffusion. Existing ASS text passes retain their balanced RGB/YUV
   round-trips; the grade does not add another unbalanced range compression.
   **The existing perspective camera warp supports only 8-bit formats**, so this
   conversion is at that boundary, before the warp. This phase does not claim an
   end-to-end float camera compositor or recover source-clipped detail. Picture
   remains 4:4:4 through composition; existing delivery encoding subsamples to
   8-bit 4:2:0 with BT.709/limited tags.
7. After footage's last scale, adaptive unsharp is applied only at 1.3× or greater
   upscale, capped at the requested 0.4 amount. Downscaled 4K is not sharpened.
   Optional documentary/cinematic grain affects luma only, preserving alpha and
   chroma. The optional vignette blends a 20% PI/5 cosine falloff. Both default
   off. All finish work precedes captions, graphics and other overlays.

Analysis and LUTs live under the project's compose cache; durable measurements are
saved as `color/report.json` and on the complete saved EDL. The IPC model carries
only the colour control state. Workers reuse background priority, bounded output,
one-thread defaults, cancellation, operation timers and progress. Cached clips do
not repeat source sampling. CPU/GPU performance gains have not been benchmarked.

## Studio and assets

The export inspector includes a look selector, keyboard-operable strength slider,
grain/vignette switches and an explicit apply-and-render action. Controls reuse
existing components/tokens. The reference strip shows the source and full-strength
look, not an interactive preview of the current project's pixels.

Look parameters and generated LUTs are original CC0 data. Preview strips are
cropped/resized/graded derivatives of the existing TH-1 ProPublica fixture, retaining
CC BY 3.0 attribution; they are not represented as CC0. Sources, licensing and
changes are listed in `THIRD_PARTY_NOTICES.md`. The additional review stills retain
their original dataset credits, including Cinestudy's required full credits and
hashtags. No new footage was downloaded.

## Verification and limits

- `npm run test:color --prefix desktop`: independent CIEDE2000 pairs, identity and
  skin guards, clipping/soft levels, conservative mid-tones, screen preservation,
  explicit primaries, scale-dependent finish, cache, interception and a tiny chart
  through every actual LUT and both compositor strategies. The chart also checks
  Windows path escaping, the HDR graph, optional finish and delivery colour tags.
- `node desktop/test/audio-ui.mjs`, then `node desktop/test/color-ui-check.mjs`:
  existing browser bridge fixture checks selection, keyboard strength, preview
  loading and persistence. It does not certify the packaged Electron IPC path.
- `KIMO_FFMPEG=... node desktop/color/tools/previews.mjs`: regenerate the seven
  TH-1 UI strips and all six golden-case still rows from existing small contact
  sheets only. Outputs default outside OneDrive under LocalAppData/kimo/color-phase09.

Full golden-clip benchmarks remain deferred under the user's existing instruction.
Sparse stills and a sub-second synthetic fixture do not establish full-footage
ΔE2000 <4, clipping <0.5% everywhere, calibrated skin accuracy, temporal consistency,
camera-specific log conversion, HDR quality or sustained responsiveness. Full-strength
sampled stills passed the clipping check; reducing strength deliberately retains
more of any original source clipping. Spatial sharpening/grain can create additional
extremes, so the LUT report's clipping estimate is not final-output certification.

Evidence and honest visual notes: `test/bench/baselines/phase09-color/REVIEW.md`.
The existing FFmpeg filter implementation and the CIEDE2000 reference used to
check the math are linked there. No installer, release, paid call or next-phase
feature was produced.
