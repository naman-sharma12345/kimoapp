<div align="center">

<picture>
  <source media="(prefers-color-scheme: dark)" srcset="docs/readme/kimo-mark-on-dark.svg">
  <source media="(prefers-color-scheme: light)" srcset="docs/readme/kimo-mark-on-light.svg">
  <img alt="kimo" src="docs/readme/kimo-mark-on-light.svg" width="120" height="120">
</picture>

# kimo

**Tell it the video you want. Watch every edit happen.**

A Windows video editor with local Whisper, FFmpeg, fonts and the kimo v6 engine
in one installer.

[Download for Windows · 218 KB setup](https://downloads.getkimo.tech/desktop/v0.4.0/kimo-Online-Setup-0.4.0.exe)
· [All releases](https://github.com/naman-sharma12345/kimoapp/releases)
· [Desktop guide](desktop/README.md)

</div>

## Creator edits

Nine templates cover clean/punchy shorts, talking-head YouTube videos, vlogs,
tutorials, podcast clips, documentaries, music montages and explainers. They
combine transcript cuts, a camera director, animated captions, graphics/b-roll,
speech-synced visuals, sound design and colour finishing with a structured planner
and critic. Templates provide starting policies; quality depends on the footage
and plan. [Template details](desktop/README.md#templates).

![Choose a creator template](docs/readme/creator-picker.gif)

The picker demonstration uses ProPublica's _Unedited: ProPublica Interviews
President Biden, September 2023_, [source](https://commons.wikimedia.org/wiki/File:Unedited-_ProPublica_Interviews_President_Biden,_September_2023.webm),
[CC BY 3.0](https://creativecommons.org/licenses/by/3.0/). The preview is cropped,
styled and captioned; labels are not dialogue or endorsement.

| Before: prepared raw interview                      | After: clean-shorts fixture                            |
| --------------------------------------------------- | ------------------------------------------------------ |
| ![Raw first second](docs/readme/creator-before.jpg) | ![Creator first second](docs/readme/creator-after.jpg) |

Both are actual benchmark first-second sheets from the same ProPublica source
credited above. The after image uses an offline deterministic plan; its hand-over-
face opening and competing hook/caption text are documented limitations.
This shows the transformation, not a claim of professional editorial quality.

Editing uses a reduced preview; export renders the full saved timeline with
software x264 medium. The optional small copy can use NVENC, Quick Sync or AMF.
Pass caches retain base picture, overlays and audio stems. Conservative background
worker limits reduce contention while you use the computer; full export still
uses CPU and disk.

Studio exposes live stages, seven timeline lanes, camera and caption controls,
sound/look inspectors, source-anchored edits and undo/redo. Quality checks retry a
failing critical stage once and show remaining failures or unavailable evidence.
Creator Score is an explicitly limited heuristic, not a human editorial grade.

Read the [final benchmark report](desktop/test/bench/FINAL.md) and
[measured results](desktop/test/bench/RESULTS.md) for real before/after evidence,
performance, source credits and unresolved limits. Hosted replay checks do not
prove provider adherence or interactive updater behaviour.

## Install and privacy

Download the [218 KB online setup](https://downloads.getkimo.tech/desktop/v0.4.0/kimo-Online-Setup-0.4.0.exe).
It downloads the 369 MB app during installation from Cloudflare's CDN, with GitHub
as backup. No card or R2 account is needed. The full offline installer remains in
[Releases](https://github.com/naman-sharma12345/kimoapp/releases/latest).
The package is unsigned, so Windows may display SmartScreen. The app checks GitHub
for updates and asks before restarting. Inputs over three hours are refused;
large/4K footage is subject to available disk and memory.

Rendering and Whisper run locally. AI edits send prompts, text tool results and
selected review images/audio measurements through the existing proxy. SAM effects
send a downscaled silent segment for tracking, deleted afterwards. Captions-only
works offline. No provider key is bundled. See [privacy and notices](desktop/README.md#privacy).

## Build and check

```sh
npm ci --prefix desktop
npm test --prefix desktop
npm run build:renderer --prefix desktop
```

The bundled tools belong in `desktop/vendor`. The manual
[Windows workflow](.github/workflows/desktop.yml) bootstraps tools, tests, builds
and installs the package, then runs offline creator replays. `release=true`
publishes only after qualification. The separate full-bench workflow checks all
nine templates against a committed score baseline with a three-point tolerance.
Full footage renders and installer builds run on hosted runners.

| Path        | Contents                                                            |
| ----------- | ------------------------------------------------------------------- |
| `desktop/`  | Windows app, creator pipeline, compositor, SAM bridge and installer |
| `apps/web/` | Browser Studio                                                      |
| `apps/api/` | Existing proxy and editing-session backend                          |
| `packages/` | Typed client, compositor and mock server                            |
| `deploy/`   | Hosting and self-hosted engine setup                                |
| `docs/`     | Design, contracts, decisions and QA evidence                        |

Web development uses Node 22+ and pnpm 9.15.9:
`pnpm install --frozen-lockfile && pnpm dev:mock`. The web runs on port 3000 and
the mock API on 8787. Required checks: `pnpm lint`, `pnpm typecheck`, `pnpm test`,
`pnpm build`; browser checks: `pnpm e2e`.

[Third-party notices](desktop/THIRD_PARTY_NOTICES.md) cover bundled assets and
tools. Benchmark outputs carry their own source-specific credits. macOS, code
signing, multicam synchronization and interactive old-install upgrade validation
remain separate work.
