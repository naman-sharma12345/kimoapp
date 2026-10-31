kimo for Windows — third-party software

This installer bundles the following programs, unmodified, as separate executables:

- kimo v6 engine (kimo-mcp) and its fonts — from github.com/naman-sharma12345/kimo
  release v6.0.0. See vendor/kimo for its license files.
- FFmpeg and FFprobe — Windows "gpl-shared" build from github.com/BtbN/FFmpeg-Builds.
  FFmpeg is licensed under the GNU General Public License v3 (this build enables GPL
  components such as x264). Its full license text is in vendor/ffmpeg/LICENSE.txt and
  the FFmpeg source code is available at https://ffmpeg.org/download.html and
  https://github.com/BtbN/FFmpeg-Builds.
- whisper.cpp (whisper-cli) — MIT License, Copyright (c) 2023-2024 The ggml authors,
  github.com/ggml-org/whisper.cpp release b5454.
- Whisper "small" model (ggml-small-q5_1.bin) — MIT License, Copyright (c) 2022 OpenAI,
  converted by the whisper.cpp project (huggingface.co/ggerganov/whisper.cpp).
- Electron — MIT License, Copyright (c) Electron contributors / GitHub Inc.

Privacy: your videos, audio and renders stay on this PC. When you use AI edit, kimo sends
the edit prompt, the engine's text results, three small JPEG frames and an audio-level
report per check to api.getkimo.tech, which forwards them to Meta's model API. Captions-only
mode is fully offline. Details: https://app.getkimo.tech/privacy

## @meta-sam/parser 0.1.0

Parses Segment Anything Model (SAM 3.1) responses. Copyright (c) Meta Platforms, Inc. and affiliates.
Licensed under the SAM License (https://github.com/meta-models/meta-sam, LICENSE). SAM 3.1 itself runs on
Meta Model API (https://dev.meta.ai); kimo calls it through api.getkimo.tech.

SAM effects: when you use subject tracking, reframe, text behind subject, background or cutout effects or
object blur, kimo uploads a downscaled copy (≤720p, no sound) of only the clip segment being processed to Meta
through api.getkimo.tech and deletes it afterwards.

Test media (CI only, not installed): _Tears of Steel_ (c) Blender Foundation | mango.blender.org, CC BY 3.0.

Creator benchmark media (downloaded locally, not installed): The Green Interview's
"David Montgomery, The Green Interview"; Nkansah Rexford's "Wikimania 2014 Interview -
Part One"; Blender Foundation's "Extrude - Blender 2.80 Fundamentals"; Aliioss Film's
"4K Nature Cinematography recorded with Nikon D5300". Each source is CC BY 3.0
(https://creativecommons.org/licenses/by/3.0/). Exact sources, attribution and
modifications are in test/bench/CREDITS.md and test/bench/clips/clips.json.

Replacement raw benchmark candidates (test acquisition only, not installed):

- Michal Marek / Pexels, "Waves Rushing And Splashing To The Shore", video 1409899.
  Source: https://www.pexels.com/video/waves-rushing-and-splashing-to-the-shore-1409899/
  Pexels licence: https://www.pexels.com/license/
- Juhani Junkala / SubspaceAudio, "5 Chiptunes (Action)" music pack.
  Source: https://opengameart.org/content/5-chiptunes-action
  CC0 1.0: https://creativecommons.org/publicdomain/zero/1.0/
  The selected archive entry and original/downloaded SHA256 values are recorded
  in the hosted candidate's music-provenance.json before final dataset adoption.
- Other inspected sources and resized review images are credited in
  test/bench/clips/raw-v2/REVIEW.md. Provisional and rejected candidates are marked.
- Cinestudy / Sonnyboo, Sabo/Ross Renaissance Fair raw footage. The user approved
  the publisher's separate free edit permission on 30 October 2026. Every derived
  dataset case/output must carry the full roles, credits and three required
  hashtags in test/bench/clips/raw-v2/CREDITS.md; no CC licence is asserted for it.
  Source and permission: https://cinestudy.org/2026/02/20/edit-this-podcast-documentary/

## Caption fonts (SIL Open Font License 1.1)

Bundled unmodified in `fonts/` for the caption and title styles; each licence text is in `fonts/licenses/`.
The OFL allows bundling and redistribution with software; the fonts are not sold on their own.

- Montserrat ExtraBold, Montserrat Black — Copyright 2024 The Montserrat.Git Project Authors
  (https://github.com/JulietaUla/Montserrat). Files: https://github.com/JulietaUla/Montserrat/tree/master/fonts/ttf
  Licence: SIL OFL 1.1, https://github.com/JulietaUla/Montserrat/blob/master/OFL.txt (`fonts/licenses/Montserrat-OFL.txt`).
- Geist SemiBold, Geist Bold, Geist Black — Copyright 2024 The Geist Project Authors (https://github.com/vercel/geist-font).
  Files: https://github.com/vercel/geist-font/tree/main/fonts/Geist/ttf
  Licence: SIL OFL 1.1, https://github.com/vercel/geist-font/blob/main/OFL.txt (`fonts/licenses/Geist-OFL.txt`).
- Bangers Regular — Copyright 2010 The Bangers Project Authors (https://github.com/googlefonts/bangers).
  File: https://github.com/google/fonts/blob/main/ofl/bangers/Bangers-Regular.ttf
  Licence: SIL OFL 1.1, https://github.com/google/fonts/blob/main/ofl/bangers/OFL.txt (`fonts/licenses/Bangers-OFL.txt`).
- Noto Sans Devanagari Bold, Noto Sans Devanagari Black — Copyright 2022 The Noto Project Authors
  (https://github.com/notofonts/devanagari). Files (hinted TTF):
  https://github.com/notofonts/notofonts.github.io/tree/main/fonts/NotoSansDevanagari/hinted/ttf
  Licence: SIL OFL 1.1, https://github.com/notofonts/devanagari/blob/main/OFL.txt (`fonts/licenses/Noto-OFL.txt`).
- Instrument Serif Regular, Instrument Serif Italic — Copyright 2022 The Instrument Serif Project Authors
  (https://github.com/Instrument/instrument-serif). Files: https://github.com/google/fonts/tree/main/ofl/instrumentserif
  Licence: SIL OFL 1.1, https://github.com/google/fonts/blob/main/ofl/instrumentserif/OFL.txt (`fonts/licenses/InstrumentSerif-OFL.txt`).
  Used by the Phase 6 graphics kit (chapter cards, documentary/cinematic titles).

## Emoji stickers (SIL Open Font License 1.1)

- `graphics/emoji/*.png` — 20 glyphs of Noto Color Emoji, Copyright 2021 Google Inc.
  (https://github.com/googlefonts/noto-emoji). Rasterised at 160 px from the OFL-licensed font file
  https://github.com/google/fonts/blob/main/ofl/notocoloremoji/NotoColorEmoji-Regular.ttf with
  `test/bench/tools/extract-emoji.py` (offline tool; not run by the app).
  Licence: SIL OFL 1.1, https://github.com/google/fonts/blob/main/ofl/notocoloremoji/OFL.txt (`graphics/emoji/NotoColorEmoji-OFL.txt`).

## Phase 7 explainer data (`explain/data/`)

Generated offline by `explain/tools/build-data.mjs` (dev tool, not run by the app) from the sources below; licence texts are in `explain/data/licenses/`. Total size about 2.5 MB.

- `icons.json` — line icons from **Lucide** 0.548.0 (https://lucide.dev, https://github.com/lucide-icons/lucide), ISC licence
  (https://github.com/lucide-icons/lucide/blob/main/LICENSE; `explain/data/licenses/Lucide-ISC.txt`), and **Tabler Icons** 3.35.0
  outline set (https://tabler.io/icons, https://github.com/tabler/tabler-icons), MIT licence
  (https://github.com/tabler/tabler-icons/blob/main/LICENSE; `explain/data/licenses/Tabler-MIT.txt`). SVG nodes converted to path data; names and tags kept for the keyword index.
- `brands.json` — 187 brand marks from **Simple Icons** 15.17.0 (https://simpleicons.org, https://github.com/simple-icons/simple-icons), CC0 1.0
  (https://github.com/simple-icons/simple-icons/blob/develop/LICENSE.md; `explain/data/licenses/SimpleIcons-CC0.md`). Brand marks remain trademarks of their owners; kimo shows them only when the speaker names the brand.
- `world.json` — **Natural Earth** 1:50m admin-0 countries (https://www.naturalearthdata.com), public domain (`explain/data/licenses/NaturalEarth-PD.txt`).
- `cities.json` — **GeoNames** cities15000 subset (https://www.geonames.org, https://download.geonames.org/export/dump/), CC BY 4.0
  (https://creativecommons.org/licenses/by/4.0/; `explain/data/licenses/GeoNames-CC-BY-4.0.txt`). Credit: "City data © GeoNames (CC BY 4.0)".

## Geist Mono (SIL Open Font License 1.1)

- `fonts/GeistMono-SemiBold.ttf` — Copyright 2024 The Geist Project Authors (https://github.com/vercel/geist-font), file from the `geist` npm package 1.8.2
  (`dist/fonts/geist-mono/GeistMono-SemiBold.ttf`). Licence: SIL OFL 1.1 (`fonts/licenses/Geist-OFL.txt`). Used by the explainer code card.

## Sound gags and UI ticks (`explain/sfx.mjs`)

Synthesised at run time by kimo with FFmpeg's `lavfi` generators from parameters in the source (no recordings, no third-party audio). kimo dedicates them to the public domain (CC0 1.0).

## Fetched explainer assets

Images found through Openverse (https://openverse.org, API https://api.openverse.org) and Wikimedia Commons (https://commons.wikimedia.org, API https://commons.wikimedia.org/w/api.php) are keyless searches filtered to CC0, public domain, CC BY and CC BY-SA. Each asset keeps its licence, creator and source URL in the project, and every export writes them to `ATTRIBUTIONS.txt` beside the video (also offered as a YouTube description block). Nothing is bundled from these sources.
