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

## Qualification

- [Application build and installed previews](https://github.com/naman-sharma12345/kimoapp/actions/runs/41670978027):
  215 desktop tests pass, zero skips. Actual installed v0.4.3.0 passes the normal
  preview and forced fallback rounded-cut check (exactly 30 frames, zero model calls).
- [Actual online upgrade](https://github.com/naman-sharma12345/kimoapp/actions/runs/41673388999):
  the 224,178-byte launcher upgrades the same spaced folder from v0.4.2 to
  v0.4.3.0 and preserves saved project data. Total measured transfer is
  **3,725,466 bytes**, including both blockmaps: 2,954,313 changed payload bytes
  and **366,197,822 bytes reused**. Exact final SHA-512 passes. Upgrade takes
  41.955 seconds on the hosted Windows runner; user disk/network speeds vary.
- The native missing-cache test exits 2 in 0.323 seconds, leaves the old app.asar
  checksum unchanged and does not silently fetch the full payload. Corruption,
  backup-server, registered-directory and child-failure fixtures also pass.
  Full-download consent is covered by policy tests; interactive clicks are not
  automated. The actual upgrade uses the silent path with a valid cache.
- [Public CDN verification](https://github.com/naman-sharma12345/kimoapp/actions/runs/41673382598):
  exact full bytes/SHA-512, published blockmaps, HTTP ranges, HEAD, resume
  boundaries and 416 handling pass for all four immutable versions. An earlier
  immediate post-deploy GET returned 404 during edge propagation; verification
  now waits for availability before applying the same strict byte/hash checks.
- The user's installed v0.4.1 → v0.4.3 plan needs 2,950,078 changed payload bytes
  plus 771,365 map bytes, with 366,202,057 reused bytes. This figure is a
  published-blockmap plan, not a completed local install. A real local
  v0.4.1 → v0.4.2 reconstruction independently transferred 3,756,949 bytes,
  matched the published SHA-512 and did not execute its output.
- Root `pnpm lint && pnpm typecheck && pnpm test && pnpm build` passes in
  [CI 41672767876](https://github.com/naman-sharma12345/kimoapp/actions/runs/41672767876).
  The later web bundle-budget step retains the existing landing-page 120 KB
  failure; the entire broader web workflow is not claimed green.

Evidence: [evidence/0.4.3/](evidence/0.4.3/). No local GPU test, full user-project
render, benchmark or paid AI call was run. The historical spend ledger is unchanged.
First installation is still 369,152,135 bytes once. Keep the updater cache;
reconstructing and unpacking the full installer still requires disk space and I/O.

[Final CDN publication](https://github.com/naman-sharma12345/kimoapp/actions/runs/41674085002)
also verifies the exact GitHub-published 224,178-byte launcher against SHA-256
`346f8ed45269705658bd4c559d758f6af7d6bcf8fc19e24131481b3997455879`,
its full payload and every preserved earlier version. The launcher downloaded
to the user's Downloads folder matches those bytes and was not executed.
