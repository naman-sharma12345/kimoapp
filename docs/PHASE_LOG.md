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

## Phase 01 — design system components

Implemented on 27 October 2026. The user requested an immediate push while the production build was still running; this log records that status honestly.

- [x] All §1.2–1.12 component families exist with named exports, typed props, forwarded DOM refs, token styling and a small variants helper. The 21 component tests cover Tab, Enter, Space, Escape, arrows, Home/End, focus trapping/return, errors, notification timing and attachment removal. The full unit/integration suite passes **91 tests**.
- [x] Axe reports **zero violations**, with no disabled rules, on the gallery and open menu, context menu, popover, small/medium dialog, tooltip and toast states. Mobile gallery audit also passes. Evidence: [accessibility results](phase-01-accessibility.json), [review](PHASE_01_REVIEW.md).
- [x] Component files contain no hex values; public appearance overrides through className are rejected. Phase 1 additions are named CSS tokens and centralized motion presets. The measured contrast corrections use existing colors and are recorded in DECISIONS.md.
- [x] Reduced-motion variants and static loop frames are verified, along with touch slider drag/cancellation. Evidence: [reduced-motion capture](screens/phase-01-ui-reduced-1440x900.png). The gallery also provides a pause/resume control.
- [x] Web-design-guidelines and Impeccable reviews completed. The mechanical detector reported no findings. Fixed findings and retained spec conflicts are documented in [PHASE_01_REVIEW.md](PHASE_01_REVIEW.md).
- [x] **11 browser checks pass.** Full-page evidence: [desktop](screens/phase-01-ui-1440x900.png), [mobile](screens/phase-01-ui-390x844.png). Component evidence: [buttons](screens/phase-01-ui-buttons-1440x900.png), [fields](screens/phase-01-ui-fields-1440x900.png), [attachments](screens/phase-01-ui-status-1440x900.png), [menu](screens/phase-01-ui-menu-1440x900.png), [dialog](screens/phase-01-ui-dialog-sm-1440x900.png), [feedback](screens/phase-01-ui-feedback-1440x900.png), [controls](screens/phase-01-ui-controls-1440x900.png), [layout and identity](screens/phase-01-ui-layout-1440x900.png).
- [x] Lint and strict typecheck pass. Component APIs are documented in [UI.md](UI.md). The user's [logo reference](brand/kimo-reference.png) is preserved unchanged.
- [ ] Production build confirmation: the build was launched and remained running at the user's immediate-push request. No successful build is claimed in this entry; CI repeats the required checks after push.

## Phase 02 — landing page and chatbox

Implemented 27 October 2026 from the supplied Phase 2 brief. The landing page contains responsive navigation, the specified hero, prompt examples, a file-aware composer, the three-step explanation and social metadata. It supports keyboard entry, drag and drop, paste, validation, aspect and length settings, upload progress, session creation and error recovery. Reduced-motion behavior and a temporary warm-up handoff are included.

The upload and navigation contract, contrast corrections, temporary screen, font generation and motion approximation are recorded in [DECISIONS.md](DECISIONS.md) and [CONTRACTS.md](CONTRACTS.md). Visual evidence: [desktop](screens/phase-02-landing-1440x900.png), [mobile](screens/phase-02-landing-390x844.png), [focused composer with file](screens/phase-02-landing-focused-files-1440x900.png), and [drag overlay](screens/phase-02-landing-drag-1440x900.png). The full warm-up and editor are future phases; the mock limits individual uploads to 100 MiB and keeps sessions in memory.

Strict typecheck and the production build passed; the 95 unit and integration tests passed with one worker. Landing behavior, failure recovery, mobile settings, the social image and axe checks passed in Chromium. The wider browser run initially had two timing-sensitive gallery failures; both passed on rerun after the tests waited for focus and context-menu exit. The production Lighthouse desktop run scored 99 performance, 100 accessibility and 100 best practices. That build preceded the user's final removal of the inner textarea focus outline; the updated preview and landing browser checks were verified afterward.

The design-taste browser inspector found no horizontal overflow or broken images. Its automated flags for the entry animation, deliberate first-fold spacing and horizontally scrolling mobile example chips are retained as specified; screenshots were reviewed directly. The kill-ai-slop scan flagged the explicitly requested status pill, also retained.
