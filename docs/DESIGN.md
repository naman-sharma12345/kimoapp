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

## Phase 07 source specification

```text
Phase 7 — Timeline, Inspector and Manual
Editing (the user can change everything)
READ THIS FIRST — rules for this phase (repeated in every
phase on purpose)
You are a senior frontend engineer building kimo web, the browser app for kimo, an AI video editor.
You are NOT the designer. Every visual decision has already been made and is written below or in
docs/DESIGN.md (created in Phase 0). Your job is to implement it exactly.
1. No improvising. If a value (color, size, radius, spacing, duration, easing, copy) is written here,
use exactly that value. If something is not specified, pick the closest existing token from docs/
DESIGN.md and write a line in docs/DECISIONS.md saying what you chose and why. Never invent
a new color, font, font size, radius, shadow or easing curve.
2. No extra libraries beyond the ones listed in Phase 0's stack table. If you think you need one,
write it in docs/DECISIONS.md as a proposal and continue without it.
3. Only tokens. Never hard-code a hex value, px font size or duration inside a component. Use
the CSS variables / Tailwind theme tokens defined in Phase 0 (--ink-0, --cream-100, --
orange, --dur-2, --ease-out, etc.).
4. Copy is exact. Every user-facing string written in quotes in these prompts is final. Use it
character for character, including lowercase "kimo". Never write "Kimo" with a capital K in UI
text.
5. One orange rule. Orange (--orange #FF5A24) means "the AI is doing this right now" or "the
one primary action". At most ONE orange element per panel at a time. Never use orange for
decoration.
6. No: gradients (except the two named exceptions in DESIGN.md), glassmorphism, drop
shadows (except the named --shadow-pop), emoji in UI, stock illustrations, lorem ipsum,
purple, neon, glow effects, rounded-full buttons except where named, bouncy overshoot
springs except where named.
7. Accessibility is not optional: every interactive element is keyboard reachable, has a visible
focus ring (--focus-ring), and has an accessible name. Respect prefers-reduced-motion
(every animation has a reduced variant listed in DESIGN.md §Motion).
8. TypeScript strict. No any. No // @ts-ignore. ESLint and Prettier must pass with zero
warnings.
9. Finish the phase completely before stopping. At the end, run pnpm lint && pnpm typecheck
&& pnpm test && pnpm build. All must pass. Then fill in the "Acceptance checklist" at the end of
this document in docs/PHASE_LOG.md, ticking each item honestly, with a screenshot path for
each visual item (docs/screens/phase-XX-*.png, captured with the Playwright script from Phase
0).
10. Do not touch the kimo engine repo or any backend code outside apps/web and packages/*
listed in Phase 0. The backend is reached only through the typed client in packages/kimo-
client.
11. Skills. The agent skills installed in Phase 0 (listed in docs/SKILLS.md) are for craft, quality and
review. Use the ones named under "Skills to load" in this phase. If a skill suggests a different
look (new fonts, colors, bolder layout), this spec wins, always. Skills never override a written
value.
1

12. If an instruction in this phase seems to conflict with an earlier phase, this phase wins for the
parts it names; everything else from earlier phases stays.
Goal: make the timeline and inspector fully interactive so the user can edit anything the AI made —
move, trim, split, delete, reorder, retime, restyle, and rewrite every single line of text — while the
AI keeps working. Every user edit is an op (Phase 0 contract), applied optimistically, previewed live
(Phase 6), and sent to the server so the AI sees it.
Skills to load: emil kowalski skills, accessibility-compliance, react-best-practices,
impeccable.
7.1 Timeline rendering
• Render the tracks area with one <canvas> per visible track row for clip bodies, filmstrips
and waveforms (fast), and DOM only for interactive handles and labels of the clips currently
under the pointer/selected. Virtualize horizontally: draw only the visible time range + 1 screen
margin.
• Time scale: pxPerSec from zoom, range 4 → 600 px/s, default = fit whole edit into the visible
width with 10% right padding.
• Ruler (h28, bg --ink-1): major ticks every "nice" interval (1s, 2s, 5s, 10s, 30s, 1min) chosen
so majors are ≥ 80px apart, labels mono t-11 cream-38 00:12; minor ticks cream-16 4px tall;
frame ticks appear at ≥ 300 px/s. Click/drag on the ruler scrubs.
• Playhead: 1.5px --orange line across ruler and tracks, with the 7px triangle head on the ruler
(draggable, 16px hit area). While the agent acts and follow-kimo moves the playhead, it glides
(240ms ease-in-out).
• Track headers (160 wide, sticky left, bg --ink-1): 24px track-kind icon (Film, Image, Type,
Music, Mic) cream-38, name t-12 cream-60 (double-click to rename), and on hover three 20px
ghost toggles: Eye/EyeOff (hide), Volume2/VolumeX (mute, audio only), Lock/Unlock. Order
top to bottom: text tracks, overlay tracks, V1 main video, then audio (voice, music, sfx). Track
heights: text 48, overlay 64, video 88, audio 64.
• Clip body: r6, fill = track tint (Phase 0), 1px inner top highlight rgb(245 241 231 / .05). Label
row (top 18px): clip name t-11 normal case cream-60 truncated, speed badge "1.5×" mono
t-11 if ≠ 1. Video clips: filmstrip below the label at 60% opacity; audio clips: waveform
cream-38 centered; text clips: the text content itself in t-12 cream-100 (live, updates as
edited), image clips: repeated thumbnail.
• Selection: 1.5px cream-100 inner border + handles. Hover: tint +4% lightness.
• AI is touching this clip: 1.5px --orange inner border + an --orange-12 wash, plus a tiny
14px orange spinner at the clip's top-right — only during the running action. When the action
ends, border fades to transparent over 600ms. A clip just created by the AI grows in from width
0 at its start (spring.snappy). A clip the AI moves slides with spring.snappy. A clip the AI
deletes collapses to width 0 and fades (220ms).
• Transitions: a 20px-wide rounded chip (r-pill, --ink-3, lucide Blend 12) centered on the cut,
label on hover "cross dissolve · 12f".
• Markers: 8px rotated-square diamonds on the ruler in cream-60; AI markers (e.g. "beat", "best
moment") in cream-38 with tooltip text.
• Gaps: hatched pattern of rgb(245 241 231 / .03) diagonal lines 6px apart.
2

7.2 Editing interactions (Select tool unless stated)
Action Gesture Behaviour
Select click; ⇧-click add; drag selection syncs with inspector
marquee on empty space
Move drag clip snaps (if snapping on) to playhead, clip edges, markers within 8px,
showing a 1px cream-60 vertical snap line; can change track of same
kind; ⌥-drag duplicates
Trim drag left/right edge (8px hit live preview updates during drag at playhead; tooltip shows new in/out
zone, cursor ew-resize) and duration mono
Ripple ⌘-drag edge shifts later clips on the track
trim
Split Blade tool click, or ⌘B at clip.split
playhead on selected/all-
under-playhead
Slip Slip tool drag changes in without moving clip; viewer shows source frame
Delete Delete/Backspace ripple delete on V1, lift on other tracks; ⇧Delete always lift
Speed inspector or right-click →
"speed…"
Add text Text tool click on a text creates caption-clean text clip of 3s at playhead with content "your
track or ⌘T text" selected for editing
Context right-click clip "split at playhead", "duplicate", "delete", "speed…",
menu "detach audio", "replace media…", "ask kimo about this
clip" (prefills composer with @clip_name ), separator, "lock"
• All gestures produce ops; during a drag, ops are applied locally every frame but sent to the
server once on release (one batch). Keyboard equivalents exist for move (,/. nudge 1
frame, ⇧ nudge 10 frames) and trim ([/] trim start/end to playhead).
• Accessibility: clips are focusable (roving tabindex per track; arrow keys move focus between
clips; Enter selects; Space plays). Each clip has aria-label like "beach_02, video, starts
00:04, 3.2 seconds".
7.3 Conflict rules with the AI (very important)
• A clip the user is currently dragging or editing is soft-locked: incoming agent ops for that
clip are queued and applied after the user releases (then animated), unless they are
clip.remove (then show toast "kimo removed a clip you were editing · undo").
• After the user edits something, the client sends the ops; the server tells the agent. In the agent
panel a system line appears: "you changed the title text" (t-12 cream-38, Phase 8).
• The user can lock any clip (lock icon on hover in clip label row, or L with clip selected). Locked
clips show a 10px Lock icon cream-38 and the agent must not change them (the server
enforces; the client sends locked: true).
• Undo/redo is per author: ⌘Z undoes the user's last op group only (never the agent's). The
history popover (top bar History icon in agent panel) lets the user revert an agent action group
with "revert this step".
3

7.4 Editing text — every line, everywhere
The user must be able to change every word on screen.
1. In the viewer: double-click a text layer → it becomes a contenteditable overlay positioned
exactly over the canvas text (same font, size scaled to viewer, same colour, caret cream-100,
selection rgb(255 90 36 / .35)); the canvas hides that layer while editing to avoid double
text. Enter = newline for titles; for captions Enter commits. Esc cancels, click outside commits.
Each commit = one text.update op.
2. In the timeline: double-click a text clip → inline input inside the clip body.
3. In the inspector Text section: a Textarea with the full content, live-updating on each
keystroke (debounced 150ms op locally, sent on blur or after 800ms idle).
4. Captions editor: a dedicated inspector mode for caption tracks: a scrollable list of caption
segments, each row: start timecode mono t-11 cream-38, the text in an editable field t-13
cream-100, a 16px ghost Trash2. Clicking a row seeks the preview there. Editing a word keeps
word timings (re-split words by spaces; if word count changes, redistribute timings evenly
inside the segment). Buttons at the top: "find & replace" (popover with two inputs and
"replace all"), "style" (menu of the 3 caption styles), "position" (segmented "bottom",
"middle", "top").
5. A text the AI is about to change while the user is editing it: the AI change is queued (§7.3) and
a small inline hint appears under the field: t-11 --warning "kimo wants to change this too ·
see suggestion"; clicking shows the AI's suggested text with "use it" / "keep mine".
7.5 Inspector sections (exact controls)
All rows use Row + controls from Phase 1. Numeric fields: drag horizontally on the label to scrub
values (cursor ew-resize), type to set, ↑/↓ ±1 (⇧ ±10). Every changed value shows a 6px cream-60
dot left of the label with "reset" on hover. Values being written by the AI right now are shown in --
orange with a 1px underline and tween (--dur-2).
• Transform: position X, Y (px), scale (%), rotation (°), opacity (%), with a keyframe toggle
diamond (12px, hollow cream-38 / filled cream-100 when a key exists at playhead, orange
when the AI is setting one) next to each.
• Crop: L, T, R, B (%), aspect lock toggle, "reset crop".
• Speed: segmented 0.5× 1× 1.5× 2× + custom field; toggle "keep pitch".
• Text: content textarea; style select (8 styles from Phase 6 with tiny previews); size; alignment
segmented; colour swatches limited to: white, black, cream #F5F1E7, kimo orange #FF5A24,
yellow #FFD84D (content colours) + custom picker; animation select "none", "fade", "rise",
"type on", "pop words".
• Colour: exposure, contrast, saturation, temperature, tint sliders; three small wheels (lift,
gamma, gain) 72px each with numeric RGB below in mono t-11; LUT select ("none", "warm
film", "teal & orange", "bleach", "mono"); a before/after toggle that shows a split wipe in
the viewer.
• Effects: list of applied effects (drag to reorder, toggle eye, remove) + "add effect" menu:
blur, vignette, grain, sharpen, black & white, zoom punch-in.
• Mask (SAM 3.1): shows the mask thumbnail (subject cutout on checkerboard of ink-2/ink-3
8px squares), label (e.g. "person"), invert toggle, feather slider, "apply effect to"
segmented "subject" / "background", and a text field "re-segment: describe what to select"
+ secondary button "run sam" (sends a message to the agent: use sam 3.1 to select
"{text}" on {clip}).
4

• Audio: volume dB slider (−60 to +12), fade in/out (s), "duck under voice" toggle, a 120×24
live level meter (cream-60 bars, --warning above −6 dB, --error at 0 dB).
• Transitions: in/out type select + duration in frames.
• Source (for web images): image thumb, "found on {site}" t-12 cream-60 with link "open
page" (new tab, ArrowUpRight 12), licence text if known, button "replace image" (asks the
agent for another search) and "upload my own".
• Project (nothing selected): aspect (16:9 / 9:16 / 1:1 — changing asks for confirmation "change
the frame? kimo will reframe every clip."), duration readout, fps readout, background colour
(black/white/cream), "project notes for kimo" textarea (sent as context).
7.6 Assets drawer
A collapsible drawer (toggle FolderOpen button in timeline toolbar, opens as a 240px-tall area above
tracks): tabs "your files" and "found by kimo". Grid of 96×54 tiles (r6), name t-11 under each;
drag a tile onto the timeline to add a clip; "upload more" tile at the start (opens file picker → Phase 3
manager → asset.added). "Found by kimo" tiles show a 12px Globe badge and the source site on
hover.
Acceptance checklist (Phase 7)
•
Canvas-rendered tracks with filmstrips/waveforms; 60fps scroll and zoom on a 50-clip fixture.
•
Every interaction in §7.2 with snapping, keyboard equivalents and accessible names.
•
Conflict rules §7.3 (soft-lock, queued agent ops, per-author undo, revert step, clip lock).
•
Text editable in viewer, timeline, inspector and captions editor; ops sent; preview live.
•
Inspector sections §7.5 with AI-written values in orange tweening.
•
Assets drawer with drag-to-timeline and upload more.
•
E2E: while the mock agent edits, the user renames the title, trims a clip, locks it; agent
respects it; undo only reverts user ops.
5
```

## Phase 08 source specification

```text
Phase 8 — The Agent Panel: Live Actions,
Chat and Interrupts
READ THIS FIRST — rules for this phase (repeated in every
phase on purpose)
You are a senior frontend engineer building kimo web, the browser app for kimo, an AI video editor.
You are NOT the designer. Every visual decision has already been made and is written below or in
docs/DESIGN.md (created in Phase 0). Your job is to implement it exactly.
1. No improvising. If a value (color, size, radius, spacing, duration, easing, copy) is written here,
use exactly that value. If something is not specified, pick the closest existing token from docs/
DESIGN.md and write a line in docs/DECISIONS.md saying what you chose and why. Never invent
a new color, font, font size, radius, shadow or easing curve.
2. No extra libraries beyond the ones listed in Phase 0's stack table. If you think you need one,
write it in docs/DECISIONS.md as a proposal and continue without it.
3. Only tokens. Never hard-code a hex value, px font size or duration inside a component. Use
the CSS variables / Tailwind theme tokens defined in Phase 0 (--ink-0, --cream-100, --
orange, --dur-2, --ease-out, etc.).
4. Copy is exact. Every user-facing string written in quotes in these prompts is final. Use it
character for character, including lowercase "kimo". Never write "Kimo" with a capital K in UI
text.
5. One orange rule. Orange (--orange #FF5A24) means "the AI is doing this right now" or "the
one primary action". At most ONE orange element per panel at a time. Never use orange for
decoration.
6. No: gradients (except the two named exceptions in DESIGN.md), glassmorphism, drop
shadows (except the named --shadow-pop), emoji in UI, stock illustrations, lorem ipsum,
purple, neon, glow effects, rounded-full buttons except where named, bouncy overshoot
springs except where named.
7. Accessibility is not optional: every interactive element is keyboard reachable, has a visible
focus ring (--focus-ring), and has an accessible name. Respect prefers-reduced-motion
(every animation has a reduced variant listed in DESIGN.md §Motion).
8. TypeScript strict. No any. No // @ts-ignore. ESLint and Prettier must pass with zero
warnings.
9. Finish the phase completely before stopping. At the end, run pnpm lint && pnpm typecheck
&& pnpm test && pnpm build. All must pass. Then fill in the "Acceptance checklist" at the end of
this document in docs/PHASE_LOG.md, ticking each item honestly, with a screenshot path for
each visual item (docs/screens/phase-XX-*.png, captured with the Playwright script from Phase
0).
10. Do not touch the kimo engine repo or any backend code outside apps/web and packages/*
listed in Phase 0. The backend is reached only through the typed client in packages/kimo-
client.
11. Skills. The agent skills installed in Phase 0 (listed in docs/SKILLS.md) are for craft, quality and
review. Use the ones named under "Skills to load" in this phase. If a skill suggests a different
look (new fonts, colors, bolder layout), this spec wins, always. Skills never override a written
value.
1

12. If an instruction in this phase seems to conflict with an earlier phase, this phase wins for the
parts it names; everything else from earlier phases stays.
Goal: make the AI's work fully visible and steerable. Every tool call appears as it happens; the user
can talk to kimo at any moment, interrupt it, answer its questions, see what SAM 3.1 selected, see
images it found on the web, and revert any step.
Skills to load: emil kowalski skills, design motion principles, accessibility-compliance,
taste-skill.
8.1 Chat tab — message types and exact styling
The chat is a single vertical stream, newest at the bottom, auto-scrolling only if the user is within
80px of the bottom (otherwise show a floating "new activity ↓" pill, h28, ink-3, t-12, bottom-center
of the panel, which scrolls down on click).
1. User message: right-aligned bubble, max-width 85%, bg --ink-3, r12 (r4 on the bottom-right
corner), padding 10px 12px, t-13 cream-100. Attachments as AttachmentChips above the text.
Timestamp t-11 cream-38 below on hover ("23:41").
2. kimo message (agent.message say): left-aligned, no bubble, avatar 20 at left top, 10px gap,
text t-13 cream-100, line-height 20, max-width 100%. Supports bold and inline code, links
(cream-100 underlined 1px cream-38). Streams in word by word (40ms/word) when it arrives as
a stream; otherwise fades in.
3. Action group (consecutive tool calls between two messages are grouped): a card bg --ink-2,
r12, padding 10px 12px. Header row: 14px icon + summary t-13 cream-100 (e.g. "cut the
intro to the best 4 seconds"), right side duration mono t-11 cream-38 and a 16px chevron to
expand. Collapsed shows up to 3 latest step lines; expanded shows all. Each step line: 16px
status icon (spinner orange running, Check cream-60 done, X --error failed) + tool title t-12
cream-60 ("trim beach_02 to 0:02–0:06") + on hover a ghost xs "show" (seeks and selects
the target) and for done steps "revert" (only on the group header: "revert this step").
◦ The running group: 2px --orange left rule (inside the card's radius), --orange-12 wash
on the running line only, elapsed timer mono t-11 (0.8s) counting.
◦ Max one orange-ruled group at a time (one-orange rule).
4. System line (user edits, pauses, reconnects): centered t-12 cream-38 with 1px --line rules
on both sides, e.g. "you changed the title text", "you paused kimo", "reconnected".
5. Review request (ask_review): a card bg --ink-2, r12, padding 16, border 1px var(--line-
strong). Avatar + t-13 cream-100 message (e.g. "first cut’s ready, 42 seconds. play it
through and tell me what to change."). Buttons row (gap 8): secondary sm
"play from start" (seeks 0 and plays), secondary sm "ask for changes" (focuses composer),
primary sm "looks good, render it" (Phase 9 flow). This is the one orange button allowed in
the agent panel.
6. Choice request (ask_choice): message + up to 4 choice buttons (secondary sm, full width
stacked, gap 6); clicking sends the choice text as a user message. Also a hint t-11 cream-38
"or type your own answer".
7. Web images found (from asset.added with source web, grouped per action): a horizontal
strip of 72×72 r8 tiles with a 12px Globe badge, under it t-11 cream-38 "from unsplash.com,
pexels.com"; click a tile → popover with bigger preview (240px), source link, licence, and "use
this" / "not this one" (sends feedback to the agent).
2

8. SAM result card: 96×54 thumbnail of the mask on checkerboard + t-12 "selected the person
in beach_02 with sam 3.1" + ghost xs "view mask" (selects clip and opens Mask section).
9. Error: --error 2px left rule card with t-13 message and secondary xs "retry step".
8.2 Actions tab (the audit log)
A dense table-like list, one row per tool call (h28): time mono t-11 cream-38 (23:41:07), status icon,
tool name mono t-12 cream-100 exactly as kimo's snake_case tool name (color_grade, sam_segment,
trim_clip, web_image_search), target t-12 cream-60, duration right-aligned mono t-11 cream-38.
Click a row → expands to show args as pretty JSON (mono t-11, bg --ink-2, r8, max-height 240
scroll) and result summary. Filter bar on top: search input sm + segmented "all", "edits", "ai
models" (sam/muse calls), "failed". Running row has the orange left rule.
8.3 Composer and interrupts
• Composer from Phase 5 §5.4. Supports attachments (Phase 3 manager → asset.added), @
mentions of clips (popover list of clip names with thumbnails; inserting a mention creates a
token chip inside the textarea, ink-4 r4, t-12) and / commands: /pause, /resume, /undo-
last, /render.
• Sending while the agent is acting = interrupt: 1. Message appears immediately as a user
bubble with a small t-11 cream-38 label under it "kimo will read this after the current
step". 2. Client sends {t:"interrupt", text}. 3. When the server acknowledges with
agent.status thinking label:"reading your note", the label changes to "read" with a
cream-60 check, and the running action group header shows "stopped here, adjusting". 4.
New actions follow as a new group whose header starts with "↪ " (the return arrow glyph) to
show it's a response to the note.
• Hard stop: a ghost xs button "stop now" appears to the right of the agent status in the panel
header while acting; it sends pause immediately (agent finishes nothing more), shows system
line "you stopped kimo", and the composer placeholder becomes "tell kimo what to do
next…".
• ⌘K focuses the composer from anywhere; Esc returns focus to the timeline.
8.4 Agent presence in the rest of the UI
• Agent status pill in the top bar (Phase 5) mirrors agent.status.
• Avatar ring rotates while acting.
• Viewer: region brackets and SAM polygons (Phase 6).
• Timeline: orange border on touched clips (Phase 7).
• Inspector: orange values (Phase 7).
• These 5 places must always agree: one running action → all show the same target
simultaneously. Write an integration test that asserts this from a single agent.action.start
event.
8.5 "What is kimo doing" labels
Map common kimo tool names to friendly present-tense titles in src/lib/agentLabels.ts (fallback:
tool name with underscores to spaces). At least: import_media "adding {name}", trim_clip
"trimming {clip}", split_clip "splitting {clip}", move_clip "moving {clip}", add_text "writing a
3

title", add_captions "writing captions", color_grade "grading colour on {clip}", sam_segment "finding
the {label} with sam 3.1", reframe "reframing for {aspect}", web_image_search "searching the web
for “{query}”", add_music "adding music", duck_audio "balancing music under voice",
add_transition "adding a {type}", muse_watch "watching {clip}", transcribe "transcribing speech",
remove_silence "removing pauses", apply_effect "adding {effect}". Titles are lowercase.
8.6 Notifications when the tab is hidden
If the document is hidden and the agent sends ask_review or ask_choice, update the tab title to
"(1) kimo needs you" and, if permitted, show a browser Notification "kimo · your first cut is
ready". Ask for notification permission only after the user's first send, via a small inline card in chat:
"want a ping when kimo needs you?" with "yes" / "no thanks".
Acceptance checklist (Phase 8)
•
All 9 message types render exactly as specified from mock events.
•
Actions tab with filters and JSON expand.
•
Interrupt flow end-to-end with the mock (≤ 400ms ack shown), hard stop, mentions, slash
commands.
•
5-places-agree integration test.
•
Revert step works and appears as a system line.
•
Hidden-tab title + notification.
•
Screen reader: new agent messages announced via a polite live region; action groups
announced as "kimo is trimming beach_02" (throttled to one announcement per 3s).
4
```

## Phase 09 source specification

```text
Phase 9 — Review, Final 1080p Render and
the Delivery Page
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
Goal: close the loop beautifully. The AI asks the user to watch the cut; the user approves or asks for
changes; on approval a render screen with a crafted animation shows real server progress; then a
delivery page presents the finished video with download and share.
Skills to load:emil kowalski skills, design motion principles, react-view-transitions,
frontend-design, kill ai slop.
9.1 Review moment (inside the Studio)
Triggered by agent.message kind:"ask_review" or by the user pressing finish in the top bar.
If triggered by the agent: the review card appears in chat (Phase 8 §8.1.5), the top bar finish
button pulses (3×), the agent status becomes "waiting for you", and the viewer shows a
centered overlay for 3 seconds then fades (unless the user hovers): a 56px circle secondary
play button with label t-13 under it "watch the first cut". Clicking plays from 0.
If the user presses finish while the agent is still acting: dialog "render now?" / "kimo is still
working on: {current group summary}. you can render now or let it finish." / primary
"render now" / secondary "let kimo finish". Render now sends pause then approve.
Review dialog (when the user clicks "looks good, render it" or finish when idle): Dialog md,
title "ready to render?", body: a 16:9 r8 poster of the current frame at 0:01 (from compositor),
under it a 3-row summary (Rows): "length"0:42, "format"1080p · 16:9 · 30 fps · mp4,
"audio"stereo · 48 kHz. A small T oggle row "burn in captions" (default on if captions
exist). Actions: secondary "keep editing", primary "render 1080p".
"ask for changes" focuses the composer with placeholder "what should kimo change?".
9.2 Render screen /render/[sessionId]
On confirm: POST /v1/sessions/:id/approve → renderId; transition (View Transition) from the Studio:
all panels fade out except the viewer frame, which scales to the center of the screen (640px wide,
keeps aspect) and becomes the render scene's frame.
Layout (bg --ink-0, grain overlay on, horizon glow centered at 60% opacity):
The frame (640 wide, r12, 1px inset highlight): shows the most recently rendered frame. Poll
GET /v1/renders/:id every 800ms; when frame advances, fetch the preview frame image (/
v1/renders/:id/frame.jpg?n= — add to the contract and mock) and crossfade it in (180ms).
Until the first frame arrives, show the poster from the review dialog at 40% opacity.
The scanline (the signature animation): a horizontal 1px line in --orange with a 24px-tall soft
trail above it (linear-gradient(to top, rgb(255 90 36 / .18), transparent) — this is the
second allowed gradient, the "render sheen") moves from the top of the frame to the bottom
once per rendered chunk (every 1s of video), and the area above it shows the freshly rendered
frame at full brightness while below it is dimmed to 55%. This reads as "the frame is being
printed". Reduced motion: no scanline, frame just updates.
Under the frame (24px): progress bar h4 r-pill, fill --orange (it's a running render → allowed),
width = progress. Right of it nothing; under it (10px) a row: left mono t-12 cream-100 "frame
812 of 1260", right mono t-12 cream-38 "about 0:14 left".
12.
•
•
•
•
1.
2.
3.
2

32px below: a single line t-15 cream-100 that changes with stage: "composing frames" (0–
85%), "mixing audio" (85–95%), "encoding 1080p" (95–99%), "finishing up" (99–100%).
Each change crossfades 220ms.
12px below: a filmstrip of the last 8 rendered frames as 64×36 r4 tiles sliding in from the right
(spring.snappy), older ones fading to 40% — "the reel being printed".
Bottom center: t-12 cream-38 "you can close this tab, we’ll keep rendering. come back to
this link anytime." and a ghost xs "copy link" button.
T op-left kimo mark; top-right ghost xs "back to editing" → confirm "cancel the render?" /
"you’ll return to the studio with everything as it was." / danger "cancel render" /
secondary "keep rendering".
9.3 Completion animation (the hand-off, 1400ms total)
When status becomes done:
Progress bar fills to 100% and turns --success (--dur-3).
The scanline does one final full sweep in 400ms.
The four kimo bars (same as warm-up) rise from below the frame in a staggered spring
(stagger 60ms, spring.snappy), hold 300ms, then collapse into a single 20px Check drawn
with stroke-dashoffset in --success.
The frame lifts (scale 1 → 1.03, then settles) and the View Transition morphs it into the delivery
page's player position. Route to /v/{videoId}.
Reduced motion: progress turns green, 220ms crossfade to delivery page.
Render failure: frame dims, progress turns --error, line "the render hit a problem" + mono t-12
cream-38 server message + buttons primary "try again" (re-approve) and secondary "back to
editing".
9.4 Delivery page /v/[videoId]
Shareable, works for anyone with the link (read-only), indexable = no (noindex).
Layout (max-width 1040, centered, padding 64px 24px; bg --ink-0, grain on, horizon glow at 50%
under the player):
T op nav: kimo mark + wordmark left; right secondary sm "make another" → /.
40px: Headline: t-11 cream-38 uppercase "your video is ready", 8px, title in
--font-display italic 56px (clamp(40px, 5vw, 56px)) cream-100 = project title (e.g. manali
trip reel).
32px: Player: full container width (or 420px wide for 9:16 videos, centered), r12, 1px inset
highlight, custom controls (not native): big center play button 64px secondary circle on poster;
control bar on hover (h44, gradient-free, bg rgb(8 8 9 / .7)): play, scrub bar (4px track ink-4,
played cream-100, buffered cream-38, 12px thumb on hover, hover time tooltip with frame
thumbnail from sprite if available), time mono t-12, volume, playback speed, fullscreen. Space/
K play, J/L ±10s, F fullscreen, M mute.
24px: Action row (centered on mobile, left-aligned desktop): primary lg "download mp4" with
Download 16 (uses a[download] to the signed URL, filename {slug}-kimo-1080p.mp4);
secondary lg "copy link" with Link 16 (toast "link copied"); secondary lg "share" with
Share 16 (Web Share API, fallback popover with X, WhatsApp, LinkedIn links + copy); ghost lg
4.
5.
6.
7.
1.
2.
3.
4.
1.
2.
3.
4.
3

"edit again" with Pencil 16 → reopens the studio for that session if not expired (else disabled
with tooltip "this edit has expired").
24px: Meta row t-12 cream-38, separated by ·: "1920 × 1080", "0:42", "48 MB", "made with
kimo in 4 min".
48px: "how kimo made it" collapsible Section (closed by default): a compact list of the action
group summaries (from session history) with step counts, e.g. "cut the intro to the best 4
seconds · 6 steps", and a line "models used: muse spark 1.3, sam 3.1, muse voice
transcribe" — good for the hackathon judges.
48px: footer (same as landing).
Entrance (when not coming via View Transition): headline lines rise 10px stagger 70ms, player fades
+ scales .98→1 spring.soft, actions stagger 50ms.
Delight detail: the first time the page opens after a render (flag in sessionStorage), the download
button shows a 1-cycle subtle sheen sweep (a 30% white-6% band crossing in 900ms) after 1.2s.
Only once. No confetti.
OG tags: og:video with the MP4 URL, og:image poster, title = project title, description "made with
kimo, the ai video editor".
Acceptance checklist (Phase 9)
Review triggers (agent and finish button), render-now dialog, review dialog with poster and
summary.
Render screen: real progress from mock, frame crossfades, scanline per chunk, stage lines,
filmstrip, close-tab safety, cancel.
Completion animation and View Transition to delivery; reduced-motion variants.
Delivery page player with custom controls and shortcuts; download filename; copy/share; edit
again; meta; how-kimo-made-it.
9:16 layout for vertical videos verified.
Failure path for render with retry.
Screen recordings of the full approve → render → delivery flow saved in docs/screens/.
5.
6.
7.
•
•
•
•
•
•
•
4
```
