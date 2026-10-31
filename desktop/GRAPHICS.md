# Graphics, titles, callouts and b-roll (Phase 6)

kimo's motion-graphics kit is rendered by the app, not by the engine. Graphics are `graphic` overlays on the version-1 EDL; the compositor renders each one to a transparent clip and overlays it at its pixel box. B-roll is placed on the EDL as its own picture track. Rendering is deterministic and cached by content hash.

## Engine (`graphics/`)

| File | Role |
|---|---|
| `renderer.mjs` | Node side: themes, layout with the bundled fonts' metrics, frame rendering, the transparent-clip encoder |
| `host-electron.cjs` | the app's hidden offscreen `BrowserWindow` that loads `render.html` (registered by `main.cjs`) |
| `render.html`, `page.mjs` | the Chromium render page: loads the bundled fonts and emoji, draws frames at exact times |
| `core.mjs`, `kit.mjs`, `easing.mjs` | shared by Node and the page: `drawFrame`, safe areas, font faces, the easing library (also used by the camera) |
| `raster.mjs`, `glyphs.mjs`, `png.mjs` | the pure-JS Canvas 2D subset (paths, glyph outlines from the TTFs, gradients, clip, alpha) and a PNG decoder for emoji |
| `elements/*.mjs` | the 10 elements, each with `defaults`, `layout(canvas, props, env)` and `draw(ctx, t, props)` |
| `plan.mjs` | template defaults, planner tools, restraint rules; writes `graphic` overlays and `edl.graphics` |
| `selftest.mjs` | the graphics check run by the Windows Electron smoke (part of `report.ok`) |
| `../compose-graphics.mjs` | compositor node: renders the EDL's graphics and expands screen cards |
| `../broll.mjs` | b-roll matching and placement |

### Backends, best first

1. **host**: the hidden offscreen Electron window (`offscreen: true`, sandboxed, no node integration). The page draws each frame on its own canvas at time `n / fps` (no `requestAnimationFrame`), and main reads the canvas pixels back. Frames are read from the page canvas, not from the offscreen `paint` event, so nothing depends on the window's paint rate.
2. **soft**: the same element code drawn by `raster.mjs` in the Node process. Used by unit tests, the headless bench and as the fallback. If the offscreen window is missing or a render fails, `compose-graphics.mjs` re-renders that graphic with the soft canvas and emits a warning op; the smoke self-test does the same and records `hostError`.

The bench can register Playwright Chromium as the host (`test/bench/graphics-playwright.mjs`, `--playwright` on the preview and gallery scripts); it loads the same page.

Frames go into FFmpeg as raw RGBA (`-f rawvideo -pix_fmt rgba`) and are encoded to QuickTime RLE (`qtrle`, `argb`, alpha kept) at the canvas rate. The cache key is a hash of the whole render job (element, props, layout, theme, canvas, fps, `GRAPHICS_VERSION`) plus the backend name.

Determinism: rendering frame 37 twice gives identical bytes (unit test for every element; the smoke repeats it on the active backend). The smoke also records a parity reading of the active backend against the soft canvas; it is informational, not a pass/fail gate.

## Elements

| kind | what it does |
|---|---|
| `hook_title` | 2-6 words, top third (shorts) or centred (16:9), word-stagger pop 3 frames apart (back-out), optional underline swipe on the key word, 6-frame fade/slide out |
| `lower_third` | name + role, slides in from the left over 8 frames, ~3 s hold, safe-area aware |
| `stat` | number / % / money count-up (0 → value over 0.5 s, expo-out) beside the face with a small label; the caption drops its accent on that word |
| `callout` | circle, arrow or box at a target box; the stroke draws on over 10 frames |
| `screen_zoom` | "Screen Studio" card: blurred dimmed background, soft shadow, rounded inset recording, 1.6-2.5x eased zooms |
| `progress` | 4-6 px accent bar at the top or bottom, linear over the duration |
| `chapter` | section title in Instrument Serif over the shot, or a full card (documentary) |
| `sticker` | Noto Color Emoji pop with a slight rotation, opt-in, max 1 per 10 s |
| `text_behind` | the existing SAM text-behind-subject, exposed as an EDL element so it composes with the rest |
| `cta` | subscribe / end card, last 5 s, 16:9 only (refuses on vertical canvases) |

Layouts are checked at 9:16, 1:1, 4:5 and 16:9: nothing leaves the safe area; edge elements (progress bar, screen card) stay on the canvas.

Themes live in `data/graphics-themes.json`: `kimo` (Geist + Instrument Serif, cream / ink / orange), `energetic` (Montserrat), `documentary` and `cinematic` (Instrument Serif display), `podcast`, `tutorial`. The caption style's accent can override the theme accent. Instrument Serif (OFL) and the Noto emoji PNGs (OFL) are bundled; notices are in `THIRD_PARTY_NOTICES.md`.

## Planning (`plan.mjs`)

1. Template defaults run first: hook title on shorts (or when the note asks, or the energetic template); lower third when the transcript or note introduces a person; number pops on numeric emphasis; chapter cards at section starts on 16:9; callouts and the screen card on screen recordings; progress bar on energetic/tutorial shorts or when the note asks; stickers on the energetic template or when the note asks; end card on 16:9 videos of 60 s or more for the auto/energetic/tutorial/podcast templates or when the note asks. Notes like "no lower third" or "no emoji" turn a default off.
2. The planner's tools add or remove on top: `graphic`, `hook_title`, `callout`, `screen_zoom`, `broll_auto`, `broll`. Calls are validated; bad ones return an error to the model.
3. Restraint rules are enforced in code whatever the model asked for: at most one graphic on screen (captions, progress bar and screen card excluded), no entry within 0.4 s of another graphic's exit, density per template (shorts ≤ 10/min, YouTube ≤ 4/min, documentary ≤ 2/min). Lower-priority graphics are dropped first.

Captions yield to graphics: kit graphics carry their laid-out box and are collision blockers for caption placement (the caption moves, or hides for the graphic's duration if nowhere fits). The MrBeast caption style rotates per word without moving the line.

## B-roll (`broll.mjs`)

- Sources: only the user's own non-speech clips (classified in Phase 3). No stock fetching.
- Matching: one cached vision call per clip (3 frames → one-line description) and one cached batched LLM call (sentences × descriptions), through the existing server proxy, in AI modes only. Captions mode and offline runs match file names and descriptions by word overlap, with no AI call.
- Placement: `needs_cover` joins from the cut plan first, then abstract sentences. 1.2-3.5 s, starts on a word onset, picture enters 6-8 frames after the sentence starts (J-cut), leaves on a word end (L-cut). Never the hook's first 1.5 s, never over a punchline's face or an introduction, ≤ 40 % of runtime, ≥ 4 s apart unless it is a montage. B-roll audio at −24 dB.

## Caveats (read before claiming anything)

- **The Windows offscreen path is untested beyond the hosted Electron smoke.** If the offscreen window cannot render, graphics fall back to the soft canvas (same element code, slower, no Chromium text shaping).
- Frames are read from the page canvas, not from offscreen `paint` events.
- B-roll colour matching to the A-roll is Phase 8; b-roll gets no grade match yet.
- B-roll camera moves are a fixed pattern (push in, push out or drift, chosen by insert index), not a pan along the clip's dominant motion.
- `callout` with `target_prompt` and the `text_behind` element trigger SAM (paid, through the proxy) only when they are actually used; the defaults never call SAM. Callouts without a prompt use the planner's box or the active screen region.
- The soft canvas does not kern; layouts leave room for Chromium's slightly tighter kerning.
- Real-footage bench numbers (VLOG-1 / TUT-1 b-roll share, max_static_s, zero overlaps on golden clips, Creator Score) are deferred by Naman's instruction; none are claimed.

## Tools

- `npm run graphics:previews` writes contact sheets of every element per theme and aspect to `graphics/previews/` (excluded from the installer).
- `npm run graphics:gallery` renders a gallery video of every element (text_behind skipped since it needs SAM; cta on 16:9 only) through the real compositor at 9:16, 16:9, 1:1 and 4:5, to `test/bench/out/graphics-gallery/` (gitignored). `--playwright` renders with Chromium; `--aspects 9x16,16x9` limits the run. With the soft canvas each aspect takes about a minute on a small Linux sandbox.
- `node --test test/graphics.test.mjs` runs the graphics unit tests.
