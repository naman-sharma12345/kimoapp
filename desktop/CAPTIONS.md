# Captions and typography (Phase 5)

Captions are kimo's own: built from the Phase 3 transcript words (whisper runs once, for the cut), re-timed onto the output after every cut, styled from data, placed around the face and drawn by libass in the compositor's final text pass. kimo's engine captions (`auto_captions`) are no longer used for the picture; they remain only as a fallback when no transcript exists (whisper missing).

## Pipeline

1. **Words onto the output** (`captions.mjs` `outputWords`): source-time words (`camera_plan.words`, by file path) map through the A-roll clips (`at + (t − in) / speed`). A word whose onset was cut never shows; hesitations (um, uh, hmm) are dropped. Judgment emphasis words are carried along.
2. **Cleanup** (`normalizeWords`): shorts styles turn spoken numbers into digits and keep units with them ("three million" → `3 MILLION`, "fifty percent" → `50%`), strip trailing punctuation (keep ? and !). Casing per style (upper, sentence, as-is); brand/proper-noun spellings typed in the note (iPhone, OpenAI) are kept in sentence/as-is styles. Each word is tagged Devanagari (`lang: hi`, Noto Sans Devanagari) or Latin; romanised Hinglish stays Latin.
3. **Chunking** (`chunkWords`): dynamic programming over break costs. Hard breaks at sentence ends and pauses > 0.5 s; preferred breaks at punctuation and pauses > 0.15 s, then before conjunctions/prepositions. Forbidden-ish: after a determiner/preposition that runs on ("the | thing"), a 1-letter word at a line end, a number before its unit ("3 | million"). One word over the style's limit is allowed only when every split would hit one of those. Shorts: 1–3 words, ~14 chars, 1–2 lines; 16:9: 4–8 words, ≤ 42 chars per line, ≤ 2 lines, balanced, slightly bottom-heavy. A chunk whose last word would be replaced in < 0.18 s is penalised.
4. **Timing** (`timeChunks`): frame grid; a chunk starts one frame before its first onset; it runs to the next chunk when the gap is ≤ 0.6 s, else lingers into the silence up to its minimum (0.3 s shorts / 0.8 s 16:9) and, on 16:9, the 17 chars/s read floor. Never overlapping. Each word's highlight starts at its onset − 1 frame and ends at the next word's onset.
5. **Keyword accent** (`accentChunks`): at most one accented word per chunk; emphasis words first, then numbers, then names; ~20–35 % of chunks (style-defined); content words fill to the floor.
6. **Placement** (`placeChunks`), decided per chunk, never mid-chunk:
   - safe areas: shorts/reels/tiktok no text in the top 12 %, bottom 22 %, right 15 % (centred, ≤ 70 % width, shrunk to fit); 16:9 inside 90 % title-safe.
   - face-aware: the subject box comes from the Phase 4 head tracks (camera-probe motion heuristic, or the cached SAM person track; never a new SAM call) mapped through the A-roll clip's camera crop at the chunk's start/middle/end. Shorts prefer just below the chin; then lower, then top. Never over the mouth; the previous position is kept when it still works (no jumping). A frame-centre guess is not treated as a face.
   - collisions: hook titles, callouts, lower thirds and image overlays are blockers for their duration. The caption moves; if nowhere fits it hides for the graphic (the longest visible remainder survives).
   - auto-contrast (compose): for styles without a box or a real outline (MKBHD, documentary subtitle), the base composite behind each caption is sampled; under 4.5:1 against the text colour the chunk renders on a soft translucent box.
7. **EDL**: chunks are `caption_word_group` overlays with `props.engine: 'kimo-captions'`, words (`at`/`until` output seconds), lines, placement and accent. `edl.captions` keeps the style, the hook title effect, the word boundaries for snapping and stats (`caption_min_word_s`, `caption_safe`, `caption_face_overlap`, `max_cps`, `accent_share`). They are appended after every other overlay so they draw in the final pass.

## Styles (data/caption-styles/*.json)

| id | look |
|---|---|
| kimo (default) | Geist Black caps, cream #F5F1E7, ink outline, orange #FF5A24 keyword, subtle 1.04 pop |
| hormozi | Montserrat Black caps, white, 7 px black outline @1080w, drop shadow, 1–2 words, current word yellow, keyword green, pop 70 % → 108 % → 100 % over 5 frames |
| mrbeast | Bangers (OFL Komika lookalike), white, colour stroke over a fat black stroke, stroke colour cycles per chunk, ±3° per-chunk rotation, squash-and-stretch bounce |
| ali-abdaal | Geist SemiBold sentence case on a soft black pill (70 %), 2 lines, words reveal 40 % → 100 %, no bounce |
| mkbhd | Geist Bold, 16:9 lower-centre, soft blurred shadow, no box, 1 line, 120 ms fade |
| karaoke | Montserrat ExtraBold, full chunk; the current word fills left to right (`\kf`) |
| boxed-highlight | the current word sits on an orange rounded box (ASS vector shape) that slides word to word (`\move` + width `\fscx`) |
| doc-subtitle | Netflix-style: white, 2 lines, bottom, 42 cpl, ≤ 17 cps, no animation |
| echo-slide (title) | text slides in stretched (`\fscx` 160 → 100) with three delayed, fading echo copies |
| gold-sweep (title) | two-band metallic gold (per-line `\clip`) with a blurred light band sweeping left → right (animated `\clip`) |
| decay (title) | resolves from a blur, then erodes: growing blur, outline shrinking to 0, jittered ghost copies (Vox-style) |

Fields: `font` / `font_devanagari` (bundled file + family), `size` / `size_wide` (fraction of canvas height), `case`, `colors`, `outline` / `shadow` (fraction of canvas width), `box`, `line_spacing`, `letter_spacing`, `layout.shorts|wide` (max words/chars/lines, min duration), `position` (auto/top/middle/lower-third/bottom), `highlight`, `animation.in|out`, `word_fx`, `accent`, `punctuation`, `numbers`, `max_cps`. Previews: `data/caption-styles/previews/*.png`, regenerated by `node test/bench/caption-previews.mjs [--check-fonts]` (synthetic background and silhouette; it also writes a contact sheet to `test/bench/out/caption-styles/`).

The three title effects come from Naman's reference reel (rystal, "viral reel text effects"). They are used for the hook title (a planner `add_title` in the first 3 s): energetic → echo-slide, documentary → decay, cinematic → gold-sweep, or when the note asks for echo/gold/shiny/decay/Vox. They can also be picked as caption styles. All three are plain libass (stacked delayed copies, `\move`, `\fscx`, `\t` on alpha/blur/border, animated rectangular `\clip`), no pre-rendered overlays.

Choice order: the caption style picked in the app → a style named in the note ("mrbeast captions") → the template (auto → kimo, energetic → hormozi, podcast → karaoke, tutorial → boxed-highlight, documentary → ali-abdaal on shorts / doc-subtitle on 16:9, cinematic → mkbhd). The planner's `auto_captions` call only switches style (ignored when the user picked one); `edit_caption` with a `cap###` id edits words.

## Rendering (ass.mjs, caption-render.mjs, compose.mjs)

- `ass.mjs` is a typed builder: styles and events are objects, override tags come from helpers that validate their numbers, and all text is escaped in one place (`\{ \}` for braces, a word joiner after every backslash so `C:\new` stays literal, newlines → `\N`; commas are stripped from style/font/name fields). No ASS string concatenation elsewhere.
- One Dialogue per word state; the chunk's entrance (pop, bounce, fade) is written as time-shifted `\t` transforms so it runs continuously across the state events. Karaoke is one event with `\kf`. Boxes are `\p1` vector shapes; widths come from the bundled fonts' advance widths (`fonts.mjs`, a small pure-JS TrueType reader, checked against libass to within ~2 %).
- One libass pass at the end of the composite, the `ass` filter with `shaping=complex` (FFmpeg's `subtitles` filter shapes simply, so Devanagari conjuncts like स्त did not form), `fontsdir=` the bundled faces copied into the job's work dir, both given as absolute, escaped filter paths (`filterPath`: `C\:/…` inside quotes, quotes escaped). Planner overlays still draw through the Phase 2 text pass in the same script.
- **Fast caption edits**: when an export has kimo captions, the base composite (everything below the final text pass) is cached in the job's `compose-cache/` keyed by content. A Studio caption edit (double-click text, drag/trim, delete) changes only overlay data, so the next render decodes the cached base and re-runs libass ("captions only · base picture reused from cache" op). One base per edit is kept. Long timelines that use the chunked compositor (> 10 min or very large graphs) render normally.
- Studio: caption chunks are timeline clips; drags and trims snap to word boundaries (UI and `caption-edits.mjs`), never overlap the neighbours, and keep word timings; text edits keep timings when the word count matches, otherwise spread the new words over the chunk. Edited chunks are kept when a follow-up rebuilds the captions.

## Fonts

Bundled OFL faces in `desktop/fonts/` (licences in `desktop/fonts/licenses/`, listed in THIRD_PARTY_NOTICES.md): Montserrat ExtraBold/Black, Geist SemiBold/Bold/Black, Bangers, Noto Sans Devanagari Bold/Black. They ship unpacked from the app archive (`asarUnpack`) because FFmpeg reads them from disk. `fonts.mjs` `checkFonts` renders a script with libass verbose logging and fails on any face outside the bundled set or any missing glyph; the unit tests and the Windows Electron smoke (`caption-selftest.mjs`) run it.

## Not done here

Real-footage caption bench numbers (TH-1 6-second renders per style, side-by-side vs. the old captions) are deferred by Naman's instruction. Per-word random rotation (MrBeast) is per chunk, because rotating single words inside a libass line moves the line. A true diagonal light sweep and per-glyph decay need a pre-rendered overlay (Phase 6 notes).
