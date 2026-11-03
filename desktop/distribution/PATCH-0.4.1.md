# kimo v0.4.1 — Windows preview fix

[Download the recommended online installer (218 KB)](https://github.com/naman-sharma12345/kimoapp/releases/download/v0.4.1/kimo-Online-Setup-0.4.1.exe)

[Fast Cloudflare mirror](https://downloads.getkimo.tech/desktop/v0.4.1/kimo-Online-Setup-0.4.1.exe) · [Full offline installer (369 MB)](https://github.com/naman-sharma12345/kimoapp/releases/download/v0.4.1/kimo-Setup-0.4.1.exe)

Fixes `EDL timeline: at least one frame required` when generating or resuming a
creator preview on Windows. Saved EDL paths use forward slashes; transcript paths
can use backslashes. The compiler now matches those representations consistently
and rejects genuinely missing selected media before creating invalid source IDs.
Existing saved plans and source files do not need to be deleted or reimported.
Install v0.4.1, reopen kimo and choose **resume edit** on the failed project.

This patch keeps the small online setup and Cloudflare CDN delivery. The full app
still downloads during setup. No render-quality, GPU-driver or AI-budget changes.
Initial setup: **218,091 bytes**. App payload: **369,147,985 bytes**.

Qualification: five-source saved-preview regression, missing-source guard, full
desktop tests, renderer build, updater feed/hash verification and a two-second
synthetic preview through the actually installed Windows app. All build/media
checks run on standard GitHub-hosted runners with model network calls blocked.
No full benchmarks or user footage are uploaded. The previously documented
v0.4.0 export-performance gap remains; this patch makes no new performance claim.

All **205 desktop tests pass with zero skips**. The actually installed app
created a nonempty preview with model network access blocked. A separate hosted
test installed v0.4.0, upgraded the same directory through the new online setup,
verified executable version **0.4.1.0**, and preserved a saved-project sentinel.
Interactive old-profile UI behavior remains a manual check.

[Build and installed preview verification](https://github.com/naman-sharma12345/kimoapp/actions/runs/41643764413) · [Online upgrade verification](https://github.com/naman-sharma12345/kimoapp/actions/runs/41645405182).
Checksums and reports are in [patch evidence](https://github.com/naman-sharma12345/kimoapp/tree/main/desktop/distribution/evidence/0.4.1).
