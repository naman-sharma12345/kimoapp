# Sound design (Phase 8)

The desktop app owns the final audio mix. `finish_audio` is intercepted by
`picture-tools.mjs`; the native engine remains a read-only planning toolbox for
this stage. No additional AI requests or runtime dependencies are used.

`plan.mjs` selects a bundled bed using the template and existing transcript tone,
exposes beat/downbeat grids, safely adjusts eligible cut boundaries, and creates
deterministic effects from transitions, section boundaries, graphics, freezes,
screen punches and marked reveals. Caption words never create SFX. Existing user
music and Phase 7 effects are retained. Unsafe beat adjustments, including source
handle violations, J/L cuts and spoken boundaries, are skipped.

`voice.mjs` samples at most 30 seconds per clip. It estimates pitch from 30 ms
autocorrelation windows, selects 80/100 Hz high-pass, learns the quietest continuous
half-second, and measures spectral centroid, sibilance and boxiness with a bounded
JS FFT. The adaptive chain includes FFT denoising, optional strong-hiss reduction,
a gentle gate only below 20 dB SNR, conditional de-essing, presence/mud/air EQ and
two gentle compressors. A measured two-pass clip level targets −16 LUFS. Documentary
and cinematic templates add a subtle exciter and a short room echo at approximately
−28 dB. Mono voice buses use the stronger channel when stereo source channels are
opposed or one channel is nearly empty. Tiny 3–40 ms editorial gaps use only room
tone that passes both periodicity checks and transcript exclusion; otherwise they
remain unfilled. Speech is never deliberately looped.

`music.mjs` fits bars with a short equal-power seam, exact sample-count end and a
1.5 second fade where the picture end is off-bar. Bundled BPMs and beat offsets are
known from composition. Imported music gets a bounded spectral-flux/autocorrelation
estimate, which cannot establish reliable musical downbeats on arbitrary recordings.
Processed voice drives a parallel sidechain at threshold 0.02, ratio 8, attack
40 ms and release 400 ms. The dry floor limits its additional reduction to about
3 dB; the transcript envelope supplies −16 dB under speech and −9 dB in gaps over
0.8 seconds, with 250 ms ramps. This avoids adding two full-strength duckers.
An optional hook keeps the first half-second at full bed level before ducking.

`sfx.mjs` rotates deterministic variants, starts sounds two picture frames early,
and caps their peaks at least 7 dB below local voice RMS (9 dB near word onsets).
Absent voice, the cap is −32 dBFS. Section selection is deterministic at 40%; density
is 4/8/14 optional events per minute by template. Whip/zoom cues always receive a
whoosh, so mandatory transition cues can exceed that optional density cap.

`mix.mjs` caches cleaned voice clips by source signature and processing settings.
It retains `audio/voice.wav`, `audio/music.wav`, `audio/sfx.wav`, `audio/master.wav`
and `audio/report.json` in the project. `master.mjs` can remix these stems without
calling a planner or re-rendering picture. The bus uses a safety limiter followed
by measured two-pass loudnorm (−14 LUFS, or −16 for podcasts; TP −1; LRA 7). An
oversampled final limiter leaves a small AAC peak margin. Delivery encoding preserves
this mix instead of running the old −14 LUFS normalization again. Checks report
actual LUFS, true peak, LRA, clipping, DC and stereo compatibility. Correlation is
sampled over the first 30 seconds and is explicitly labeled with that limit.

All workers reuse the app's background priority, one-thread default, bounded
buffers and cancellation. Longer jobs publish FFmpeg progress. Audio processing
uses CPU; the voice cache and worker limit reduce repeated work and contention.
No real-footage CPU or listening-quality claims have been established.

## Library and licensing

Eight original procedural instrumental scores (120–134.4 seconds, Opus 128 kbps,
19,232,787 bytes total) and forty synthesized effects (3,687,600 bytes total) are
bundled offline. They are original simple scores and synthesized foley, not a
curated commercial recording pack. Metadata, BPM, key, mood, energy, loop points,
effect kind/intensity/duration and actual sample peaks live in `data/music.json`
and `data/sfx.json`. The audio files are CC0; see `LICENSE-CC0.txt` and the source
URLs in each record. The library is generated only by the maintenance tool, never
at app startup. User music can be selected with **add music** or dropped onto the
Studio MUSIC lane; its rights remain with its owner.

## Lightweight verification

- `npm run test:audio --prefix desktop`: pure planning checks and one six-second
  synthetic audio fixture, including cleanup, looped import, room-tone gap, SFX,
  stem cache, master and podcast stem-only remix. No AI or golden-clip benchmarks.
- `node desktop/test/audio-ui.mjs`, then `node desktop/test/audio-ui-check.mjs`:
  browser fixture for keyboard import and MUSIC-lane drop. Its bridge is mocked;
  this does not test the operating-system picker. The fixture alone removes CSP
  to inject its mock; production CSP is unchanged.

Their source and licensing URLs are also included in export attributions. Imported
music survives subsequent AI follow-ups and can be explicitly removed with a
"no music" note.

The installed 28 October 2026 BtbN build exits with Windows heap-corruption code
3221226356 in `anlmdn`. A tiny cached capability probe detects this before processing
real audio. Affected builds use a second gentle FFT denoiser for strong hiss and
emit an explicit warning; compatible builds use `anlmdn`. De-esser, gate, exciter
and room filters were exercised in the short audio check.

The user explicitly requested no benchmarks. Golden-clip measurements, 30-second
human listening reviews, sustained CPU measurements, and real-footage LRA/duck-depth
acceptance are deferred. The six-second fixture's LRA is 0.5 LU, below the requested
4–9 range; its report correctly fails that check. No real-footage acceptance is
claimed from synthetic checks. The final smoke measurements are in `RESULTS.md`.
