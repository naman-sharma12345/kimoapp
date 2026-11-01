// Graphics planning on the EDL: deterministic defaults per template (hook
// title on shorts, lower third on intros, number pops on numeric emphasis,
// chapter cards, callouts and the Screen Studio card on screen recordings,
// progress bar, emoji pops, end card), the planner's graphic tools on top, then
// the restraint rules enforced in code: at most one graphic on screen
// (captions, the progress bar and the screen card excluded), ≥ 0.4 s between
// one graphic's exit and the next entry, density per template (shorts ≤ 10/min,
// YouTube ≤ 4/min, documentary ≤ 2/min). Writes `graphic` overlays (rendered by
// the compositor through graphics/renderer.mjs) and edl.graphics. Node only.
import { arollTrack, coverGeometry, clipCameraAt, cameraRect } from '../camera.mjs';
import { outputWords, normalizeWords, subjectBoxAt, captionStyle } from '../captions.mjs';
import { rate as rateOf } from '../edl.mjs';
import { ELEMENT_KINDS } from './elements/index.mjs';
import { parseStat } from './elements/stat-pop.mjs';
import { STICKERS } from './elements/sticker.mjs';
import { cardRect } from './elements/screen-zoom.mjs';
import { themeFor, layoutGraphic } from './renderer.mjs';
import { safeArea, isVertical, isWide } from './kit.mjs';

export const GRAPHICS_PLAN_VERSION = 1;
export const GAP = 0.4; // s between one graphic's exit and the next entry
/** Kinds that never count as "a graphic on screen" (edge bar, camera treatment). */
export const PASSIVE = new Set(['progress', 'screen_zoom']);
const PRIORITY = { hook_title: 100, planner: 90, cta: 80, lower_third: 70, chapter: 65, text_behind: 62, callout: 60, stat: 50, sticker: 30 };

const r3 = (n) => +Number(n).toFixed(3);
const npath = (p) => String(p ?? '').replaceAll('\\', '/');
const clipLen = (c) => (c.out - c.in) / (c.speed ?? 1);

/** Density limit (graphics per minute) for a template on a canvas. */
export function densityLimit(template, canvas) {
  if (template === 'documentary' || template === 'cinematic') return 2;
  return isVertical(canvas) ? 10 : 4;
}
/** Allowed count in a window of `span` seconds (proportional under a minute, at least 1). */
export const allowedIn = (limit, span) => Math.max(1, Math.ceil((limit * Math.min(60, span)) / 60 - 1e-9));

/** Template defaults: which automatic graphics a template turns on. */
export function templateDefaults(template, canvas, note = '') {
  const vertical = isVertical(canvas);
  const wide = isWide(canvas);
  const n = String(note ?? '').toLowerCase();
  const t = template ?? 'auto';
  return {
    hook: vertical || /\b(hook|title)\b/.test(n) || t === 'energetic',
    lowerThird: !/no lower.?third/.test(n),
    stats: !/no (number|stat)/.test(n),
    chapters: wide && !/no chapter/.test(n),
    chapterVariant: t === 'documentary' ? 'full' : 'over',
    callouts: !/no callout/.test(n),
    screenCard: !/no (screen )?card|no screen studio/.test(n),
    progress: (vertical && (t === 'energetic' || t === 'tutorial')) || /progress bar/.test(n),
    stickers: (t === 'energetic' && !/no emoji/.test(n)) || /\bemoji|sticker/.test(n),
    cta: wide && (/subscribe|end ?card|cta/.test(n) || ['auto', 'energetic', 'tutorial', 'podcast'].includes(t)),
  };
}

// ---------------------------------------------------------------- inputs
const STOP_TAIL = new Set(['the', 'a', 'an', 'to', 'of', 'and', 'or', 'but', 'so', 'is', 'are', 'was', 'in', 'on', 'for', 'with', 'my', 'your', 'this', 'that', 'it', 'i', 'we', 'you']);
const GREETING = /^(hey|hi|hello|what'?s up|namaste|welcome|so|okay|ok|alright)\b/i;
/** Hook text: the judgment's hook text, else the first spoken sentence when it is short enough. */
export function deriveHookText(words, judgment) {
  if (judgment?.hook_text) return String(judgment.hook_text).split(/\s+/).slice(0, 6).join(' ');
  const first = [];
  for (const w of words) {
    first.push(w);
    if (/[.?!]$/.test(w.w) || first.length >= 12) break;
  }
  if (!first.length) return null;
  let ws = first.map((w) => w.w.replace(/[.,;:]+$/, ''));
  if (GREETING.test(ws.join(' '))) return null;
  if (ws.length > 6) {
    const comma = first.findIndex((w, i) => i >= 2 && i <= 5 && /[,;:]$/.test(w.w));
    ws = comma > 0 ? ws.slice(0, comma + 1) : ws.slice(0, 6);
  }
  while (ws.length > 2 && STOP_TAIL.has(ws.at(-1).toLowerCase().replace(/[^a-z]/g, ''))) ws.pop();
  return ws.length >= 2 ? ws.join(' ') : null;
}

const INTRO = /^(i'?m|i am|my name is|my name's|this is|mera naam|main|naam)$/i;
/** People introduced in the transcript ("I'm Naman", "my name is …") with roles from the note ("Naman, founder of kimo"). */
export function findIntroductions(words, note = '') {
  const roles = new Map();
  for (const m of String(note ?? '').matchAll(/\b(\p{Lu}[\p{L}'-]+(?:\s\p{Lu}[\p{L}'-]+)?)\s*(?:,|\(|–|—|-|:)\s*(?:the\s|a\s|an\s)?([\p{L}][\p{L}\s&.'-]{2,40}?)(?:\)|\.|;|\n|$|,)/gu)) roles.set(m[1].split(/\s/)[0].toLowerCase(), m[2].trim());
  const out = [];
  const seen = new Set();
  const lw = words.map((w) => w.w.toLowerCase().replace(/[^\p{L}']/gu, ''));
  for (let i = 0; i < words.length; i++) {
    let j = -1;
    if (/^i'?m$/.test(lw[i]) || lw[i] === 'main') j = i + 1;
    else if (lw[i] === 'i' && lw[i + 1] === 'am') j = i + 2;
    else if (lw[i] === 'name' && (lw[i + 1] === 'is' || lw[i + 1] === "name's")) j = i + 2;
    else if (lw[i] === "name's") j = i + 1;
    else if (lw[i] === 'this' && lw[i + 1] === 'is' && i + 2 < words.length && /^\p{Lu}/u.test(words[i + 2].w)) j = i + 2;
    else if (lw[i] === 'naam' && i + 1 < words.length) j = i + 1;
    if (j < 0 || j >= words.length) continue;
    const name = words[j].w.replace(/[^\p{L}'-]/gu, '');
    if (!/^\p{Lu}/u.test(name) || name.length < 2 || STOP_TAIL.has(name.toLowerCase())) continue;
    let full = name;
    const next = words[j + 1]?.w.replace(/[^\p{L}'-]/gu, '') ?? '';
    if (/^\p{Lu}\p{Ll}/u.test(next) && !/[.,]$/.test(words[j].w)) full += ` ${next}`;
    const key = name.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push({ name: full, role: roles.get(key) ?? '', at: words[j].start });
    void INTRO;
  }
  return out;
}

/** Number words → stat values ("fifty percent" → 50%, "3 million" → 3M) with a short label. */
export function findStats(words, { emphasisOnly = false } = {}) {
  const style = captionStyle('kimo');
  const norm = normalizeWords(words, { ...style, numbers: 'digits', case: 'as-is', punctuation: 'strip' });
  const out = [];
  for (let i = 0; i < norm.length; i++) {
    const w = norm[i];
    if (!w.number) continue;
    let text = w.w.replace(/[?!]+$/, '');
    let next = norm[i + 1]?.w.toLowerCase().replace(/[^\p{L}%]/gu, '') ?? '';
    const scale = { thousand: 'K', million: 'M', billion: 'B', lakh: ' LAKH', lakhs: ' LAKH', crore: ' CRORE', crores: ' CRORE' }[next];
    let skip = 0;
    if (scale) {
      text = text.replace(/,000$/, '') + scale.trim();
      skip = 1;
      next = norm[i + 2]?.w.toLowerCase().replace(/[^\p{L}]/gu, '') ?? '';
    }
    if (/^\d+x$/i.test(text.replace(/\s/g, ''))) text = text.replace(/\s/g, '');
    if (next === 'x' || next === 'times') {
      text += 'x';
      skip++;
      next = norm[i + 1 + skip]?.w.toLowerCase().replace(/[^\p{L}]/gu, '') ?? '';
    }
    if (/^(dollars?|bucks)$/.test(next)) {
      text = `$${text}`;
      next = norm[i + 2 + skip]?.w.toLowerCase().replace(/[^\p{L}]/gu, '') ?? '';
    }
    const stat = parseStat(text);
    if (!stat) continue;
    const big = /%|x$|[KMB]$|\$|₹/.test(text) || stat.value >= 100;
    if (emphasisOnly ? !w.emphasis : !(w.emphasis || big)) continue;
    // label: the counted noun after the number ("views", "subscribers")
    const label = next && !STOP_TAIL.has(next) && next.length > 2 && !/^\d/.test(next) ? next : '';
    out.push({ value: text, label, at: w.start, end: w.end, emphasis: Boolean(w.emphasis) });
  }
  return out;
}

const STICKER_WORDS = [
  [/^(money|cash|rich|dollars?|paisa|paise|income|revenue|profit)$/, 'money'],
  [/^(fire|insane|crazy|hot|lit|wild)$/, 'fire'],
  [/^(rocket|launch|launched|skyrocket|growth|grow|scale)$/, 'rocket'],
  [/^(idea|tip|trick|hack|secret)$/, 'bulb'],
  [/^(mind|blown|wow|unbelievable|shocking)$/, 'mind-blown'],
  [/^(love|loved|favourite|favorite)$/, 'heart'],
  [/^(funny|laugh|lol|hilarious)$/, 'laugh'],
  [/^(look|watch|see|notice)$/, 'eyes'],
  [/^(win|won|winner|champion)$/, 'trophy'],
  [/^(warning|careful|mistake|mistakes|danger)$/, 'warning'],
  [/^(brain|smart|genius|learn)$/, 'brain'],
  [/^(fast|faster|quick|instantly|speed)$/, 'lightning'],
  [/^(done|correct|works|easy)$/, 'check'],
  [/^(wrong|never|stop|fail|failed)$/, 'x'],
  [/^(best|top|perfect)$/, 'star'],
  [/^(celebrate|party|finally)$/, 'party'],
  [/^(views|followers|subscribers|sales|increase)$/, 'chart-up'],
  [/^(think|thinking|wonder|question)$/, 'thinking'],
];
export function findStickers(words, { emphasisOnly = false } = {}) {
  const out = [];
  for (const w of words) {
    if (emphasisOnly && !w.emphasis) continue;
    const k = w.w.toLowerCase().replace(/[^\p{L}]/gu, '');
    const hit = STICKER_WORDS.find(([re]) => re.test(k));
    if (hit) out.push({ emoji: hit[1], at: w.start, word: w.w, emphasis: Boolean(w.emphasis) });
  }
  return out;
}

/** A source-normalised box on a clip at local time → canvas px through the camera crop (and the screen card inset). */
export function sourceBoxToCanvas(edl, clip, box, local) {
  const source = edl.sources.find((s) => s.id === clip.src);
  if (!source) return null;
  const geom = coverGeometry(source, edl.canvas, clip.fit);
  const rect = cameraRect(clipCameraAt(clip, geom)(local), geom, edl.canvas);
  const sx = edl.canvas.w / rect[2];
  const sy = edl.canvas.h / rect[3];
  let x0 = (box.x * geom.W - rect[0]) * sx;
  let y0 = (box.y * geom.H - rect[1]) * sy;
  let x1 = ((box.x + box.w) * geom.W - rect[0]) * sx;
  let y1 = ((box.y + box.h) * geom.H - rect[1]) * sy;
  const k = clip.screen_card?.scale;
  if (k) {
    const cx = edl.canvas.w / 2;
    const cy = edl.canvas.h / 2;
    [x0, x1] = [cx + (x0 - cx) * k, cx + (x1 - cx) * k];
    [y0, y1] = [cy + (y0 - cy) * k, cy + (y1 - cy) * k];
  }
  x0 = Math.max(0, x0);
  y0 = Math.max(0, y0);
  x1 = Math.min(edl.canvas.w, x1);
  y1 = Math.min(edl.canvas.h, y1);
  return x1 - x0 > 4 && y1 - y0 > 4 ? { x: x0, y: y0, w: x1 - x0, h: y1 - y0 } : null;
}

// ---------------------------------------------------------------- planner tools
export const GRAPHIC_TOOLS = ['graphic', 'hook_title', 'callout', 'screen_zoom', 'broll_auto', 'broll'];
export const GRAPHIC_TOOL_TEXT = `graphic(kind*:string, at:number, dur:number, props:object, remove:boolean) — the app's motion-graphics kit (rendered by the app, template typography, restraint rules enforced: max 1 graphic on screen, ≥ 0.4 s apart, density shorts ≤ 10/min, youtube ≤ 4/min, documentary ≤ 2/min). kinds: hook_title {text, key}, lower_third {name, role}, stat {value e.g. "50%" "$3M" "10x", label}, callout {kind circle|arrow|box, box [x,y,w,h] 0-1 canvas, label}, chapter {title, variant over|full}, sticker {emoji: ${STICKERS.join('|')}}, progress {position top|bottom}, cta {text, line} (16:9 only, last 5 s), text_behind {text} (SAM matte). The app already adds the defaults (hook title on shorts, lower thirds on introductions, number pops on numeric emphasis, chapter cards, callouts on screen recordings); remove:true with a kind (and optional at) removes them. never use add_title/add_text for titles or lower thirds.
hook_title(text*:string) — set the on-screen hook text (2-6 words, shows in the first second).
callout(at*:number, kind:string(circle|arrow|box), box:[x,y,w,h] 0-1 canvas, target_prompt:string, label:string, dur:number) — point at the thing on screen (e.g. "the export button"); target_prompt finds it with SAM on that frame.
screen_zoom(range*:[from,to] seconds, target:[x,y,w,h] 0-1 of the screen recording) — Screen Studio zoom (1.6-2.5x, eased) onto that region; screen recordings already sit on a rounded card with a soft shadow.
broll_auto(density:number 0-1) — the app places b-roll from the user's non-speech clips over jump cuts and abstract lines (J/L-cut, own slow push, ducked sound); 0 turns it off, 0.5 default.
broll(at*:number, dur*:number, clip*:string file path or asset id, in:number) — put a specific b-roll clip over the talking track at that time (1.2-3.5 s).`;

/** Records a planner graphics tool call; returns {ok, text}. */
export function graphicToolCall(state, name, args = {}) {
  state.calls ??= [];
  const num = (v) => (Number.isFinite(Number(v)) ? Number(v) : undefined);
  if (name === 'graphic') {
    const kind = String(args.kind ?? '').toLowerCase().replace(/[\s-]+/g, '_').replace(/^(number|stat_pop|number_pop)$/, 'stat').replace(/^(chapter_card|section)$/, 'chapter').replace(/^(emoji|sticker_pop)$/, 'sticker').replace(/^(subscribe|end_card|cta_card)$/, 'cta').replace(/^(progress_bar)$/, 'progress').replace(/^(title|hook)$/, 'hook_title');
    if (!ELEMENT_KINDS.includes(kind)) return { ok: false, text: `unknown graphic kind ${args.kind}; one of ${ELEMENT_KINDS.join(', ')}` };
    state.calls.push({ tool: 'graphic', kind, at: num(args.at), dur: num(args.dur ?? args.duration), props: args.props && typeof args.props === 'object' ? args.props : {}, remove: Boolean(args.remove) });
    return { ok: true, text: JSON.stringify({ ok: true, kind, note: args.remove ? 'removed (defaults of that kind near that time)' : 'added; restraint rules decide the final timing, see graphics report on export' }) };
  }
  if (name === 'hook_title') {
    const text = String(args.text ?? '').split(/\s+/).filter(Boolean).slice(0, 6).join(' ');
    if (!text) return { ok: false, text: 'hook_title needs text (2-6 words)' };
    state.hookText = text;
    return { ok: true, text: JSON.stringify({ ok: true, hook: text }) };
  }
  if (name === 'callout') {
    const at = num(args.at);
    if (at == null) return { ok: false, text: 'callout needs at (seconds)' };
    state.calls.push({ tool: 'callout', kind: 'callout', at, dur: num(args.dur), props: { kind: args.kind ?? 'circle', label: args.label, box: Array.isArray(args.box) ? args.box.map(Number) : undefined, target_prompt: args.target_prompt ? String(args.target_prompt).slice(0, 80) : undefined } });
    return { ok: true, text: JSON.stringify({ ok: true, note: args.box ? 'callout at that box' : args.target_prompt ? 'the target is found on that frame (SAM) before rendering' : 'no target given: the active screen region at that time is used' }) };
  }
  if (name === 'screen_zoom') {
    const range = Array.isArray(args.range) ? args.range.map(Number) : [num(args.from ?? args.at), num(args.to)];
    if (!(range[1] > range[0])) return { ok: false, text: 'screen_zoom needs range [from, to] seconds' };
    state.calls.push({ tool: 'screen_zoom', kind: 'screen_zoom', at: range[0], dur: range[1] - range[0], props: { target: Array.isArray(args.target) ? args.target.map(Number) : undefined } });
    return { ok: true, text: JSON.stringify({ ok: true, note: 'eased 1.6-2.5x zoom onto the target inside the screen card' }) };
  }
  if (name === 'broll_auto') {
    const d = num(args.density);
    state.brollDensity = d == null ? 0.5 : Math.max(0, Math.min(1, d));
    return { ok: true, text: JSON.stringify({ ok: true, density: state.brollDensity }) };
  }
  if (name === 'broll') {
    const at = num(args.at);
    const dur = num(args.dur ?? args.duration);
    if (at == null || !(dur > 0) || !args.clip) return { ok: false, text: 'broll needs at, dur and clip' };
    (state.broll ??= []).push({ at, dur: Math.max(1.2, Math.min(3.5, dur)), clip: String(args.clip), in: num(args.in) ?? 0 });
    return { ok: true, text: JSON.stringify({ ok: true, note: 'placed on the next snapshot (J/L-cut, own slow push, sound ducked)' }) };
  }
  return { ok: false, text: `unknown graphics tool ${name}` };
}

// ---------------------------------------------------------------- restraint
/**
 * Accepts candidates greedily by priority under the restraint rules. occupied:
 * fixed intervals (native planner overlays) that count as graphics on screen.
 * Returns {accepted, dropped}.
 */
export function enforceRestraint(cands, { limit, total, occupied = [], gap = GAP, fps = 30 } = {}) {
  const accepted = [];
  const dropped = [];
  const frame = 1 / fps;
  const active = (x) => !PASSIVE.has(x.kind);
  const clash = (a0, a1, b) => a0 < b.end + gap - 1e-6 && b.at < a1 + gap - 1e-6;
  const dense = (c) => {
    const list = [...accepted.filter(active), ...occupied, c].sort((a, b) => a.at - b.at);
    const span = Math.min(60, Math.max(total, 1));
    for (const x of list) {
      const n = list.filter((y) => y.at >= x.at - 1e-6 && y.at < x.at + span - 1e-6).length;
      if (n > allowedIn(limit, span)) return true;
    }
    return false;
  };
  const order = [...cands].sort((a, b) => (PRIORITY[b.source === 'planner' ? 'planner' : b.kind] ?? 0) - (PRIORITY[a.source === 'planner' ? 'planner' : a.kind] ?? 0) || a.at - b.at);
  for (const c0 of order) {
    if (!active(c0)) {
      accepted.push(c0);
      continue;
    }
    let placed = null;
    const maxShift = c0.kind === 'hook_title' || c0.kind === 'cta' ? 0 : c0.kind === 'stat' || c0.kind === 'sticker' ? 0.3 : 0.6;
    for (let shift = 0; shift <= maxShift + 1e-9; shift += 0.1) {
      const at = Math.round((c0.at + shift) / frame) * frame;
      const end = Math.min(total, at + c0.dur);
      if (end - at < Math.max(0.5, c0.dur * 0.6)) break;
      const c = { ...c0, at, end, dur: end - at };
      const blockers = [...accepted.filter(active), ...occupied];
      if (blockers.some((b) => clash(c.at, c.end, b))) continue;
      placed = c;
      break;
    }
    if (!placed) {
      dropped.push({ kind: c0.kind, at: r3(c0.at), why: 'another graphic on screen (max 1, 0.4 s apart)' });
      continue;
    }
    if (dense(placed)) {
      dropped.push({ kind: c0.kind, at: r3(c0.at), why: `density limit ${limit}/min` });
      continue;
    }
    accepted.push(placed);
  }
  accepted.sort((a, b) => a.at - b.at);
  return { accepted, dropped };
}

/** Overlap and density audit of a finished overlay list (the code-enforced restraint, checked independently). */
export function graphicsAudit(overlays, { limit, total }) {
  const g = overlays.filter((o) => o.kind === 'graphic' && !PASSIVE.has(o.props?.element)).sort((a, b) => a.at - b.at);
  let overlaps = 0;
  let minGap = Infinity;
  for (let i = 1; i < g.length; i++) {
    const gp = g[i].at - (g[i - 1].at + g[i - 1].dur);
    if (gp < -1e-6) overlaps++;
    minGap = Math.min(minGap, gp);
  }
  const span = Math.min(60, Math.max(total, 1));
  let peak = 0;
  for (const x of g) peak = Math.max(peak, g.filter((y) => y.at >= x.at - 1e-6 && y.at < x.at + span - 1e-6).length);
  return { count: g.length, overlaps, min_gap_s: Number.isFinite(minGap) ? r3(minGap) : null, peak_per_window: peak, window_s: r3(span), allowed: allowedIn(limit, span), per_min: total > 0 ? r3((g.length * 60) / total) : 0 };
}

// ---------------------------------------------------------------- planning
/**
 * Plans graphics on an EDL (after the camera director, before captions).
 * config: {enabled, template, note, hookStyle, accent, state: planner tool state,
 *   targets: {callIndex: box px} resolved planner prompts, samLayers}
 * Mutates and returns edl; edl.graphics holds the report.
 */
export function applyGraphics(edl, config = {}, ctx = {}) {
  edl.overlays = edl.overlays.filter((o) => o.kind !== 'graphic' && !o.props?.graphics_plan);
  for (const t of edl.video) for (const c of t.clips) delete c.screen_card;
  if (config.enabled === false) {
    delete edl.graphics;
    return edl;
  }
  const canvas = edl.canvas;
  const fps = rateOf(canvas.fps);
  const frame = 1 / fps;
  const template = config.template ?? 'auto';
  const theme = themeFor(template, { accent: config.accent });
  const defs = {...templateDefaults(template, canvas, config.note),...(config.defaults?{hook:config.defaults.hook_title,lowerThird:config.defaults.lower_thirds,chapters:config.defaults.chapters}: {})};
  const state = config.state ?? {};
  const calls = state.calls ?? [];
  const total = edl.video.flatMap((t) => t.clips).reduce((m, c) => Math.max(m, c.at + clipLen(c)), 0);
  const words = outputWords(edl, ctx);
  const track = arollTrack(edl);
  const aClips = [...(track?.clips ?? [])].sort((a, b) => a.at - b.at);
  const brolls = edl.video.filter((t) => t !== track).flatMap((t) => t.clips).filter((c) => edl.sources.find((s) => s.id === c.src)?.kind === 'video');
  const underBroll = (a, b) => brolls.some((c) => c.at < b && c.at + clipLen(c) > a);
  const cands = [];
  const removed = (kind, at) => calls.some((c) => c.tool === 'graphic' && c.remove && c.kind === kind && (c.at == null || Math.abs(c.at - at) < 1.5));
  const add = (kind, at, dur, props, source = 'default') => {
    if (source === 'default' && removed(kind, at)) return;
    cands.push({ kind, at: Math.max(0, at), dur, props, source });
  };

  // hook title: judgment / planner text, else the planner's own early add_title, else the first short sentence
  const plannerHooks = edl.overlays.filter((o) => o.kind === 'hook_title' && !o.props?.primitive && typeof o.props?.text === 'string' && o.at < 3 && !o.props?.engine);
  const hookText = state.hookText ?? edl.cut_plan?.judgment?.hook_text ?? plannerHooks[0]?.props.text ?? (defs.hook ? deriveHookText(words, edl.cut_plan?.judgment) : null);
  if (hookText && (defs.hook || state.hookText || plannerHooks.length || edl.cut_plan?.judgment?.hook_text)) {
    // the app's hook replaces the planner's early title (no double titles)
    edl.overlays = edl.overlays.filter((o) => !plannerHooks.includes(o));
    const emph = words.find((w) => w.emphasis && hookText.toLowerCase().includes(w.w.toLowerCase().replace(/[^\p{L}\p{N}]/gu, '')));
    add('hook_title', 0.15, Math.min(2.4, Math.max(1.2, total - 0.2)), { text: hookText, effect: config.hookStyle && config.hookStyle !== 'planner' ? config.hookStyle : theme.hook, key: emph?.w });
  }
  // lower thirds on introductions
  if (defs.lowerThird)
    for (const p of findIntroductions(words, config.note)) if (!underBroll(p.at, p.at + 3.4)) add('lower_third', p.at, 3.4, { name: p.name, role: p.role });
  // number pops on numeric emphasis (any big number when there is no AI judgment)
  const noAccent = [];
  if (defs.stats)
    for (const s of findStats(words, { emphasisOnly: Boolean(edl.cut_plan?.judgment?.emphasis?.length) })) {
      add('stat', s.at - frame, 1.7, { value: s.value, label: s.label, face: underBroll(s.at, s.at + 1.7) ? null : subjectBoxAt(edl, ctx, s.at) });
      noAccent.push({ at: s.at, end: s.end, value: s.value });
    }
  // chapter cards (16:9) at section starts after the first
  if (defs.chapters) {
    const chapters = (ctx.chapters ?? []).map((ch) => {
      for (const c of aClips) {
        const p = npath(edl.sources.find((s) => s.id === c.src)?.path);
        if (p === npath(ch.path) && ch.t >= c.in - 0.05 && ch.t < c.out) return { at: c.at + (Math.max(ch.t, c.in) - c.in) / (c.speed ?? 1), title: ch.title };
      }
      return null;
    }).filter((c) => c && c.at > 2 && c.title).sort((a, b) => a.at - b.at);
    chapters.forEach((ch, i) => add('chapter', ch.at, defs.chapterVariant === 'full' ? 2 : 1.8, { title: ch.title, index: i + 2, variant: defs.chapterVariant }));
  }
  // screen recordings: Screen Studio card + 1.6–2.5x zooms, callouts on newly active regions
  const screenIds = new Set([...(edl.cut_plan?.screen_punch ?? []).map((p) => p.clip_id), ...Object.keys(ctx.screenRegions ?? {})]);
  const card = cardRect(canvas);
  for (const c of aClips) {
    if (!screenIds.has(c.id)) continue;
    if (defs.screenCard) c.screen_card = { scale: r3(card.scale), radius: card.radius, inset: r3((1 - card.scale) / 2) };
    // director punches on screen recordings become proper Screen Studio zooms (1.6–2.5x)
    for (const k of c.camera ?? []) if (k.zoom > 1.05) k.zoom = r3(Math.max(1.6, Math.min(2.5, k.zoom)));
    if (!defs.callouts) continue;
    let last = null;
    for (const r of ctx.screenRegions?.[c.id] ?? []) {
      const local = Math.max(0, r.t0 + 0.6);
      if (local >= clipLen(c) - 1) continue;
      if (last && Math.abs(last.x + last.w / 2 - (r.box.x + r.box.w / 2)) < 0.1 && Math.abs(last.y + last.h / 2 - (r.box.y + r.box.h / 2)) < 0.1) continue;
      last = r.box;
      const target = sourceBoxToCanvas(edl, c, r.box, local);
      if (!target) continue;
      const big = (target.w * target.h) / (canvas.w * canvas.h) > 0.3;
      add('callout', c.at + local, 2, { kind: big ? 'box' : 'circle', target, seed: c.id });
    }
  }
  // progress bar (shorts), end card (16:9)
  if (defs.progress && !removed('progress', 0)) add('progress', 0, total, { position: 'top' });
  if (defs.cta && total >= 60) add('cta', Math.max(0, total - 5), 5, { text: 'Subscribe' });
  // emoji pops (opt-in), at most one per 10 s
  if (defs.stickers) {
    let lastAt = -Infinity;
    for (const s of findStickers(words, { emphasisOnly: words.some((w) => w.emphasis) })) {
      if (s.at - lastAt < 10) continue;
      const face = subjectBoxAt(edl, ctx, s.at);
      add('sticker', s.at, 1.3, { emoji: s.emoji, ...(face ? { x: face.x1 + (canvas.w - face.x1) * 0.35, y: face.y0 } : {}) });
      lastAt = s.at;
    }
  }
  // planner additions
  for (const [i, c] of calls.entries()) {
    if (c.remove || c.tool === 'screen_zoom') continue;
    const el = c.kind;
    const props = { ...c.props };
    if (el === 'callout') {
      const box = config.targets?.[i] ?? (Array.isArray(props.box) && props.box.length === 4 ? (props.box.every((v) => v <= 1.0001) ? { x: props.box[0] * canvas.w, y: props.box[1] * canvas.h, w: props.box[2] * canvas.w, h: props.box[3] * canvas.h } : { x: props.box[0], y: props.box[1], w: props.box[2], h: props.box[3] }) : null);
      let target = box;
      if (!target) {
        // no box: the active screen region at that time
        const clip = aClips.find((x) => c.at >= x.at && c.at < x.at + clipLen(x));
        const r = clip && (ctx.screenRegions?.[clip.id] ?? []).find((x) => c.at - clip.at >= x.t0 - 0.2 && c.at - clip.at < x.t1 + 0.5);
        target = r ? sourceBoxToCanvas(edl, clip, r.box, c.at - clip.at) : null;
      }
      if (!target) continue;
      props.target = target;
      delete props.box;
      delete props.target_prompt;
    }
    if (el === 'stat' && !props.face) props.face = subjectBoxAt(edl, ctx, c.at ?? 0);
    if (el === 'text_behind') continue; // rendered by SAM (samLayers below)
    const dflt = { hook_title: 2.4, lower_third: 3.4, stat: 1.7, callout: 2.2, chapter: 1.8, sticker: 1.3, cta: 5, progress: total }[el] ?? 2;
    const at = el === 'progress' ? 0 : el === 'cta' ? Math.max(0, total - (c.dur ?? 5)) : c.at ?? 0;
    if (el === 'hook_title') {
      cands.splice(0, cands.length, ...cands.filter((x) => x.kind !== 'hook_title'));
      props.effect ??= config.hookStyle && config.hookStyle !== 'planner' ? config.hookStyle : theme.hook;
    }
    add(el, at, c.dur ?? dflt, props, 'planner');
  }
  // planner screen zooms: eased 1.6–2.5x keys onto the target over the range
  for (const c of calls.filter((x) => x.tool === 'screen_zoom')) {
    const clip = aClips.find((x) => c.at >= x.at - 1e-6 && c.at < x.at + clipLen(x));
    if (!clip) continue;
    const L = clipLen(clip);
    const t0 = Math.max(0, c.at - clip.at);
    const t1 = Math.min(L, t0 + c.dur);
    if (t1 - t0 < 0.6) continue;
    const tg = Array.isArray(c.props.target) && c.props.target.length === 4 ? { x: c.props.target[0], y: c.props.target[1], w: c.props.target[2], h: c.props.target[3] } : (ctx.screenRegions?.[clip.id] ?? []).find((r) => t0 >= r.t0 - 0.3 && t0 < r.t1)?.box;
    if (!tg) continue;
    const z = r3(Math.max(1.6, Math.min(2.5, 0.62 / Math.max(0.05, Math.max(tg.w, tg.h)))));
    const keys = (clip.camera ?? []).filter((k) => k.t < t0 - 1e-6 || k.t > t1 + 0.5 + 1e-6);
    const base = { x: 0.5, y: 0.5, zoom: 1 };
    const ease = 10 * frame;
    keys.push({ t: r3(t0), ...base, ease: 'cubic' }, { t: r3(t0 + ease), x: r3(tg.x + tg.w / 2), y: r3(tg.y + tg.h / 2), zoom: z, ease: 'hold' });
    if (t1 + 0.45 <= L) keys.push({ t: r3(t1), x: r3(tg.x + tg.w / 2), y: r3(tg.y + tg.h / 2), zoom: z, ease: 'cubic' }, { t: r3(t1 + 0.45), ...base, ease: 'cubic' });
    clip.camera = keys.sort((a, b) => a.t - b.t);
    clip.camera_by = 'screen_zoom';
    if (defs.screenCard || screenIds.has(clip.id)) clip.screen_card ??= { scale: r3(card.scale), radius: card.radius, inset: r3((1 - card.scale) / 2) };
  }

  // layouts (refusals drop out), then the restraint rules
  const laidOut = [];
  const dropped = [];
  for (const c of cands) {
    if (c.at >= total - 0.3) {
      dropped.push({ kind: c.kind, at: r3(c.at), why: 'past the end' });
      continue;
    }
    const laid = layoutGraphic(c.kind, c.props, canvas, theme);
    if (!laid) {
      dropped.push({ kind: c.kind, at: r3(c.at), why: 'does not fit this canvas' });
      continue;
    }
    laidOut.push({ ...c, laid, end: c.at + c.dur });
  }
  // native planner overlays that are still graphics (text titles, shapes, images) occupy the screen too
  const occupied = edl.overlays.filter((o) => !o.props?.engine && ['hook_title', 'lower_third', 'callout', 'image', 'text_behind'].includes(o.kind)).map((o) => ({ kind: o.kind, at: o.at, end: o.at + o.dur }));
  for (const layer of config.samLayers ?? []) occupied.push({ kind: 'text_behind', at: layer.at, end: layer.at + layer.dur });
  const limit = config.densityLimit ?? densityLimit(template, canvas);
  const { accepted, dropped: restrained } = enforceRestraint(laidOut, { limit, total, occupied, fps });
  dropped.push(...restrained);

  // SAM text-behind layers: an existing EDL kind (picture overlay of the matte render)
  for (const [i, layer] of (config.samLayers ?? []).entries()) {
    const id = `sam-tb-${i + 1}`;
    if (!edl.sources.some((s) => s.id === id)) edl.sources.push({ id, path: npath(layer.path), kind: 'video', fps: layer.fps ?? canvas.fps, w: layer.w ?? canvas.w, h: layer.h ?? canvas.h, duration: layer.duration, rotation: 0, color: { primaries: 'bt709', trc: 'bt709' } });
    edl.overlays.push({ id: `gfx-text_behind-${i + 1}`, kind: 'text_behind', src: id, at: r3(layer.at), dur: r3(layer.dur), track: 'graphics', props: { graphics_plan: true, element: 'text_behind', text: layer.text, in: layer.in ?? 0, fit: 'cover' } });
  }
  const counts = {};
  const overlays = accepted.map((c) => {
    counts[c.kind] = (counts[c.kind] ?? 0) + 1;
    const sb = c.laid.safeBox;
    return {
      id: `gfx-${c.kind}-${counts[c.kind]}`,
      kind: 'graphic',
      at: r3(c.at),
      dur: r3(Math.max(2 * frame, c.dur)),
      track: 'graphics',
      props: { element: c.kind, ...c.props, source: c.source, theme: theme.id, box: c.laid.box, safe_box: sb ? { x0: r3(sb.x), y0: r3(sb.y), x1: r3(sb.x + sb.w), y1: r3(sb.y + sb.h) } : null },
    };
  });
  // graphics draw under the captions (captions are appended later, in the final pass)
  edl.overlays.push(...overlays);
  const stats = overlays.filter((o) => o.props.element === 'stat');
  edl.graphics = {
    version: GRAPHICS_PLAN_VERSION,
    template,
    theme: theme.id,
    hook_style: config.hookStyle ?? null,
    density_limit: limit,
    defaults: defs,
    planner: { calls, hookText: state.hookText ?? null },
    // caption words a number pop already shows lose their accent (no double)
    no_accent: noAccent.filter((n) => stats.some((o) => Math.abs(o.at - n.at) < 0.4)).map((n) => ({ at: r3(n.at), end: r3(n.end), value: n.value })),
    dropped,
    report: { ...graphicsAudit(edl.overlays, { limit, total }), by_kind: counts, screen_cards: aClips.filter((c) => c.screen_card).length },
  };
  return edl;
}
export { safeArea };
