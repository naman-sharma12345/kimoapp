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

Test media (CI only, not installed): *Tears of Steel* (c) Blender Foundation | mango.blender.org, CC BY 3.0.
