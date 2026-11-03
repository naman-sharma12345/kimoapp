# kimo v0.4.3 — Incremental updates

The earlier small setup was a first-install bootstrap: running it again fetched
the full app. This version reconstructs updates from the cached previous
installer, downloading changed blocks and reusing the rest locally. Both setup
and background updates require explicit approval before a full-download fallback;
silent setup fails instead of fetching the full app if no valid delta is possible.

Every reconstructed installer must match the pinned size and SHA-512 before it
can run. A server ignoring Range, corrupt data, a missing/mismatched cached base,
or an oversized delta cannot silently cause a full download. New installations
still need the complete application once. Tools/models/Electron are reused by
block identity for code-only updates; local reconstruction still needs disk space.

All v0.4.2 render-boundary safeguards and prior Windows path fixes remain.
