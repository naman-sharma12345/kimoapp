// Planner tools and chat patches for explainers (Phase 7.5). Node + browser
// safe, no I/O. The plan state ({density, toggles, userBeats, removed,
// theme, layoutHint, regenerate}) rides on edl.explain.config so follow-ups
// and re-renders keep it.
export const EXPLAIN_TOOLS = ['explain_auto', 'explain', 'explain_remove', 'explain_style'];
export const DENSITIES = ['off', 'light', 'normal', 'rich'];
export const EXPLAIN_TOOL_TEXT = `explain_auto(density:string(off|light|normal|rich)) — the app's visual director shows what the speaker says while they say it (diagrams, real photos, memes, emoji, screenshots, sound gags), item by item on the spoken words; the app already ran it. change the density or switch it off.
explain(kind*:string, at:number, word:string, title:string, items:[string], value:number, unit:string, label:string, places:[string], query:string, layout:string(side|top|overlay|full|pip)) — add one visual at a time (seconds) or on a spoken word: kinds list, stat, chart, compare, flow, timeline, definition, map, logo_or_icon, name_card, code, quote, icon_metaphor, question, photo (query = what to show), meme, emoji, sound_gag.
explain_remove(id:string, kind:string) — remove a visual by beat id (b1, c3, u1 …) or every visual of a kind (e.g. meme).
explain_style(theme:string, layout:string(side|top|overlay|full|pip)) — typography theme for the visuals (kimo, energetic, documentary, cinematic, podcast, tutorial) and/or a preferred layout (pip = speaker in a bubble).`;

const step = (d, k) => DENSITIES[Math.max(0, Math.min(DENSITIES.length - 1, DENSITIES.indexOf(d ?? 'normal') + k))];
const num = (v) => (Number.isFinite(Number(v)) ? Number(v) : undefined);

/** Records a planner explainer tool call on the state; returns {ok, text, redirect}. */
export function explainToolCall(state, name, args = {}) {
  state.userBeats ??= [];
  state.removed ??= [];
  if (name === 'explain_auto') {
    const d = String(args.density ?? 'normal').toLowerCase();
    if (!DENSITIES.includes(d)) return { ok: false, text: `density is one of ${DENSITIES.join(', ')}` };
    state.density = d;
    return { ok: true, redirect: true, text: JSON.stringify({ ok: true, density: d }) };
  }
  if (name === 'explain') {
    const kind = String(args.kind ?? '').toLowerCase().replace(/[\s-]+/g, '_');
    if (!kind) return { ok: false, text: 'explain needs a kind' };
    const at = num(args.at);
    if (at == null && !args.word) return { ok: false, text: 'explain needs at (seconds) or the spoken word' };
    const items = Array.isArray(args.items) ? args.items.map(String).slice(0, 8) : [];
    state.userBeats.push({ kind, at, word: args.word ? String(args.word).slice(0, 40) : undefined, title: args.title, items, value: num(args.value), unit: args.unit, label: args.label, places: Array.isArray(args.places) ? args.places.map(String).slice(0, 4) : undefined, query: args.query ? String(args.query).slice(0, 80) : undefined, layout_hint: args.layout });
    return { ok: true, text: JSON.stringify({ ok: true, note: 'added; it appears on its word on the next snapshot' }) };
  }
  if (name === 'explain_remove') {
    if (!args.id && !args.kind) return { ok: false, text: 'explain_remove needs id or kind' };
    state.removed.push({ id: args.id ? String(args.id) : undefined, kind: args.kind ? String(args.kind).toLowerCase() : undefined });
    return { ok: true, text: JSON.stringify({ ok: true }) };
  }
  if (name === 'explain_style') {
    if (args.theme) state.theme = String(args.theme).toLowerCase();
    if (args.layout) state.layoutHint = String(args.layout).toLowerCase();
    return { ok: true, text: JSON.stringify({ ok: true, theme: state.theme ?? null, layout: state.layoutHint ?? null }) };
  }
  return { ok: false, text: `unknown explainer tool ${name}` };
}

const TIME = /\b(?:at|@)\s*(\d{1,2}):(\d{2})\b|\b(?:at|@)\s*(\d+(?:\.\d+)?)\s*s(?:ec(?:onds?)?)?\b/i;
const atOf = (s) => {
  const m = TIME.exec(s);
  if (!m) return undefined;
  return m[1] != null ? Number(m[1]) * 60 + Number(m[2]) : Number(m[3]);
};

/**
 * Deterministic chat patches (the planner LLM may add more through the
 * tools). Returns the state changes it made as {changes: [text], redirect}.
 * Handles: "fewer graphics", "more visuals (in the intro)", "no memes",
 * "add a meme when I fail", "no emoji", "show a chart when I talk about
 * revenue", "make the list appear one by one", "add a map of Delhi at 0:42",
 * "put the speaker in a bubble during the explanation", "show a real photo of
 * the Taj Mahal there", "no explainers", "regenerate visuals for this part (a–b s)".
 */
export function notePatches(state, note = '') {
  const s = String(note ?? '');
  const changes = [];
  let redirect = false;
  state.toggles ??= {};
  state.userBeats ??= [];
  if (/\b(no|without|turn off|remove|drop)\s+(the\s+|any\s+)?(explainers?|explainer visuals|visuals)\b/i.test(s)) {
    state.density = 'off';
    changes.push('explainers off');
    redirect = true;
  } else if (/\b(fewer|less|too many|less busy|tone down)\b.*\b(graphics|visuals|overlays|explainers?|things on screen)\b/i.test(s)) {
    state.density = step(state.density, -1);
    changes.push(`density ${state.density}`);
    redirect = true;
  } else if (/\bmore\b.*\b(graphics|visuals|explainers?)\b/i.test(s)) {
    if (/\b(intro|start|beginning|first)\b/i.test(s)) {
      state.focus = { from: 0, to: 30, density: step(state.density, 1) };
      changes.push('more visuals in the intro');
    } else {
      state.density = step(state.density, 1);
      changes.push(`density ${state.density}`);
    }
    redirect = true;
  }
  for (const [re, key] of [[/\bno (memes?|gifs?)\b/i, 'memes'], [/\bno (emojis?|stickers?)\b/i, 'emoji'], [/\bno (photos?|images?|pictures?)\b/i, 'images'], [/\bno (sound gags?|sfx gags?|meme sounds?)\b/i, 'gags'], [/\bno screenshots?\b/i, 'screenshots'], [/\bno (diagrams?|charts?)\b/i, 'diagrams']]) {
    if (re.test(s)) {
      state.toggles[key] = false;
      changes.push(`${key} off`);
      redirect = true;
    }
  }
  if (/\b(add|put|show)\b.*\bmemes?\b.*\bwhen i (fail|mess up|screw up)/i.test(s)) {
    state.toggles.memes = true;
    state.allowMemes = true;
    state.userBeats.push({ kind: 'meme', word: 'fail', meme: { format: 'expectation_reality', top: 'the plan', bottom: 'what happened' } });
    changes.push('a meme on the fail');
    redirect = true;
  }
  if (/\b(speaker|me|face)\b.*\b(bubble|picture.in.picture|pip|corner)\b/i.test(s)) {
    state.layoutHint = 'pip';
    changes.push('speaker in a bubble during explanations');
  }
  const chart = /\b(show|add|put)\b.*\b(chart|graph)\b.*\b(?:about|on|when i (?:talk|say|mention)\w*(?: about)?)\s+([\p{L}\d][\p{L}\d\s-]{1,30}?)(?:[.,!?]|$)/iu.exec(s);
  if (chart) {
    state.userBeats.push({ kind: 'chart', word: chart[3].trim().split(/\s+/)[0], near: chart[3].trim() });
    changes.push(`a chart near "${chart[3].trim()}"`);
  }
  const map = /\b(?:add|show|put)\b.*\bmap\b(?:\s+of)?\s+([\p{Lu}][\p{L}]+(?:\s+[\p{Lu}][\p{L}]+)?)/u.exec(s);
  if (map) {
    state.userBeats.push({ kind: 'map', places: [map[1]], at: atOf(s), word: atOf(s) == null ? map[1] : undefined });
    changes.push(`a map of ${map[1]}`);
  }
  const photo = /\b(?:show|add|put)\b.*\b(?:real\s+)?(?:photo|picture|image)\b\s+of\s+(?:the\s+)?([\p{L}][\p{L}\s-]{1,40}?)(?:\s+(?:there|here|at|when)\b|[.,!?]|$)/iu.exec(s);
  if (photo) {
    const q = photo[1].trim();
    state.toggles.images = true;
    state.userBeats.push({ kind: 'photo', query: q, at: atOf(s), word: atOf(s) == null ? q.split(/\s+/).at(-1) : undefined, caption: q });
    changes.push(`a real photo of ${q}`);
    redirect = true;
  }
  if (/\blist\b.*\bone by one\b|\bone by one\b.*\blist\b/i.test(s)) {
    state.listOneByOne = true;
    changes.push('list items reveal one by one on their words (already the default)');
  }
  const regen = /\bregenerate (?:the )?visuals\b.*?(\d+(?:\.\d+)?)\s*(?:s)?\s*[–-]\s*(\d+(?:\.\d+)?)\s*s/i.exec(s);
  if (regen) {
    state.regenerate = { from: Number(regen[1]), to: Number(regen[2]), seed: (state.regenerate?.seed ?? 0) + 1 };
    changes.push(`regenerate visuals ${regen[1]}–${regen[2]} s`);
    redirect = true;
  }
  return { changes, redirect };
}

/**
 * User beats (planner/chat) → beats with word indices on the given words
 * (at → first word at or after it; word → first matching spoken word, the
 * nearest to at when both). Unplaceable ones are returned in `missing`.
 */
export function placeUserBeats(userBeats = [], words = []) {
  const beats = [];
  const missing = [];
  const clean = (w) => String(w ?? '').toLowerCase().replace(/[^\p{L}\p{N}]/gu, '');
  for (const [k, u] of userBeats.entries()) {
    let i = null;
    if (u.word) {
      const want = clean(u.word);
      const hits = words.map((w, j) => (clean(w.w).startsWith(want) && want ? j : -1)).filter((j) => j >= 0);
      i = hits.length ? (u.at != null ? hits.reduce((a, b) => (Math.abs(words[b].start - u.at) < Math.abs(words[a].start - u.at) ? b : a)) : hits[0]) : null;
    }
    if (i == null && u.at != null) i = words.findIndex((w) => w.start >= u.at - 0.05);
    if (i == null || i < 0) {
      missing.push(u);
      continue;
    }
    const end = Math.min(words.length - 1, i + Math.max(4, (u.items?.length ?? 0) * 3));
    const b = { ...u, id: `u${k + 1}`, source: 'user', importance: 1, start_word_idx: i, say_word_idx: i, end_word_idx: end };
    if (u.items?.length) b.items = u.items.map((text, n) => ({ text, say_word_idx: Math.min(end, i + n * 3) }));
    if (u.kind === 'map') b.items = (u.places ?? []).map((name) => ({ text: name, say_word_idx: i }));
    if (u.kind === 'photo') b.asset_query = { source: 'wikimedia', q: u.query ?? u.caption };
    if (u.kind === 'chart' && !b.items?.length) b.from_speech = true;
    beats.push(b);
  }
  return { beats, missing };
}
