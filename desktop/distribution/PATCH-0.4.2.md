# kimo v0.4.2 — Runaway render fix

[Download the recommended online installer (218 KB)](https://github.com/naman-sharma12345/kimoapp/releases/download/v0.4.2/kimo-Online-Setup-0.4.2.exe)

[Fast Cloudflare mirror](https://downloads.getkimo.tech/desktop/v0.4.2/kimo-Online-Setup-0.4.2.exe) · [Full offline installer](https://github.com/naman-sharma12345/kimoapp/releases/download/v0.4.2/kimo-Setup-0.4.2.exe)

Fixes an unlimited FFmpeg job when rounded adjacent cuts produced a negative
one-frame gap in the fallback compositor. The baked timeline now assigns each
boundary frame once, gives the later cut ownership, and never generates padding
for a nonpositive gap. Every explicit compositor FFmpeg frame limit is checked
before launch; negative, zero, noninteger and nonfinite counts are rejected.

Old picture caches are invalidated for the corrected compositor. Saved plans,
original media and the previous Windows path fix are retained. Positive gap
padding now reports progress. This fixes a hang, not the existing export-speed
limitations: legitimate renders can still take time.

Publication requires frame-limit and chunk-boundary regressions, an actual
rounded-cut render with independently decoded source frame IDs, all desktop
tests, an installer build, and both normal-preview and forced-fallback boundary
checks through the installed Windows app. All media tests/builds run on standard
GitHub-hosted runners with no paid model calls or user footage uploads.

Verified: **208 desktop tests pass, zero skips**. The installed Windows app
completes both a normal preview and the forced-fallback boundary reproduction;
the latter produces exactly **30 frames**, exits normally and makes zero model
network calls. [Windows build/install checks](https://github.com/naman-sharma12345/kimoapp/actions/runs/41663467603).

At the user's explicit request, a local **CPU-only, one-core, below-normal-priority**
test rendered a 192×128 synthetic source and checked all 30 output source frame
IDs. The two focused tests completed successfully in about **2.1 seconds**.
No local GPU test or full-project render was run. A separate read-only metadata
check of the existing 43-clip project found **three old negative gaps and zero
after the fix**, with correct coverage across every 30-second chunk.

Install v0.4.2 and choose **resume edit** on the saved project. The full project
has not been rendered as part of these checks, and this patch does not claim to
meet the previously missed export-performance targets.
[Detailed evidence](https://github.com/naman-sharma12345/kimoapp/tree/main/desktop/distribution/evidence/0.4.2).

Initial launcher: **218,135 bytes**. App download during setup: **369,148,808 bytes**.
[Upgrade qualification](https://github.com/naman-sharma12345/kimoapp/actions/runs/41665698493)
installs v0.4.1, upgrades the same folder through the new online launcher, verifies
version **0.4.2.0** and preserves a saved project sentinel. The initial attempt
41665176638 crashed while seeding the older installer; the fresh-runner retry
passed. This is a silent installation check, not an interactive UI/profile test.
