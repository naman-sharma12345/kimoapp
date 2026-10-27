# kimo web design bible

Source sections below are preserved verbatim from the supplied Phase 0 PDF text extraction (including table wrapping and page numerals). Use these exact values.

## One orange rule

Orange (--orange #FF5A24) means "the AI is doing this right now" or "the one primary action". At most ONE orange element per panel at a time. Never use orange for decoration.

## Brand mark update

The user's supplied SVG at `apps/web/public/brand/kimo-mark.svg` supersedes the earlier provisional four-bar mark described in the historical source sections below. Preserve the supplied mark and its original colors wherever the logo appears.

## Source sections 0.1, 0.5 and 0.6 (verbatim)

```text
0.1 What kimo web is (product summary — memorise it)
kimo web lives at app.getkimo.tech (the marketing site stays at getkimo.tech). A user:
Lands on a calm, beautiful page with one headline, one line of subtext and one big chatbox.
They type what video they want and can attach videos, images, audio, PDFs and other files.
Presses send. A warm-up screen with small, precise animations plays while uploads finish and
the AI director (Muse Spark 1.3 on Meta Model API) studies the footage.
The Studio opens: a live editor with a preview viewer, a multi-track timeline, tool panels, an
inspector and the agent panel. Every move the AI makes (cut, trim, caption, colour grade, SAM
3.1 subject mask, reframe, image found on the web, music, transition) appears instantly in
the viewer and timeline. There is no "render to see" step: the preview is composited live in
the browser from the project state.
The user can, at any time: type into the agent chat to interrupt and redirect the AI; edit any
text themselves (every caption, title, lower third, every word); scrub, play and pause the
preview; undo.
When the AI thinks it is done, it says so and asks the user to play it. The user either asks for
changes or approves.
On approval, a render screen animates while the server renders the final 1080p MP4 with the
kimo engine.
A delivery page shows the finished video in a player with a download button, plus share and
"make another" actions.
There is no Muse Image (not available in India). Images the user does not provide are found by the AI
through web image search and shown in an "Images found" tray with source attribution.


0.5 Design tokens (put in src/styles/tokens.css inside @theme, exactly)
Colour
Token Value Use
--ink-0 #080809 app canvas, viewer surround,
landing background
--ink-1 #0E0E0F panels
--ink-2 #151516 raised rows, inputs, clip
bodies, chatbox body
--ink-3 #1D1D1E hover on ink-2, selected row
--ink-4 #262627 pressed, active segmented
item
--line rgb(245 241 231 / 0.07) hairlines
--line-
strong
rgb(245 241 231 / 0.12) input borders, focus-adjacent
borders
--cream-100#F5F1E7 primary text, active icons
--cream-60rgb(245 241 231 / 0.60) secondary text
--cream-38rgb(245 241 231 / 0.38) labels, placeholders, tertiary
--cream-16rgb(245 241 231 / 0.16) disabled text, ruler minor
ticks
--orange #FF5A24 NOW / primary action only
--orange-
hover
#FF6D3D hover on orange buttons
--orange-
press
#E84E1B pressed
--orange-12rgb(255 90 36 / 0.12) wash behind the running
agent action
--orange-24rgb(255 90 36 / 0.24) SAM mask fill in viewer
--on-orange#140A05 text on orange buttons
--success #3DD68C upload done tick, render
complete tick only
--warning #F5B14C file too large, slow network
--error #E5484D failed action rule, error text
--focus-
ring
0 0 0 2px var(--ink-0), 0 0 0 4px rgb(245 241 231 /
0.55)
every focus-visible
Track tints clip bodies; never orange
5
Token Value Use
video #3A3833, broll #34383A, image #36343A, music
#33382F, voice #3A3530, sfx #38353A, text #2F3036, fx
#383338
Two allowed gradients only: (a) the landing "horizon" glow (§Phase 2), (b) the render progress
sheen (§Phase 9). Nothing else.
Type
Families: --font-sans: "Geist", ui-sans-serif, system-ui; --font-mono: "Geist Mono", ui-
monospace; --font-display: "Instrument Serif", Georgia, serif (italic only).
Scale (size / line-height / letter-spacing / weight):
--t-11: 11px / 16px / +0.06em / 500, uppercase — labels
--t-12: 12px / 16px / 0 / 400 — secondary
--t-13: 13px / 20px / 0 / 400 — body in app
--t-15: 15px / 22px / -0.005em / 500 — panel titles, buttons-lg
--t-17: 17px / 26px / -0.01em / 400 — landing subtext, chatbox input
--t-20: 20px / 28px / -0.01em / 500 — mono timecode, dialog titles
--t-28: 28px / 34px / -0.02em / 500 — delivery title (sans)
--t-display: clamp(44px, 6.2vw, 88px) / 0.98 / -0.035em / 400 — landing headline
(sans part)
Numbers in the app always font-variant-numeric: tabular-nums.
Weights allowed: 400, 500. (600 nowhere. Bold nowhere.)
Space, size, radius
Spacing scale (px): 2, 4, 6, 8, 12, 16, 20, 24, 32, 40, 48, 64, 80, 96, 128. Nothing else.
Radii: --r-4 4 (tags), --r-6 6 (clips), --r-8 8 (rows, small buttons, inputs), --r-12 12
(panels, cards, menus), --r-20 20 (chatbox), --r-pill 999 (pills, LIVE badge, attachment
chips only).
Control heights: 24 (xs), 28 (sm), 32 (md, default in app), 40 (lg), 48 (chatbox send button).
Icon sizes: 14, 16, 20.
Elevation
No shadows except --shadow-pop: 0 12px 32px -8px rgb(0 0 0 / 0.6), 0 0 0 1px var(--line-
strong) for popovers, menus, dialogs, toasts.
Viewer frame: inset 0 0 0 1px rgb(245 241 231 / 0.06).
Motion (in src/lib/motion.ts, export these and use nothing else)
Name Value
--dur-1 90ms (hover, press colour)
--dur-2 140ms (small moves, value tween)
--dur-3 220ms (panels, popovers, chips enter)
--dur-4 360ms (page sections, dialogs)
--dur-5 640ms (screen transitions)
•
•
◦
◦
◦
◦
◦
◦
◦
◦
•
•
•
•
•
•
•
•
6
Name Value
--ease-out cubic-bezier(0.22, 1, 0.36, 1)
--ease-in-outcubic-bezier(0.65, 0, 0.35, 1)
--ease-in cubic-bezier(0.55, 0, 1, 0.45) (exits only)
spring.snappy{ type: "spring", stiffness: 520, damping: 40, mass: 0.8 } (clips sliding, chips)
spring.soft { type: "spring", stiffness: 260, damping: 32 } (panels)
Reduced motion: all translate/scale animations become opacity-only fades of --dur-2; looping
animations stop on their first frame; the warm-up and render scenes switch to their static variants
(described in those phases).
0.6 The kimo mark
Create public/brand/kimo-mark.svg: a 24×24 viewBox mark made of four vertical fully-rounded
bars (widths 3px, gaps 2.5px, heights 10, 16, 12, 7, bottom-aligned at y=19), colour currentColor,
plus a 1.5px vertical playhead line crossing the third bar at x=15, with a 4px downward
triangle on top at y=3. The mark is used ONLY: top-left of the landing nav (20px), studio top bar
(16px), favicon, delivery page footer (14px). Never as a watermark, never repeated.
Wordmark: the word kimo in Geist Sans 500, letter-spacing -0.02em, lowercase, cream-100.

```

## Phase 1 component specification (verbatim source)

```text
1.1 General component rules
Each component: one file, named export, forwardRef where it renders a DOM element,
className merge via cn() allowed only for layout (margin, width, grid placement). Never
pass colours through className from outside.
Variants via a tiny variants() helper you write (no cva dependency). Variants listed below are
the only ones.
Every interactive component: :focus-visible → box-shadow: var(--focus-ring); no outline on
mouse focus.
Hover changes colour only, in --dur-1--ease-out. Press: background one step darker (ink-3 →
ink-4, orange → orange-press) and transform: scale(0.98) for --dur-1. No hover lift, no hover
shadow.
Disabled: text --cream-16, background unchanged, cursor: not-allowed, no hover change.
Loading state on buttons: label stays (keeps width), opacity 0, a 14px spinner centered (§1.9).
1.2 Button
Variant BackgroundText Border Use
primary --orange --on-orange none the ONE main action on a screen
("send", "looks good, render it",
"download")
secondary--ink-2 --cream-100 1px var(--
line-strong)
normal actions
ghost transparent --cream-60 (hover --
cream-100, bg --
ink-2)
none toolbar, low emphasis
danger transparent --error 1px rgb(229
72 77 / .35)
delete, discard
Sizes: xs h24 px8 t-12 r6; sm h28 px10 t-12 r8; md h32 px12 t-13 r8; lg h40 px16 t-15 r8. Gap
icon↔label 6px; icon 14 (xs, sm), 16 (md, lg). Icon-only buttons are square (24/28/32/40) and require
aria-label and a T ooltip.
1.3 Input, Textarea
Height md 32 (inputs), padding 0 10px, --ink-2 background, 1px var(--line) border, r8, t-13
cream-100, placeholder cream-38.
Hover border --line-strong. Focus: border rgb(245 241 231 / .28) + focus ring.
Error: border --error at 60%, message below t-12 --error, 6px gap, aria-describedby linked.
T extarea: auto-grow from 1 to N rows (prop maxRows), no resize handle.
•
•
•
•
•
•
•
•
•
•
2
1.4 Pill / Chip
Pill (status): h22, px8, r-pill, t-11 uppercase, bg --ink-2, text cream-60. Variant live: 6px
orange dot left (gap 6), text cream-100; dot pulses (opacity 1 → .35 → 1, 1600ms, ease-in-out,
infinite) only when prop active.
AttachmentChip (used in chatbox and agent chat): h40, r12, bg --ink-2, border 1px var(--
line), padding 4px 10px 4px 4px. Left: 32×32 r8 thumbnail (video: first frame + 10px play
glyph bottom-left; image: cover; audio: 32px mini-waveform of 12 bars in cream-38; doc: lucide
FileText 16 cream-60 on ink-3). Middle: name t-12 cream-100 truncated at 160px, under it
meta t-11 normal-case cream-38 ("0:12 · 24 MB"). Right: 20px ghost icon button X (aria-label
"remove {name}"). Upload progress: a 2px bar along the chip's bottom inside the radius, fill --
cream-60, turning --success for 600ms on complete then fading out.
1.5 Tooltip
Radix tooltip, delay 400ms open / 0 close, bg --ink-3, text t-12 cream-100, padding 4px 8px, r6, --
shadow-pop, side offset 6, keyboard shortcut shown at right in mono t-11 cream-38 inside a 16px-high
kbd box (r4, bg ink-4). Enter: opacity 0→1 + 2px slide from side, --dur-2.
1.6 Menu, Popover, ContextMenu
Bg --ink-1, r12, --shadow-pop, padding 4. Items h28, px8, r6, t-13 cream-100, icon 14 cream-60 left
(gap 8), shortcut right mono t-11 cream-38. Hover/highlight bg --ink-3. Separator 1px --line with
4px vertical margin. Enter: opacity + scale .97→1 from transform-origin of trigger, --dur-3--ease-
out. Exit: opacity --dur-2--ease-in.
1.7 Dialog
Overlay rgb(8 8 9 / .72) (no blur). Panel width 440 (sm) / 560 (md), bg --ink-1, r12, --shadow-
pop, padding 24. Title t-20 cream-100, description t-13 cream-60 (8px below), actions row right-
aligned 24px below, gap 8. Enter: overlay fade --dur-3; panel opacity + translateY(8px→0) +
scale(.98→1) --dur-4--ease-out.
1.8 Toast
Bottom-center, 16px from bottom, max 3 stacked (gap 8, older ones scale .96 and opacity .7). Bg --
ink-2, --shadow-pop, r12, padding 10px 12px, t-13, max-width 420. Left icon 16: info cream-60,
success --success, error --error. Optional action ghost button xs. Auto-dismiss 4s (errors 8s), pause
on hover. Enter: translateY(12px→0)+opacity, spring.soft.
1.9 Spinner, Progress, Skeleton
Spinner: 14 or 20px, 1.5px stroke, an arc of 90° in current colour over a full circle at 16%
opacity, rotating 700ms linear infinite. Reduced motion: static arc.
Progress bar: h2 (thin) or h4, r-pill, track --ink-3, fill --cream-100 by default, --orange only
when it represents an agent/render action currently running. Width transitions --dur-2 linear.
Indeterminate: a 30%-wide fill sliding left→right 1200ms ease-in-out infinite.
•
•
•
•
3
Skeleton: bg --ink-2, r matches the element it replaces, shimmer = a 40%-wide band of
rgb(245 241 231 / .04) sweeping over 1400ms. No shimmer under reduced motion.
1.10 Segmented control, Toggle, Slider, Tabs
Segmented: h28, bg --ink-2, r8, padding 2, items r6 t-12; active item bg --ink-4 cream-100,
inactive cream-60; the active background slides between items with spring.snappy (shared
layoutId).
T oggle switch: 28×16 track r-pill, off --ink-4, on --cream-100; 12px knob, off cream-60 / on
ink-0; knob moves spring.snappy.
Slider: track h2 --ink-4, filled part cream-60, thumb 12px circle cream-100 with 0 0 0 4px
var(--ink-1) ring; on drag show a value bubble above (mono t-11, ink-3 bg, r4). Value text
field next to every slider in the inspector (Phase 7).
T abs: text tabs t-13, inactive cream-38, active cream-100 with a 1.5px cream-100 underline
6px below text that slides between tabs (shared layoutId).
1.11 Panel, Section, Row, Kbd, ScrollArea
Panel: bg --ink-1, r12, no border. Header h40, px12, title t-15 cream-100, right slot for icon
buttons. Body padding 12 (or 0 with flush).
Section: label t-11 uppercase cream-38, 8px below label → content; 16px between sections;
collapsible with a 14px chevron rotating 90° --dur-2.
Row: h32 (or 28 dense), px8, r8, label t-12 cream-60 left, value t-13 cream-100 mono-tabular
right. Hover bg --ink-2.
Kbd: h18, min-w18, px4, r4, bg --ink-3, mono t-11 cream-60.
ScrollArea (Radix): scrollbar 6px, thumb rgb(245 241 231 / .14) r-pill, appears on hover/
scroll only.
1.12 Avatar / Agent identity
The AI is shown as "kimo" with a 20px circle avatar: ink-3 background with the kimo mark at 12px in
cream-100. When the agent is acting, a 1.5px orange ring rotates around the avatar (a 100° arc,
1200ms linear). The user is shown as a 20px circle ink-4 with their initial in t-11 cream-100 (or "you").

```

Component-specific tokens introduced by Phase 1 live in `apps/web/src/styles/ui.css`; Phase 0 primitives remain unchanged. The axe-required contrast exceptions are recorded in DECISIONS.md.

## Phase 3 upload specification (verbatim source)

```text
3.1 Upload manager (src/lib/uploads/manager.ts)
A singleton store (zustand) useUploads with items { localId, file, kind, status:
"queued"|"probing"|"uploading"|"done"|"error"|"canceled", progress 0..1, bytesSent,
assetId?, error?, meta: { durationSec?, width?, height?, thumbBlobUrl?, waveform?:
Float32Array(64) } }.
Concurrency: 3 parallel uploads. Order: smallest files first so chips complete visibly early.
Flow per file: (1) probe locally (§3.2) → (2) request presigned URLs in one batched POST /v1/
uploads for all queued files → (3) XMLHttpRequest PUT with upload.onprogress → (4) mark
done.
Files > 100 MB: use multipart (POST /v1/uploads returns parts: [{ partNumber, putUrl }]
with 16 MB parts when size > 100MB; add this to the contract and the mock). 4 parts in
parallel, retry each part up to 3 times with backoff 1s/3s/9s.
Network loss: pause all, show the warning toast "you’re offline. uploads will continue when
you’re back." and resume automatically on online event.
Cancel: removing a chip aborts its XHR and deletes it from the session list.
Uploads continue in the background across the route change to /warmup and /studio
(manager lives above the routes in the root layout provider).
beforeunload warning while any upload is in progress.
3.2 Local probe (no server needed, runs in a Web Worker where
possible)
Video: create a hidden <video muted preload="metadata"> from URL.createObjectURL, read
duration, videoWidth, videoHeight. Seek to min(1, duration*0.1) and draw to a 160×90 (or
90×160) OffscreenCanvas → JPEG blob → thumbBlobUrl. Also extract 8 filmstrip frames
evenly spaced at 80px height for the timeline (store as blob URLs), lazily after upload starts.
Audio (and video audio tracks ≤ 10 min): decode with OfflineAudioContext at 8 kHz
mono, compute 64-bin peak waveform for chips and a 1 value per 10ms peak array for the
timeline (store in IndexedDB keyed by localId, since it can be large).
Image:createImageBitmap, read size, make a 160px thumbnail.
Docs: no probe; just name/size.
Unsupported codecs (e.g. HEVC in Firefox): still upload; chip shows thumbnail placeholder
(ink-3 with lucide Film 16 cream-38) and meta "preview after upload".
12.
•
•
•
•
•
•
•
•
•
•
•
•
•
2
3.3 Chip states (exact)
State Visual
queued thumbnail at 50% opacity, meta "waiting…" cream-38
probing thumbnail skeleton shimmer, meta "reading…"
uploadingthumbnail full, meta "{pct}% · {sent} of {total}" mono-tabular, 2px cream-60 progress bar at
the bottom
done meta returns to "0:12 · 24 MB"; bar turns --success for 600ms then fades out over --dur-3; a
12px Check icon in --success appears right of the name for 1.2s then fades
error border rgb(229 72 77 / .5), meta "failed · retry" where "retry" is an underlined button in
cream-100; clicking retries
canceledchip collapses width to 0 and fades, spring.snappy
3.4 Session start
POST /v1/sessions is sent as soon as all presigned URLs are obtained (we know assetIds)
— do not wait for bytes to finish. The backend waits for assets itself and reports progress via
warmup.step.
Persist { sessionId, prompt, assetLocalMap } in sessionStorage so a refresh on /warmup or /
studio restores state.
Store the prompt and attachments so the Studio's agent chat shows them as the first user
message (exactly as the user wrote it, with chips).
3.5 Session restore and deep links
Visiting /studio/{id} directly: call GET /v1/sessions/:id; if status warming redirect to /
warmup/{id}; if rendering redirect to /render/{id}; if done redirect to /v/{videoId}; if failed
show the error screen (§3.6).
Unknown id → not-found.tsx with copy: title t-20 "this session doesn’t exist", body t-13
cream-60 "it may have expired. sessions are kept for 24 hours.", primary button "start a
new video" → /.
3.6 Error screen (shared component FullScreenError)
Centered, max-width 440: lucide CircleAlert 20 --error, 16px gap, title t-20 cream-100, 8px, body
t-13 cream-60, 24px, buttons row: primary + secondary. Copy variants:
upload: "some files didn’t upload" / "check your connection and try again. nothing you
made is lost." / "retry uploads" / "back"
session: "kimo couldn’t start this edit" / "the editor hit a problem before it began. your
files are saved for 24 hours." / "try again" / "start over"
3.7 Tests
Unit: manager concurrency, retry/backoff, multipart splitting (use fake XHR), cancel, offline/
online.
•
•
•
•
•
•
•
•
3
E2E (mock server): attach 5 files including one 150 MB generated file → multipart path; verify
progress UI, completion ticks, session created before uploads finish, redirect to warm-up.
MOCK_FAIL=upload shows error chip and retry works.
Acceptance checklist (Phase 3)
3-parallel uploads, multipart > 100 MB, retries, offline resume, cancel, background continuation
across routes.
Thumbnails, filmstrips and waveforms generated locally; cached in IndexedDB.
All chip states pixel-match §3.3.
Session restore/redirect rules in §3.5 work on refresh.
Error and not-found screens with exact copy.
T ests green.
•
•
•
•
•
•
•
•
4
```

## Phase 04 source specification

```text
Phase 4 — The Warm-up Screen
READ THIS FIRST — rules for this phase (repeated in every
phase on purpose)
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
If an instruction in this phase seems to conflict with an earlier phase, this phase wins for the
parts it names; everything else from earlier phases stays.
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
12.
1
Goal: build /warmup/[sessionId], the 5–40 seconds between "send" and the Studio. It must feel
alive, honest and beautiful: small precise animations that show real progress (uploading, reading
files, watching footage, planning the edit), never a fake spinner. Then a seamless transition into the
Studio.
Skills to load:emil kowalski skills, design motion principles, motion.dev animations, react-
view-transitions.
4.1 Layout
Background --ink-0, grain overlay from Phase 2 kept, horizon glow kept but moved to center
(ellipse 900×420, centered, opacity animates with progress from .5 to 1).
Everything centered in a 560px column, vertically centered.
T op-left: kimo mark 16px + kimo t-13 (links nowhere during warm-up). T op-right: ghost xs
button "cancel" → confirm dialog ("stop this edit?" / "your files stay uploaded for 24
hours." / danger "stop" / secondary "keep going").
4.2 The centerpiece: "the reel" (component WarmupReel)
A 360×120 composition built with SVG + motion:
Filmstrip: a horizontal strip, 360 wide × 64 tall, r12, bg --ink-1, clipped. Inside: the user's
actual thumbnails (from Phase 3; for images the image, for audio a waveform tile, for docs a
ink-2 tile with the doc icon), each 96×54 r6, gap 6, scrolling left at a constant 24px/s in an
endless loop (duplicate the list to loop). Sprocket holes: 4×3px rounded rects in rgb(245 241
231 / .08) along the top and bottom edges every 12px, scrolling with the strip.
Playhead: a 1.5px --orange vertical line centered on the strip, 80px tall (extends 8px above
and below), with the 7px downward triangle at top (the mark's playhead). It does not move; the
strip moves under it. Each time a thumbnail's center crosses the playhead, that thumbnail
brightens (filter brightness 1 → 1.25 → 1 over 400ms) — "being watched".
Bars: below the strip (16px gap) the four rounded bars of the kimo mark drawn large (bar
width 10px, gap 8px, max height 40px), cream-100 at 85%. Their heights animate like a calm
equalizer tied to the current step: during upload they follow the aggregate upload progress (all
bars rise to the progress height); during watch they animate in a slow staggered wave (each
bar 900ms ease-in-out alternate, offsets 0/120/240/360ms, heights between 30% and 100%);
during plan they settle one by one into the exact proportions of the logo (10/16/12/7 ratio)
with spring.snappy; at ready the whole cluster performs a single 1.06 scale pulse.
If the user attached no files: strip shows 6 ink-2 placeholder tiles with a subtle shimmer.
Reduced motion: strip static showing the first 3 thumbnails, bars static in logo proportions, only the
step text and progress change.
4.3 Step list (under the reel, 40px gap)
A vertical list of 4 rows, each h28, gap 6, left-aligned inside a 320px box centered:
Step id Label while active Label when done
upload "uploading your files" + live " · 64%" mono "files uploaded"
•
•
•
•
•
•
•
2
Step id Label while active Label when done
probe / watch "watching your footage" + " · clip 3 of 7" when known "footage watched"
plan "planning the edit" "plan ready"
ready "opening the studio" —
Row anatomy: 16px status icon slot + 10px gap + label t-13. Pending: 6px dot cream-16, label
cream-38. Active: 14px spinner in --orange (the one orange on screen besides the playhead —
allowed because both are "now"), label cream-100. Done: 14px Check cream-60, label cream-60; the
check draws with a stroke-dashoffset animation 260ms. Rows transition color --dur-3.
4.4 "What kimo noticed" line (live, delightful)
Under the step list (24px gap): a single line t-13 cream-60 italic-free, max-width 520, centered, that
types itself letter by letter (18ms per char) from agent.status labels sent during warm-up, e.g.
"spotted a sunset at 0:42 in clip 2", "found speech in the podcast clip", "the music is 112
bpm". Each new line replaces the old with a 220ms crossfade. Prefix: a 4px orange dot that blinks
once on change. If no labels arrive within 4s of the watch step, show rotating honest fallbacks:
"reading every frame…", "listening to the audio…", "looking for the best moments…".
4.5 Bottom info
Bottom-center, 32px from the bottom: t-12 cream-38 "usually ready in under a minute · you can
leave this tab open". If warm-up exceeds 60s: change to "taking longer than usual, big files
take a moment" in --warning at 80%.
4.6 Data flow
Connect to the WebSocket from POST /v1/sessions response (or GET restore). Map
warmup.step to the rows. Combine local upload progress (Phase 3 manager) into the upload
row so it moves even before the server reports.
On warmup.step: ready (or agent.status with the first agent.action.start), wait until the
current animation beat ends (max 400ms), then transition.
Prefetch: as soon as plan starts, router.prefetch('/studio/{id}') and preload the compositor
chunk and the first 3 asset proxies (<link rel="preload" as="video"> is unreliable; instead
create hidden video elements with preload="auto" for the first 3 assets and hand them to the
compositor via a shared cache).
4.7 Transition into the Studio (the "unfold")
T otal 900ms, with View Transitions API (fallback: motion layout animation):
Step list and noticed-line fade out (--dur-3).
The filmstrip stops scrolling and morphs into the Studio timeline's V1 track area (bottom of
screen): it stretches to full width and moves down, while thumbnails become the first clips
(shared element names per asset id).
The playhead morphs into the timeline playhead.
The four bars shrink and fly to the top-left to become the 16px mark in the Studio top bar.
•
•
•
1.
2.
3.
4.
3
The Studio panels (viewer, agent panel, inspector) fade + rise 8px with stagger 60ms after step
2 reaches 60%.
Reduced motion: crossfade 220ms.
4.8 Failure states
WS cannot connect after 3 tries (2s/4s/8s): FullScreenError session variant.
error message from server: same error screen with server message appended in mono t-12
cream-38.
Upload failure: the upload row turns --error label "2 files failed · retry" (retry button
inline) while the rest continues if possible.
Acceptance checklist (Phase 4)
Reel uses the user's real thumbnails; playhead brightening works; bars follow each step's
behaviour.
Step rows and noticed-line driven by real WS events from the mock; fallbacks after 4s.
Prefetch of studio route and first asset videos.
Unfold transition lands with clips exactly where the Studio timeline will render them (record a
60fps Playwright video and attach in docs/screens/phase-04-unfold.webm).
Reduced-motion version verified.
Cancel dialog, >60s message, failure screens.
5.
•
•
•
•
•
•
•
•
•
4
```

## Phase 05 source specification

```text
Phase 5 — The Studio Shell (layout, panels,
top bar, status)
READ THIS FIRST — rules for this phase (repeated in every
phase on purpose)
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
Goal: build the static and responsive structure of /studio/[sessionId]: every panel in its exact
place, sizes, resizers, the top bar, the status bar, panel headers, empty states and keyboard map.
The live preview (Phase 6), timeline editing (Phase 7) and agent panel behaviour (Phase 8) plug into
this shell.
Design principle (write it at the top of studio/README.md):the footage is the hero; the chrome
stays quiet; orange only marks what the AI is doing right now.
Skills to load:design-system-patterns, impeccable, taste-skill, react-best-practices.
5.1 Reference layout at 1920×1080 (8px grid, 8px gutters,
panels separated by tone, no borders)
+--------------------------------------------------------------------------------------------
+
| TOP BAR 48
|
+---------------------+-----------------------------------------------
+----------------------+
| AGENT PANEL         | VIEWER                                        | INSPECTOR
|
| 360 (min 300,       | flexible (min 560)                            | 320 (min 280,
|
|      max 480)       | 16:9 or 9:16 frame centered, letterboxed      |      max 420)
|
|                     | on --ink-0                                    |
|
|                     | transport bar 48 under the frame              |
|
+---------------------+-----------------------------------------------
+----------------------+
| TIMELINE 320 (min 200, max 60% of height)
|
|  toolbar 36 | ruler 28 | tracks ... | zoom/scroll footer 24
|
+--------------------------------------------------------------------------------------------
+
| STATUS BAR 28
|
+--------------------------------------------------------------------------------------------
+
App canvas --ink-0; each panel is a Panel (--ink-1, r12). Gutters 8px around and between
panels (so the canvas shows as thin dark lines).
Resizers: 8px-wide invisible hit areas in the gutters. On hover (after 150ms) a 2px cream-38
line appears centered in the gutter, cursor col-resize/row-resize. Double-click resets to
default. Sizes persist to localStorage per user.
Panels can collapse: agent panel collapses to a 48px rail (avatar + unread dot + expand
button), inspector collapses to 0 (toggle in top bar), timeline collapses to its 36px toolbar.
12.
•
•
•
2
5.2 Top bar (h48, sits on --ink-0, no panel background)
Left group (padding-left 16, gap 12):
kimo mark 16px (link to / with a confirm dialog if session active: "leave the studio?" / "your
edit keeps its place for 24 hours." / "leave" / "stay").
Divider: 1px × 16px --line.
Project title: t-13 cream-100, inline-editable (click → input, Enter saves, Esc cancels). Default
from the agent (e.g. "manali trip reel"); fallback "untitled video". Pencil icon 12 cream-38
appears on hover.
Save state t-12 cream-38: "saved", "saving…", or "offline · changes kept locally" in --
warning.
Center group (absolutely centered):
Agent status pill (Pill live variant, h24, px10): orange pulsing dot + "kimo is editing" +
mono cream-38 " · 41 actions" while acting; "kimo is thinking" (dot pulses slower 2.4s)
while thinking; "waiting for you" (dot cream-100, still) when waiting_user; "paused" (dot
cream-38) when paused. Click opens the agent panel if collapsed.
Next to it, ghost icon button 28: Pause / Play (pause/resume the agent; tooltip "pause kimo" /
"let kimo continue", shortcut ⌘ .).
Right group (padding-right 16, gap 8):
Ghost icon Undo2, Redo2 (⌘Z / ⇧⌘Z), divider.
Ghost icon PanelRight toggle inspector; PanelLeft toggle agent.
Secondary sm button "preview full" with Maximize2 icon (opens fullscreen player of current
cut, Phase 6).
Primary sm button "finish" — the one orange button in the top bar. Disabled (secondary
style) until the agent has produced at least one action. Opens the review flow (Phase 9). When
the agent asks for review, the button gains a 2px orange ring pulse 3 times.
5.3 Viewer panel structure (contents wired in Phase 6)
Header: none (the viewer has no title, to keep the frame the hero). A 32px-high overlay row
appears on hover at the top inside the panel: left "1920 × 1080 · 30 fps" t-11 cream-38; right:
zoom segmented "fit", "50%", "100%", and a ghost icon Grid3x3 (safe-area/thirds guides
toggle), ScanEye (show AI overlays toggle, default on).
Frame area: the canvas (Phase 6) centered with object-fit: contain logic, inset 1px highlight.
Transport bar (h48, under frame, inside panel): left: timecode 00:00:12:07 mono t-20
cream-100 tabular, then " / 00:00:45:00" mono t-13 cream-38. Center: buttons ghost 32:
SkipBack (to start, Home), StepBack (prev frame, ←), Play/Pause 40px circle secondary
(space), StepForward (→), SkipForward (end, End). Right: Repeat loop toggle (L), volume
Volume2 with a popover slider, playback speed menu (0.5×, 1×, 1.5×, 2×).
5.4 Agent panel structure (behaviour in Phase 8)
Header h40: avatar 20 + "kimo" t-15 + flexible + ghost icon History (opens action history
filter) + ghost icon PanelLeftClose.
•
•
•
•
•
•
•
•
•
•
•
•
•
•
3
T abs under header (T abs component): "chat" and "actions". Chat = conversation interleaved
with grouped action summaries; Actions = the raw, auditable list of every tool call.
Body: scroll area.
Footer: the Studio composer (smaller sibling of landing composer): min h88, r12, bg --ink-2,
border --line, textarea t-13, placeholder "tell kimo what to change…", attach button, send
button 32px circle (orange when text present). While the agent is acting, the placeholder
becomes "type to interrupt kimo…" and a t-11 cream-38 hint above the composer reads
"kimo will stop after the current step and read your note".
5.5 Inspector panel structure (behaviour in Phase 7)
Header h40: title t-15 reflects the selection: "project" (nothing selected), "clip ·
beach_02.mp4", "text · title", "audio · lofi_beat", "3 clips".
When the AI touches a property of the selected (or any, if "follow kimo" is on) object, the
inspector auto-switches to that object and section. T oggle "follow kimo" (T oggle component,
label t-12 cream-60) sits in the header right; default on.
Sections per object type (defined fully in Phase 7): Transform, Crop, Speed, T ext, Style, Colour,
Effects, Mask (SAM), Audio, Transitions, Source (for web images: attribution).
5.6 Timeline panel structure (behaviour in Phase 7)
T oolbar h36: left tools (segmented, 28): MousePointer2 select (V), Scissors blade (B),
MoveHorizontal slip (Y), Type add text (T); divider; Magnet snapping toggle (S, default on);
Link linked selection; flexible; centre: current tool hint t-12 cream-38; right: zoom slider
(120px) + ZoomIn/ZoomOut, "fit" ghost xs button (⇧Z).
Ruler h28; track headers column 160 wide on the left (sticky); tracks area scrolls horizontally
and vertically.
Footer h24: horizontal mini-map scrollbar showing the whole edit with a viewport window.
5.7 Status bar (h28, on --ink-0)
Left (t-11 normal case, cream-38, gap 16, separated by ·): "preview 60 fps" (live from compositor;
--warning if < 30), "proxies ready 7/7", "session 00:12:48". Right: "connected" with a 6px --
success dot, or "reconnecting…" with a --warning dot and spinner. Clicking "connected" opens a
small popover with latency in ms and WS version.
5.8 Responsive behaviour
≥ 1600: as reference.
1280–1599: agent 320, inspector 280, timeline 280.
1024–1279: inspector becomes an overlay sheet from the right (opens on selection, 320 wide,
--shadow-pop); agent 300.
< 1024 (tablet/phone): "watch mode" layout: viewer on top (full width), tabs underneath:
"chat", "timeline", "edit". Timeline is simplified (no track headers, pinch-zoom). A banner
t-12 at top: "for full editing, open kimo on a bigger screen" (dismissible).
•
•
•
•
•
•
•
•
•
•
•
•
•
4
5.9 Keyboard map (src/lib/keyboard.ts, one central registry, shown in
a ? dialog)
Space play/pause · J/K/L shuttle · ←/→ frame · ⇧←/⇧→ 1s · Home/End · I/O set in/out range · V/B/Y/T
tools · S snapping · ⌘Z/⇧⌘Z undo/redo · ⌘C/⌘V/⌘D copy/paste/duplicate · Delete ripple-delete
selection · ⌘K focus agent composer · ⌘. pause/resume kimo · F toggle fullscreen preview · ⇧Z fit
timeline · ? shortcuts dialog. Shortcuts are disabled while typing in inputs, except ⌘K, ⌘Enter, Esc.
Shortcuts dialog: Dialog md, title "keyboard shortcuts", two columns of Rows with Kbd groups.
5.10 Empty / loading states
Before the first project.ops arrives: viewer shows the first user thumbnail dimmed 40% with
centered t-13 cream-60 "kimo is laying out the first cut…" and a 2px indeterminate
progress at the very top of the viewer panel (cream-60). Timeline shows track header skeletons
and 3 clip skeletons.
Agent panel always shows the user's first message immediately (from Phase 3).
Acceptance checklist (Phase 5)
Layout matches §5.1 at 1920×1080 within ±1px (Playwright bounding-box test for every
panel).
Resizers, collapse, persistence, double-click reset.
T op bar groups, status pill states (driven by mock WS), pause/resume, finish button
disabled→enabled→pulse.
Transport, timeline toolbar, inspector header switching (with stub data).
Responsive breakpoints including watch mode.
Keyboard registry and ? dialog; no conflicts.
Screenshots at 1920×1080, 1440×900, 1280×800, 390×844.
•
•
•
•
•
•
•
•
•
5
```

## Phase 06 source specification

```text
Phase 6 — The Live Preview Engine (real-
time, no render step)
READ THIS FIRST — rules for this phase (repeated in every
phase on purpose)
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
Goal: build packages/compositor, the engine that draws the current KimoProject into the viewer in
real time at 30–60 fps, and redraws the very same frame within one animation frame of any change
(agent op or user edit). The user must never wait for a render to see an edit. The final 1080p export
is done by the kimo engine on the server (Phase 9); this engine is a faithful preview of it.
Skills to load:webgpu skill, react-best-practices. Read the PixiJS v8 docs on video textures,
render groups and filters before starting.
6.1 Architecture
project store (zustand) --subscribe--> CompositorController
                                         |-- Timeline clock (requestAnimationFrame, audio-
clock master)
                                         |-- MediaPool (HTMLVideoElement / ImageBitmap /
AudioBuffer per asset, proxy URLs)
                                         |-- SceneBuilder (pure fn: project + time ->
SceneGraph)
                                         |-- PixiRenderer (SceneGraph -> Pixi containers,
diffed)
                                         |-- AudioEngine (WebAudio graph: clips -> gain ->
ducking -> master)
                                         |-- OverlayLayer (DOM/SVG above canvas: AI regions,
SAM masks, guides, text editing handles)
SceneBuilder.build(project, t) is pure and unit-tested: returns an ordered list of visible
layers at time t with resolved transform (after keyframe interpolation), opacity (after
transitions), crop, effects, text layout and mask refs.
PixiRenderer keeps a map clipId → DisplayObject, diffs the SceneGraph every frame, and
only creates/destroys objects when layers appear/disappear.
Canvas internal resolution: project size scaled to the viewer's device-pixel size, capped at
1920×1080 (or 1080×1920) and at 1280×720 when navigator.hardwareConcurrency <= 4 or
measured fps < 40 for 2 seconds (adaptive quality). Status bar reports actual fps.
6.2 Media pool and proxies
Each video asset is played from proxyUrl (720p H.264, provided by backend / mock) when
available, else original. One HTMLVideoElement per clip instance on screen (pool reused; max 6
active decoders; beyond that, clips not near the playhead release their elements).
Seeking accuracy: when paused, after a seek or an edit, request
video.requestVideoFrameCallback and render only when the frame for in + (t - start) *
speed is presented (±half a frame). While waiting, keep the previous frame (never flash black).
Pre-roll: 1.5s before a clip becomes visible during playback, create/seek its element so the cut
is seamless.
Images: ImageBitmap → texture, cached. Web-found images arrive via asset.added and are
loaded immediately (show a 120ms fade-in the first time they appear in frame).
Audio: decode audio-only assets to AudioBuffer; video audio comes from the video elements
routed through MediaElementAudioSourceNode.
12.
•
•
•
•
•
•
•
•
2
6.3 Clock and playback
Master clock = AudioContext.currentTime while playing (keeps A/V in sync);
performance.now() when muted/no audio.
Play: resume AudioContext, start all clips intersecting t at correct offsets. Pause: freeze, keep
frame.
Loop region (I/O points from the timeline) when loop is on.
Scrubbing (dragging the playhead): render at most every animation frame; video elements use
fastSeek where available during drag and an exact seek on release; audio plays 60ms "scrub
blips" at the scrub position (toggle in settings, default on).
Playback speed 0.5×–2× via playbackRate and audio playbackRate.
6.4 What must render live (the preview feature list)
Implement each with a Pixi filter or display object. Each must match the server output closely; write
the formula in packages/compositor/FIDELITY.md so the backend team can match it.
Feature Live preview implementation
Cuts, trims,
reorders, splits,
speed
SceneBuilder timing math
Transform (x, y,
scale, rotation,
opacity), crop
container props + mask rect
Keyframes linear, ease-in-out (cubic), hold; bezier handles from op
Transitions cross-dissolve (opacity), dip to black, slide (4 dirs), zoom-in, whip blur (motion blur filter) —
durations in frames
Reframe 16:9 →
9:16
transform from AI with keyframed x following SAM subject centroid
Colour exposure, contrast, saturation, temperature, tint, lift/gamma/gain (RGB), LUT (3D LUT as
2D 512×512 strip texture, custom filter)
Effects gaussian blur, vignette, film grain, sharpen, black & white, zoom punch-in
SAM 3.1 masksmask asset = per-frame RLE or a low-res mask video (proxy) from backend; preview uses
mask video texture as alpha (custom filter) with feather as blur on the mask; invert
supported. Effects can apply inside or outside the mask (e.g. background blur, subject-only
colour pop)
T ext Pixi Text/BitmapText with our text styles (§6.5); word-level caption highlighting from
words[]
Shapes rounded rect bars (lower-third backgrounds), lines
Audio volume, fades, ducking (music gain reduced by −12 dB when voice clips play, 300ms
attack/release), mute/solo per track
Anything the server can do that the preview cannot exactly reproduce (e.g. a heavy 3D effect) must
still show immediately as an approximation, plus a small badge in the viewer top-right: t-11
"preview approx." on --ink-2 r4. Never block.
•
•
•
•
•
3
6.5 Text styles (defined here, used by Phase 7 and server)
Ship 8 styles as data (textStyles.ts), each with a font family. Allowed in-video fonts: Geist, Geist
Mono, Instrument Serif, plus Anton and DM Serif Display (these two are loaded only for the canvas,
never used in UI chrome). No other fonts. The 8 styles: caption-clean (Geist 500 56px white, 2px
black stroke 25%, bottom safe area), caption-pop (Anton 72px uppercase, active word in #FFD84D,
others white), caption-box (Geist 500 48px on black 70% rounded box), title-serif (Instrument
Serif italic 120px), title-bold (Anton 140px), lower-third (Geist 500 40px + Geist 400 28px on a
rounded bar), label-mono (Geist Mono 32px), quote (DM Serif Display 64px). Positions in a
1920×1080 safe-area grid (title-safe 90%). These are inside-video styles and are the only place
colours other than tokens are allowed (they are content, not UI).
6.6 Live updates from ops
Store applies ops (Phase 0 contract) with immer → controller gets a change set of affected clip
ids → marks the frame dirty → next rAF redraws. T arget: op received → pixels updated < 50
ms when paused (measure and show in a dev overlay ?debug=1).
When an agent.action.start has a target, the controller (if "follow kimo" is on and the user is
not playing or scrubbing) moves the playhead to the target clip's start (or target.time) with a
240ms eased scrub so the user sees the change happen in frame.
When the user is playing, never move the playhead; instead show a small "edit at 00:21" chip
in the viewer bottom-left that seeks there when clicked.
6.7 OverlayLayer (DOM above canvas, pointer-events only
where interactive)
AI region outline: when an action has target.region, draw a 1px --orange rounded rect (r4)
with a 10px corner bracket style (only corners drawn, 12px long) that fades in 120ms and fades
out 600ms after agent.action.end.
SAM mask preview: while a sam action runs, draw the previewPolygon filled --orange-24
with a 1px --orange edge and a label chip at its top-left: t-11 "sam 3.1 · person" on --ink-1
r4. When the real mask asset arrives, crossfade polygon → actual mask edge (rendered via an
edge-detect pass) over 300ms, then hide (keep it visible when the clip's Mask section is open in
the inspector).
Text edit handles: for selected text clips, a 1px cream-60 bounding box with 6px square
handles (r1, cream-100) for move/scale/rotate (rotate handle 16px above the top center).
Double-click enters inline text editing (Phase 7).
Guides: thirds grid and title-safe rect in rgb(245 241 231 / .16) when the grid toggle is on;
snapping guides in --cream-60 dashed when dragging.
6.8 Fullscreen preview
F or "preview full": a fullscreen black overlay with the canvas centered, minimal controls auto-hiding
after 2s (scrub bar 4px → 8px on hover, timecode, play, close). The agent can keep editing; changes
appear live even here.
•
•
•
•
•
•
•
4
6.9 Thumbnails and filmstrips for the timeline
Expose compositor.getFilmstrip(clipId, widthPx) using the cached frames from Phase 3 and, for
agent-generated clips, extracting frames from proxies with an OffscreenCanvas in a worker.
Waveforms from IndexedDB or computed from proxy audio.
6.10 Tests & benchmarks
Unit tests for SceneBuilder (timing, transitions, keyframes, speed, splits).
Visual regression: render 12 golden frames from a fixture project with Playwright +
toHaveScreenshot (tolerance 1%).
Benchmark page /dev/compositor with a 20-clip, 5-track fixture: must sustain ≥ 55 fps on an
M1/RTX laptop at 1080p canvas, ≥ 30 fps at 720p on a 4-core laptop. Log results in docs/
PHASE_LOG.md.
Acceptance checklist (Phase 6)
Live preview of every feature in §6.4 against the mock's scripted session.
Op → pixel latency < 50 ms paused, shown in debug overlay.
Seamless cuts during playback (no black frames) on the fixture; A/V sync within 1 frame.
SAM polygon → mask crossfade; AI region brackets; text handles; guides.
Follow-kimo playhead behaviour and "edit at" chip while playing.
Adaptive quality and fps reporting.
FIDELITY.md written; golden-frame tests green; benchmark numbers logged.
•
•
•
•
•
•
•
•
•
•
5
```
