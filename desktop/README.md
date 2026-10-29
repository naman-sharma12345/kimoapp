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
- **AI edit, live**: kimo writes the edit script and drives kimo tools (rough cut,
  captions, titles, grade, punch-ins, reframe, audio finish…). Every AI step and tool
  call streams with timers; the preview and a visual timeline update after each change;
  renders show % and ETA.
- **Style presets**: Energetic (MrBeast-style), Documentary, Podcast clip, Cinematic,
  Tutorial, Auto.
- **Quality**: kimo export at CRF 16, then a YouTube upload master (H.264 High, closed
  GOP, recommended bitrate, AAC 384 kbps, -14 LUFS / ≤ -1 dBTP). Each pass is measured
  (loudness, true peak, black frames, dead air) and AI-checked on 18 frames; faults are
  fixed and re-rendered (up to 3 passes).
- **Edit it yourself**: drag-to-edit timeline (move, trim, delete, caption text), or ask
  kimo for changes in chat; both apply on top of the saved project.
- **YouTube pack**: thumbnail, title, description, chapters.
- **Captions only**: fully offline — whisper on your PC, no internet needed.
- Formats: YouTube 16:9 (1080p or 4K), Shorts/Reels/TikTok 9:16, square 1:1, feed 4:5.
- Batch: drop several videos, tick *Batch*, one prompt edits each one in a queue.
- **Small copy** re-encodes on your GPU (NVENC, Quick Sync or AMF) when there is one.

## Privacy

Media never leaves your PC. AI edit sends only the prompt, text results from the engine
and two contact sheets + two frames + measured audio numbers per check to `api.getkimo.tech` (no API key is
in the app). SAM features (subject tracking, 9:16 follow-reframe, text behind subject,
background blur/replace, object blur) upload a downscaled (~720p, silent) copy of only the
clip segment being processed to Meta via the same proxy, and delete it after. See `THIRD_PARTY_NOTICES.md` for bundled licenses.

## Build

`.github/workflows/desktop.yml` (windows-latest) downloads the bundled tools into
`desktop/vendor`, builds the NSIS installer with electron-builder, installs it on the
runner, runs `kimo.exe --smoke <clip>` (engine start, ffmpeg, whisper captions, one real
render) and publishes the release.
