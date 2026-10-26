# Phase log

## Phase 00 — foundation, design bible, contracts and guardrails

Implemented and verified on 27 October 2026 (Asia/Calcutta). The supplied Phase 0 PDF defines the scope. No later product screens or external engine repositories were modified.

### Acceptance checklist

- [x] Repo structure matches §0.3. The root is this `kimo-web` workspace; `apps/web`, `packages/kimo-client`, `packages/compositor`, `packages/mock-server`, future route/component directories, docs, e2e and AGENTS.md exist. `pnpm install`, `pnpm dev` (3000) and `pnpm mock` (8787) were run successfully.
- [x] All skills in §0.4 are installed in the current user's Codex skill directory and listed in [SKILLS.md](SKILLS.md). Actual upstream names/paths are recorded in [skill-installation.json](skill-installation.json). The four Phase 0 skills were read. They are available for automatic discovery on the next Codex turn.
- [x] tokens.css contains the exact §0.5 palette, typography, spacing, radii, heights, icons, elevation and motion values. CSS-first Tailwind aliases generate the required utilities. Browser assertions verify `bg-ink-1`, `text-cream-60`, `rounded-r12`, loaded font families and 96×64 swatches. Visual evidence: [desktop](screens/phase-00-tokens-1440x900.png), [mobile](screens/phase-00-tokens-390x844.png).
- [x] Component hex literals fail the custom ESLint rule, and the root production build explicitly runs the rule before Next.js. Five guard tests exercise plain strings, template strings, JSX text, arbitrary hex classes and permitted token classes. Zero lint warnings.
- [x] [DESIGN.md](DESIGN.md) contains source sections §0.1, §0.5 and §0.6 verbatim, preserving PDF text extraction, plus the one orange rule. Diagnostic swatch exceptions and unspecified choices are documented in [DECISIONS.md](DECISIONS.md).
- [x] Every §0.7 REST request/response, record, operation and both directions of WebSocket traffic has a Zod schema and parsing tests. Typed clients, atomic ops, optimistic edits, gap recovery and 409 retry behavior are implemented. Undefined nested contract records and the square-aspect extension are explicitly documented for future backend agreement in [CONTRACTS.md](CONTRACTS.md).
- [x] The mock implements all endpoints, presigned PUT storage/expiry, media ranges, five primary sample assets, warmup, all 45 scripted actions, captions, grading, SAM mask, attributed image, music/ducking, transitions, interrupts, pause/resume and approval/render/video flow. All three MOCK_FAIL modes and accelerated timing are covered. A user deleting a clip mid-script no longer crashes the mock.
- [x] `pnpm mock:demo` printed the complete normal-speed stream and stopped at ask_review. [mock-demo.log](mock-demo.log) records five warmup steps, 45 starts, 45 successful ends and 45 versioned op batches. [mock-demo-summary.json](mock-demo-summary.json) records the counts.
- [x] `/dev/tokens` renders with `data-ready="true"` after hydration/fonts/paint. `pnpm e2e` passes keyboard focus, reduced motion, actual 64px motion, responsive overflow and zero browser page errors. Screenshots captured at 1440×900 and 390×844: [desktop](screens/phase-00-tokens-1440x900.png), [mobile](screens/phase-00-tokens-390x844.png). Full-page captures show all specimens. No studio screen exists yet; registered studio routes will add 1920×1080 captures.
- [x] AGENTS.md is written. `pnpm lint`, `pnpm typecheck`, `pnpm test` and `pnpm build` pass. The unit/integration suite has **70 passing tests**; browser/screenshot suite has **4 passing tests**. CI repeats these checks and uploads screenshot artifacts.

### Explicit source substitution

The brief calls for “4” assets but enumerates five, downloaded from unspecified Pexels/Pixabay CC0 URLs. Five primary **original CC0** media assets are included instead, with mask and delivery support files, source URLs, SHA-256 checksums, a postinstall verifier/downloader and a reproducible generator. Three clips are each 8 seconds at 1920×1080. This satisfies runnable fixtures and redistribution, but **does not claim stock-provider provenance**. Current Pexels/Pixabay content is not automatically CC0. See [fixture SOURCES.md](../packages/mock-server/fixtures/SOURCES.md) and decision 11.

### Visual review

Reviewed the final desktop and mobile captures: token swatches, type specimens, radii, heights, spacing, motion and focus/elevation examples remain within the viewport and wrap cleanly. Swatch metadata uses bundled Geist Mono, the display specimen uses bundled Instrument Serif italic, and body text uses Geist Sans. The token preview is a diagnostic page; no product landing, warmup, studio, render or delivery UI has been introduced.
