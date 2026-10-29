# kimo for Windows

A desktop video editor that runs the **real kimo v6 engine** on your PC. Everything is
inside one installer: kimo-mcp, FFmpeg/FFprobe, whisper.cpp with the small model, fonts
and the UI. No Docker, no separate engine, no size or length caps (long videos and 4K
are fine).

## Install

1. Download `kimo-Setup-<version>.exe` from
   [Releases](https://github.com/naman-sharma12345/kimoapp/releases/latest).
2. The installer is not code-signed yet, so Windows SmartScreen may say "Windows
   protected your PC". Click **More info → Run anyway**.
3. kimo updates itself from GitHub Releases (it asks before restarting).

## What it does

- Drag in files or whole folders; each edit is saved in your local library with its
  history, edit script and full op log.
- **AI edit**: kimo writes the edit script, drives kimo tools (rough cut, captions,
  titles, grade, punch-ins, reframe, audio finish…) live in the op log, renders,
  checks 3 frames + the audio report, fixes and re-renders (up to 3 passes).
- **Captions only**: fully offline — whisper on your PC, no internet needed.
- Formats: YouTube 16:9 (1080p or 4K), Shorts/Reels/TikTok 9:16, square 1:1, feed 4:5.
- Batch: drop several videos, tick *Batch*, one prompt edits each one in a queue.
- **Save compressed for upload** re-encodes the master on your GPU (NVENC, Quick Sync
  or AMF) when there is one, otherwise on the CPU.

## Privacy

Media never leaves your PC. AI edit sends only the prompt, text results from the engine
and three small frames + an audio report per check to `api.getkimo.tech` (no API key is
in the app). See `THIRD_PARTY_NOTICES.md` for bundled licenses.

## Build

`.github/workflows/desktop.yml` (windows-latest) downloads the bundled tools into
`desktop/vendor`, builds the NSIS installer with electron-builder, installs it on the
runner, runs `kimo.exe --smoke <clip>` (engine start, ffmpeg, whisper captions, one real
render) and publishes the release.
