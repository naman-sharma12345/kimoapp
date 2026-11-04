# Online setup for the published v0.5.0 app

This is a small delivery wrapper around the existing v0.5.0 Windows installer.
The original 368,924,142-byte EXE, blockmap, latest.yml and release tag are retained.
The app is not rebuilt from this checkout: origin/main and tag v0.5.0 initially
pointed to v0.4.3 source. Hosted setup qualification checks both the installed
EXE product version and the app.asar package version against v0.5.0.

The wrapper uses the existing pinned NSIS toolchain and the published payload's
exact size and SHA-512. Changed blocks come from the free Cloudflare CDN. The
previous cached installer supplies unchanged blocks; a new installation still
needs the complete application once. A missing/mismatched cache, corrupt data
or a server ignoring Range cannot silently trigger a full download. Interactive
setup asks for full-download consent; silent setup fails.

The official blockmap plan for v0.4.3 → v0.5.0 has 73,323,001 changed payload
bytes and 295,601,141 reused bytes. The two maps add 770,665 bytes. The total
expected network transfer is therefore 74,093,666 bytes, rather than 368,924,142.
This engine update is larger than a code-only patch. Its pinned bootstrap budget
is 80 MiB of changed blocks, with a separate 80%-of-payload ceiling and a hard
128 MiB maximum for any configured release budget. Other app background updates
retain their existing 64 MiB policy; this wrapper does not modify the frozen app.

[CDN qualification](https://github.com/naman-sharma12345/kimoapp/actions/runs/41786505787)
checks full-file SHA-512, blockmaps, HTTP ranges, boundary resume, HEAD and 416
handling for v0.5.0 plus all four preserved v0.4.x versions. No R2, paid hosting
plan or payment card is needed. Route measurements are not a connection-speed
guarantee for the user's ISP.

Sixteen focused updater/CDN tests pass. They cover ignored/corrupt range
responses, reuse, missing caches, release-specific byte limits, the minimum
reuse requirement, bounded interrupted-range retries, the pinned GitHub backup,
and explicit consent before background full-download fallback.
Root lint/typecheck/tests/build passes in CI 41787683774; the later existing web
bundle-budget failure is separate. This delivery task does not requalify the
v0.5 engine's render-speed claims. No local GPU/app/media/build test or paid AI
request is part of this work. Evidence is in [evidence/0.5.0/](evidence/0.5.0/).

## Native qualification

[Windows run 41787901835](https://github.com/naman-sharma12345/kimoapp/actions/runs/41787901835)
builds the **225,068-byte** launcher, seeds the actual v0.4.3 installer into a
folder containing spaces, then upgrades through the small setup. It verifies
product version **0.5.0.0**, app.asar package version **0.5.0**, the incremental
updater modules, saved project preservation and the exact reconstructed SHA-512.
The measured transfer is **74,093,666 bytes**, including both maps, with
**295,601,141 bytes reused**. The actual upgrade takes 32.079 seconds on the
hosted Windows runner.

The successful run recovers one disconnected CDN request by retrying the same
bounded range through GitHub. It never fetches the full payload as a fallback.
Transport retries stop after three attempts per range, obey the total retry-byte
budget and retain final integrity checks. Corrupt data and a server ignoring
Range are still refused. Failed partial output is removed and the base is retained.

With the base cache withheld, silent upgrade exits 2 in 0.297 seconds and leaves
the old app.asar checksum unchanged. After installation, re-running the same
launcher with the cache withheld exits 0 in 0.289 seconds and leaves the installed
app checksum unchanged. It recognizes the current version without another download.

Earlier runs 41786847860 and 41787210437 stop before installation on a transfer
failure; the second identifies `UND_ERR_SOCKET` / "other side closed". This led
to bounded range retry/backup support. Run 41787686912 instead crashes with
3221225477 while seeding the unchanged old v0.4.3 installer, before reaching the
new setup; its fresh-runner retry passes. Assertions were not relaxed.

Launcher SHA-256:
`b49d1adbef8ffcb1d1d5dd2dc3c3895ab4a474b4bd8719781388c2d3ba2b2e18`.
The hosted publication step downloads the GitHub asset again and compares its
checksum with the exact tested launcher. This is silent native qualification;
interactive wizard and full-download consent clicks are not automated.

[Final CDN publication 41788187185](https://github.com/naman-sharma12345/kimoapp/actions/runs/41788187185)
passes full payload, range, blockmap and launcher checks for the current version
and every preserved v0.4.x release. Both the public GitHub and CDN launchers match
the qualified 225,068-byte file and SHA-256. A verified copy is saved to the user's
Downloads folder without executing it. Original EXE/blockmap/latest.yml digests
are independently checked against their values captured before this work.
