// Phase 7.5b the visual director: the model decides what to show while the
// creator speaks. Node only.
//
//   1. deterministic cues (detect.mjs) are hints;
//   2. pass 1: one cached call (proxy kind "explain", whose system prompt with
//      the taste rules lives on the Worker) returns beats of any family or
//      asset kind, each with its spoken word index and an asset_query;
//   3. code validation (validate.mjs) enforces the rules whatever was asked;
//   4. the app fetches up to 3 candidates per asset beat (sources/), cached;
//   5. pass 2: one cached vision call (kind "pick") on 256 px thumbnails
//      picks the best candidate per beat, drops or marks unsafe; a beat with
//      no good picture becomes an icon card.
// Without AI (captions mode, offline, no sign-in or own key) the cues alone
// are validated into beats, using only bundled visuals and the user's files.
// Every AI answer is cached by content hash: a re-render makes no AI and no
// network call. The run's AI and asset budget is reported in the op feed.
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { detectCues } from './detect.mjs';
import { validateBeats, normalizeBeat, KINDS, DEFAULT_TOGGLES, DENSITY, TOGGLES } from './validate.mjs';
import { FAMILIES, ASSET_KINDS } from './families/index.mjs';
import { METAPHORS } from './families/metaphor.mjs';
import { MEME_FORMATS } from './families/meme.mjs';
import { findIcon, findBrand } from './icons.mjs';
import { AssetCache, preparePicture, thumbDataUrl, creditLine, needsCredit, sha } from './assets.mjs';
import { sourcesFor, library as librarySrc, openverse, wikimedia, screenshot, aiImage } from './sources/index.mjs';
import { GAGS } from './sfx.mjs';

export const DIRECTOR_VERSION = 1;
export const MAX_AI_CALLS = 4;
export const CANDIDATES = 3;
export const PICTURE_KINDS = new Set(['photo', 'screenshot', 'ai_image', 'reaction_gif', 'image_asset']);

/** Cue candidate → beat (the same shape the model answers). */
export function cueToBeat(c, i) {
  const { family, i0, i1, say, ...rest } = c;
  return { ...rest, id: `c${i + 1}`, kind: family, start_word_idx: i0, end_word_idx: i1, say_word_idx: say, source: 'cue' };
}

/** Pass-1 request text: words, sentences, cues, context, catalogue. */
export function pass1Text({ words, cues, template, canvas, tone, audience, note, toggles, density, offline, library, screens }) {
  const vertical = canvas && canvas.h > canvas.w;
  const lines = [];
  lines.push(`template: ${template} · canvas ${canvas?.w}x${canvas?.h}${vertical ? ' (vertical short)' : ' (16:9)'} · audience: ${audience || 'young creators / tech audience'}`);
  lines.push(`tone windows (s): humour ${JSON.stringify(tone?.humour ?? [])} serious ${JSON.stringify(tone?.serious ?? [])}`);
  lines.push(`density: ${density} · toggles: ${Object.entries(toggles).map(([k, v]) => `${k} ${v ? 'on' : 'OFF'}`).join(', ')}${offline ? ' · OFFLINE / licence-safe only: no photo, screenshot, broll, reaction_gif or ai_image unless asset_query.source is library' : ''}`);
  lines.push(`switched-off kinds (never use): ${Object.entries(TOGGLES).filter(([k]) => !toggles[k]).flatMap(([, ks]) => ks).join(', ') || 'none'}`);
  lines.push(`metaphors: ${METAPHORS.join(', ')} · meme formats: ${MEME_FORMATS.join(', ')} · sound gags: ${GAGS.join(', ')}`);
  lines.push('asset sources available: library (the user\'s files), openverse, wikimedia (real CC photos), screenshot (a public url the speaker names), ai (only if ai_images is on). no giphy/tenor/pexels/pixabay: reaction GIFs only from the library; memes are rebuilt formats.');
  if (note) lines.push(`creator's note: ${String(note).slice(0, 400)}`);
  if (library?.length) lines.push(`user library: ${library.slice(0, 60).map((x) => `${x.name}${x.caption ? ` (${x.caption})` : ''}`).join('; ')}`);
  if (screens?.length) lines.push(`on screen: ${screens.slice(0, 80).map((s) => `${s.t0.toFixed(1)}-${s.t1.toFixed(1)} ${s.what}`).join('; ')}`);
  lines.push('sentences:');
  for (const [k, s] of cues.sentences.entries()) lines.push(`S${k + 1} [${s.i0}-${s.i1}] ${words[s.i0].start.toFixed(2)}-${words[s.i1].end.toFixed(2)}s: ${s.text}`);
  lines.push('words (index word@seconds):');
  lines.push(words.map((w, i) => `${i} ${w.w}@${w.start.toFixed(2)}`).join(' | '));
  const hints = cues.candidates.slice(0, 80).map((c, i) => cueToBeat(c, i));
  lines.push(`deterministic cue candidates (hints, not rules): ${JSON.stringify(hints)}`);
  return lines.join('\n');
}

function aiCache(dir) {
  mkdirSync(dir, { recursive: true });
  return {
    get: (key) => {
      const p = join(dir, `${key}.json`);
      return existsSync(p) ? JSON.parse(readFileSync(p, 'utf8')) : null;
    },
    put: (key, v) => writeFileSync(join(dir, `${key}.json`), JSON.stringify(v)),
  };
}

/**
 * Runs the director. opts: {words (output-timeline), canvas, template, note,
 * toggles, density, offline, audience, screens, libraryDirs, userBeats,
 * ask(kind, text, images) (null → deterministic), cacheDir, assetCache,
 * ffmpeg, signal, emit, allowMemes}. Returns {beats, dropped, trimmed, cues,
 * report}.
 */
export async function direct(opts) {
  const { words, canvas, note = '', signal } = opts;
  const template = opts.template ?? 'auto';
  const toggles = { ...DEFAULT_TOGGLES, ...(opts.toggles ?? {}) };
  const density = DENSITY[opts.density] != null ? opts.density : 'normal';
  const ask = opts.ask ?? null;
  const emit = opts.emit ?? (() => {});
  const report = { version: DIRECTOR_VERSION, mode: ask ? 'ai' : 'cues', ai_calls: 0, ai_cached: 0, ai_failed: 0, searches: 0, fetches: 0, network: 0, candidates: 0, picked: 0, fallbacks: 0, ai_images: 0 };
  if (!words?.length || density === 'off') return { beats: [], dropped: [], trimmed: [], cues: null, report: { ...report, skipped: density === 'off' ? 'explainers off' : 'no words' } };
  const cues = detectCues(words, { note });
  const assets = opts.assetCache ?? new AssetCache(undefined, {});
  const cache = aiCache(opts.cacheDir ?? join(assets.dir, 'ai'));
  const budget = { calls: 0, max: opts.maxAiCalls ?? MAX_AI_CALLS };
  const cachedAsk = async (kind, text, images = []) => {
    const key = sha({ v: DIRECTOR_VERSION, kind, text, images: images.map((x) => sha(x.url)) });
    const hit = cache.get(key);
    if (hit) {
      report.ai_cached++;
      return hit;
    }
    if (!ask || budget.calls >= budget.max) return null;
    budget.calls++;
    report.ai_calls++;
    const rec = await ask(kind, text, images);
    cache.put(key, rec ?? {});
    return rec;
  };

  // the user's own library (captioned once, cached)
  let library = librarySrc.listLibrary(opts.libraryDirs ?? []);
  if (library.length) {
    const thumbOf = (p) => thumbDataUrl(preparePicture(p, { ffmpeg: opts.ffmpeg, cache: assets })?.thumb);
    library = await librarySrc.captionLibrary(library, { cache: assets, describe: ask ? (text, images) => cachedAsk('describe', text, images) : null, thumbOf }).catch(() => library);
  }

  // pass 1
  let raw = null;
  if (ask) {
    try {
      const text = pass1Text({ words, cues, template, canvas, tone: cues.tone, audience: opts.audience, note, toggles, density, offline: opts.offline, library, screens: opts.screens });
      const rec = await cachedAsk('explain', text);
      if (Array.isArray(rec?.beats)) raw = rec.beats.map((b) => ({ ...b, source: 'llm' }));
    } catch (error) {
      if (signal?.aborted) throw error;
      report.ai_failed++;
      report.error = String(error.message).slice(0, 160);
    }
  }
  if (!raw) raw = cues.candidates.map(cueToBeat);
  for (const [i, b] of (opts.userBeats ?? []).entries()) raw.push({ ...b, id: b.id ?? `u${i + 1}`, source: 'user' });
  const total = opts.total ?? words.at(-1).end;
  const v = validateBeats(raw, { words, template, canvas, toggles, density, offline: opts.offline, tone: cues.tone, allowMemes: opts.allowMemes || /\bmeme/i.test(note), total });
  let beats = v.beats;
  const dropped = [...v.dropped];

  // fetch candidates for picture beats (≤ 3 each), cached on disk
  const fetched = [];
  const aiBudget = { used: 0 };
  for (const b of beats) {
    if (!PICTURE_KINDS.has(b.kind)) continue;
    const q = b.asset_query ?? {};
    const query = q.q ?? q.url ?? b.caption ?? b.title ?? b.label ?? '';
    const list = [];
    for (const src of sourcesFor(b.kind, q)) {
      if (list.length >= CANDIDATES) break;
      if (opts.offline && src !== 'library') continue;
      try {
        if (src === 'library') list.push(...librarySrc.search(query, { library, limit: CANDIDATES - list.length }));
        else if (src === 'openverse') list.push(...(await openverse.search(query, { cache: assets, signal, limit: CANDIDATES - list.length })));
        else if (src === 'wikimedia') list.push(...(await wikimedia.search(query, { cache: assets, signal, limit: CANDIDATES - list.length })));
        else if (src === 'screenshot') list.push(...screenshot.search(q.url ?? query));
        else if (src === 'ai' && toggles.ai_images) list.push({ source: 'ai', prompt: q.q ?? query, title: query, license: 'ai', creator: 'AI image' });
      } catch (error) {
        if (signal?.aborted) throw error;
        emit({ t: 'op', phase: 'end', tool: 'explain_warning', title: `explainer: ${src} search failed (${String(error.message).slice(0, 80)})`, warning: true, ok: true, at: Date.now() });
      }
    }
    // local files for each candidate
    for (const c of list) {
      try {
        let file = null;
        if (c.source === 'library') file = c.path;
        else if (c.source === 'screenshot') file = await screenshot.capture(c, { cache: assets });
        else if (c.source === 'ai') {
          file = await aiImage.generate(c.prompt, { cache: assets, budget: aiBudget, signal });
          if (file) report.ai_images++;
        } else file = await assets.download(c.url, { signal });
        if (!file) continue;
        const pic = preparePicture(file, { ffmpeg: opts.ffmpeg, cache: assets });
        if (pic) fetched.push({ beat: b.id, n: fetched.filter((f) => f.beat === b.id).length + 1, cand: c, pic });
      } catch (error) {
        if (signal?.aborted) throw error;
      }
    }
  }
  report.candidates = fetched.length;

  // pass 2: vision pick on thumbnails (batched 12), or the first candidate without AI (library only)
  const picks = new Map();
  const unsafe = new Set();
  const noPick = new Set();
  if (fetched.length && ask) {
    for (let i = 0; i < fetched.length; i += 12) {
      const chunk = fetched.slice(i, i + 12).filter((f) => f.pic.thumb);
      if (!chunk.length) continue;
      const ids = [...new Set(chunk.map((f) => f.beat))];
      const text = ids.map((id) => {
        const b = beats.find((x) => x.id === id);
        return `${id} (${b.kind}): said "${words.slice(b.start_word_idx, b.end_word_idx + 1).map((w) => w.w).join(' ').slice(0, 200)}"; wanted: ${b.asset_query?.q ?? b.caption ?? ''}`;
      }).join('\n');
      try {
        const rec = await cachedAsk('pick', text, chunk.map((f) => ({ label: `${f.beat} #${f.n}`, url: thumbDataUrl(f.pic.thumb) })));
        for (const p of rec?.picks ?? []) if (p?.beat && Number.isInteger(p.pick)) picks.set(String(p.beat), p.pick);
        for (const d of rec?.drop ?? []) if (d?.beat) noPick.add(String(d.beat));
        for (const u of rec?.unsafe ?? []) unsafe.add(String(u));
      } catch (error) {
        if (signal?.aborted) throw error;
        report.ai_failed++;
      }
    }
  }
  const out = [];
  for (const b of beats) {
    if (!PICTURE_KINDS.has(b.kind)) {
      out.push(b);
      continue;
    }
    const mine = fetched.filter((f) => f.beat === b.id && !unsafe.has(`${b.id} #${f.n}`));
    // without a vision pass only the user's own files (or an AI image they switched on) are trusted
    const trusted = ask ? mine : mine.filter((f) => f.cand.source === 'library');
    let chosen = null;
    if (!noPick.has(b.id)) chosen = picks.has(b.id) ? trusted.find((f) => f.n === picks.get(b.id)) ?? null : trusted.find((f) => f.cand.source === 'library') ?? null;
    if (chosen) {
      report.picked++;
      const c = chosen.cand;
      out.push({ ...b, asset: { source: c.source, path: chosen.pic.png, w: chosen.pic.w, h: chosen.pic.h, url: c.url ?? null, title: c.title ?? null, creator: c.creator ?? null, license: c.license ?? null, license_version: c.license_version ?? null, license_url: c.license_url ?? null, landing: c.landing ?? null, host: c.host ?? null, credit: creditLine(c), on_screen_credit: needsCredit(c.license) } });
      continue;
    }
    // no good picture: an icon card instead
    const q = b.asset_query?.q ?? b.caption ?? b.title ?? '';
    const brand = findBrand(q);
    const icon = findIcon(q);
    const label = String(b.caption ?? b.title ?? q).split(/\s+/).filter(Boolean).slice(0, 3).join(' ');
    if ((brand || icon) && label && toggles.diagrams) {
      report.fallbacks++;
      out.push({ ...b, kind: 'logo_or_icon', label, icon: icon?.name, brand: brand?.slug, why: `${b.why ?? ''} (no good picture found: icon card)`.trim() });
    } else dropped.push({ id: b.id, kind: b.kind, why: 'no good picture found' });
  }
  beats = out;
  Object.assign(report, { searches: assets.stats.searches, fetches: assets.stats.fetches, network: assets.stats.network + report.ai_calls, refused_searches: assets.stats.refused });
  return { beats, dropped, trimmed: v.trimmed, cues, report, library };
}

/** One op-feed line for the decisions ("explainer: 5 visuals: list, stat, compare, map, flow"). */
export function directorSummary(beats, report) {
  const kinds = beats.map((b) => b.kind.replace(/_/g, ' '));
  return `explainer: ${beats.length} visual${beats.length === 1 ? '' : 's'}${kinds.length ? `: ${kinds.join(', ')}` : ''} · ${report.mode === 'ai' ? `AI ${report.ai_calls} call${report.ai_calls === 1 ? '' : 's'} (${report.ai_cached} cached)` : 'from speech cues (no AI)'} · assets ${report.searches} searches, ${report.fetches} downloads${report.ai_images ? `, ${report.ai_images} AI image${report.ai_images === 1 ? '' : 's'}` : ''}`;
}

export { KINDS, FAMILIES, ASSET_KINDS, normalizeBeat };
