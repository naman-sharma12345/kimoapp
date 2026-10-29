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

## Phase 07 — Timeline, inspector and manual editing

Completed against the typed mock session on 28 October 2026. The supplied logo and requested composer focus/resize treatment are preserved.

### Acceptance checklist

- [x] Canvas track rows paint clip bodies, labels, temporal filmstrips and cached/computed waveforms. Only hovered, selected and roving-focus clips need DOM controls. Three viewport widths are cached, with bucketed updates during native scrolling. Production benchmark on an RTX 4050 laptop: 179 measured intervals averaged **60.0 fps scrolling** and **60.0 fps continuous zooming**, worst interval **16.8 ms** for each. Trace recording was disabled. Development measurements were 41–56 fps and are not substituted for the production result. Evidence: [captions and 50-clip timeline](screens/phase-07-captions-1440x900.png).
- [x] Selection, shift selection, marquee, same-kind track moves, snapping, duplicate, trim, ripple trim, split, slip, delete, speed, text creation, context actions and keyboard editing use project operations. Ruler scrubbing, markers, frame ticks, transition chips, track toggles, clip locks and AI clip feedback are present. Roving focus supports arrow navigation between clips. Evidence: [editor](screens/phase-07-editor-1440x900.png).
- [x] Soft locks defer only the edited clip; other agent changes advance immediately. Removed clips bypass the soft lock and expose undo recovery. Text suggestions support use-it/keep-mine; user undo records the actual serialized group baseline and optional-field resets survive JSON. Agent action groups have explicit revert controls. Unit tests cover queued updates, removals, suggestion resolution and lock filtering.
- [x] Viewer, timeline, inspector and captions editor all edit text. Inspector preview and save timers are 150/800 ms, with blur commit. Caption find/replace, styles and position work across a track; word timing is preserved or redistributed by the typed operation layer. Evidence: [captions](screens/phase-07-captions-1440x900.png).
- [x] Inspector controls cover transform/keyframes/reset, crop/aspect lock, speed/pitch, text formatting/animations, grading/wheels/LUT presets/split comparison, effect order and enable state, SAM settings/re-segmentation, audio envelopes/ducking/live analyser level, transition frame durations, source attribution/replacement, and project aspect/background/notes. AI-written fields use orange feedback. Evidence: [inspector](screens/phase-07-inspector-1440x900.png).
- [x] Assets drawer supports user/found tabs, drag to compatible tracks, keyboard insertion, automatic compatible-track creation, upload-more through the Phase 3 manager, and typed attachment with asset-added events. Evidence: [assets](screens/phase-07-assets-1440x900.png).
- [x] The production browser flow renames a title and trims/locks clips while the real mock script runs, verifies that the agent skips a locked clip while trimming its neighbor, and verifies that undo restores the user lock without reverting the neighbor's agent edit. Evidence: [live agent](screens/phase-07-live-agent-1440x900.png).

The required lint, typecheck, 128 unit/integration tests and production build pass. Two focused production browser flows cover editing and the captions/upload/formatting benchmark. Engine rendering fidelity limitations remain documented in [FIDELITY.md](../packages/compositor/FIDELITY.md); Phase 7 does not claim exact export-render parity.

The final Axe scan reported zero violations in the tested inspector/timeline state. Raw production frame measurements are saved in [the benchmark record](benchmarks/phase-07-timeline.json); the workload contains 50 caption clips plus the uploaded still image.

## Phase 08 — Agent panel, live actions, chat and interrupts

Completed against the typed mock on 28 October 2026. The supplied logo and requested composer treatment remain in place. The agent panel now has a single event feed shared by chat and the action audit; presence and notifications remain active when the panel is collapsed.

### Acceptance checklist

- [x] All nine message types render from typed mock events: user bubbles with attachments, rich/streaming agent text, grouped actions, system lines, review cards, choices, found images, SAM results and retryable errors. Evidence: [running action](screens/phase-08-running-1920x1080.png), [results and image preview](screens/phase-08-results-1920x1080.png), [choices and review](screens/phase-08-chat-1920x1080.png), and [attachments and stop](screens/phase-08-interrupt-1440x900.png). Small secondary text follows the previously documented contrast adjustment.
- [x] Actions audit includes 28px rows, search, category filters, status, target, duration and expanded pretty JSON/result. Evidence: [action audit](screens/phase-08-actions-1920x1080.png).
- [x] The real mock flow verifies interrupt acknowledgement within 400ms, read feedback, a hard stop that freezes subsequent project updates, attachments and the next-instruction placeholder. Controlled events verify stopped/response groups, mention chips, Escape focus and slash pause. Unit coverage exercises retry after a failed tool; browser coverage checks the retry command. Evidence: [interrupt](screens/phase-08-interrupt-1440x900.png).
- [x] A single action-start event sets the same target in the top status, acting avatar/panel, viewer brackets, timeline and inspector. The integration test asserts all five places and the friendly live announcement. An initial REST restore cannot overwrite a newer live agent state. Evidence: [shared target](screens/phase-08-running-1920x1080.png).
- [x] Revert submits inverse operations in reverse action order, restores the backend project and adds the system line only after the save succeeds. The production browser test checks the restored duration. Evidence: [reverted step](screens/phase-08-revert-1440x900.png).
- [x] Hidden review and choice requests update the title and dispatch the specified notification when permitted, including while the panel is collapsed. Browser checks stub the browser Notification API, verify permission is requested only from the inline card after a send, and verify title restoration on visibility. They validate application behavior, not operating-system notification delivery.
- [x] New agent messages and friendly action titles use an always-mounted polite live region. Browser checks verify action announcements are throttled to one per 3s; reduced motion reveals full streamed text and stops the spinner. Keyboard focus and mobile overflow are checked. Evidence: [mobile reduced motion](screens/phase-08-mobile-reduced-390x844.png). Axe reports no violations in the tested desktop chat state; a full manual screen-reader audit has not been performed.

Validation: lint, strict typecheck, 132 unit/integration tests and production build pass. Four Phase 8 production browser checks and the existing live manual-edit/lock/undo regression pass. Seven Phase 8 screenshots are captured with the repository's Playwright harness. The full historical browser suite was not rerun. Retry and optional message/image grouping fields are documented in CONTRACTS.md for production-backend agreement. Chat history remains in memory because the current snapshot API does not restore historical messages. The render button hands off to the existing render route; the full render screen remains Phase 9.

## Phase 09 — Review, final render and delivery

Completed against the typed mock on 28 October 2026. The supplied logo, existing tokens and requested composer focus/resize treatment are preserved. The new public delivery screen replaces the old handoff placeholder; render restoration uses the session URL and retains compatibility with old render-ID links.

### Acceptance checklist

- [x] Agent review and the finish button open the review flow. The watch-first-cut overlay starts playback from zero and asking for changes focuses the composer with the specified placeholder. Early finish shows the current action-group summary and requires render-now confirmation. Review includes a compositor poster at 0:01, length/format/audio rows and caption settings. Evidence: [review](screens/phase-09-review-1440x900.png) and [render now](screens/phase-09-render-now-1440x900.png).
- [x] The render screen polls actual mock progress every 800ms, loads frame JPEGs as the frame advances, crossfades previews, prints each chunk with the scanline, shows the last eight previews, and derives stage copy from progress. Refresh restores the same server job. Cancellation confirms and returns to an unchanged saved project. Evidence: [render](screens/phase-09-render-1440x900.png), [finishing](screens/phase-09-finishing-1440x900.png), and [cancel](screens/phase-09-cancel-1440x900.png).
- [x] Completion includes the success progress bar, final sweep, supplied-mark proportions, check drawing, frame lift and a shared-frame delivery handoff. The nominal timeline is 1400ms with a 220ms reduced-motion crossfade. Reduced motion removes the scanline, bar movement and sheen. The production recording demonstrates the flow; no claim is made that network or device scheduling always completes navigation within an exact millisecond bound. Evidence: [approve → render → delivery recording](screens/phase-09-approve-render-delivery.webm).
- [x] Delivery has custom media controls, transport shortcuts, sprite-backed hover previews, fullscreen, volume/mute and speed controls. Download uses the requested slug filename and the response Content-Disposition; copy-link shows the exact toast. Native share and fallback links are exercised, public access is checked in a fresh browser context, edit-again restores the saved Studio, and expired edits disable that action without removing public video access. Metadata, model/action history, noindex and OG video/poster tags are present. Evidence: [delivery](screens/phase-09-delivery-1440x900.png).
- [x] Portrait playback uses the 9:16 layout with a 420px maximum width and no horizontal page overflow. The reduced-motion mobile test also covers edit expiry. Evidence: [portrait delivery](screens/phase-09-delivery-portrait-390x844.png).
- [x] Render failure dims the frame, marks progress as failed, shows the server message, and retries through approval. Unit coverage exercises the real MOCK_FAIL=render mode and a successful second job; browser coverage injects a failed response and verifies recovery. Evidence: [failure](screens/phase-09-failure-390x844.png).
- [x] A full production approve → render → delivery recording is saved in docs/screens using Playwright. Eight Phase 9 screenshots accompany it. The desktop delivery Axe scan reports zero violations; the existing Phase 8 browser regressions pass.

Validation: pnpm lint, pnpm typecheck, 136 unit/integration tests and pnpm build pass. The focused production browser checks cover review/render/delivery, immediate cancellation, portrait failure/retry/expiry, all render stages and Phase 8 chat behavior. The full historical browser suite was not rerun. A production-only interrupted App Router stream was found during the warm-up handoff; transition-promise handling and a cancellable navigation watchdog recover it instead of leaving a blank screen. The cancellation path cancels that watchdog before returning to Studio.

The mock exports prerecorded 24-second CC0 fixtures in 1920×1080 or 1080×1920 with stereo 48kHz audio. It records and accepts project/caption settings but does not run the external kimo engine or burn captions into those canned bytes. Render jobs survive tab closure while the mock process remains running; they are not persisted across server restarts. The production backend must support the documented extensions in CONTRACTS.md. Existing compositor fidelity limitations remain in FIDELITY.md.

## Phase 10 — mock-backed launch preparation (28 October 2026)

User scope overrides the production-launch brief: no real backend exists; keep mock defaults, prepare Cloudflare Pages without deploying, defer v1.0.0, and submit a branch PR rather than pushing main. Backend-only dependencies are in BACKEND_TODO.md.

### Acceptance checklist

- [x] Separate API/WS configuration, mock dev command, runnable target-URL contract suite, 1/2/4/8/15-second reconnect, authoritative restoration and ordered durable IndexedDB operations. Stable mutation IDs prevent duplicate application after a lost acknowledgement. Unit and browser offline/reload coverage pass against the mock.
- [x] Mock Google-auth endpoint with httpOnly cookie, anonymous daily limit and exact sign-in dialog; server upload caps and typed errors. Privacy notice and /privacy explain the future policy and current demo honestly. Evidence: [auth](screens/phase-10-auth.png), [privacy](screens/phase-10-privacy.png).
- [x] STATES.md and polish review; existing logo/tokens and composer focus/resize preferences retained. Fixed touch focus, historical mutation paths, hidden palette selection, opener/command focus destinations, square format labels, export labels and overlay contrast. Evidence: [Studio](screens/phase-10-studio.png), [palette](screens/phase-10-palette.png), [version](screens/phase-10-version.png).
- [x] Automated Axe checks in the launch matrix report no violations for their exercised routes/states; keyboard controls, reduced motion, route focus and increased contrast are implemented. [A11Y.md](A11Y.md) records scope.
- [ ] Full manual WCAG acceptance: actual VoiceOver, NVDA, Safari/iPhone keyboard and 200% zoom sign-off remain unverified. No blanket certification is claimed.
- [x] Gzip JS budgets meet 120KB landing / 450KB Studio and are enforced by size-limit in CI. The measurement includes root layout, error and not-found chunks. The compositor stays lazy. Font outlines remain unchanged; small preloaded web subsets reduce the cold payload and full faces load for extended scripts.
- [ ] All performance gates: the final cold mobile check passes its LCP, zero-CLS and typing-interaction budgets. The 20-minute soak was not accepted because its first harness used the wrong pause-button selector. The selector is corrected, action waits are bounded, and the full gate remains in CI. Do not claim <800MB after 20 minutes from that attempt.
- [x] The focused production launch matrix passed **32 tests across installed Chrome, Edge, Firefox and Playwright WebKit**, covering all five requested viewport sizes, auth, offline edits, versions/compare, export and delivery. WebKit is not actual Safari certification. Evidence: [desktop](screens/phase-10-landing-1920.png), [tablet](screens/phase-10-landing-1180.png), [phone](screens/phase-10-landing-390.png).
- [x] Controlled visual baselines cover landing, auth, privacy, Studio, versions, comparison, palette, review, render, delivery and expiry with toHaveScreenshot. Live media/time regions are masked for deterministic comparisons; screenshot evidence also retains the real canvases. Evidence: [review](screens/phase-10-review.png), [render](screens/phase-10-render.png), [delivery](screens/phase-10-delivery.png), [expiry](screens/phase-10-expired.png).
- [x] Environment-gated PostHog capture allowlist (no autocapture, prompt text, names or URLs) and privacy-filtered Sentry-compatible route error reporting. Unit coverage verifies payload filtering. No analytics was enabled during local work.
- [x] Cloudflare Pages project/config/header template, static route build, public metadata Function, mock-preview artifact CI and exact DEPLOY.md steps prepared. No project, DNS or deployment was created. The user's separate Workers workflow is left for coordination at PR review.
- [x] Extra features implemented: Ctrl/⌘P search/actions/clips/recent prompts; named review cuts and read-only restore; clock-synchronized comparison; supplied-beat ticks/snapping; once-dismissed coach tips; resolution/container/vertical requests; SRT and alternate delivery links. Mock exports are prerecorded fixtures, not real model/engine renders. Evidence: [comparison](screens/phase-10-comparison.png), [export options](screens/phase-10-export.png), [offline](screens/phase-10-offline.png).
- [x] README, DEMO_SCRIPT.md, STATES.md, A11Y.md, QA.md, DEPLOY.md, MARKETING_LINK.md and backend handoff written.
- [ ] Real backend contracts, deployed service and v1.0.0: intentionally deferred by the user. No release tag is created.

Core validation: final lint, strict typecheck, **141 unit/integration tests** (including target-URL contracts on an isolated mock), normal production build, and a clean Node 22 Cloudflare Pages static export passed. The focused 32-case browser matrix and controlled baseline creation passed. A fresh final Chromium auth smoke test and cold mobile performance test also passed after the last composer change. Earlier failed runs found real input/focus and reduced-motion navigation issues, which were fixed; they are not counted as passes. A stale local server caused an intermediate smoke failure and was stopped before rebuilding and rerunning. The historical full e2e suite has not been rerun in this phase. Incremental Pages builds hit a Node 26 Webpack cache error; the generated Pages config now disables that cache and the clean supported Node 22 build passed.

This phase is submitted for PR review with the explicit manual/performance gates above, rather than claiming an unverified production launch.

## Desktop creator Phase 01 - benchmark and resource follow-up (29 October 2026)

User request: implement the attached benchmark phase and push to GitHub. Subsequent steering requested immediate relief from PC lag and high-quality rendering with minimum CPU use. The heavy local baseline and replay were stopped; no further full render was started. Desktop implementation is ready for a normal main-branch push, with the full baseline explicitly incomplete.

### Acceptance and evidence

- [x] Six golden cases, 13 prepared segments, four pinned CC BY sources; downloader verified SHA256 on original bytes. Credits, source limitations and notices are committed. Large media is excluded from Git and moved outside OneDrive to LocalAppData.
- [x] Headless runner imports the real runEdit, captures truthful ops, saves projects and measurements, builds contact sheets/strips/offline review pages, writes summary tables and fails on replay misses. Seven genuine build-response cache entries survived the interrupted baseline.
- [ ] Every golden case rendered in both aspects and replayed fully: the TH-1 run/replay were interrupted; the remaining cases are pending. Do not treat the supplemental smoke as the requested baseline.
- [x] Pure JS metric functions, targets and weighted Creator Score; synthetic FFmpeg pause/repeat/clipping fixtures, known caption/subject boxes, CIEDE2000 reference pairs, timestamp/IDR checks, cache integrity, no-network replay and artifact escaping are tested. Estimated or unavailable evidence is labeled.
- [ ] Complete v0.3.2 baseline table and per-golden visual critique: pending. RESULTS.md and BASELINE.md honestly list the missing cases. The existing five-second smoke completed through runEdit and scored 74.1; its output tail, caption safe area and delivery gate failed. Small evidence is committed under desktop/test/bench/baselines/smoke-v0.3.2.
- [x] Offline review page played and sought video without HTTP requests. A mobile overflow defect was fixed and 390px verification passed. Local review: %LOCALAPPDATA%/kimo/bench/out/scratch/bench-smoke/review.html. The agent-browser workflow failed session retention; the existing Playwright/Chrome tooling verified playback, seeking and offline requests. Test browser process trees were closed.
- [x] npm test and push/PR Windows/Linux unit CI are wired; CI does not execute paid/full benchmarks. Node 20 with bundled BtbN FFmpeg passes 34 desktop tests. Tests run serially and all media workers have lower scheduling priority.
- [x] Resource follow-up: cross-process locks reject simultaneous jobs and recover dead owners; the app queue claims its slot before awaiting module loading; FFmpeg/filter/recognized library pools and analysis buffers are bounded. Cancellation stops workers. Actual child priority, queue race, cross-process exclusion and cancellation tests pass.
- [x] High-quality hardware master: NVENC P6/HQ, bounded surfaces/lookahead, source resolution/fps, H.264 High, closed GOPs, BT.709 and AAC settings. The RTX 4050 passed a 1.2-second NVDEC/CUDA + NVENC test. GPU decode, GPU encoder and cancellation fallbacks are covered. New modules are included in desktop packaging.
- [ ] Real-footage before/after CPU percentages, sustained responsiveness and perceptual-quality sign-off: pending; no heavier render was resumed after the lag report. The engine compositor/intermediate export remains CPU-based. No installer/release was built.

Validation: web lint/typecheck, 300 existing unit/integration tests and web production build were exercised; the final lint pass succeeded. The web test alias was repaired for Windows and its existing tests pass on Node 24. Desktop Node 20 tests cover all new resource/encoder paths using small synthetic clips. The engine repository/binaries and web runtime behavior remain unchanged. The version stays 0.3.2; no release tag was created. Source changes take effect in the next desktop build.
