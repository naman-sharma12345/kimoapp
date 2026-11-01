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

## Desktop creator Phase 07 - explainers: the screen shows what is said (1 November 2026)

Implementation is complete and pushed to main without force (`e915785` … `c4c7b93`, wrap-up commits `b9f92e7` … `c4c7b93`); real-footage numbers and the EXPLAIN-1 bench are deferred, as for Phases 3-6. No engine repository/binary change, no web app behaviour or Worker change in the wrap-up, deploy-cloudflare stays disabled, no installer/release/tag, no paid AI/SAM call. Design and controls: [desktop/EXPLAINERS.md](../desktop/EXPLAINERS.md); key lockdown: [desktop/SECURITY.md](../desktop/SECURITY.md).

### Acceptance checklist

- [x] Cue detection (en + hi/Hinglish), the visual director (cached two-pass model decision through the locked proxy, at most 4 calls, cue-only without AI), validation (density, emoji caps, variety, per-kind switches, licence-safe), word-synced timing (items 2 frames before their word, on their entry frame), layout with make-room camera keys, full ≤ 25 %, pip with a speaker bubble, and beats → EDL (`ex_*` overlays, SFX bus, caption no-accent, attributions, metrics).
- [x] 16+ explainer families on the Phase 6 graphics kit with bundled icons and an offline map; previews regenerated after the sync/layout changes (`desktop/explain/previews/`, synthetic scene, inspected by eye).
- [x] Asset sources (library, Openverse, Wikimedia, sandboxed screenshots of public URLs, opt-in AI images) with a licence filter, 2 GB LRU cache and per-video search cap; ATTRIBUTIONS.txt beside saved exports and credits in the description.
- [x] Sound kit synthesised on the PC (own CC0 sounds) with SFX cue planning.
- [x] Controls: Home "explain with visuals" (on/off, density, per-kind switches, licence-safe only), chat patches and planner tools, explainer beat blocks on the Studio GFX track with item ticks and a beat editor (title, items, text, shape, layout, delete, regenerate this part). `publicEdl` carries the explainer fields over IPC; panel geometry and asset paths stay off it.
- [x] Meta key lockdown: owner allowlist (`OWNER_ALLOWLIST` Worker secret), desktop loopback + PKCE sign-in, 30-minute tokens, BYOK never falls back to kimo's key, fail closed.
- [x] Light tests: 163/163 desktop tests locally (Linux, FFmpeg 6) and on hosted Windows + Linux (`41246970470`, main `c4c7b93`). Windows Electron smoke `41246983535` (Phase 02 compositor validation, golden matrix off, no installer/release) passes on `c4c7b93`: the new explain self-test ran on the offscreen Chromium window (all 8 checked families drew, frame 37 byte-identical, the third list item appears on its entry frame and not before, tick/whoosh/ding synthesised, a beat survives publicEdl and an edit_explain), and the lockdown check stopped an AI step locally. The explain self-test is part of the smoke's `report.ok`.
- [ ] EXPLAIN-1 bench and real-footage numbers (beat-to-word sync, face overlaps, visual share, Creator Score): **deferred**; not measured, no numbers claimed.
- [ ] Renderer browser check (`desktop/test/renderer-edl.mjs`, now 14 fixture clips including one explainer beat): not run this session (no local Chrome in the agent sandbox); the renderer build and unit tests pass.

Open gaps are listed in [desktop/test/bench/NOTES.md](../desktop/test/bench/NOTES.md) (Phase 7): no keyed sources, Openverse/Wikimedia called directly (one Openverse 504 seen), crowd sounds mapped to synth sounds, no music dip, regenerate needs AI access, UI callouts need a target box. The root `kimo checks` run `41246970521` passed lint/typecheck/test/build and failed only the pre-existing web bundle budgets.

## Desktop creator Phase 06 - graphics, titles, callouts and b-roll (1 November 2026)

Naman's instruction for this phase: don't go deep on tests or benchmarks. Implementation is complete and pushed to main without force (`6831afa` … `114854b`); real-footage bench numbers are deferred. No engine repository/binary or web runtime change, no installer/release, no paid AI/SAM call. Design notes and caveats: [desktop/GRAPHICS.md](../desktop/GRAPHICS.md).

### Acceptance checklist

- [x] Graphics renderer: the app's hidden offscreen Chromium window (`graphics/host-electron.cjs` + `render.html`), the same page under Playwright Chromium for the bench, and a pure-JS raster canvas fallback running the same element code. Time is driven manually (frame n at n/fps); raw RGBA goes into FFmpeg and out as QuickTime RLE with alpha, cached by content hash. Frame 37 rendered twice gives identical bytes for every element. Easing library shared with the camera.
- [x] All 10 elements (hook title, lower third, number/stat pop, callout, screen zoom card, progress bar, chapter card, emoji sticker, text-behind-subject as an EDL element, CTA end card) with layouts checked at 9:16, 1:1, 4:5 and 16:9 inside the safe areas, and six themes in `data/graphics-themes.json` using the template typography (Geist / Instrument Serif / Montserrat). Instrument Serif and Noto emoji (OFL) bundled and listed in THIRD_PARTY_NOTICES.md.
- [x] B-roll (`broll.mjs`): the user's own non-speech clips only; cached vision description per clip and one batched sentence × clip LLM call in AI modes (word-overlap matching offline); needs_cover first, then abstract sentences; 1.2-3.5 s, J-cut in 6-8 frames, L-cut out, never the hook's first 1.5 s, ≤ 40 % of runtime, ≥ 4 s apart, −24 dB, its own push/drift.
- [x] Planner tools `graphic`, `hook_title`, `callout`, `screen_zoom`, `broll_auto`, `broll`; template defaults first; restraint rules enforced in code (one graphic on screen, 0.4 s gap, shorts ≤ 10/min, YouTube ≤ 4/min, documentary ≤ 2/min). Captions yield to kit graphics; MrBeast captions rotate per word. `graphic` is an EDL overlay kind (validator, timeline, public EDL).
- [x] Light tests: 10 graphics tests (layouts at 4 aspects, determinism, soft canvas, stat parsing, restraint, planning + caption yielding, planner tools, b-roll rules, MrBeast rotation, real-FFmpeg graphic render) plus pipeline assertions. 148/148 desktop tests pass on hosted Windows + Linux (`41234653698`). Windows Electron smoke `41235183276` (Phase 02 compositor validation, golden matrix off, no installer/release) passes on main `114854b`: the graphics self-test ran on the offscreen Chromium window (`chromium-offscreen`, no fallback), all elements drew, frame 37 was byte-identical, and the 9:16 composite with a hook title, callout and progress bar rendered with no warnings. Chromium vs soft-canvas parity on the hook title was mean abs 6.12 / 3.2 % of bytes over 64 (antialiasing and kerning differ; informational, not a gate). The earlier smoke `41234710107` on `54608ac` also passed but skipped the composite because of a clip-path bug fixed in `114854b`. The graphics self-test is part of the smoke's `report.ok`.
- [x] Gallery: `npm run graphics:gallery` renders every element through the real compositor at 9:16, 16:9, 1:1 and 4:5. 9:16 and 16:9 were rendered (soft canvas) and frames inspected; 1:1 and 4:5 were not rendered in this session (sandbox CPU time). Contact sheets per theme are in `desktop/graphics/previews/` (excluded from the installer).
- [ ] Bench on VLOG-1 and TUT-1 (b-roll / callouts / screen zoom, max_static_s, b-roll % of runtime, zero overlaps on real footage) and a Creator Score change: **deferred by Naman's instruction**; not measured, no numbers claimed. `edl.graphics.report` records overlaps and density per edit so the bench can read them later.

Open caveats: the Windows offscreen path has only been exercised on the hosted runner (it rendered there), not on a user PC; it falls back to the raster canvas if it cannot render; frames are read from the page canvas (not paint events); b-roll colour match is Phase 8; b-roll moves are a fixed pattern, not motion-following pans; callout `target_prompt` and `text_behind` make paid SAM calls only when used.

## Desktop creator Phase 05 - captions and typography, creator-grade (31 October 2026)

Naman's instruction for this phase: "Dont go too much into testing and benchmarks just make it better", and complete the phase fully. Implementation is complete and pushed to main without force (`2926129` … `b13fc22`); real-footage caption bench numbers are deferred. No engine repository/binary or web runtime change, no installer/release, no paid AI/SAM call. Design notes: [desktop/CAPTIONS.md](../desktop/CAPTIONS.md).

### Acceptance checklist

- [x] Caption engine (`captions.mjs`): Phase 3 transcript words re-timed onto the output through the A-roll in/out/at/speed (cut words never show, hesitations dropped); chunking by dynamic programming (sentence ends and pauses > 0.5 s hard, punctuation and pauses > 0.15 s preferred, then before conjunctions/prepositions; no "the | thing", no 1-letter line end, numbers kept with units; shorts 1–3 words / ~14 chars, 16:9 4–8 words / ≤ 42 cpl / ≤ 2 lines); frame timing with a 1-frame lead, highlights to the next onset, minimum durations 0.3/0.8 s lingering into silence, ≤ 17 cps on 16:9, never overlapping; casing per style, spoken numbers to digits in shorts styles ("three million" → `3 MILLION`), note brand casing, ? and ! kept; one keyword accent per chunk (emphasis > numbers > names, ~20–35 %); en + Devanagari per-word detection (Noto Sans Devanagari, Hinglish stays Latin).
- [x] Styles as data (`data/caption-styles/*.json`): hormozi, mrbeast, ali-abdaal, mkbhd, karaoke, boxed-highlight, doc-subtitle and the default kimo, plus Naman's reference-reel title effects echo-slide, gold-sweep and decay (hook titles by template or note, also selectable as caption styles). Preview PNGs generated by `test/bench/caption-previews.mjs` and committed in `data/caption-styles/previews/`; reviewed for clipping and font fallback.
- [x] ASS/libass rendering: typed builder `ass.mjs` (escaping, number validation, no string soup), `caption-render.mjs` (one Dialogue per word state with continuous time-shifted `\t` pops/bounces/fades, `\kf` karaoke, sliding vector highlight box, reveal pill, stacked-copy title effects). One final `ass` filter pass with `shaping=complex` (the `subtitles` filter did not form Devanagari conjuncts) and absolute, escaped `filename=`/`fontsdir=` paths. OFL fonts bundled in `desktop/fonts/` (Montserrat, Geist, Bangers, Noto Sans Devanagari; Luckiest Guy skipped as Apache-2.0), listed in THIRD_PARTY_NOTICES.md with URLs and licence, in the installer file list and `asarUnpack`ed. Windows CI: unit test renders every style through an escaped `C:` fontsdir; Electron smoke reports no fallback face.
- [x] Placement: platform safe areas (shorts top 12 % / bottom 22 % / right 15 %; 16:9 90 % title-safe), face-aware per chunk from the Phase 4 head tracks (camera-probe heuristic or cached SAM track) mapped through the camera crop, below the chin when there is room, never over the mouth, sticky between chunks; captions move or hide for hook titles, callouts, lower thirds and images; auto-contrast boxes shadow-only styles under 4.5:1 against the sampled base composite.
- [x] Studio: caption chunks are EDL `caption_word_group` overlays; double-click text edits, drags and trims snap to word boundaries (UI and `caption-edits.mjs`) without overlaps and keep word timings; a caption edit re-renders only the libass pass over the cached base composite (`caption_pass` op); edited chunks survive follow-up rebuilds. Home has a caption style picker.
- [x] Wired into every mode: captions-only (offline, transcript words, no engine `auto_captions`, no second whisper), AI and batch (the planner's `auto_captions` only switches style unless the user picked one; `edit_caption` edits chunks), follow-up (saved style and edited chunks kept; "remove captions" turns them off), manual. The engine's captions remain only as a fallback when no transcript exists.
- [x] Light tests: 13 caption tests (grouping, timing, accent, placement, cut mapping, ASS escaping, Windows filter-path escaping, real libass font check, metrics, chunk edits, contrast + cached base) and pipeline assertions (captions from the cut plan in captions and AI modes, caption edit reuses the cached base). 138/138 desktop tests pass locally and on hosted Windows + Linux (`41224602555`). Windows Electron smoke `41224602938` (Phase 02 compositor validation, golden matrix off, no installer/release) passes on main `b13fc22` with 6 kimo caption chunks and no font fallback.
- [ ] Bench on TH-1 (6-second sample per style + contact sheet), caption_min_word_s ≥ 0.18 / caption_safe / caption_face_overlap < 2 % / ≤ 17 cps on real footage, and the side-by-side against the old engine captions: **deferred by Naman's instruction**; not measured, no numbers claimed. `edl.captions.stats` computes these per edit so the bench can read them later.

## Desktop creator Phase 04 - camera language: punch-ins, framing, reframes, ramps, transitions (31 October 2026)

Naman's instruction for this phase: "Dont go too much into testing and benchmarks just make it better", and complete the phase fully. Implementation is complete and pushed to main without force (`48049ea`, `dfe3f26`, `db0b957`, `884b567`); golden-clip bench numbers and the energy-grid review video are deferred. No engine repository/binary or web runtime change, no installer/release, no paid AI/SAM call (SAM tracks are only read from the job cache). Design notes: [desktop/CAMERA.md](../desktop/CAMERA.md).

### Acceptance checklist

- [x] Framing vocabulary (`camera.mjs`): wide 1.00 / medium 1.12–1.18 / tight 1.28–1.38 / extreme 1.5–1.7 with eye lines, hairline kept at medium, eyes ≥ 28 % and chin kept at tight, gaze look room on the thirds; heads from cached SAM tracks > local motion heuristic (`camera-probe.mjs`) > centre with eyes on the upper third; 9:16-from-16:9 crop follows the subject with `gimbalPath` (4 % dead zone, 18 %/s) plus a critically damped spring. Unit-tested.
- [x] Director: framing change at every jump cut by energy pattern with no repeats (micro-jump forced joins change zoom by ≥ 0.1), emphasis pushes landing on the word onset and 5-frame expo-out snap punches at energy ≥ 4, wide section openers after chapters and b-roll with a breathing push, podcast speaker framing from Phase 3 diarisation (single after 1.2 s, two-shot on overlaps/laughter, ≥ 1.5 s, anticipated 4 frames), screen-recording punch-ins on the active region (tutorial-reel style), static-span budget (shorts 3 s, 16:9 6 s) with clause-boundary inserts, keys reset at every cut (`motionAcrossCuts` invariant), optional micro_drift at energy ≤ 2.
- [x] Smoothness: easing library (linear, sine, cubic, expo, back-out for graphics only, critically damped spring), per-frame sampling, log-space zoom, 2 % soft clamp, 0.75× upscale cap with a warning op (judgment call: 1.25 floor when the fit is already below 0.75×, e.g. 1080p on 9:16), all through `rectFilter` float crop + Lanczos. The decoded float-camera edge fixture measures 0.2504 px residual at a 1080-px short side under the new model (fixture only, not footage).
- [x] Speed ramps (planner-requested, b-roll/action only, sound muted; `minterpolate` mci/aobmc/vsbmc only when source fps < 2× canvas) and transitions as compositor nodes in `compose-fx.mjs`/`compose.mjs`: cut default, whip (7 frames + `whoosh` marker for the sound phase; no SFX file bundled), zoom-through (expo scale both sides + Gaussian blur, 8 frames), dip to black/white (12 frames), J/L-cuts on every b-roll entry/exit (8 frames, matched fades) and planner jcut/lcut between different cameras. Rendered on real FFmpeg in tests; Windows Electron smoke passes.
- [x] Planner tools `camera_style`, `camera_emphasis`, `camera_hold`, `transition`, `speed_ramp`; kimo's `add_punch_ins`/`add_smart_punch` are no longer offered and A-roll scale/x/y from the planner is overridden. The deterministic director runs by default in every runEdit mode (ai, captions offline, sam, follow-up, manual) through the picture snapshot; `camera_plan`/`camera_report` ride on `edit.edl.json`. New modules are in the installer file list.
- [x] Light tests: 17 camera unit tests + 2 real-FFmpeg render tests + pipeline assertions; 125/125 desktop tests pass locally and on hosted Windows + Linux (`41217625493`). Windows Electron smoke `41217708535` (Phase 02 compositor validation, golden matrix off, no installer/release) passes on main `884b567`.
- [ ] Bench on TH-1/TH-2/POD-1/VLOG-1 (framing_variety ≥ 3/30 s, max_static_s ≤ template, jitter < 0.5 px, zero framing repeats at jump cuts, faces never cropped), Creator Score and the 3×3 energy-grid eye test: **deferred by Naman's instruction**; not measured, no numbers claimed. `camera_report.metrics` computes framing variety, max static span and repeats per edit so the bench can read them later.

## Desktop creator Phase 03 - edit decisions from the transcript (31 October 2026)

Naman's instruction for this phase: "Dont go too much into testing and benchmarks just make it better", and complete the phase fully. Implementation is complete and pushed to main without force; real-footage bench numbers are deferred. No engine repository/binary or web runtime change, no installer/release, no paid AI/SAM call (the judgment layer is mocked in tests). Design notes: [desktop/CUTPLAN.md](../desktop/CUTPLAN.md).

### Acceptance checklist

- [x] Transcript with refined word edges, cached; fillers list for en + hi. `transcript.mjs`: 16 kHz mono extract, bundled whisper flags detected from `--help` (`-ojf`, `-ml 1 -sow`, `-dtw small` with a no-DTW retry), energy-snapped starts/ends that keep sibilant and plosive tails, en/hi/Hinglish detection, `data/fillers.json`, words/sentences/pauses, cache by audio SHA-256 + model.
- [x] Deterministic cut plan: silence (template max_pause/pad), clean-join fillers (coarticulated ones flagged and kept), stutters/restarts, retakes with take scoring; needs_cover marked; micro-jumps merged or forced to a framing change. Live op summary ("removed N pauses (x s), N fillers, N retakes · before → after").
- [x] LLM hook/order/drop/best-take/emphasis/chapters JSON in one cached call through the existing proxy, hook rules verbatim in the prompt, strict validation, deterministic fallback; cold-open hooks applied. Tutorial template (Naman's style reference): optional result-preview montage before the hook, teaser lines kept early and protected from length cuts, setup chatter dropped; screen-recording segments listed as `screen_punch` candidates for Phase 4.
- [x] Multi-clip speech/broll/mixed classification; two-speaker diarisation by stereo channel energy or mouth-motion vs voice energy (no new paid calls).
- [x] Wired into runEdit: the plan becomes a frame-exact A-roll track in the planner project, so the EDL compose() renders follows it; `cut_plan` rides on the EDL and `cutplan.json`. ai/batch (AI judgment), captions (offline, deterministic, every jump framed) and follow-up (saved plan in the prompt). The vague pacing advice in the planner prompt is replaced by the cut plan brief; auto_rough_cut/cut_to_beat/re-imports are skipped when the plan applied. New modules and `data/**` are in the installer file list.
- [x] Synthetic tone+silence unit tests (known gaps, known duplicate take, filler, stutter, cold open, micro-jumps, tutorial preview) plus a runEdit pipeline test for captions and AI modes. 106/106 desktop tests pass locally and on hosted Windows + Linux (`41213165101`). Windows Electron smoke `41213203235` (Phase 02 compositor validation, golden matrix off, no installer/release) passes on main `0b3ede2`; with real bundled whisper on the TTS clip it cut 4.88 s → 4.34 s (2 pauses, first speech 0.05 s) and the manual re-render still works.
- [x] Joins review tool: `desktop/test/bench/joins-wav.mjs` (beep before each cut). Not yet run on TH-1.
- [ ] Bench targets on real footage (dead_air_ratio < 3 %, filler_count 0, repeat_takes 0, first_speech_s < 0.4 on TH-1/TH-2/VLOG-1/POD-1), listening to the TH-1 joins, Creator Score: **deferred by Naman's instruction**; not measured, no numbers claimed. Plan-level metrics on the synthetic fixtures and the one TTS smoke clip are not golden-clip results.

The root `kimo checks` run for this push fails only its existing web bundle-budget steps (`pnpm budgets`), outside this desktop change.

## Desktop creator Phase 02 - app-owned frame-exact picture (30 October 2026)

The user explicitly requested this desktop phase after the incomplete Phase 1 benchmark, overriding the earlier sequencing instruction. Work is pushed to main without force. No engine repository/binary or web runtime behavior is changed. No installer/release is built. Full footage runs on standard hosted Windows runners; this PC only runs bounded synthetic and browser checks.

### Acceptance checklist

- [x] Version-1 EDL, precise validation, native-project conversion with warning ops, and timeline IPC. Native planner data is retained for follow-up; manual edits persist the EDL and render it directly. Unit/integration coverage exercises the manual supplied-EDL path.
- [x] Exact barcode source indices at 24000/1001, 24, 25, 30000/1001, 30, 50 and 60 fps, with trims, 2x, half speed and punch camera keys. Direct/fallback strategy equality, quoted Windows paths, cancellation and delivery encoding are tested. Final Windows/Linux CI `41194854601` passes all 82 desktop tests on each platform. Independent saved-timeline companions `41191170102` additionally decode 17,018 delivered H.264 frames across all 12 raw-v2 timelines with zero wrong asset/frame indices, unintended repeats or skips. Their generated pictures/silence and one-tenth raster are explicitly separate from natural-footage quality evidence.
- [x] Picture routes for AI, captions, follow-up, manual, SAM, queued jobs, review sheets, thumbnails and smoke use the app compositor. Legacy picture rendering is disabled by default and restricted to explicit benchmark calls.
- [x] 1 kHz tone-cut test has no sample above -40 dBFS at the checked seam. Separate audio mixing follows source cuts and applies 10 ms equal-power edge fades; full voice/SFX chains remain later-phase work.
- [x] Final Windows Electron smoke `41189545211` passes with real tools at 24000/1001, saved EDL/composed-picture assertions and a manual re-render, without building an installer or release.
- [x] EDL timeline browser check renders 13 fixture clips and persists a caption edit through the mocked preload bridge without JavaScript errors. Evidence: [timeline](screens/phase-02-desktop-edl.png), [edited caption](screens/phase-02-desktop-edl-edit.png). The viewer is empty because this is an IPC/layout fixture, not golden footage or real media playback evidence. Existing tokens and visual layout are retained.
- [x] All six replacement raw cases rendered in both aspects in `41189542616`; all 24 actual final sheets/first-second images inspected, with 16-line before/after critiques per case in BASELINE.md. Evidence: [clean output images and metrics](../desktop/test/bench/baselines/raw-v2-after), [native before images](../desktop/test/bench/baselines/raw-v2-before), [source hashes/review](../desktop/test/bench/clips/raw-v2/REVIEW.md). All 12 short strips briefly played muted and sought at three positions without errors or HTTP; this does not claim full listening quality. Large media remains outside OneDrive.
- [x] Completion pass (31 October 2026): every 2.1–2.3 requirement audited at code level. Gaps fixed: `transition_in` dip/whip/zoom now render (morph renders as a dip with a warning), BROLL/any-clip rect/ellipse `mask` is composited, the opacity geq runs only on translucent frames, MUSIC is sidechain-ducked under VOICE from the EDL `duck` spec (16 dB requested → 15.9 dB measured on the tone fixture), SFX asset clips are placed and tested, audio tracks carry VOICE/MUSIC/SFX roles, the validator reports bad transitions/masks/ducks/master values, native transition names are mapped and native masks reported, compose progress is tied to its op with frame/fps/ETA, and the new module is packaged. No `zoompan` exists anywhere in desktop/. 88 desktop tests pass locally (Node 22, FFmpeg 7.1) and on hosted Windows/Linux (`41208291033`, `41208564274`); Windows Electron smoke `41208574755` passes on main without an installer or release. The Linux FFmpeg 6 run caught and led to fixing a dropped ducked-music tail.
- [ ] Real-footage repeated-frame counts, punch jitter below 0.5 px and higher Creator Scores against a fair baseline: **deferred by Naman's instruction** ("Dont go too much into testing and benchmarks just make it better. complete phase 2 first fully.", 31 October 2026). Not measured; no numbers are claimed. Planned source-frame indices and synthetic fixtures are not an observed real-footage zero-repeat result. Missing/ambiguous mappings and unavailable legacy references must stay labeled when this is run.
- [x] RESULTS.md updated honestly: implementation complete, real-footage benchmark numbers deferred. The root lint/typecheck/test/build command passed in run `41028998366`; its later web bundle-budget failure is pre-existing and outside this desktop change.

Implementation and extension boundaries are documented in desktop/COMPOSITOR.md. The latest complete Phase 1 artifact confirms USD 2.2000843 reserved and at least 53 requests. An unuploaded TUT-1 ledger is conservatively covered by reserving the remaining authorized allowance, total USD 5.49; actual billing is unknown. No more paid calls are started. Artifact restores preserve the larger cumulative ledger rather than resetting it.

Latest bounded checks: 72 desktop tests pass with real bundled FFmpeg, including independent barcode expectations, native shape/alpha bounds and an observed static-edge camera residual of 0.2424 px at normalized 1080 short side. The perspective counter correction removes a one-frame lead. ASS and composition explicitly agree on BT.709 limited range. Renderer build and keyboard-caption IPC check pass; current screenshots above were refreshed. Lean IPC retains the same timeline projection while reducing a preserved TH-1 payload from 207376 to 11468 JSON bytes. None of these fixture results closes raw-footage acceptance.

Hosted follow-up `41086873409` passes 72 tests on each of Windows and Linux, including the retained half-alpha colour assertion after fixing FFmpeg 6's ASS draw path. The combined required lint/typecheck/test/build step passes in `41086873461`; unrelated broader web gates still fail. New raw-source inspection `41086477761` produced actual reviewed sheets/first-second frames and SHA256 pins. [Candidate review](../desktop/test/bench/clips/raw-v2/REVIEW.md) records two provisional sources and rejects the podcast candidate for baked-in cuts. Final new-dataset renders, before/after scores and final visual acceptance remain unchecked. Original benchmark source/cache bundles were preserved again in `41086877223`; the aggregate USD 5.49 reservation remains intact.

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

Desktop Phase02 follow-up (30October): user explicitly approved Cinestudy credit/hashtag terms. Raw-v2 source selections, credits, exact hosted preparation and comparison workflow are pushed;41099499282 is running. Dedicated b-roll hit HTTP429 twice and was stopped. Six vlog inputs are documented as raw shot excerpts from two camera rolls, pending actual selected-preview review. New source-referenced camera measurement preserves whole-picture motion separately;75 local desktop tests pass including injected subpixel shake, moving source/brightness/caption rejection and unavailable flat/aperture cases. This does not tick final raw-data, score or full-footage frame acceptance.

## Desktop creator Phase 08 — sound design (1 November 2026)

User scope: implement Phase 8 and push; explicitly skip benchmarks and use quick
working checks. Earlier benchmark work is not resumed. Implementation is complete
within that revised scope; real-footage sound-quality acceptance remains unclaimed.

- [x] Adaptive voice analysis and cleanup, pitch-based high-pass, learned noise
      floor, conditional gentle gate/de-esser/EQ, two compressors and clip leveling.
      Quiet gap fills require both unvoiced analysis and transcript exclusion.
- [x] Optional documentary/cinematic studio processing. The installed BtbN build's
      crashing anlmdn is capability-gated, with a reported FFT fallback.
- [x] Eight offline original CC0 scores, BPM/key/mood/energy and loop metadata;
      19,232,787 bytes. Bar fitting, seam crossfades, final fade, beat grids, safe cut
      snapping, processed-voice sidechain and word envelope are connected.
- [x] Forty offline original CC0 SFX, tagged variants and measured peaks;
      3,687,600 bytes. Deterministic selection, spacing/rotation, transition cues,
      graphic entrances, reveal/freeze/screen cues, early starts and local level caps.
- [x] Two-pass app-owned mastering, −14 LUFS / −16 podcast targets, limiter,
      measured peak/LRA/DC/clipping/stereo checks. Native finish_audio is intercepted;
      delivery encoding preserves podcast loudness.
- [x] Durable voice/music/SFX stems, source-signature caches, stem-only remix API,
      background worker/thread limits, cancellation and live FFmpeg progress.
- [x] Own music picker and MUSIC-lane drop, retained across follow-ups. Existing
      tokens/components are reused. Keyboard import/drop browser smoke passes with no
      page errors; inspected screenshot: `docs/screens/phase-08-music-import.png`.
      The browser bridge is mocked and provides no preview video; no OS-picker or
      packaged-installer acceptance is claimed.
- [x] Seven audio tests pass, including six-second real FFmpeg audio smoke,
      synthetic SNR/treble checks, 20 ms verified room fill, loops/stems/cache and
      podcast remix. Twenty existing EDL/resource/encoder and three short synthetic
      pipeline checks pass. No golden media or full-footage render was run.
- [x] Repository lint/typecheck/build and desktop renderer build pass. All 311 web
      tests pass on bundled Node 24.22.1 (Node 26 initially failed existing storage
      tests; no web source fix was needed). No engine or backend source was changed.
- [ ] Golden benchmarks, 30-second human listening reviews, real-footage LRA and
      duck-depth acceptance, full-program correlation and sustained CPU/lag checks:
      explicitly deferred under the user's no-benchmarks instruction. The synthetic
      fixture's 0.5 LU LRA fails the requested 4–9 range and is reported honestly.

Final smoke: −14.01 LUFS, −6.82 dBTP, synthetic SNR 40.45 → 50.79 dB, 6 kHz/140 Hz
ratio +1.59 dB, podcast stem remix −16.01 LUFS. These describe only the fixture.
Details, reproduction and limitations: `desktop/audio/README.md` and
`desktop/audio/RESULTS.md`. No paid AI calls, benchmarks, installer or release.

## Desktop creator Phase 09 — colour and finish (1 November 2026)

Implementation is complete with lightweight verification under the user's
standing no-benchmark/no-heavy-local-render preference. Full real-footage gates
remain unclaimed. Nothing from the next phase, a release or an installer is built.

- [x] Per-clip twelve-frame RGB analysis, percentiles, clipping, chroma, skin-region
      sampling, bounded grey-world WB, saturation/contrast and heuristic flat-profile
      detection. Signature/range/metadata/mask-aware caches avoid repeated sampling.
- [x] One generated 33³ tetrahedral LUT per footage clip combines correction,
      bounded reference-shot matching, existing explicit primaries and the look.
      Longest A-roll is the reference; b-roll matching is weaker. Missing skin regions
      and sparse/proxy metrics are labeled, including expired cached mask coverage.
- [x] Seven original CC0 look parameter files, zero-strength identity, skin
      protection, teal/orange cap, full-strength TH-1 strips and Studio controls.
      Existing styles/tokens only; selection, keyboard strength, preview and persistence
      pass the browser bridge test. Inspected screenshot:
      `docs/screens/phase-09-colour-finish.png`.
- [x] Adaptive sharpening after scale, optional luma grain and 20% vignette before
      overlays. Downscaled 4K is not sharpened. Float LUT processing is dithered at the
      existing 8-bit camera-warp boundary; this is not an end-to-end float renderer.
- [x] Native auto_grade is intercepted; source colour metadata and input range are
      read, generic HDR normalization has technical coverage, and delivery BT.709
      primaries/transfer/matrix/limited range pass. Explicit user primaries still apply.
- [x] Seven colour tests pass. Actual chart clipping is 0% for all looks, skin patch
      hues stay in range, A/B compositor mean RGB difference is 0, and tiny delivery
      patch drift is 1.34 RGB levels. Nineteen existing EDL/transition/mask/audio/pipeline
      checks pass. These are synthetic fixtures, not full golden videos.
- [x] All six golden-case still rows across all seven looks were generated from
      existing small tiles and visually inspected. Initial washout was corrected;
      remaining highlight/framing/dataset limits are recorded honestly. All 42 processed
      tiles measure 0% clipped luma, which does not prove recovered source detail.
      Evidence: `desktop/test/bench/baselines/phase09-color/REVIEW.md`, `stills.webp`,
      `still-metrics.json` and full `ATTRIBUTIONS.txt` in that directory.
- [x] Repository lint/typecheck, 311 existing web tests on Node 24, web production
      build and desktop renderer build pass. Web behavior, engine and backend source
      are unchanged. Built desktop assets are committed.
- [ ] Full VLOG-1 clip_delta_e <4, all-frame clipping <0.5%, temporal consistency,
      calibrated skin, camera-specific log/HDR quality and sustained CPU/lag acceptance:
      deferred under the user's no-benchmark preference. No unavailable measurement
      is counted as a pass.

The runtime saves `color/report.json` and the full EDL; preview/source selection is
cached, workers remain bounded and cancellable, and long operations emit progress.
Technical details and reproduction: `desktop/color/README.md`. Benchmark history
and this lightweight result are recorded in `desktop/test/bench/RESULTS.md`.

## Desktop creator Phase 10 — planner, templates and critic (1 November 2026)

Implementation uses lightweight verification under the user's standing
no-benchmark preference. Full real-footage creator acceptance remains unclaimed.
No paid request, engine/backend edit, installer, release or Phase 11 work.

- [x] Nine complete data templates, legacy aliases and UI selection. Numeric craft
      defaults drive the existing deterministic compilers; no extra libraries.
      Template/aspect browser evidence: `docs/screens/phase-10-templates.png`.
- [x] Versioned planner prompt, strict JSON schema and small fail-closed validator.
      Indexed transcript/takes/fluency, source words, clip metadata and six low-res
      keyframes enter one plan task. One invalid response gets one repair; errors,
      timeout, oversize context or another invalid answer use deterministic fallback.
- [x] Plan compiles to cut/camera/captions/graphics/b-roll/local diagrams/audio/look
      and title pack. Models cannot supply commands, renderer graphs or file paths.
      Imported music and user-locked colour survive plan changes.
- [x] Cached critic reads an actual 12–16-frame rendered sheet and metrics, returns
      at most five problems and validated patches, and stops on progress/call/cost/
      iteration limits. Image requests count against both caps; a fresh visual plan
      normally leaves one vision review, a cached plan can leave two.
- [x] Per-edit reservations persist before requests, including failures. At most
      three total requests/two image requests, 60-second proxy timeout, no hidden
      retries. Estimated $0.09 reservation cap is explicitly not an exact billing
      ceiling. The old fully reserved USD 5.49 benchmark ledger remains untouched.
- [x] Common follow-ups patch locally; other requests get one capped patch call.
      Separate retained base/picture/audio passes select minimal work using content
      dependencies. Persistent plan undo and previous-edit comparison work through
      the mock browser bridge: `docs/screens/phase-10-planner-history.png`.
- [x] Eight new planner tests cover validation/repair/fallback, caps/timeouts,
      durable failures, atomic patches, offline undo, synthetic golden-ID replay,
      and a 1.2-second actual FFmpeg edit with critic frames and AAC delivery.
      Caption-only changes rebuild overlays; no-music changes rebuild only audio.
      The six-ID replay is synthetic contract coverage, not new golden recordings.
- [x] Actual Phase 9 stills and the new synthetic contact sheet were inspected;
      `desktop/test/bench/REVIEW-P9.md` contains four honest editorial notes per
      existing case. No copyrighted reference-creator footage was added.
- [x] Regression suite initially passed 184/185 checks and exposed the existing
      denoiser capability-probe crash. The representative-chain probe fix then
      passed all seven audio checks plus eight planner checks. No skipped tests.
- [x] Root lint/typecheck, all 311 web tests, web production build and desktop
      renderer build pass. Final caption/planner checks pass (21/21), followed by
      the final eight planner checks after input compaction. Browser checks pass
      with no page errors. Built assets and screenshots are included.
- [ ] Full golden creator scores, real provider adherence, pixel motion/frame
      identity, clip Delta E and sustained CPU/lag acceptance: deferred under the
      user's no-benchmark instruction. Missing applicable metrics score zero;
      exports may finish with an explicitly unverified creator target.

Synthetic evidence: `desktop/test/bench/baselines/phase10-planner/smoke.json`
and `contact.jpg`. The measured fixture score is 57.7/100 with acceptance false;
no target is claimed. The new runtime and trade-offs are documented in
`desktop/planner/README.md`.
Older projects require an explicit re-run before plan-based chat, preserving
their saved manual edits rather than silently migrating them. Captions-only,
manual EDL and SAM-only paths remain available. Built desktop assets are included.
