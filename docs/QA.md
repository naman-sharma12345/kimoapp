# Phase 10 QA scope

The release boundary is **mock-backed frontend readiness**. The user explicitly deferred real backend integration, deployment and the v1.0.0 tag. Backend dependencies are isolated in `BACKEND_TODO.md`.

## Repeatable checks

```sh
pnpm lint
pnpm typecheck
pnpm test
pnpm build
pnpm budgets
pnpm test:contract
pnpm e2e
```

`pnpm test:contract` starts an isolated mock by default. Setting `KIMO_CONTRACT_API` and `KIMO_CONTRACT_WS` opts into a real staging service and performs writes there. No production URL has been tested.

`e2e/launch.spec.ts` covers auth/quota, privacy, actual IndexedDB persistence and reconnect, historical cut controls, command palette, comparison, beat toggle, export options, SRT and alternate delivery, plus 1920×1080, 1440×900, 1280×800, 1180×820 and 390×844. Existing suites cover prompt/upload/warm-up/edit/interrupt/manual text/review/render/download, upload failures, dropped sockets, render retry and expired sessions.

For installed Chrome/Edge/Firefox and WebKit, set `KIMO_MATRIX=1` and run `pnpm exec playwright test e2e/launch.spec.ts`. For production, build first and also set `KIMO_E2E_PRODUCTION=1`. The CI matrix installs the named browser channels. **WebKit automation is not proof of Safari 18+ on macOS/iOS.** A real-device Safari texture upload, requestVideoFrameCallback and View Transition fallback pass remains a manual environment gate. Firefox receives the API's browser-decodable proxy URL; a real HEVC/proxy round trip awaits the backend.

`e2e/visual-launch.spec.ts` uses controlled project data and `toHaveScreenshot` baselines. It masks live canvas/video/time/progress regions for deterministic layout comparison; compositor pixels have separate rendering tests. New baselines require review, not automatic acceptance of every diff. `pnpm shots` retains the existing phase screenshot workflow.

## Performance

`pnpm budgets` measures the union of actual route, root layout, not-found and error-boundary JS chunks with gzip, then runs size-limit against the same files. Landing cap: 120,000 bytes; Studio cap: 450,000 bytes. It does not exclude framework/shared code. The compositor remains a dynamic import preloaded during warm-up. `pnpm analyze` writes local HTML treemaps under `apps/web/.next/analyze`; CI uploads them.

For the cold mobile production check, set `KIMO_E2E_PRODUCTION=1 KIMO_PERF=1` and run `pnpm exec playwright test e2e/performance.spec.ts`. The profile uses the Moto G Power viewport, DevTools Fast 4G (9 Mbps download / 1.5 Mbps upload / 60ms target RTT, with its 0.9 throughput and 2.75 latency emulation adjustments) and 4× CPU slowdown. It asserts LCP ≤1800ms, CLS exactly 0, and maximum observed typing-interaction latency ≤100ms. This is a laboratory event-timing check, not a field INP certification. Raw results are retained in `performance-mobile.json`.

The 50-clip soak is explicit: set `KIMO_E2E_PRODUCTION=1 KIMO_SOAK=1` and run `pnpm exec playwright test e2e/soak.spec.ts`. It exercises real playback/seek/scroll for 20 minutes, writes start/middle/end compressed Chrome heap snapshots, samples renderer/browser/GPU process RSS (not only JS heap) and enforces <800MB plus nominal 60Hz scrolling with a 58fps sampling tolerance. The corrected harness uses the actual “pause playback” accessible name and bounded action timeouts. The first local attempt timed out on its incorrect pause selector before collecting meaningful samples; it is **not** a passed 20-minute memory result. CI retains the full-length gate.

## Review method

Impeccable Method: dual-agent (A: `/root/design_review`, B: `/root/detector_review`). Assessment A independently inspected screenshots/source and live touch/auth interactions. Assessment B reported zero deterministic findings in the requested targets. Its browser API did not permit the mutable injection preflight; no injected overlay is claimed. The agent-browser Windows CLI returned a blank capture, replaced by Playwright evidence rather than accepted as proof.

Fixed review findings include first-touch focus transfer, historical mutation guards, auth/palette opener focus, visible keyboard palette selection, banner clearance, 1:1 ratio labeling, and resolution-aware review copy. A follow-up caught recent-prompt command focus; selected commands now run after palette dismissal so the dialog cannot overwrite their destination.

Manual VoiceOver/NVDA, actual Safari/iPhone keyboard and 200% zoom review remain explicitly documented in `A11Y.md`. Exact final executed results and any remaining laboratory budget gap belong in `PHASE_LOG.md`; these documents do not substitute for green checks.

The network preset follows [Chromium’s authoritative DevTools profile](https://chromium.googlesource.com/devtools/devtools-frontend/+/HEAD/front_end/core/sdk/NetworkManager.ts). Earlier local iterations incorrectly labeled a slower 1.6 Mbps profile as Fast 4G; those results are development diagnostics, not the requested preset.

Questions skipped: the user supplied an exact design brief and requested implementation, then requested a fast PR handoff. No additional design choices require an interview.
