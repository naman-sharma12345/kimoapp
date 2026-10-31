// Phase 7 explainers on the EDL: the director's beats become `graphic`
// overlays (ex_* elements of the Phase 6 kit), speaker bubbles (`pip`
// overlays), "make room" camera keys on the talking track, SFX clips, emoji
// stickers, caption no-accent ranges and the attribution list. Runs on
// every snapshot after the Phase 6 graphics and before the captions, so the
// caption engine yields to the explainer boxes. Node only.
import { pathToFileURL } from 'node:url';
import { outputWords } from '../captions.mjs';
import { arollTrack, headAt, coverGeometry, clipCameraAt, cameraSampler } from '../camera.mjs';
import { rate } from '../edl.mjs';
import { layoutGraphic, themeFor } from '../graphics/renderer.mjs';
import { STICKERS } from '../graphics/elements/sticker.mjs';
import { FAMILY_ELEMENT, ASSET_ELEMENT } from './families/index.mjs';
import { COUNT_S } from './families/stat.mjs';
import { beatTiming, makeRoomWindow, toFrame, entryFrame } from './timing.mjs';
import { placeBeat, projectFace, resolveGraphics, reframeFor, FULL_SHARE_MAX } from './layout.mjs';
import { sentences, clean } from './detect.mjs';
import { mapProps } from './geo.mjs';
import { findIcon, findBrand } from './icons.mjs';
import { planSfx, sfxFile, KIT } from './sfx.mjs';
import { planMetrics, HUMOUR_KINDS } from './validate.mjs';
import { pipRect } from './panel.mjs';

export const EXPLAIN_PLAN_VERSION = 1;
const r3 = (n) => +Number(n).toFixed(3);
const npath = (p) => String(p ?? '').replaceAll('\\', '/');
const clipLen = (c) => (c.out - c.in) / (c.speed ?? 1);
const EMOJI_MAP = { 'mind-blown': 'mind-blown', mindblown: 'mind-blown', laugh: 'laugh', joy: 'laugh', skull: 'laugh', fire: 'fire', check: 'check', x: 'x', cross: 'x', rocket: 'rocket', money: 'money', eyes: 'eyes', thinking: 'thinking', warning: 'warning', party: 'party', heart: 'heart', bulb: 'bulb', brain: 'brain', trophy: 'trophy', clap: 'clap', star: 'star', lightning: 'lightning', hundred: 'hundred', 'chart-up': 'chart-up' };
const MEME_EMOJI = { expectation_reality: ['star', 'x'], nobody_me: ['eyes', 'laugh'], two_choice: ['x', 'check'], this_is_fine: ['fire', 'thinking'] };

/** Element kind for a beat kind (null → no canvas card). */
export const elementFor = (kind) => FAMILY_ELEMENT[kind] ?? ASSET_ELEMENT[kind] ?? null;

/** Stores absolute times on beats so they survive word-list changes (re-anchored on each snapshot). */
export function anchorBeats(beats, words) {
  const at = (i) => (Number.isInteger(i) && words[i] ? words[i].start : null);
  return beats.map((b) => ({
    ...b,
    _anchor: {
      start: at(b.start_word_idx),
      say: at(b.say_word_idx),
      end: Number.isInteger(b.end_word_idx) && words[b.end_word_idx] ? words[b.end_word_idx].end : null,
      items: (b.items ?? []).map((it) => at(it.say_word_idx)),
      left: at(b.left?.say_word_idx),
      right: at(b.right?.say_word_idx),
      lp: (b.left?.points ?? []).map((p) => at(p.say_word_idx)),
      rp: (b.right?.points ?? []).map((p) => at(p.say_word_idx)),
    },
  }));
}
/** Word index whose onset is within 0.12 s of t (null when the word was cut). */
export function wordAt(words, t, tol = 0.12) {
  if (t == null) return null;
  let best = null;
  for (let i = 0; i < words.length; i++) if (Math.abs(words[i].start - t) <= tol && (best == null || Math.abs(words[i].start - t) < Math.abs(words[best].start - t))) best = i;
  return best;
}
const endWordAt = (words, t) => {
  if (t == null) return null;
  let best = null;
  for (let i = 0; i < words.length; i++) if (Math.abs(words[i].end - t) <= 0.15) best = i;
  return best;
};
function reanchor(b, words) {
  const a = b._anchor;
  if (!a) return b;
  const s = wordAt(words, a.start);
  const say = wordAt(words, a.say);
  if (s == null || say == null) return null;
  const e = endWordAt(words, a.end) ?? say;
  const items = (b.items ?? []).map((it, k) => ({ ...it, say_word_idx: wordAt(words, a.items[k]) }));
  if (items.some((it, k) => a.items[k] != null && it.say_word_idx == null)) return null;
  const side = (x, t, pts) => (x ? { ...x, say_word_idx: wordAt(words, t), points: (x.points ?? []).map((p, k) => ({ ...p, say_word_idx: wordAt(words, pts[k]) })) } : x);
  return { ...b, start_word_idx: s, say_word_idx: say, end_word_idx: Math.max(e, say), items, left: side(b.left, a.left, a.lp), right: side(b.right, a.right, a.rp) };
}

/** Subject samples over a window for the layout engine: [{face, head, geom, state, clip}]. */
export function subjectSamples(edl, ctx, t0, t1, step = 0.5) {
  const track = arollTrack(edl);
  if (!track) return [];
  const out = [];
  for (let t = t0; t <= t1 + 1e-6; t += step) {
    const clip = track.clips.find((c) => t >= c.at - 1e-6 && t < c.at + clipLen(c) - 1e-6);
    if (!clip) continue;
    const source = edl.sources.find((s) => s.id === clip.src);
    const head = ctx.heads?.[npath(source?.path)];
    if (!source || !head) continue;
    const local = t - clip.at;
    const h = headAt(head, clip.in + local * (clip.speed ?? 1));
    if (!h || h.source === 'centre') continue;
    const geom = coverGeometry(source, edl.canvas, clip.fit);
    const state = clipCameraAt(clip, geom)(local);
    out.push({ t, clip, head: h, geom, state, face: projectFace(h, geom, state, edl.canvas) });
  }
  return out;
}

const said = (words, i0, i1) => words.slice(Math.max(0, i0), i1 + 1).map((w) => w.w).join(' ');
/** Element props for a beat (times relative to the visual's start). */
export function beatProps(b, tm, words, fps) {
  const rel = (i, d = 0) => (Number.isInteger(i) && words[i] ? Math.max(0, (entryFrame(words[i].start, fps) - tm.startFrame) / fps) : d);
  const it = (k) => tm.items[k] ?? tm.items.at(-1) ?? 0;
  const first = [{ t: it(0) }];
  switch (b.kind) {
    case 'list':
      return { title: b.title, items: b.items.map((x, k) => ({ text: x.text, t: it(k) })) };
    case 'stat':
      return { value: Number(b.value), unit: b.unit ?? '', prefix: b.prefix ?? '', locale: b.locale ?? 'en-US', label: b.label ?? '', items: first };
    case 'chart':
      return { title: b.title, chart: ['bar', 'line', 'donut'].includes(b.chart) ? b.chart : b.trend ? 'line' : 'bar', trend: Boolean(b.trend), items: b.items.map((x, k) => ({ label: x.label ?? x.text ?? '', value: Number(x.value), t: it(k) })) };
    case 'compare': {
      const side = (x) => (x ? { title: x.title ?? '', t: rel(x.say_word_idx, 0), points: (x.points ?? []).map((p) => ({ text: p.text, t: rel(p.say_word_idx, rel(x.say_word_idx, 0) + 0.2) })) } : { title: '', points: [] });
      return { left: side(b.left), right: side(b.right), winner: b.winner === 'left' || b.winner === 'right' ? b.winner : null, winner_t: b.winner ? rel(b.end_word_idx, tm.dur * 0.7) : null };
    }
    case 'flow':
      return { title: b.title, items: b.items.map((x, k) => ({ text: x.text, t: it(k) })), cycle: Boolean(b.cycle), cycle_t: b.cycle ? Math.min(tm.dur - 0.3, it(b.items.length - 1) + 0.5) : null };
    case 'timeline':
      return { items: b.items.map((x, k) => ({ when: x.when ?? '', text: x.text ?? '', t: it(k) })) };
    case 'definition':
      return { term: b.term ?? b.title ?? '', pos: b.pos ?? 'noun', definition: b.definition ?? '', items: first };
    case 'map': {
      const m = mapProps(b.items.map((x, k) => ({ name: x.text, t: it(k) })), { route: Boolean(b.route) });
      return m ? { map: m } : null;
    }
    case 'logo_or_icon': {
      const brand = findBrand(b.brand ?? b.label ?? '');
      const icon = brand ? null : findIcon(b.icon ?? b.label ?? b.keyword ?? '');
      if (!brand && !icon) return null;
      return { label: b.label ?? brand?.title ?? '', icon: brand ? { d: brand.d, kind: 'brand', hex: brand.hex } : { d: icon.d, kind: 'line' }, items: first };
    }
    case 'name_card':
      return { name: b.name ?? b.title ?? '', descriptor: b.descriptor ?? b.label ?? '' };
    case 'code': {
      const lines = b.items.length ? b.items.map((x) => x.text) : String(b.code ?? '').split('\n').filter(Boolean);
      return { lang: b.lang ?? 'bash', items: lines.slice(0, 10).map((text, k) => ({ text, t: b.items.length ? it(k) : it(0) + k * 0.6 })) };
    }
    case 'ui_callout':
      return b.target ? { style: b.style ?? 'circle', target: b.target, label: b.label ?? '', items: first } : null;
    case 'quote': {
      const q = String(b.quote ?? '').split(/\s+/).filter(Boolean).slice(0, 30);
      // karaoke: each quote word on its spoken word when found in order, else spread over the beat
      let k = b.start_word_idx;
      const qw = q.map((w, n) => {
        for (let j = k; j <= Math.min(words.length - 1, b.end_word_idx + 2); j++)
          if (clean(words[j].w) === clean(w)) {
            k = j + 1;
            return { w, t: rel(j) };
          }
        return { w, t: it(0) + (n / Math.max(1, q.length)) * Math.max(0.5, tm.dur - 0.8) };
      });
      return { quote: q.join(' '), author: b.author ?? '', words: qw };
    }
    case 'icon_metaphor':
    case 'kinetic_text':
      return { keyword: b.keyword ?? b.title ?? '', metaphor: b.metaphor ?? 'grow-curve', text: b.text ?? '', items: first };
    case 'question':
      return { question: b.question ?? said(words, b.start_word_idx, b.end_word_idx) };
    case 'meme':
      return { format: b.meme?.format ?? 'nobody_me', top: b.meme?.top ?? '', bottom: b.meme?.bottom ?? '', items: [{ t: it(0) }, { t: Math.min(tm.dur - 0.4, rel(b.end_word_idx, it(0) + 0.6)) }], assets: (MEME_EMOJI[b.meme?.format] ?? MEME_EMOJI.nobody_me).map((e) => ({ key: e, emoji: e })) };
    case 'tweet_card':
    case 'news_card':
      return { variant: b.kind === 'news_card' ? 'news' : 'post', name: b.name ?? '', handle: b.handle ?? '', outlet: b.outlet ?? '', date: b.date ?? '', text: b.text ?? b.quote ?? '' };
    case 'photo':
    case 'screenshot':
    case 'ai_image':
    case 'reaction_gif':
    case 'image_asset': {
      if (!b.asset?.path) return null;
      return { caption: b.caption ?? b.title ?? '', credit: b.asset.on_screen_credit ? b.asset.credit : b.asset.source === 'ai' ? 'AI image' : '', ai: b.asset.source === 'ai', screenshot: b.kind === 'screenshot', assets: [{ key: 'pic', path: b.asset.path, url: pathToFileURL(b.asset.path).href }] };
    }
    default:
      return null;
  }
}

/** Replaces the A-roll camera keys over a window with an eased (spring) move to target and back. */
export function applyReframe(clip, from, to, target, fps) {
  const len = clipLen(clip);
  const ease = 10 / fps;
  const lf = Math.max(0, from - clip.at);
  const lt = Math.min(len, to - clip.at);
  if (lt <= lf) return false;
  const sample = cameraSampler(clip.camera);
  const keep = (clip.camera ?? []).filter((k) => k.t < lf - 1e-6 || k.t > lt + ease + 1e-6);
  const keys = [...keep];
  if (lf > 1e-6) keys.push({ t: r3(lf), ...sample(lf), ease: 'spring' });
  keys.push({ t: r3(lf > 1e-6 ? Math.min(lt, lf + ease) : 0), ...target, ease: 'hold' });
  if (lt < len - 1e-6) {
    keys.push({ t: r3(lt), ...target, ease: 'spring' });
    const back = Math.min(len, lt + ease);
    keys.push({ t: r3(back), ...sample(back), ease: 'cubic' });
  }
  for (const k of keys) {
    k.x = r3(k.x);
    k.y = r3(k.y);
    k.zoom = r3(k.zoom);
  }
  clip.camera = keys.sort((a, b) => a.t - b.t);
  clip.camera_by = clip.camera_by ? `${clip.camera_by}+explain` : 'explain';
  return true;
}

/**
 * Applies explainers to an EDL. config: {enabled, beats (anchored), template,
 * theme, toggles, sfx (true), ffmpeg, sfxDir, words (override)}; ctx: the
 * camera ctx (words, heads). Mutates and returns edl; edl.explain holds the report.
 */
export function applyExplain(edl, config = {}, ctx = {}) {
  edl.overlays = edl.overlays.filter((o) => !o.props?.explain_plan);
  edl.audio = edl.audio.filter((t) => t.track !== 'SFX:explain');
  if (config.enabled === false || !config.beats?.length) {
    delete edl.explain;
    return edl;
  }
  const canvas = edl.canvas;
  const fps = rate(canvas.fps);
  const template = config.template ?? 'auto';
  const theme = themeFor(config.theme ?? template, { accent: config.accent });
  const words = config.words ?? outputWords(edl, ctx);
  const total = edl.video.flatMap((t) => t.clips).reduce((m, c) => Math.max(m, c.at + clipLen(c)), 0);
  const sents = sentences(words);
  const dropped = [];
  const beats = config.beats.map((b) => {
    const r = reanchor(b, words);
    if (!r) dropped.push({ id: b.id, kind: b.kind, why: 'its words were cut' });
    return r;
  }).filter(Boolean).sort((a, b) => words[a.start_word_idx].start - words[b.start_word_idx].start);
  const track = arollTrack(edl);
  const placed = [];
  const overlays = [];
  const sfxCues = [];
  const noAccent = [];
  const credits = [];
  let fullUsed = 0;
  for (const [k, b] of beats.entries()) {
    const next = beats[k + 1];
    const nextAt = next ? (Math.min(entryFrame(words[next.start_word_idx].start, fps), entryFrame(words[next.say_word_idx].start, fps) - (next.kind === 'stat' ? Math.round(COUNT_S * fps) : 0)) - 1) / fps : Infinity;
    const sent = sents.find((s) => b.end_word_idx >= s.i0 && b.end_word_idx <= s.i1);
    const tm = beatTiming(b, words, { fps, total, nextAt, sentenceEnd: sent ? words[sent.i1].end : null, lead: b.kind === 'stat' ? COUNT_S : 0 });
    if (b.kind === 'sound_gag') {
      sfxCues.push({ at: words[b.say_word_idx].start, kind: b.gag ?? 'ding', beat: b.id });
      placed.push({ id: b.id, kind: b.kind, at: r3(words[b.say_word_idx].start), dur: 0, mode: 'sound', why: b.why ?? '' });
      continue;
    }
    if (b.kind === 'broll') continue; // placed by the Phase 6 b-roll planner (engine wiring)
    if (b.kind === 'emoji') {
      const emoji = EMOJI_MAP[String(b.emoji ?? '').toLowerCase()] ?? null;
      if (!emoji || !STICKERS.includes(emoji)) {
        dropped.push({ id: b.id, kind: b.kind, why: `no bundled emoji ${b.emoji}` });
        continue;
      }
      const at = entryFrame(words[b.say_word_idx].start, fps) / fps;
      const face = subjectSamples(edl, ctx, at, at)[0]?.face;
      const props = { emoji, ...(face ? { x: Math.min(canvas.w * 0.9, face.x1 + (canvas.w - face.x1) * 0.3), y: face.y0 } : {}) };
      const laid = layoutGraphic('sticker', props, canvas, theme);
      if (!laid) continue;
      overlays.push({ id: `ex-${b.id}`, kind: 'graphic', at: r3(at), dur: r3(Math.min(1.3, total - at)), track: 'graphics', props: { element: 'sticker', ...props, theme: theme.id, box: laid.box, safe_box: null, explain: { beat: b.id, kind: b.kind, why: b.why ?? '', source: b.source }, explain_plan: true } });
      placed.push({ id: b.id, kind: b.kind, at: r3(at), dur: 1.3, mode: 'overlay', why: b.why ?? '' });
      sfxCues.push({ at, kind: 'pop', beat: b.id });
      continue;
    }
    const element = elementFor(b.kind);
    if (!element) {
      dropped.push({ id: b.id, kind: b.kind, why: 'no visual for this kind' });
      continue;
    }
    const props0 = beatProps(b, tm, words, fps);
    if (!props0) {
      dropped.push({ id: b.id, kind: b.kind, why: b.kind === 'map' ? 'place not in the offline map' : 'nothing to draw' });
      continue;
    }
    const at = tm.at;
    const end = tm.endFrame / fps;
    const samples = subjectSamples(edl, ctx, at, end);
    const place = placeBeat(b, { canvas, template, dur: tm.dur, fullLeft: total * FULL_SHARE_MAX - fullUsed, hint: config.layoutHint ?? b.layout_hint ?? null, samples });
    if (!place.mode) {
      dropped.push({ id: b.id, kind: b.kind, why: place.why });
      continue;
    }
    const props = { ...props0, mode: place.mode, ...(place.panel && element !== 'ex_name_card' && element !== 'ex_ui_callout' ? { panel: place.panel } : {}), face: place.face ?? null };
    const laid = layoutGraphic(element, props, canvas, theme);
    if (!laid) {
      dropped.push({ id: b.id, kind: b.kind, why: 'does not fit this canvas' });
      continue;
    }
    if (place.mode === 'full' || place.mode === 'pip') fullUsed += tm.dur;
    const sb = laid.safeBox;
    overlays.push({
      id: `ex-${b.id}`,
      kind: 'graphic',
      at: tm.at,
      dur: tm.dur,
      track: 'graphics',
      props: { element, ...props, theme: theme.id, box: laid.box, safe_box: sb ? { x0: r3(sb.x), y0: r3(sb.y), x1: r3(sb.x + sb.w), y1: r3(sb.y + sb.h) } : null, explain: { beat: b.id, kind: b.kind, why: b.why ?? '', source: b.source }, overflow: Boolean(laid.layout?.overflow), explain_plan: true },
    });
    // speaker bubble over full-screen visuals (pip): a copy of the talking track, face-centred, rounded
    if (place.mode === 'pip' && track) {
      const rect = place.pip ?? pipRect(canvas);
      const short = Math.min(canvas.w, canvas.h);
      const mask = { shape: 'rect', x: r3((rect.x + rect.w / 2) / canvas.w), y: r3((rect.y + rect.h / 2) / canvas.h), w: r3(rect.w / canvas.w), h: r3(rect.h / canvas.h), radius: r3(rect.radius / short), feather: r3(1 / short) };
      let n = 0;
      for (const c of [...track.clips].sort((x, y) => x.at - y.at)) {
        const a0 = Math.max(at, c.at);
        const a1 = Math.min(end, c.at + clipLen(c));
        if (a1 - a0 < 1 / fps) continue;
        const src = edl.sources.find((s) => s.id === c.src);
        const head = ctx.heads?.[npath(src?.path)];
        const h = head ? headAt(head, c.in + (a0 - c.at) * (c.speed ?? 1)) : null;
        const cam = h && h.source !== 'centre' ? [{ t: 0, x: r3(h.cx), y: r3((h.top + h.chin) / 2), zoom: 1 }] : undefined;
        overlays.push({ id: `ex-${b.id}-pip-${++n}`, kind: 'pip', src: c.src, at: r3(a0), dur: r3(a1 - a0), track: 'graphics', props: { in: r3(c.in + (a0 - c.at) * (c.speed ?? 1)), speed: c.speed ?? 1, camera: cam, pip: { x: rect.x, y: rect.y, w: rect.w, h: rect.h, zoom: h && h.source !== 'centre' ? 1.35 : 1.1 }, mask, explain_plan: true } });
      }
      const ring = layoutGraphic('ex_pip', { rect }, canvas, theme);
      if (ring) overlays.push({ id: `ex-${b.id}-ring`, kind: 'graphic', at: tm.at, dur: tm.dur, track: 'graphics', props: { element: 'ex_pip', rect, theme: theme.id, box: ring.box, safe_box: { x0: rect.x, y0: rect.y, x1: rect.x + rect.w, y1: rect.y + rect.h }, explain_plan: true } });
    }
    // camera makes room for side / top
    if (place.reframe && track && (place.mode === 'side' || place.mode === 'top')) {
      const win = makeRoomWindow(tm, fps);
      for (const c of track.clips) {
        if (c.at >= win.to || c.at + clipLen(c) <= win.from) continue;
        const src = edl.sources.find((s) => s.id === c.src);
        const head = ctx.heads?.[npath(src?.path)];
        const mid = Math.max(c.at, Math.min(c.at + clipLen(c) - 1e-3, at));
        const h = head ? headAt(head, c.in + (mid - c.at) * (c.speed ?? 1)) : null;
        if (!h || h.source === 'centre') continue;
        const geom = coverGeometry(src, canvas, c.fit);
        const state = clipCameraAt(c, geom)(mid - c.at);
        const target = reframeFor(place.mode, place.panel, { head: h, geom, state, canvas });
        if (target) applyReframe(c, win.from, win.to, target, fps);
      }
    }
    // sound: a tick per item entrance, a whoosh on full-screen entrances
    if (place.mode === 'full' || place.mode === 'pip') sfxCues.push({ at: tm.at, kind: 'whoosh', beat: b.id });
    for (const f of tm.entries) sfxCues.push({ at: f / fps, kind: 'tick', beat: b.id });
    // one emphasis channel: the words this visual shows lose the caption accent
    const shown = new Set([b.title, b.label, b.term, b.keyword, ...b.items.map((x) => x.text), b.left?.title, b.right?.title, ...(b.left?.points ?? []).map((p) => p.text), ...(b.right?.points ?? []).map((p) => p.text), b.value != null ? String(b.value) : null].filter(Boolean).flatMap((s) => String(s).split(/\s+/)).map(clean).filter((w) => w.length > 1));
    for (let i = b.start_word_idx; i <= b.end_word_idx; i++) if (shown.has(clean(words[i].w))) noAccent.push({ at: r3(words[i].start), end: r3(words[i].end) });
    if (b.asset?.credit || b.asset?.source === 'ai') credits.push({ source: b.asset.source, title: b.asset.title, creator: b.asset.creator, license: b.asset.license, license_version: b.asset.license_version, license_url: b.asset.license_url, url: b.asset.url, landing: b.asset.landing, host: b.asset.host });
    if (b.kind === 'map') credits.push({ source: 'bundled', text: 'Map data: Natural Earth (public domain); city positions: GeoNames (CC BY 4.0, https://www.geonames.org)' });
    placed.push({ id: b.id, kind: b.kind, element, at: tm.at, dur: tm.dur, mode: place.mode, fallback: Boolean(place.fallback), items: tm.items, why: b.why ?? '', source: b.source, ...(b.asset ? { asset: { source: b.asset.source, credit: b.asset.credit } } : {}) });
  }
  // decorative Phase 6 graphics move or wait; a hook title / end card makes the explainer wait
  const windows = placed.filter((p) => p.dur > 0).map((p) => ({ id: p.id, at: p.at, end: p.at + p.dur }));
  const g = resolveGraphics(edl.overlays, windows, { total });
  const blocked = new Set(g.blocked);
  const keepOv = overlays.filter((o) => !blocked.has(o.props?.explain?.beat ?? String(o.id).replace(/^ex-/, '').replace(/-(pip-\d+|ring)$/, '')));
  for (const id of blocked) {
    dropped.push({ id, kind: placed.find((p) => p.id === id)?.kind, why: 'waits for the hook title / end card' });
    const i = placed.findIndex((p) => p.id === id);
    if (i >= 0) placed.splice(i, 1);
  }
  edl.overlays.push(...keepOv);
  // SFX track (synthesised kit), unless switched off
  const sfx = config.sfx === false ? [] : planSfx(sfxCues.filter((c) => !blocked.has(c.beat)));
  if (sfx.length && config.sfxDir) {
    try {
      const clips = sfx.map((c, i) => ({ id: `sfx-ex-${i + 1}`, asset: npath(sfxFile(c.name, { ffmpeg: config.ffmpeg, dir: config.sfxDir })), at: c.at, in: 0, out: KIT[c.name].d, dur: KIT[c.name].d, speed: 1, gain_db: c.gain_db })).filter((c) => c.at + c.dur <= total + 1e-6);
      edl.audio.push({ track: 'SFX:explain', role: 'SFX', name: 'explainer sounds', clips });
    } catch (error) {
      dropped.push({ id: 'sfx', kind: 'sound', why: String(error.message).slice(0, 120) });
    }
  }
  const metrics = planMetrics(placed.map((p) => ({ ...p, items: [], _at: p.at })), { tone: config.tone, total });
  const faceOverlap = placed.filter((p) => p.mode !== 'pip' && p.mode !== 'full' && p.mode !== 'sound').length ? countFaceOverlaps(edl, ctx, keepOv) : 0;
  edl.explain = {
    version: EXPLAIN_PLAN_VERSION,
    template,
    theme: theme.id,
    placed,
    dropped: [...(config.dropped ?? []), ...dropped].slice(0, 80),
    graphics: { moved: g.moved, removed: g.removed },
    sfx: sfx.map((c) => ({ at: c.at, name: c.name, gain_db: c.gain_db })),
    no_accent: noAccent,
    attributions: credits,
    report: config.report ?? null,
    metrics: { ...metrics, explain_face_overlap: faceOverlap, full_share: total ? r3(fullUsed / total) : 0, humour_misfire: placed.filter((p) => HUMOUR_KINDS.has(p.kind) && (config.tone?.serious ?? []).some(([a, z]) => p.at >= a && p.at <= z)).length },
  };
  return edl;
}

/** Frames (sampled every 0.25 s) where an explainer panel covers the subject's face. */
export function countFaceOverlaps(edl, ctx, overlays) {
  let n = 0;
  for (const o of overlays) {
    const sb = o.props?.safe_box;
    if (!sb || o.kind !== 'graphic' || ['full', 'pip'].includes(o.props.mode) || o.props.element === 'ex_pip') continue;
    const r = { x: sb.x0, y: sb.y0, w: sb.x1 - sb.x0, h: sb.y1 - sb.y0 };
    for (const s of subjectSamples(edl, ctx, o.at, o.at + o.dur, 0.25)) {
      const f = s.face;
      if (Math.max(0, Math.min(r.x + r.w, f.x1) - Math.max(r.x, f.x0)) * Math.max(0, Math.min(r.y + r.h, f.y1) - Math.max(r.y, f.y0)) > 0) n++;
    }
  }
  return n;
}

/** Text of the beats for the planner / chat ("b3 list @12.4s side: 3 reasons it failed"). */
export function explainSummary(edl) {
  return (edl.explain?.placed ?? []).map((p) => `${p.id} ${p.kind} @${p.at}s ${p.mode}${p.why ? ` (${p.why})` : ''}`).join('; ');
}
export { toFrame };
