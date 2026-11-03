# kimo v0.4.1 — Windows preview fix

Fixes `EDL timeline: at least one frame required` when generating or resuming a
creator preview on Windows. Saved EDL paths use forward slashes; transcript paths
can use backslashes. The compiler now matches those representations consistently
and rejects genuinely missing selected media before creating invalid source IDs.
Existing saved plans and source files do not need to be deleted or reimported.

This patch keeps the small online setup and Cloudflare CDN delivery. The full app
still downloads during setup. No render-quality, GPU-driver or AI-budget changes.

Qualification: five-source saved-preview regression, missing-source guard, full
desktop tests, renderer build, updater feed/hash verification and a two-second
synthetic preview through the actually installed Windows app. All build/media
checks run on standard GitHub-hosted runners with model network calls blocked.
No full benchmarks or user footage are uploaded. The previously documented
v0.4.0 export-performance gap remains; this patch makes no new performance claim.
