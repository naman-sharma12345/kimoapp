# Small online setup

The native NSIS launcher downloads the pinned, qualified offline installer
during setup instead of embedding Electron, FFmpeg, Whisper and models. The initial
EXE stays under the 2,000,000-byte build gate.
The v0.4.2 app download is 369,148,808 bytes (about 369 MB / 352 MiB).
This does not reduce the installed app size.

`payload.json` pins the exact published EXE's length and SHA-512. HTTPS/TLS and the
checksum are both required. Setup downloads into its private temporary directory,
checks length and hash, and only then invokes the qualified offline installer.
No command-line package/URL override is accepted. A failed/cancelled/unverified
download never launches the payload or uninstalls an existing app. The full
installer retains ownership of upgrades, shortcuts, app data and uninstall.

The native setup provides directory selection, download progress, interactive
connection retry/resume within a running download, cancellation, and a finish
page with an option to open the app. It requires 64-bit Windows and approximately
2 GB free during setup. Interrupted downloads are not cached between setup runs.
Silent `/S` calls return failure without network dialogs: 1 = download cancelled,
2 = download/hash/platform/duplicate-instance failure, 3 = installation failure.
The inner installer runs silently after the user selects Install in this visible
setup. The launcher does not change driver/GPU settings or execute a renderer.

Build on Windows with `npm ci --prefix desktop` then
`npm run dist:online --prefix desktop`. This reuses electron-builder 25.1.8's
checksum-pinned NSIS 3.0.4.1 and nsis-resources 3.4.1 downloads, not a new runtime
dependency. The output includes an exact-size/SHA-256 verification manifest.

`.github/workflows/desktop-online.yml` runs native localhost fixtures (backup
server success, equal-length tampering, both servers unavailable, child install
failure and retaining the registered 64-bit upgrade directory), verifies that
failure preserves an existing app sentinel, then performs
a real internet installation of the pinned release and checks installed files
and the executable's 0.4.0 version. It never launches Electron or renders media.
Only after passing may its publish option add the new launcher and manifest to
v0.4.0; it does not overwrite the offline EXE, blockmap, `latest.yml`, or tag.

The primary server is `downloads.getkimo.tech` on Cloudflare Workers Static
Assets, with the exact GitHub release as backup. R2 needed a payment card, so this
uses the existing free account without R2 or paid storage. The large EXE is split
into 19 immutable pieces of at most 20 MB (under the 25 MiB static-asset limit).
A dedicated distribution Worker streams them as one EXE with native `pipeTo` and
backpressure. It buffers no whole application, validates the source before
deployment, and supports HEAD, single byte ranges and resume across piece
boundaries. Only range-boundary pieces pass through a bounded slicing stream.
Assets bindings need not supply Content-Length or implement Range themselves.
The client still verifies the whole EXE's pinned SHA-512 before execution.

This is a separate installer service: web/API Workers, routes, secrets, engine and
databases are unchanged. `guard-cdn.mjs` refuses an unrelated existing DNS/service
on this hostname. `.github/workflows/desktop-cdn.yml` deploys only this service and
tests full-length/SHA-512, cross-piece ranges, end ranges, HEAD and 416 handling.
The free Worker daily request/CPU limits apply; GitHub remains the fallback.
No regional speed guarantee is made. No Cloudflare credential enters setup.

The same verified launcher is also served directly as a small static file:
https://downloads.getkimo.tech/desktop/v0.4.2/kimo-Online-Setup-0.4.2.exe .
Reproduce with the online workflow's publish option, then the CDN workflow's
`include_online=true` option. Both refuse unverified files. Existing release
assets are never clobbered; publish a newly versioned launcher for future changes.
Exact measured proof and test limitations: [QUALIFICATION.md](QUALIFICATION.md).

The versioned CDN manifest retains v0.4.0, v0.4.1 and v0.4.2 pieces and launchers;
publishing the patch does not remove immutable URLs used by an older setup.
The online qualification also installs the pinned prior-version payload first, upgrades
that same location through the new launcher, and checks a saved project sentinel.

Distribution uses NSIS/zlib, InetC (NSIS licence), and StdUtils (LGPL 2.1+), the
same setup plug-ins already used by electron-builder. Upstream licence and source:
https://nsis.sourceforge.io/License,
https://nsis.sourceforge.io/Inetc_plug-in,
https://github.com/lordmulder/stdutils.
