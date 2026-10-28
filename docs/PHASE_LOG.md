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

## Phase 03 — uploads, browser media preparation and session start

Implemented and verified 27 October 2026. Phase 2 polish preserves the fixed design and the user's removal of the inner textarea outline. The full studio, warm-up, render and delivery scenes remain later-phase work; this phase supplies the upload and route handoffs they require.

### Acceptance checklist

- [x] Three concurrent file uploads, smallest first; multipart above 100 MiB in 16 MiB parts with four concurrent parts per file. Retries use 1s/3s/9s delays, expired targets renew, cancellation aborts requests, offline uploads resume, and uploads continue across navigation and refresh. Cancellation while offline is saved and reconciled when online. Unit tests use fake XHR; the real browser test uploads five files including a generated 150 MiB file. Evidence: [running uploads](screens/phase-03-uploads-running-1440x900.png), [completion](screens/phase-03-uploads-complete-1440x900.png).
- [x] Browser-generated thumbnails, eight-frame video filmstrips, 64-bin chip waveforms and 10ms timeline peaks are cached in IndexedDB alongside original files and multipart recovery state. A refresh after upload completion resumes unfinished filmstrip generation. The browser test checks the actual cached records. Unsupported codecs retain the required placeholder; local audio preparation is bounded to ten minutes as documented.
- [x] Queued, probing, uploading, complete, retry/error and unsupported-codec chip states are implemented with the specified dimensions and timing. Readable metadata retains the documented cream-60 contrast correction. Evidence: [states](screens/phase-03-chip-states-1440x900.png), [completion tick](screens/phase-03-completion-tick-1440x900.png), [mobile](screens/phase-03-uploads-390x844.png), [upload error](screens/phase-03-upload-error-1440x900.png).
- [x] Sessions start after signed URLs are known and before file bytes finish. SessionStorage retains the exact raw prompt and asset/local map; IndexedDB restores the attachments. Warming, editing, rendering and delivered deep links are verified against the mock. The typed snapshot now carries optional render/video IDs.
- [x] Exact shared error and not-found copy, token styling and recovery actions. Evidence: [session error](screens/phase-03-session-error-1440x900.png), [not found](screens/phase-03-session-not-found-1440x900.png).
- [x] `pnpm lint && pnpm typecheck && pnpm test && pnpm build` passed. **110 unit/integration tests** and **25 browser tests** passed; two additional registered upload-gallery screenshot checks passed at desktop and mobile sizes. Axe reports no violations in the tested landing, handoff, chip gallery and component-gallery states, with no disabled rules.
- [x] Phase 2 polish replaces approximate entrances with the specified springs, corrects reduced-motion initial sizing, improves composer layout, preserves the raw prompt, and retains the user's preferred focus treatment. A browser geometry check verifies width 760 and gaps 24/20/40/16, plus custom duration, keyboard editing and the character limit. Evidence: [landing](screens/phase-02-landing-1440x900.png), [focused files](screens/phase-02-landing-focused-files-1440x900.png), [reduced motion](screens/phase-02-landing-reduced-1440x900.png). Review: [Phase 3 review](PHASE_03_REVIEW.md).

Browser recovery depends on available IndexedDB quota; storage restrictions produce a warning rather than a false persistence promise. The mock's session data remains in memory and resets on server restart. The new multipart, detach and restore contract extensions are documented for real-backend agreement in CONTRACTS.md. A fresh Lighthouse run was started but was not required to claim these passed functional checks; the prior Phase 2 production score remains recorded above.

## Phase 04 — the warm-up screen

Implemented 27 October 2026. The screen connects session events to the real upload manager and transitions to the existing Studio handoff. Contract extensions, accessibility choices and transition limitations are recorded in [CONTRACTS.md](CONTRACTS.md) and [DECISIONS.md](DECISIONS.md).

### Acceptance checklist

- [x] The reel uses cached user thumbnails and waveforms, has a scrolling strip and crossing highlight, and changes the four bars by step. Evidence: [desktop](screens/phase-04-watch-1440x900.png) and [1920px](screens/phase-04-warmup-1920x1080.png).
- [x] Rows and notices respond to validated WebSocket events; the notice falls back after four seconds without a label. Socket retries use 2/4/8-second delays. Evidence: [live notice](screens/phase-04-watch-1440x900.png), [fallback](screens/phase-04-reduced-390x844.png), and the warm-up state and socket tests.
- [x] Planning prefetches the Studio route, dynamically loads the compositor and preloads up to three video assets into the shared cache.
- [ ] The 900ms unfold uses the planned Phase 5 shell and timeline geometry, but exact alignment with the eventual Studio clips cannot yet be verified because that screen does not exist. The [transition video](screens/phase-04-unfold.webm) is encoded at 60 fps from a 25 fps Playwright source; it is not a native 60 fps capture or a performance measurement.
- [x] Reduced motion uses static reel and mark proportions with an opacity-only route transition. Evidence: [mobile reduced motion](screens/phase-04-reduced-390x844.png).
- [x] Cancel confirmation, the long-wait message, upload retry and server-error copy are present. Evidence: [cancel dialog](screens/phase-04-cancel-1440x900.png), [long wait](screens/phase-04-reduced-390x844.png), and [session error](screens/phase-04-error-390x844.png).
- [x] `pnpm lint`, `pnpm typecheck`, `pnpm test` and `pnpm build` pass.

The Studio placeholder is deliberately retained until its later implementation. Cancel, restore socket URL and optional clip progress fields are mock/client contract extensions that need agreement with the real backend.

The full browser run passed 30 of 31 tests; the remaining cancellation assertion was corrected to check the actual user asset ID after the mock adds its own assets, and that test passed on rerun. The expanded thumbnail and video-preload test also passed on rerun. Axe found no violations on the tested warm-up states. The unit/integration suite passed 113 tests.

## Phase 05 — Studio shell

Implemented 27 October 2026. The shell uses the specified panel structure and follows the live session and project through the typed WebSocket client. Preview compositing, timeline editing, agent messaging and the review flow remain later phases, as specified in the brief.

### Acceptance checklist

- [x] Desktop panel positions and dimensions are checked against §5.1 in Chromium at 1920×1080. Evidence: [1920×1080](screens/phase-05-studio-1920x1080.png).
- [x] Pointer and keyboard resizers, size persistence, reset and panel collapse are implemented. The browser checks exercise persistence, reset and collapse; dimensions are saved locally per browser.
- [x] The status pill and pause/resume use mock WebSocket events. A controlled browser test verifies the finish button's disabled-to-enabled transition and the three-pulse waiting state.
- [x] Viewer transport, timeline tools and inspector selection have shell-level controls and stub state. Playback, editing, and agent messaging remain disabled until their later phases. Evidence: [desktop](screens/phase-05-studio-1920x1080.png).
- [x] Responsive desktop and watch mode are implemented, including the intermediate inspector overlay. Evidence: [1440×900](screens/phase-05-studio-1440x900.png), [1280×800](screens/phase-05-studio-1280x800.png), [390×844](screens/phase-05-studio-390x844.png).
- [ ] The central keyboard registry and shortcuts dialog are present; shell controls and input guards are tested. Shortcuts for the future playback and editing operations are listed but not yet wired to those operations.
- [x] Screenshot evidence is captured at all four requested sizes using Playwright. Axe reports no violations in the tested desktop state.
- [x] `pnpm lint`, `pnpm typecheck`, `pnpm test` and `pnpm build` pass; the unit and integration suite contains 114 passing tests.

The optional restore fields, local title persistence, contrast adjustments and the overlapping L shortcuts are documented in [CONTRACTS.md](CONTRACTS.md) and [DECISIONS.md](DECISIONS.md). The live compositor is not yet available, so the FPS indicator does not fabricate a value.

The user subsequently supplied the final logo SVG, which replaces the provisional mark in product branding, the agent avatar, the favicon and the social image. They also requested that the Studio composer show neither a focus highlight nor the browser resize handle; both have been removed.

The broad browser run passed 35 of 36 checks. The remaining warm-up removal test exposed a moving target; repeated reel tiles now offer pointer removal and the original control remains keyboard accessible. The corrected cancellation test passed on rerun. Eleven focused Studio, warm-up and landing checks then passed, including the updated logo, composer treatment, review pulse, mobile layouts and social image.

## Phase 06 — Live preview

The Studio now uses a Pixi canvas, a scene builder, per-clip media pooling, Web Audio, live project updates and transport controls. See [preview fidelity](../packages/compositor/FIDELITY.md) for formulas and known gaps.

### Acceptance checklist

- [ ] Every feature in §6.4: common transforms, transitions, effects, text and image/video masks render, but LUTs, RLE masks, effect scopes and several grading controls remain approximate or unsupported.
- [ ] Paused op-to-pixel latency under 50 ms: the debug overlay reports receipt-to-render-submission timing; one browser test measured 26 ms, but display presentation latency is not verified.
- [ ] Seamless cuts and A/V sync within one frame: the renderer waits for decoded frames and pre-rolls media, but one-frame sync has not been established.
- [ ] SAM polygon-to-mask edge crossfade, corner brackets and interactive text handles are incomplete; guides and basic region and polygon overlays are present. Preview evidence: [Studio](screens/phase-06-preview-1440x900.png) and [overlays](screens/phase-06-overlays-1440x900.png).
- [ ] Follow-kimo and the edit-at chip are implemented but their complete interaction sequence has not been independently verified.
- [x] Adaptive resolution and frame-rate reporting are implemented. In the headless Playwright run on Chromium SwiftShader (16 logical cores, 720p), five one-second samples averaged 6.6 fps; this does not meet the 30 fps target. An RTX 4050 laptop using Direct3D 11 averaged 56.3 fps over six one-second samples at 1080p. At 720p with the browser reporting four cores it averaged 59.3 fps, but overriding the reported core count does not simulate a four-core CPU, so that hardware target remains unverified.
- [ ] Fidelity notes and twelve visual regression frames are present and the golden-frame test passes at 1% tolerance; the full hardware benchmark requirements remain unverified.

The existing logo and the requested Studio composer styling are preserved.

The required lint, typecheck, 119 unit/integration tests and production build passed. Browser checks cover mock video playback, fullscreen, paused updates, a grayscale mask, overlays and twelve golden frames.

## Phase 07 — Timeline and manual editing

The current implementation adds time-based canvas track bodies, repeated source thumbnails, computed/cached audio waveforms, virtualized clip controls, inspector editing, optimistic user operations, clip locks, user undo/redo, an assets drawer and viewer/timeline/inspector text entry. The phase is not yet fully accepted.

### Acceptance checklist

- [ ] Canvas tracks and waveform/thumbnail rendering are present. True temporal filmstrips and a measured 60 fps scroll/zoom run on 50 clips remain outstanding.
- [ ] Move, trim, ripple trim, split, slip, delete, duplication, snapping, track controls and several keyboard commands are implemented. Marquee/multi-selection, complete context actions, cross-track gestures, roving clip focus, marker/transition drawing and AI clip animations remain incomplete.
- [ ] Optimistic edits, user history and queued updates during editing are present, and the mock filters edits to locked clips. Per-clip suggestion resolution, agent-step reversion and full removal-conflict handling remain outstanding.
- [ ] Text entry is implemented in the viewer, timeline and inspector. A dedicated captions editor, complete autosave timing and text suggestions remain outstanding.
- [ ] Inspector controls cover transform, crop, speed, text content/style, basic colour, effects, mask invert/feather, volume, transitions and source attribution. The remaining specified controls and AI value tweening remain outstanding.
- [ ] The drawer displays user and found assets, supports drag to a compatible track and keyboard insertion at the playhead. Session attachment for upload-more remains outstanding.
- [ ] A real-session browser test verifies text persistence, a trim gesture, lock persistence and user undo. Continuous simultaneous-agent editing and all conflict scenarios have not been established.

Visual evidence: [editor](screens/phase-07-editor-1440x900.png). Existing composer treatment and logo remain as requested.

Verification: `pnpm lint`, `pnpm typecheck`, `pnpm test` (122 tests) and `pnpm build` passed. The focused Playwright editing test passed, covering viewer and inspector text edits, a trim gesture, persistence, clip lock and undo. The final typecheck ran after the build to avoid concurrent regeneration of Next.js type files.
