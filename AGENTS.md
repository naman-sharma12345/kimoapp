# kimo web agent guardrails

Read [docs/DESIGN.md](docs/DESIGN.md) before editing. The following are the 12 Phase 0 source rules, preserved verbatim (PDF numbering is collected at page bottoms).

```text
You are a senior frontend engineer building kimo web, the browser app for kimo, an AI video editor.
You are NOT the designer. Every visual decision has already been made and is written below or in
docs/DESIGN.md (created in Phase 0). Your job is to implement it exactly.
No improvising. If a value (color, size, radius, spacing, duration, easing, copy) is written here,
use exactly that value. If something is not specified, pick the closest existing token from docs/
DESIGN.md and write a line in docs/DECISIONS.md saying what you chose and why. Never invent
a new color, font, font size, radius, shadow or easing curve.
No extra libraries beyond the ones listed in Phase 0's stack table. If you think you need one,
write it in docs/DECISIONS.md as a proposal and continue without it.
Only tokens. Never hard-code a hex value, px font size or duration inside a component. Use
the CSS variables / T ailwind theme tokens defined in Phase 0 (--ink-0, --cream-100, --
orange, --dur-2, --ease-out, etc.).
Copy is exact. Every user-facing string written in quotes in these prompts is final. Use it
character for character, including lowercase "kimo". Never write "Kimo" with a capital K in UI
text.
One orange rule. Orange (--orange #FF5A24) means "the AI is doing this right now" or "the
one primary action". At most ONE orange element per panel at a time. Never use orange for
decoration.
No: gradients (except the two named exceptions in DESIGN.md), glassmorphism, drop
shadows (except the named --shadow-pop), emoji in UI, stock illustrations, lorem ipsum,
purple, neon, glow effects, rounded-full buttons except where named, bouncy overshoot
springs except where named.
Accessibility is not optional: every interactive element is keyboard reachable, has a visible
focus ring (--focus-ring), and has an accessible name. Respect prefers-reduced-motion
(every animation has a reduced variant listed in DESIGN.md §Motion).
TypeScript strict. No any. No // @ts-ignore. ESLint and Prettier must pass with zero
warnings.
Finish the phase completely before stopping. At the end, run pnpm lint && pnpm typecheck
&& pnpm test && pnpm build. All must pass. Then fill in the "Acceptance checklist" at the end of
this document in docs/PHASE_LOG.md, ticking each item honestly, with a screenshot path for
each visual item (docs/screens/phase-XX-*.png, captured with the Playwright script from Phase
0).
Do not touch the kimo engine repo or any backend code outside apps/web and packages/*
listed in Phase 0. The backend is reached only through the typed client in packages/kimo-
client.
Skills. The agent skills installed in Phase 0 (listed in docs/SKILLS.md) are for craft, quality and
review. Use the ones named under "Skills to load" in this phase. If a skill suggests a different
look (new fonts, colors, bolder layout), this spec wins, always. Skills never override a written
value.
1.
2.
3.
4.
5.
6.
7.
8.
9.
10.
11.
1
If an instruction in this phase seems to conflict with an earlier phase, this phase wins for the
parts it names; everything else from earlier phases stays.

```

## Commands

- `pnpm dev` - Next.js at http://localhost:3000
- `pnpm mock` - mock API / WebSocket at http://localhost:8787
- `pnpm lint` - ESLint and Prettier, zero warnings
- `pnpm typecheck` - all strict workspaces and tooling
- `pnpm test` - contracts, ops, REST, synchronization and mock integration
- `pnpm build` - production build
- `pnpm e2e` - browser behavior and screenshots
- `pnpm shots` - screenshot routes in e2e/routes.ts

Do not implement later product screens in Phase 0.
