# kimo v0.4.3 — Incremental updates

[Download the small online installer (224 KB)](https://github.com/naman-sharma12345/kimoapp/releases/download/v0.4.3/kimo-Online-Setup-0.4.3.exe)

[Fast Cloudflare mirror](https://downloads.getkimo.tech/desktop/v0.4.3/kimo-Online-Setup-0.4.3.exe) · [Full offline installer](https://github.com/naman-sharma12345/kimoapp/releases/download/v0.4.3/kimo-Setup-0.4.3.exe)

The previous small setup always downloaded the complete app when run again.
This version reuses the cached previous installer and downloads changed blocks.
Both the online setup and background app updater now require approval before
falling back to a full download; silent setup stops instead.

First installation still needs the complete 369 MB application once. Keep the
updater cache: without a matching previous installer, a small update cannot be
prepared. Reconstruction and installation need local disk space and disk I/O.
The final installer must match its exact expected size and SHA-512 before use.
Ignored HTTP ranges, corrupt blocks and oversized deltas cannot silently trigger
a full download.

The [actual Windows upgrade test](https://github.com/naman-sharma12345/kimoapp/actions/runs/41673388999)
installs v0.4.2, upgrades the same folder to v0.4.3.0, and preserves saved project
data. It downloads **3.73 MB total**, including both blockmaps, and reuses
**366.20 MB locally**. With the cached base removed, silent setup stops and leaves
the existing app unchanged. The tested launcher is **224,178 bytes**.

Verified application checks: **215 desktop tests pass, zero skips**. The actual
installed Windows app completes both a normal preview and the forced-fallback
rounded-cut reproduction, producing exactly 30 frames with zero model requests.
[Hosted build and installed-app checks](https://github.com/naman-sharma12345/kimoapp/actions/runs/41670978027).
All v0.4.2 render-boundary safeguards and Windows source-path fixes are retained.
The previously documented export-performance gap is unchanged.

A local reconstruction of v0.4.1 → v0.4.2 transferred **3,756,949 bytes** including
both blockmaps, reused **366,162,961 bytes**, and matched the published installer
SHA-512. It took 12.217 seconds and did not execute the installer or touch a project.
The published-version upgrade qualification and transfer measurements are recorded
in [the patch record](https://github.com/naman-sharma12345/kimoapp/blob/main/desktop/distribution/PATCH-0.4.3.md).

[Machine-readable evidence](https://github.com/naman-sharma12345/kimoapp/tree/main/desktop/distribution/evidence/0.4.3).
