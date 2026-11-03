# Small online setup

The native NSIS launcher downloads the frozen, published v0.4.0 offline installer
during setup instead of embedding Electron, FFmpeg, Whisper and models. The initial
EXE must be at most 2,000,000 bytes; the later app download is still 369,147,721
bytes (about 369 MB / 352 MiB). This does not reduce the installed app size.

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
failure), verifies that failure preserves an existing app sentinel, then performs
a real internet installation of the pinned release and checks installed files
and the executable's 0.4.0 version. It never launches Electron or renders media.
Only after passing may its publish option add the new launcher and manifest to
v0.4.0; it does not overwrite the offline EXE, blockmap, `latest.yml`, or tag.

Hosting status: GitHub Release assets are the current working source. Cloudflare
R2 preflight on 2026-11-03 returned error 10042: enable R2 in the dashboard. The
separate `downloads.getkimo.tech` CDN endpoint is pending that user account step;
no regional speed claim is made before it exists and is measured. Once enabled,
upload the exact pinned EXE, enable the dedicated custom domain and caching, test
full/ranged downloads and the checksum, then make it primary with GitHub fallback
and rebuild/requalify the launcher. Never embed Cloudflare credentials in setup.

Distribution uses NSIS/zlib, InetC (NSIS licence), and StdUtils (LGPL 2.1+), the
same setup plug-ins already used by electron-builder. Upstream licence and source:
https://nsis.sourceforge.io/License,
https://nsis.sourceforge.io/Inetc_plug-in,
https://github.com/lordmulder/stdutils.
