# Formats and genre recipes

Ask yourself: where will this be posted and who is it for? If the user doesn't say, infer from aspect and length; vertical under 60 s is a short.

## Vertical short (TikTok, Reels, Shorts), 1080x1920

- Face in the upper-middle third; captions in the lower-middle (position middle or bottom with margin), never covered by platform UI at the very bottom ~15% and right edge.
- Word-timed captions (caption-pop or caption-clean, animation pop words), 1 to 4 words on screen at a time.
- Hard cuts, punch-ins, B-roll every 2 to 4 s. Music at low level under voice (duckUnderVoice true).
- Converting 16:9 to 9:16: scale up to fill height (about 1.78) and set x to keep the subject centred; for wide shots, use a blurred copy (blur 15 to 20, scale 1.78) on a lower track behind the original at scale 1.

## YouTube long-form, 1920x1080

- Cold open 5 to 15 s, title card optional (title-serif or title-bold, under 2 s), then the content.
- Chapters: marker.add at each section start with a clean label.
- Captions optional; lower-thirds for names (lower-third, 3 to 5 s, fade).
- B-roll on overlay track over the A-roll whenever the speaker references something visual.

## Podcast / interview clips

- Pick the single most quotable, self-contained 30 to 90 s. Start on a strong statement.
- Two speakers: cut to whoever is talking; reaction shots only if they add something.
- Captions always (many watch muted). Speaker name lower-third in the first 3 s.

## Talking-head tutorial / explainer

- Ruthless silence and filler removal. Text callouts for each step ("step 2: trim the ends") using label-mono or caption-box.
- Zoom (scale keyframes 1.0 to 1.3, ease-in-out over 0.4 s) onto screen recordings where the action is.

## Vlog / travel

- Music-driven. Open on the best shot, not the airport. Cut on beats, mix wide, medium, detail shots. Warm grade (temperature 0.08, saturation 1.08, lut 'warm film' lightly) unless footage is already warm.

## Product / demo / ad

- Problem in 2 s, product in 3 s, proof, call to action. Bold titles (title-bold). Clean hard cuts and slide transitions on product reveals only.

## Gaming / montage

- Beat-synced cuts, zoom_punch on kills/hits, short speed ramps, contrast 1.15 and saturation 1.15. Text minimal.

## Cinematic / mood

- Longer shots, crossfades and dip-to-black between scenes, letterbox via crop t/b 0.06 each on 16:9, teal & orange or warm film grade, light grain 0.05, vignette 0.25.
