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
