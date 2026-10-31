// Phase 3 edit stage: transcript → deterministic cut plan → (AI modes) one
// cached judgment call → join check → CutPlan, then the plan is laid on the
// planner's timeline so the EDL that compose() renders follows it. Every step
// is a live op in the activity feed.
import { randomUUID } from 'node:crypto';
import { writeFileSync, existsSync, readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { transcribe as whisperTranscribe, classifyClip } from './transcript.mjs';
import { analyzeClips, buildCutPlan, refineJoins, sentenceList, templateFor, planMetrics } from './cutplan.mjs';
import { judge } from './judgment.mjs';
import { joinMotion } from './joins.mjs';
import { diarise } from './speakers.mjs';

const PODCAST = /podcast|interview|two (people|speakers|hosts)|conversation|guest/i;
const TUTORIAL = /tutorial|how[- ]to|step[- ]by[- ]step|walkthrough|guide|explainer|reel/i;
const SCREEN = /screen|capture|screencast|loom|obs[ _-]/i;

function opRunner(emit) {
  return async (tool, title, fn, summary) => {
    const id = randomUUID().slice(0, 8);
    const t0 = Date.now();
    emit({ t: 'op', id, phase: 'start', tool, title, at: t0 });
    try {
      const r = await fn((f) => emit({ t: 'progress', phase: tool, label: title, f }));
      emit({ t: 'op', id, phase: 'end', ok: true, ms: Date.now() - t0, result: (summary ? summary(r) : '').slice(0, 200) });
      return r;
    } catch (error) {
      emit({ t: 'op', id, phase: 'end', ok: false, ms: Date.now() - t0, error: String(error.message).slice(0, 240) });
      throw error;
    }
  };
}

/** A plan that is safe to save or send over IPC (no samples, no dense energy arrays). */
export function storablePlan(plan) {
  return JSON.parse(JSON.stringify({ ...plan, analysis: undefined }));
}

/**
 * Plans the cut for every speech clip. Returns null when no clip can be
 * transcribed (no whisper/model, no audio): the caller keeps its old path.
 * askAi(text) is given only in AI modes; captions-only stays fully offline.
 */
export async function planCut({ files, P, style, styleInfo, note, mode, env, dir, ffmpeg, signal, emit, askAi, transcribe = whisperTranscribe }) {
  const step = opRunner(emit);
  const cacheDir = env?.KIMO_CACHE_DIR || join(dir, 'cache');
  const template = templateFor(P, style);
  const videos = files.filter((f) => f.kind === 'video');
  if (!videos.length || !videos.some((f) => f.audio)) return null;
  if (transcribe === whisperTranscribe && !(env?.KIMO_WHISPER_BIN && existsSync(env.KIMO_WHISPER_BIN) && env?.KIMO_WHISPER_MODEL && existsSync(env.KIMO_WHISPER_MODEL))) {
    emit({ t: 'think', text: "whisper isn't installed on this PC yet, so the cut can't follow the words; keeping the clips whole" });
    return null;
  }
  const clips = [];
  for (const [i, f] of videos.entries()) {
    const src = `f${i}`;
    if (!f.audio) {
      clips.push({ src, file: f, duration: f.duration, kind: 'broll', transcript: null, speech_ratio: 0 });
      continue;
    }
    let t = null;
    try {
      t = await step(
        'transcribe',
        `transcribe ${f.path.split(/[\\/]/).pop()} · word timestamps on this PC`,
        (progress) => transcribe({ ffmpeg, whisper: env?.KIMO_WHISPER_BIN, model: env?.KIMO_WHISPER_MODEL, input: f.path, src, workDir: join(dir, 'transcript'), cacheDir, signal, onProgress: progress }),
        (r) => `${r.words.length} words · ${r.sentences.length} sentences · ${r.lang}${r.hinglish ? ' (Hinglish)' : ''}${r.cached ? ' · cached' : ''}`,
      );
    } catch (error) {
      if (signal?.aborted) throw error;
    }
    const c = t ? classifyClip(t, f.duration) : { kind: 'untranscribed', speech_ratio: null };
    clips.push({ src, file: f, duration: f.duration || t?.duration, kind: c.kind, speech_ratio: c.speech_ratio, transcript: t, screen: SCREEN.test(f.path.split(/[\\/]/).pop()) || /screen ?record/i.test(note ?? '') });
  }
  if (!clips.some((c) => c.kind === 'speech' || c.kind === 'mixed')) return null;
  if (clips.length > 1) emit({ t: 'think', text: `clips: ${clips.map((c) => `${c.file.path.split(/[\\/]/).pop()} ${c.kind}${c.speech_ratio != null ? ` (${Math.round(c.speech_ratio * 100)}% speech)` : ''}`).join(' · ')}` });
  // two-speaker diarisation for podcast-style edits (Phase 4 frames the speaker)
  if (style === 'podcast' || PODCAST.test(note ?? ''))
    for (const c of clips.filter((x) => x.kind === 'speech'))
      await step('diarise', `who speaks when · ${c.file.path.split(/[\\/]/).pop()}`, () => diarise({ ffmpeg, file: c.file, transcript: c.transcript, signal }), (r) => (r ? `2 speakers by ${r.method} (confidence ${r.confidence})` : 'one speaker or not separable; no labels')).catch((e) => {
        if (signal?.aborted) throw e;
      });
  const analysis = analyzeClips(clips, template);
  let judgment = null;
  const speechSeconds = clips.filter((c) => c.transcript && c.kind !== 'broll').reduce((a, c) => a + c.transcript.words.reduce((s, w) => s + w.end - w.start, 0), 0);
  if (askAi && analysis.sentences.length >= 2) {
    const r = await step(
      'judgment',
      'judgment · hook, story order, drops, best takes (one cached AI call)',
      () => judge({ analysis, sentences: sentenceList(analysis), note, template: style === 'tutorial' || TUTORIAL.test(note ?? '') ? `${template.name} tutorial` : template.name, tutorial: style === 'tutorial' || TUTORIAL.test(note ?? ''), shorts: template.shorts, speechSeconds, cacheDir, ask: askAi }),
      (x) => (x.judgment ? `${x.judgment.hook ? `hook "${hookWords(analysis, clips, x.judgment.hook)}"` : 'no hook change'} · ${x.judgment.order?.length ?? 'chronological'} lines · ${x.judgment.drop.length} drops${x.cached ? ' · cached' : ''}` : `kept the deterministic plan (${x.error || x.errors.slice(0, 2).join('; ') || 'invalid answer'})`),
    ).catch((e) => {
      if (signal?.aborted) throw e;
      return { judgment: null };
    });
    judgment = r.judgment;
  }
  let plan = buildCutPlan({ clips, template, analysis, judgment });
  const sources = new Map(clips.map((c) => [c.src, c.file]));
  const punch = Math.min(1.2, Math.max(1.1, styleInfo?.punch ?? 1.12));
  if (plan.needs_cover.length) {
    const motions = await step('join_check', `check ${plan.needs_cover.length} jump cuts for micro-jumps`, (progress) => joinMotion({ ffmpeg, plan, sources, signal, onProgress: progress }), (m) => `${m.filter((x) => x && x.shift < 0.02).length} micro-jumps of ${m.length}`).catch((e) => {
      if (signal?.aborted) throw e;
      return [];
    });
    plan = refineJoins(plan, motions, { punch, frameAll: mode === 'captions' });
  } else refineJoins(plan, [], { punch, frameAll: mode === 'captions' });
  plan.metrics = planMetrics(plan, clips);
  plan.clips = clips.map((c) => ({ src: c.src, path: c.file.path, kind: c.kind, speech_ratio: c.speech_ratio, duration: c.duration, lang: c.transcript?.lang, hinglish: c.transcript?.hinglish }));
  plan.sentences = analysis.sentences.map((s) => ({ i: s.id, src: s.src, start: s.start, end: s.end, text: s.text, group: s.group ?? null, fluency: s.fluency }));
  const opId = randomUUID().slice(0, 8);
  emit({ t: 'op', id: opId, phase: 'start', tool: 'cut_plan', title: `cut plan · ${template.name} (max pause ${template.max_pause} s, pad ${Math.round(template.pad * 1000)} ms)`, at: Date.now() });
  emit({ t: 'op', id: opId, phase: 'end', ok: true, ms: 0, result: plan.summary.text });
  emit({ t: 'say', kind: 'cut', text: `cut plan: ${plan.summary.text}` });
  writeFileSync(join(dir, 'cutplan.json'), JSON.stringify(storablePlan(plan), null, 1));
  return { plan, clips };
}

function hookWords(analysis, clips, hook) {
  const s = analysis.sentences[hook.sentence];
  const words = clips[s.clip].transcript.words;
  return words
    .slice(s.w0 + hook.trim_words[0], s.w0 + hook.trim_words[1] + 1)
    .map((w) => w.w)
    .join(' ')
    .slice(0, 80);
}

/** Frame-exact source range: in floors, out ceils to the source frame grid; the duration lands on whole canvas frames. */
export function frameRange(inT, outT, srcFps, canvasFps) {
  const sf = srcFps > 0 ? srcFps : canvasFps;
  const a = Math.floor(inT * sf + 1e-6) / sf;
  const b = Math.ceil(outT * sf - 1e-6) / sf;
  const frames = Math.max(1, Math.round((b - a) * canvasFps));
  return { in: +a.toFixed(6), dur: +(frames / canvasFps).toFixed(6), frames };
}

/**
 * Lays the plan on the planner's timeline: one A-roll track, one clip per kept
 * segment (frame-exact in/out), punch framing on forced joins. In captions
 * mode b-roll / untranscribed clips go in at their place in file order; in AI
 * mode b-roll is offered to the planner instead. Returns {track, clipIds}.
 */
export async function applyCutPlan({ plan, clips, assets, call, P, fps, mode }) {
  const track = (await call('add_track', {})).track_id;
  if (!track) throw new Error('could not add the A-roll track');
  let frames = 0;
  const placed = [];
  const add = async (asset, inT, dur, k) => {
    const j = await call('add_clip', { track_id: track, source_type: 'media', asset_id: asset.id, start: +(frames / fps).toFixed(6), duration: dur, in_point: inT, fit: 'cover' });
    if (!j.clip_id) return null;
    if (k?.zoom && k.zoom !== 1) {
      await call('set_property', { clip_id: j.clip_id, property: 'scale', value: k.zoom });
      // keep the eyes where they were: zoom around the upper third, not the centre
      await call('set_property', { clip_id: j.clip_id, property: 'y', value: +((P.height * (k.zoom - 1)) / 6).toFixed(2) });
    }
    placed.push(j.clip_id);
    return j.clip_id;
  };
  const bySrc = new Map(clips.map((c, i) => [c.src, { c, asset: assets[i] }]));
  const segment = async (k) => {
    const { c, asset } = bySrc.get(k.src);
    if (!asset) return;
    const r = frameRange(k.in, k.out, c.file.fps, fps);
    k.clip_id = await add(asset, r.in, r.dur, k);
    k.at = +(frames / fps).toFixed(6);
    frames += r.frames;
  };
  const whole = async (c, asset) => {
    if (!asset || !(c.duration > 0)) return;
    const frames0 = Math.max(1, Math.round(c.duration * fps));
    await add(asset, 0, +(frames0 / fps).toFixed(6));
    frames += frames0;
  };
  if (mode === 'captions') {
    // file order; each speech clip contributes its own kept segments
    for (const [i, c] of clips.entries()) {
      if (c.kind === 'speech' || c.kind === 'mixed') for (const k of plan.keep.filter((x) => x.src === c.src)) await segment(k);
      else await whole(c, assets[i]);
    }
  } else {
    for (const k of plan.keep) await segment(k);
    for (const [i, c] of clips.entries()) if (c.kind === 'untranscribed') await whole(c, assets[i]);
  }
  return { track, clipIds: placed, duration: frames / fps };
}

/** The previous edit's plan, for follow-ups (null when there is none). */
export function loadSavedPlan(projectFile) {
  try {
    const path = join(dirname(projectFile), 'cutplan.json');
    return existsSync(path) ? JSON.parse(readFileSync(path, 'utf8')) : null;
  } catch {
    return null;
  }
}

/** Planner prompt lines that hand the transcript decisions to the tool planner. */
export function plannerBrief(plan, { trackId, broll = [] } = {}) {
  const segs = plan.keep.filter((k) => k.clip_id);
  const cover = plan.needs_cover.filter((j) => !j.framed);
  const emph = (plan.judgment?.emphasis ?? []).map((e) => e.word);
  return [
    `the talking track${trackId ? ` (${trackId})` : ''} is ALREADY CUT from a word-level transcript: ${plan.summary.text}. it opens on ${plan.hook ? 'the hook line as a cold open' : 'the first spoken word'}. do NOT call auto_rough_cut or cut_to_beat, and do not trim, move or delete these clips unless the user asks.`,
    `cut clips in story order (clip id @ timeline s: words):\n${segs
      .slice(0, 80)
      .map((k) => `${k.clip_id} @${k.at.toFixed(2)}${k.zoom && k.zoom !== 1 ? ` [punched ${k.zoom}]` : ''}: ${k.text.slice(0, 90)}`)
      .join('\n')}${segs.length > 80 ? `\n… ${segs.length - 80} more` : ''}`,
    plan.screen_punch?.length ? `screen-recording segments (timeline s); the camera director punches in on the region being clicked: ${plan.screen_punch.slice(0, 30).map((p) => p.at.toFixed(2)).join(', ')}.` : '',
    cover.length ? `jump cuts (timeline s): ${cover.slice(0, 40).map((j) => j.at.toFixed(2)).join(', ')}. the app's camera director frames every one of them (a framing change on the cut) and pushes into the emphasis words; do not punch or zoom the talking track. place_broll over a cut only where b-roll genuinely helps.` : 'every jump cut is framed by the camera director.',
    plan.judgment?.hook_text ? `hook title text (on-screen by 0.3 s, ≤ 6 words): "${plan.judgment.hook_text}"` : '',
    emph.length ? `emphasis words for captions/keywords: ${emph.join(', ')}` : '',
    broll.length ? `b-roll clips (no speech) already imported: ${broll.map((b) => `${b.asset_id} (${b.path.split(/[\\/]/).pop()}, ${Number(b.duration).toFixed(1)} s)`).join(', ')}. place_broll them over the talking track at the jump cuts or over abstract talk.` : '',
  ].filter(Boolean);
}
