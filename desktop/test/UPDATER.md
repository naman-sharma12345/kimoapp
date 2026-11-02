# v0.3.2 → v0.4.0 updater verification

`verify-release.mjs` uses the installed electron-updater provider parser and file
selection helpers. It requires version 0.4.0, `kimo-Setup-0.4.0.exe`, an existing
nonempty blockmap, and the exact installer byte count and SHA-512 in latest.yml.
The installer hash is streamed. A mismatched-size fixture must fail. The Windows
qualification stores `release-verification.json` alongside its installer evidence.
On publication, the workflow downloads all three published assets on the hosted
runner, repeats feed/size/SHA-512 checks and compares their SHA-256 hashes with
the built files. `published-release-verification` retains that proof.

This checks the feed contract and package bytes. It does not prove a signed-in
user's network, SmartScreen choices, profile migration, differential download or
interactive restart. The binary is unsigned. The interactive upgrade test below
remains a separate manual test until its result is explicitly recorded.

## Manual old-install upgrade

1. Use an isolated Windows VM, retain a backup, and install the published v0.3.2
   package. Launch it and create a small saved project, caption edit and settings
   change. Quit and retain the profile copy.
2. Confirm its `resources/app-update.yml` uses the GitHub provider with owner
   `naman-sharma12345` and repo `kimoapp`. Use the published feed; do not embed an
   access token or point the old build at an untrusted mirror.
3. Launch v0.3.2 after v0.4.0 is published. Check that an update is offered, the
   download completes, and restart occurs only after the user's acceptance.
4. Confirm the installed version is 0.4.0, the saved project/settings survive,
   offline captions still work, and an export opens. Record OS/build, versions,
   timestamps and screenshots. If the GitHub request is blocked, retain its
   error instead of claiming a successful update.

No such interactive result is implied by the automated feed-parser proof.
