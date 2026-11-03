# kimo v0.4.2 — Runaway render fix

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
