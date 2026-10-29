# kimo engine (real kimo v6 on Naman's PC)

The real kimo v6 engine (`kimo-mcp`) behind a small authenticated HTTP bridge
(`server.mjs`), running on Naman's own PC and reached by app.getkimo.tech through the
free Cloudflare Tunnel **kimo-engine** at `https://engine.getkimo.tech`.

- Only the kimo-api Worker can call it: every request needs `X-Engine-Token` (Worker
  secret `KIMO_ENGINE_TOKEN`); `/health` is the only open path.
- Clips live in the OS temp folder (`kimo-jobs/<job>`) for one job and are deleted when
  the result has been downloaded, or after 30 minutes. Logs carry job ids, tool names and
  timings only, never media.
- Free: Cloudflare Tunnel on the free plan, no Access, no card. It works only while the PC
  is on and the engine is running. When it is offline the studio says
  "real kimo engine offline — using browser editor" and edits in the browser as before.

## One-command setup

Windows (PowerShell, no admin needed; uses Docker Desktop when it is running, otherwise
the native kimo Windows release + portable Node, FFmpeg and whisper):

```powershell
$env:KIMO_TUNNEL_TOKEN='<tunnel token>'; $env:KIMO_ENGINE_TOKEN='<engine token>'; irm https://raw.githubusercontent.com/naman-sharma12345/kimoapp/main/deploy/kimo-engine/setup.ps1 | iex
```

Linux (uses Docker when it is running, otherwise the native x86_64 release; native mode
needs `node` and `ffmpeg` installed):

```bash
curl -fsSL https://raw.githubusercontent.com/naman-sharma12345/kimoapp/main/deploy/kimo-engine/setup.sh | KIMO_TUNNEL_TOKEN='<tunnel token>' KIMO_ENGINE_TOKEN='<engine token>' bash
```

The two tokens are never committed. The tunnel token comes from Cloudflare (Zero Trust >
Networks > Tunnels > kimo-engine, or `GET /accounts/<id>/cfd_tunnel/<id>/token`); the
engine token is the same value as the Worker secret `KIMO_ENGINE_TOKEN`.

After setup: start again with `start.ps1` / `start.sh` and stop with `stop.ps1` /
`stop.sh` in `%LOCALAPPDATA%\kimo-engine` (Windows) or `~/.local/share/kimo-engine`
(Linux). Check `https://engine.getkimo.tech/health`.

## How the studio uses it

`GET /v1/engine` (health) → `POST /v1/sessions/<id>/engine` (job) → clips streamed with
`POST …/engine/<job>/media/<name>` → `POST …/engine/<job>/step` repeatedly (edit script
first, then the AI drives kimo tools: project_set, import_media, auto_rough_cut,
auto_captions with whisper, titles, auto_grade, finish_audio…; every tool call shows in
the studio's live op log; then the engine exports, renders 3 frames + an audio/loudness
report, and the AI checks them and fixes + re-renders up to 3 passes) →
`GET …/engine/<job>/output` downloads the mp4 to the user's device and deletes the job.
Long tool calls answer `202 {pending}` after 80 s and are polled, so no hop passes
Cloudflare's 100 s limit.

## Files

- `server.mjs`: the bridge (Node 18+, Linux or Windows).
- `Dockerfile.release`: image from the prebuilt kimo v6.0.0 x86_64 release (fast).
- `Dockerfile`: image built from kimo source (branch v6-all), for arm64.
- `setup.ps1`, `setup.sh`: the one-command setups above.
