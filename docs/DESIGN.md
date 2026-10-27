# kimo web design bible

Source sections below are preserved verbatim from the supplied Phase 0 PDF text extraction (including table wrapping and page numerals). Use these exact values.

## One orange rule

Orange (--orange #FF5A24) means "the AI is doing this right now" or "the one primary action". At most ONE orange element per panel at a time. Never use orange for decoration.

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
