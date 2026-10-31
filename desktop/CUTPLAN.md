# Transcript cut planner (Phase 3)

The cut is decided from the words, in kimoapp, before the tool planner runs. The AI only makes the judgment calls an editor makes by taste; everything measurable is deterministic and tested.

## Flow (`cutstage.mjs`)

1. **Transcript** (`transcript.mjs`), per video clip with sound, live op `transcribe`:
   - 16 kHz mono WAV extract → bundled whisper.cpp with the flags its `--help` lists: `-ojf` full JSON, `-ml 1 -sow` (one segment per word), `-l auto`, and `-dtw <preset>` (e.g. `small` for `ggml-small-q5_1.bin`); a failing DTW run is retried without it.
   - Word edges are snapped to energy (10 ms RMS, onset threshold = noise floor + 12 dB): start → nearest onset within −120…+40 ms, end → offset within −40…+150 ms using a floor + 6 dB tail threshold. A stop's release burst after a short closure and a long sibilant are kept with the word.
   - Language: whisper's detection, plus Devanagari share and romanised Hindi markers for Hinglish. Fillers come from `data/fillers.json` (en and hi; Hinglish speakers also get the English list). Conditional fillers ("like", "kind of", "matlab", "toh", "na", "haan", "accha", "basically", …) are tagged only when their rule holds (pause-bounded, isolated/repeated, opener, tag question, not modifying).
   - Transcript object: `words[] {w,start,end,conf,filler?,speaker?}`, `sentences[]` (punctuation or pause > 0.5 s), `pauses[]`, plus the energy and pitch tracks. Cached as JSON by SHA-256 of the 16 kHz audio + model name in `KIMO_CACHE_DIR/transcripts` (the app's `userData/cache`).
2. **Clip classes**: speech (> 40 % speech), mixed, b-roll (< 10 % or < 3 words). B-roll is offered to the planner (`place_broll`); in captions-only mode it stays in place, whole. Filenames like "screen", "capture", "loom" (or a note saying screen recording) mark screen-recording clips.
3. **Diarisation** (`speakers.mjs`, podcast style or a podcast/interview note): per-channel loudness when the stereo channels are separated (median |L−R| ≥ 6 dB, both sides leading ≥ 15 % of words); otherwise mouth-region motion per person (default left/right halves of a two-shot, or given person boxes) against the voice energy, per sentence. Low confidence leaves words unlabelled. No network calls.
4. **Deterministic plan** (`cutplan.mjs`):
   - templates: shorts 0.12 s / 40 ms pad, punchy 16:9 0.20 s / 50 ms, calm (documentary, cinematic) 0.35 s / 80 ms. Mixed clips keep pauses up to 1 s.
   - fillers are cut only on clean joins (both new edges below −35 dBFS or a zero crossing within 5 ms); fillers glued to both neighbours (< 20 ms) are flagged and kept.
   - stutters/restarts ("the the", "I think I think", "bec- because") keep the last instance; emphatic repeats ("very very") stay.
   - retakes: sentences within 30 s (also across consecutive clips) with token Levenshtein/Jaccard similarity ≥ 0.75 on lemmatised tokens, or an abandoned ≥ 3-token restart. Take score = 35 % fluency, 20 % whisper confidence, 20 % energy (loudness + pitch movement), 25 % completeness (end punctuation, falling cadence, length); best take kept.
   - shorts without an AI answer: a greeting-only opener is dropped; over 60 s (or the target) the weakest middle sentences go (never a teaser line).
   - segments get the template pad of room tone (never into a removed word) and are snapped to a zero crossing; every joint also gets the compositor's 10 ms equal-power fade.
5. **Judgment** (`judgment.mjs`, AI modes only, live op `judgment`): one call through the existing proxy (`kind: build`, key stays server-side) with the sentence list (index, start, duration, take group, fluency, teaser flag, text), the note, the template, the hook rules verbatim and the length rules. Tutorial style or a tutorial/how-to note adds the tutorial rules: an optional result-preview montage (≤ 3 excerpts) before the hook, teaser lines kept early, setup chatter dropped. The answer is validated (indices, ≤ 12-word hook, no greeting hook, best take within its group, no duplicate order entries; a sentence both ordered and dropped is dropped) and cached by prompt hash in `KIMO_CACHE_DIR/judgments`. Any failure keeps the deterministic plan.
   - Cold open: the trimmed hook plays first. The original occurrence is cut when the hook is ≥ 60 % of its sentence or would be heard again within 8 s; otherwise it is repeated in context.
6. **Joins** (`joins.mjs`, live op `join_check`): two 72 px grey frames per jump cut, shift search on the central region. Micro-jumps (< 2 % of frame height) are merged when only ≤ 0.25 s of silence was removed, else forced to a framing change (alternating 1.10–1.20 punch, zoomed about the upper third). In captions-only mode every jump gets the alternating punch; in AI modes the remaining joins are `needs_cover` for the planner now and Phase 4/6 later. Screen-recording segments are listed as `screen_punch` candidates.
7. **CutPlan → EDL**: `apply_cut` lays one A-roll track with one frame-exact clip per kept segment (in floored, out ceiled to the source frame grid, whole canvas frames). The planner is told the track is already cut and its `auto_rough_cut`/`cut_to_beat`/re-imports are skipped. The plan rides on the EDL as `cut_plan` (`edit.edl.json`) and is saved as `cutplan.json` beside the project; follow-ups read it. The live feed shows e.g. `removed 37 pauses (11.4 s), 9 fillers, 2 retakes · 312.4 s → 241.0 s · cold-open hook`.

Captions-only mode stays offline: no judgment call, the deterministic plan still applies. Without whisper or its model, the old whole-clip path is used.

## Review tool

`node desktop/test/bench/joins-wav.mjs <render> <cutplan.json|edit.edl.json> [joins.wav] [--seconds 20]` writes the render's first seconds with a 1 kHz beep just before every cut and prints each cut with what was removed there.
