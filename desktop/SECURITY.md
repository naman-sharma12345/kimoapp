# kimo desktop: who can spend kimo's AI key

kimo's own Meta key never ships in the app and never leaves the kimo-api Worker. Since Phase 7 it answers only kimo's owners. Everyone else uses their own key (BYOK) or works without AI. This file describes that lockdown; it names no secret values and does not list who is on the allowlist.

## Owner allowlist

- The Worker reads the owner list from the `OWNER_ALLOWLIST` Worker secret (set with `wrangler secret`, never committed). A GitHub or Google identity that is not on it gets no account row, no auth code and no token: the sign-in redirect comes back with `not_allowed`, and token or refresh calls answer `403 owner_only`.
- The list is checked again on every token refresh, so removing someone from the secret ends their access within one token lifetime.
- If the secret is missing or empty, nobody is an owner: the Worker fails closed rather than open.

## Desktop sign-in (owners only)

- **Sign in** opens the system browser on the Worker's GitHub/Google OAuth. The app listens on a one-off `127.0.0.1` loopback port and uses PKCE (S256 code challenge, random state), so an intercepted code is useless without the verifier held in the app's memory.
- The Worker mints a signed access token that lives **30 minutes**, plus a rotating refresh token. The app refreshes about a minute before expiry; a refused refresh (401/403) ends the session.
- Only the refresh token and the signed-in subject are kept on disk, encrypted with Electron `safeStorage` (Windows DPAPI). If encryption is unavailable nothing is saved and the owner signs in again next launch.
- The app contains no shared desktop secret (a unit test checks the bundle for one).

## Bring your own key

- A user's key is held in the app process's memory only: never written to disk or logs, gone when the app quits.
- It travels with each call as `X-AI-*` headers to the Worker's passthrough, which forwards it to the chosen provider for that one call. **BYOK never falls back to kimo's key**: a bad or rate-limited own key returns the provider's error, not a silent switch to kimo's.

## Fail closed

- With no owner session, no own key and no run-time token, every AI step (AI edit, visual director, SAM, AI images, "regenerate this part") stops locally with a clear message before any network call. Captions (whisper on the PC), manual timeline edits, cue-only explainers and exports keep working.
- The Windows Electron smoke asserts this: with no sign-in and no key, an AI step throws the locked error (`report.lockdown.ok`).
- The Worker side: requests without a valid owner token or BYOK headers are refused (`401`/`403`), never served with kimo's key.

## Bench and CI runs

- Benchmark runs that need kimo's key take an owner access token at run time through the `KIMO_DESKTOP_TOKEN` environment variable (the Worker's `kd1.` signed format). It is never bundled, committed or written to a report, and it expires like any access token.
- Unit tests use a dummy token shape and a mocked network; they make no real AI calls and spend nothing.
