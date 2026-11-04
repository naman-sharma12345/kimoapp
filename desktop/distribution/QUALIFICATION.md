# Online installer qualification — 2026-11-03

This section records the original v0.4.0 first-install bootstrap. For the current
small installer, see [v0.5.0](ONLINE-0.5.0.md) and its
[qualification evidence](evidence/0.5.0/). v0.4.3 changed both setup and background
updater behavior; the historical measurements below remain unchanged.

The initial download is **218,072 bytes** (218 KB / 0.218 MB), below the requested
1–2 MB ceiling. Setup then retrieves the unchanged **369,147,721-byte** v0.4.0
app. This is a delivery change; application size, render quality and the accepted
Phase 12 performance gap are unchanged.

- Online setup SHA-256:
  `21b62e4034af02e7406119e03e7b051f3585f6eec26de44c3f35f446d5929da1`.
- Original offline EXE SHA-256:
  `1031acc75d3946fbe1e5da5ac2d8fac9833af5bf6672506e9520f26e7f96f2ce`.
- App payload SHA-512 is pinned in [payload-0.4.0.json](payload-0.4.0.json); NSIS checks both
  exact length and SHA-512 before executing any app-changing operation.
- [Windows publication run 41621814250](https://github.com/naman-sharma12345/kimoapp/actions/runs/41621814250),
  source `d457bfe8926bd4676dd907a4e89630ffda5b1302`, passed the native fixtures,
  downloaded the real CDN payload, installed it into a folder containing spaces,
  and checked `kimo.exe`, `app.asar`, FFmpeg and product version **0.4.0.0**.
  Real download/install took **33.9436s** on that standard hosted Windows runner.
  The workflow published the launcher and manifest and downloaded the launcher
  from GitHub again, comparing SHA-256 to the exact tested bytes.
- Fixtures pass: backup-server download; retaining the registered 64-bit per-user
  installation directory; equal-length corrupt payload rejected (exit 2);
  unavailable server rejected without a silent dialog (exit 2); payload failure
  reported (exit 3). Failed fixture cases preserve the prior app sentinel.
  The registry case uses a dedicated fixture-only key, not real app registration.
- [CDN byte/range run 41621359588](https://github.com/naman-sharma12345/kimoapp/actions/runs/41621359588)
  downloaded the full file and checked SHA-512, a 1 MB initial range, a range
  crossing a 20 MB piece boundary, the final 4096 bytes, HEAD and invalid-range
  416 handling. Full download **15.9838s / 23.10 MB/s** on its SJC runner route.
  This measures that route, not the user's ISP or all regions.
- [Launcher CDN deployment 41622182934](https://github.com/naman-sharma12345/kimoapp/actions/runs/41622182934)
  also verifies the small published launcher against its exact GitHub manifest.
  Its full payload download took **4.0997s / 90.04 MB/s** on the SJC route; this
  warm-route result is not a promise for the user's connection. All four CDN
  unit tests pass, including omitted asset length headers and ignored ranges.
- Machine-readable evidence is in [evidence/](evidence/). The original v0.4.0
  EXE/blockmap/`latest.yml` and tag remain unchanged; the new EXE and manifest are
  additional assets. Existing electron-updater behavior is unchanged.

Cloudflare R2 was unavailable without a payment card. The dedicated
`kimo-downloads` Worker uses the already available **free Static Assets** service,
with 19 immutable pieces smaller than its 25 MiB/file limit. A native fixed-length
stream joins the pieces without buffering the whole app. The original GitHub EXE
is the fallback if the CDN is unavailable. Free Worker request/CPU limits still
apply. No R2, paid-plan activation, new credentials or application-backend changes.

The root required command chain (lint, typecheck, 311 tests, build) passed in CI 41621812437. Its later web bundle-budget step retains the pre-existing 120 KB
landing limit failure; the entire broader web workflow is not claimed green.
No local browser, GPU, media, installer build or installed-app test ran on the
user's computer. No benchmarks, renders or paid AI requests were needed.
The historical spending-ledger Git blob remains
`f33b9339c1459b02a4d3633b6dad989ffdf6d8db`.

Interactive wizard clicks, interrupted-network Retry/Cancel dialogs, SmartScreen
and an actual old-profile upgrade were not automated. Native NSIS provides those
controls; hosted tests exercise silent success/failure, directory parsing,
integrity gates and HTTP resume ranges. The installer remains unsigned, like
the existing release. Setup does not change driver settings or probe a GPU.
