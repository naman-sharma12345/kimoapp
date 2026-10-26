# Fixture sources and licensing

These are original procedural test assets dedicated to [CC0 1.0](https://creativecommons.org/publicdomain/zero/1.0/), created for kimo web with the reproducible `scripts/generate-fixtures.py` script. No stock content, third-party music, people, trademarks, or training-generated images are included.

The Phase 0 request says “4 sample assets” but enumerates five (three clips, one music track, one image). We provide all five, plus a mask and a playable delivery file. All three clips are 8 seconds, 1920×1080, H.264, 30fps. The original music study is 24 seconds. The final mock video is a 24-second fixture, not a server rendering of user edits.

The request to download Pexels/Pixabay CC0 files cannot be satisfied by assuming their current stock licenses are CC0. [Pexels terms](https://www.pexels.com/terms-of-service/) distinguish CC0 content from their own license; [Pixabay terms](https://pixabay.com/service/terms/) identify CC0 by publication before January 9, 2019. No specific legacy asset URLs were supplied. To keep this foundation immediately runnable and redistribution unambiguous, original CC0 media replaces stock footage. This source substitution is recorded in `docs/DECISIONS.md` and the acceptance log.

Canonical download URLs and SHA-256 checksums for every file are in [manifest.json](manifest.json). `pnpm install` verifies bundled files and downloads missing copies from those URLs. FFmpeg is needed only when deliberately regenerating the originals.

| File | Contents | License |
| --- | --- | --- |
| study-1.mp4 | warm neutral geometric motion study, 8s, 1080p | CC0-1.0 |
| study-2.mp4 | cool neutral geometric motion study, 8s, 1080p | CC0-1.0 |
| study-3.mp4 | muted violet-grey geometric motion study, 8s, 1080p | CC0-1.0 |
| quiet-study.wav | original synthesized four-chord music bed, 24s | CC0-1.0 |
| still.png | poster frame, 1920×1080 | CC0-1.0 |
| mask.png | black/white subject mask test texture, 1920×1080 | CC0-1.0 |
| delivery.mp4 | concatenated 24-second mock output with music | CC0-1.0 |
