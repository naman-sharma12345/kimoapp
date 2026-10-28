# Cloudflare Pages preparation

Target: a **new Pages project `kimo-app`**, production hostname **app.getkimo.tech**. This change does not create a project, modify DNS, deploy, or tag a release.

Cloudflare's current [Next.js Pages guide](https://developers.cloudflare.com/pages/framework-guides/nextjs/) supports a [static export](https://developers.cloudflare.com/pages/framework-guides/nextjs/deploy-a-static-nextjs-site/). Full Next SSR is a Workers deployment. To honor the requested Pages target, `pnpm build:pages` generates an isolated static entrypoint in `apps/web/.pages-build`, preserving the normal `pnpm build` server-rendered app. It exports landing/privacy and browser-loaded shells for Studio, warm-up, render and delivery. `_redirects` preserves real session URLs; the Pages-only router uses document navigation between those shells. `functions/v/[[path]].ts` adds public delivery metadata from the API around the static player shell. Development specimen routes are not exported.

The user's separate `deploy-cloudflare` branch currently contains an OpenNext **Workers** workflow. This PR does not edit that workflow or deploy either target. Choose one hosting path when reviewing the PR; do not run both against the same hostname.

## Local preview

1. Install dependencies with `pnpm install --frozen-lockfile`.
2. Keep the mock running in another terminal with `pnpm mock`. Default API/WS are localhost:8787.
3. Run `pnpm build:pages`.
4. With a current Wrangler CLI installed, run `wrangler pages dev apps/web/.pages-build/out --port 3000`. Run from the repository root so `functions/` is found. Test a real `/studio/<id>` deep link, refresh, `/render/<id>` and `/v/<id>`; do not test only shell URLs.
5. Inspect generated `_headers` and response headers, including the `/v/*` Function response. CSP placeholders stay closed for unconfigured services. The mock must be reachable from the browser and from the local Function.

## Prepare the hosted mock preview

The Node mock uses HTTP and WebSockets and cannot run inside a static Pages asset deployment. Host **this repository's mock** on a separate demo service or expose its local port through an authenticated/configured Cloudflare Tunnel. Never point a PR preview at an unbuilt production service. Supply its actual HTTPS and WSS URLs as `MOCK_PUBLIC_API` and `MOCK_PUBLIC_WS` repository variables. These are configuration values, not credentials.

Set `MOCK_APP_ORIGINS` on the mock host to the exact allowed Pages preview origins (comma separated). For cross-site HTTPS demos, set `MOCK_COOKIE_SECURE=1`; the mock then sets Secure, httpOnly, SameSite=None cookies. Browser third-party cookie policies still apply; a same-site preview hostname avoids this issue. Use disposable demo files and restrict access to the demo API. The mock remains explicitly labeled and uses fixture media. It is not an authentication service for production.

The PR CI job produces a Pages preview artifact with those mock variables, or localhost defaults for a developer-local preview. **It does not deploy.** Without a hosted mock, an Internet preview cannot reach another developer's localhost. Configure the actual hosted mock before enabling remote preview publication.

## Create the project later

1. In Cloudflare Workers & Pages, choose **Create application → Pages → Connect to Git**. Select `naman-sharma12345/kimoapp`, project name `kimo-app`, production branch `main`.
2. Use repository root `/`, Node 22, pnpm 9.15.9, build command `pnpm build:pages`, build output `apps/web/.pages-build/out`. Do not use the full-stack Workers preset.
3. Initially disable automatic production deployments. Configure Preview environment API/WS to the hosted **mock** values. Enable branch previews only after the host and allowed origins are ready. Keep all model keys out of Pages.
4. After backend acceptance, configure Production `NEXT_PUBLIC_KIMO_API`, `NEXT_PUBLIC_KIMO_WS`, `NEXT_PUBLIC_R2_ORIGIN`; optional `NEXT_PUBLIC_POSTHOG_KEY`/`NEXT_PUBLIC_POSTHOG_HOST` and `NEXT_PUBLIC_SENTRY_DSN`. Set Function binding `KIMO_API_URL` to the same actual REST origin. Rebuild after changing public variables: Next embeds them at build time.
5. `deploy/_headers` is the reviewed CSP template. The build substitutes configured API/WS/R2/PostHog/Sentry origins into the output. Check that no required `*_HOST.invalid` placeholder remains. Unused integrations may remain blocked. API/WS/R2 entries in the source are deliberately placeholders; they do not announce a running service.
6. Add `app.getkimo.tech` under the project's **Custom domains**. Let Cloudflare create the CNAME to the project's actual Pages hostname. Do not change the apex marketing hostname `getkimo.tech` or guess a Pages domain before project creation.
7. Manually publish the reviewed artifact only when authorized. Verify CORS/cookies, deep links, Google callback allowlist, OG title/poster, byte-range playback, downloads, and security headers on both static and Function routes. Keep the mock preview and production data separate.

## Security choices

CSP permits the app itself and configured API, WS, R2, PostHog, Sentry and Google Fonts origins only. Fonts are actually self-hosted. `script-src 'unsafe-inline'` supports Next 15's static bootstrap/RSC scripts; `style-src 'unsafe-inline'` supports controlled dynamic timeline/layout styles. No remote script or `unsafe-eval` is allowed. API text is rendered as text; metadata is escaped. No frontend Meta SDK or model key is present.

Permissions-Policy disables camera, microphone, geolocation, payment and USB. Objects/framing/base URLs are restricted, MIME sniffing is disabled, and referrers use strict-origin-when-cross-origin. COOP/COEP are not required because the compositor does not use SharedArrayBuffer; enabling isolation would complicate cross-origin media and authentication without a current requirement. Revisit this only if the media pipeline adopts shared memory.

Do not run `wrangler deploy`: that command targets Workers. For a manually approved Pages direct upload, the corresponding command is `wrangler pages deploy apps/web/.pages-build/out --project-name kimo-app --branch <reviewed-branch>` from the repository root, after local build and configuration checks. This document records the future command; it has not been run.
