# kimo web

Phase 0 foundation for the browser app at app.getkimo.tech. This repository contains the monorepo, design tokens, contract client, scripted mock backend and screenshot tooling. The token preview is the only Phase 0 screen; the product landing page and editor belong to later phases.

## Start

Use Node.js 22+ and pnpm 9.15.9.

```sh
pnpm install
pnpm dev
# In a second terminal:
pnpm mock
# In a third terminal, to print the complete scripted WebSocket edit:
pnpm mock:demo
```

Open [the token preview](http://localhost:3000/dev/tokens). Web runs on 3000, mock API/WebSocket on 8787. `.env.example` lists configuration. Environment variables for the standalone mock must be exported in its terminal; Next reads browser configuration from `apps/web/.env.local`.

Phase 1 adds [the component gallery](http://localhost:3000/dev/ui): the reusable UI library, keyboard behavior, overlay focus management, accessible feedback, reduced-motion variants and a full state gallery. See [UI.md](docs/UI.md) for APIs and [the Phase 1 review](docs/PHASE_01_REVIEW.md) for accessibility evidence and explicit spec exceptions.

## Verify

```sh
pnpm lint
pnpm typecheck
pnpm test
pnpm build
pnpm exec playwright install chromium
pnpm e2e
pnpm shots
```

Screenshots are written to `docs/screens/phase-00-tokens-{viewport}.png` at desktop and mobile sizes. Register later routes in `e2e/routes.ts` and set their root `data-ready="true"` after paint. Studio routes also capture 1920×1080.

## Workspaces

| Path                 | Role                                                                            |
| -------------------- | ------------------------------------------------------------------------------- |
| apps/web             | Next.js 15, React 19, Tailwind v4, strict TypeScript                            |
| packages/kimo-client | Zod contracts, typed REST, native WebSocket, atomic ops and version recovery    |
| packages/compositor  | PixiJS v8 dependency and Phase 6 interface; renderer deliberately deferred      |
| packages/mock-server | plain Node HTTP + ws, uploads, 45-action edit, interrupts and render simulation |

Read [DESIGN.md](docs/DESIGN.md), [CONTRACTS.md](docs/CONTRACTS.md), [DECISIONS.md](docs/DECISIONS.md), [SKILLS.md](docs/SKILLS.md), and [PHASE_LOG.md](docs/PHASE_LOG.md). `AGENTS.md` contains the twelve phase guardrails and commands. Component hex literals fail ESLint; Next's production build also runs that lint rule.

Media fixtures are original CC0 assets, bundled for reliable local development, with checksums, download URLs and reproducible generation. See [fixture sources](packages/mock-server/fixtures/SOURCES.md) for the documented substitution for the brief's unspecified Pexels/Pixabay URLs.
