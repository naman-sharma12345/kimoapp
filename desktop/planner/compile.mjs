import { basename } from 'node:path';
import { fromKimoProject, duration, validate } from '../edl.mjs';
import {
  analyzeClips,
  buildCutPlan,
  templateFor,
  sentenceList,
  refineJoins,
  planMetrics,
} from '../cutplan.mjs';
import { frameRange } from '../cutstage.mjs';
import { storyJudgment } from '../planner.mjs';
import { validatePlan } from './validate.mjs';
import {
  directCamera,
  cameraInputsFromCut,
  frameFor,
  headAt,
  coverGeometry,
  zoomCap,
} from '../camera.mjs';
import {
  outputWords,
  applyCaptions,
  captionStyle,
  captionStats,
} from '../captions.mjs';
import { applyGraphics } from '../graphics/plan.mjs';
import { planBroll, applyBroll } from '../broll.mjs';
import { validateBeats } from '../explain/validate.mjs';
import { applyExplain } from '../explain/plan.mjs';
import {
  planSound,
  retainUserMusic,
  chooseMusic,
  libraries,
} from '../audio/plan.mjs';
import { barSeconds } from '../audio/music.mjs';
import { colorConfig } from '../color/plan.mjs';

export function plannerContext({ template, note, files, clips = [], P }) {
  const cutTemplate = templateFor(P, template.legacy_style, template.cut),
    analysis = analyzeClips(clips, cutTemplate);
  let word_count = 0;
  const words = [];
  for (const c of clips)
    for (const w of c.transcript?.words ?? [])
      words.push({
        ...w,
        path: c.file.path.replaceAll('\\', '/'),
        index: word_count++,
      });
  const offsets = clips.map((_, i) =>
    clips
      .slice(0, i)
      .reduce((n, c) => n + (c.transcript?.words.length ?? 0), 0),
  );
  return {
    template,
    note: note ?? '',
    platform: template.platform,
    duration: files
      .filter((f) => f.kind === 'video')
      .reduce((n, f) => n + (f.duration ?? 0), 0),
    sentences: sentenceList(analysis).map((s) => {
      const original = analysis.sentences[s.i];
      return {
        ...s,
        word_count: original.w1 - original.w0 + 1,
        word_start: offsets[original.clip] + original.w0,
        word_end: offsets[original.clip] + original.w1,
      };
    }),
    takes: analysis.takes,
    word_count,
    words,
    clips: files
      .filter((f) => f.kind === 'video')
      .map((f, i) => ({
        id: `s${i + 1}`,
        type:
          clips.find((c) => c.file.path === f.path)?.kind ?? 'untranscribed',
        duration: f.duration,
        description: `Metadata only: ${basename(f.path)}, ${f.width} by ${f.height}; visual content not inferred.`,
      })),
  };
}
/** Pure compiler. The model cannot create renderer properties or media paths. */
export function compilePlan({
  plan,
  context,
  files,
  clips = [],
  P,
  fps = 30,
  heads = {},
  screenRegions = {},
  previous,
}) {
  const valid = validatePlan(plan, context);
  if (!valid.ok) throw new Error(valid.errors.join('; '));
  const t = context.template,
    ct = templateFor(P, t.legacy_style, t.cut),
    analysis = analyzeClips(clips, ct);
  let cut = null;
  if (analysis.sentences.length && t.audio.voice) {
    cut = buildCutPlan({
      clips,
      template: ct,
      analysis,
      judgment: storyJudgment(plan, analysis, { shorts: ct.shorts }),
    });
    cut.sentences = analysis.sentences.map((s) => ({
      i: s.id,
      src: s.src,
      start: s.start,
      end: s.end,
      text: s.text,
    }));
  }
  const videos = files.filter((f) => f.kind === 'video'),
    assets = Object.fromEntries(
      videos.map((f, i) => [
        `s${i + 1}`,
        { ...f, width: f.width, height: f.height },
      ]),
    );
  let at = 0;
  const placed = [];
  const add = (f, a, b, k) => {
    const sourceIndex = videos.findIndex((v) => v.path === f.path),
      r = frameRange(a, b, Number(f.fps) || fps, fps);
    let d = Math.min(
      r.dur,
      t.duration.max_s == null ? Infinity : Math.max(0, t.duration.max_s - at),
    );
    d = Math.floor((d + 1e-6) * fps) / fps;
    if (d <= 0) return;
    const id = `clip${placed.length + 1}`;
    placed.push({
      id,
      source: { type: 'media', asset: `s${sourceIndex + 1}` },
      start: at,
      duration: d,
      in_point: r.in,
      props: {},
      audio: {},
    });
    if (k) {
      k.clip_id = id;
      k.at = at;
    }
    at = +(at + d).toFixed(6);
  };
  if (cut?.keep.length) {
    for (const k of cut.keep) {
      const c = clips.find((c) => c.src === k.src);
      if (c) add(c.file, k.in, k.out, k);
    }
  } else
    for (const f of videos) {
      if (t.id === 'music-montage') {
        const music = chooseMusic(libraries().music, {
            template: t.legacy_style,
            mood: plan.music.mood,
            track: plan.music.track,
          }),
          step = barSeconds(music?.bpm ?? 100);
        for (let time = 0; time < f.duration; time += step)
          add(f, time, Math.min(f.duration, time + step), null);
      } else add(f, 0, f.duration, null);
    }
  if (!placed.length) throw new Error('The plan has no usable picture');
  const project = {
    width: P.width,
    height: P.height,
    fps,
    assets,
    tracks: [{ id: 'aroll', name: 'A-roll', clips: placed }],
    markers: [],
  };
  const edl = fromKimoProject(project, files),
    ctx = cut
      ? cameraInputsFromCut(cut, clips)
      : { words: {}, emphasis: [], chapters: [] };
  Object.assign(ctx, {
    energy: plan.camera.energy,
    maxStatic: t.camera.max_static_s,
    heads,
    screenRegions,
    podcast: t.camera.speaker_framing,
    overrides: {
      style: {
        energy: plan.camera.energy,
        pattern: t.camera.pattern.split(','),
        micro_drift: t.camera.micro_drift,
      },
    },
  });
  if (!t.audio.voice) edl.audio = [];
  if (t.camera.ramps)
    ctx.overrides.ramps = edl.video[0].clips
      .filter((c) => c.out - c.in > 1)
      .map((c) => ({
        clip: c.id,
        at: 0.2,
        dur: Math.min(1.5, c.out - c.in - 0.3),
        min: 0.6,
      }));
  if (t.id === 'music-montage')
    ctx.overrides.transitions = edl.video[0].clips
      .slice(1)
      .filter((_, i) => i % 3 === 0)
      .map((c) => ({ at: c.at, kind: 'whip' }));
  if (cut) {
    refineJoins(cut, [], { punch: t.camera.punch });
    cut.metrics = planMetrics(cut, clips);
    edl.cut_plan = cut;
    for (const k of cut.keep)
      if (clips.find((c) => c.src === k.src)?.screen)
        (edl.cut_plan.screen_punch ??= []).push({
          clip_id: k.clip_id,
          at: k.at,
        });
  }
  // Only words explicitly selected for camera emphasis reach the camera director.
  ctx.emphasis = ctx.emphasis.filter((e) =>
    plan.emphasis.some(
      (p) =>
        p.treat.includes('camera_snap') &&
        p.word.toLowerCase() === e.word?.toLowerCase(),
    ),
  );
  edl.camera_plan = ctx;
  const sentenceAt = (id) => {
    const s = analysis.sentences.find((s) => s.id === id);
    if (!s) return null;
    for (const c of edl.video[0].clips) {
      const path = edl.sources.find((x) => x.id === c.src)?.path;
      if (
        path === clips[s.clip]?.file.path.replaceAll('\\', '/') &&
        s.end > c.in &&
        s.start < c.out
      )
        return c.at + (Math.max(c.in, s.start) - c.in) / (c.speed ?? 1);
    }
    return null;
  };

  const rollClips = clips
    .filter(
      (c) =>
        c.kind === 'broll' ||
        plan.broll.some(
          (b) => videos[Number(b.clip.slice(1)) - 1]?.path === c.file.path,
        ),
    )
    .map((c) => ({ path: c.file.path, duration: c.duration }));
  const inserts = planBroll(edl, {
    ctx,
    clips: rollClips,
    density: t.broll.density,
    note: context.note,
    planner: plan.broll
      .map((b) => ({
        clip: videos[Number(b.clip.slice(1)) - 1]?.path,
        at: sentenceAt(b.sentence) ?? -1,
        dur: t.broll.max_s,
      }))
      .filter((b) => b.at >= 0),
  });
  applyBroll(edl, inserts.inserts, { files });
  edl.broll_plan = inserts;
  // Re-run camera after b-roll placement for its existing J/L-cut and transition logic.
  edl.camera_report = directCamera(edl, ctx).report;
  for (const o of plan.camera.overrides)
    for (const c of edl.video[0].clips) {
      const a = Math.max(0, o.range[0] - c.at),
        b = Math.min(c.out - c.in, o.range[1] - c.at);
      if (b <= a) continue;
      const src = edl.sources.find((s) => s.id === c.src),
        geom = coverGeometry(src, edl.canvas, c.fit),
        state = frameFor(o.framing, headAt(heads[src.path], c.in + a), geom, {
          cap: zoomCap(geom, edl.canvas),
        });
      c.camera = [
        ...(c.camera ?? []).filter((k) => k.t < a || k.t >= b),
        { t: a, ...state, ease: 'hold' },
        { t: Math.max(a, b - 1 / fps), ...state, ease: 'hold' },
      ].sort((a, b) => a.t - b.t);
    }
  const calls = plan.graphics
    .map((g) => ({
      tool: 'graphic',
      kind: g.kind,
      at: g.at_sentence == null ? (g.at ?? 0) : sentenceAt(g.at_sentence),
      dur: g.dur ?? 2,
      props: { ...g, title: g.text ?? g.label },
    }))
    .filter((g) => g.at != null && g.at < duration(edl));
  for (const e of plan.emphasis.filter((e) => e.treat.includes('number_pop'))) {
    const at = sentenceAt(e.sentence);
    if (at != null && /\d/.test(e.word))
      calls.push({
        tool: 'graphic',
        kind: 'stat',
        at,
        dur: 1.7,
        props: { value: e.word, label: '' },
      });
  }
  applyGraphics(
    edl,
    {
      template: t.legacy_style,
      note: context.note,
      densityLimit: t.graphics.density_per_min,
      defaults: t.graphics,
      state: {
        calls,
        hookText:
          plan.story.hook?.hook_text ??
          calls.find((c) => c.kind === 'hook_title')?.props.text,
      },
    },
    ctx,
  );
  const words = outputWords(edl, ctx),
    mapped = (context.words ?? []).map((w) =>
      words.findIndex(
        (v) =>
          v.w === w.w &&
          v.path === w.path &&
          Math.abs((v.src_start ?? v.start) - w.start) < 0.12,
      ),
    );
  // Source-word IDs survive cuts via source timestamp + path, never an arbitrary offset.
  const outputIndex = (i) => {
    const w = context.words[i];
    if (!w) return -1;
    for (const c of edl.video[0].clips) {
      const path = edl.sources.find((s) => s.id === c.src)?.path;
      if (path === w.path && w.start >= c.in - 0.01 && w.start < c.out) {
        const time = c.at + (w.start - c.in) / (c.speed ?? 1);
        return words.findIndex(
          (v) => Math.abs(v.start - time) < 0.05 && v.w === w.w,
        );
      }
    }
    return mapped[i] ?? -1;
  };
  const raw = plan.explainers.map((e, i) => ({
    ...e,
    ...explainProps(e),
    mode: t.explainers.layouts[0],
    id: `creator-ex-${i}`,
    kind: e.family,
    start_word_idx: outputIndex(e.start_word_idx),
    say_word_idx: outputIndex(e.items[0]?.say_word_idx ?? e.start_word_idx),
    end_word_idx: outputIndex(e.end_word_idx),
    items: (explainProps(e).items ?? e.items).map((it) => ({
      ...it,
      say_word_idx: outputIndex(it.say_word_idx),
    })),
  }));
  for (const beat of raw)
    for (const side of ['left', 'right'])
      if (beat[side])
        beat[side].say_word_idx = outputIndex(beat[side].say_word_idx);
  const grounded = raw.filter((b) =>
    b.kind === 'stat'
      ? Number.isFinite(b.value)
      : b.kind === 'chart'
        ? b.items.every((i) => Number.isFinite(i.value))
        : b.kind === 'compare'
          ? b.items.length >= 2
          : true,
  );
  const beats = validateBeats(grounded, {
    words,
    template: t.legacy_style,
    density: t.explainers.density,
    offline: true,
  }).beats;
  applyExplain(
    edl,
    { enabled: true, beats, words, template: t.legacy_style },
    ctx,
  );
  applyCaptions(
    edl,
    {
      ...plan.captions,
      fontScale: plan.captions.font_scale,
      hints: plan.captions.hints,
      emphasis: plan.captions.accent_words.map((word) => ({ word })),
      layout: {
        max_words: t.captions.max_words,
        min_word_dur: t.captions.min_word_s,
      },
    },
    ctx,
  );
  retainUserMusic(edl, previous);
  const pictureEnd = Math.max(
    ...edl.video.flatMap((t) =>
      t.clips.map((c) => c.at + (c.out - c.in) / (c.speed ?? 1)),
    ),
  );
  edl.overlays = edl.overlays
    .map((o) => ({ ...o, dur: Math.min(o.dur, pictureEnd - o.at) }))
    .filter((o) => o.dur > 0);
  if (edl.captions)
    edl.captions.stats = captionStats(
      edl.overlays,
      captionStyle(plan.captions.style),
      edl.canvas,
      fps,
    );
  const imported = files.find((f) => f.kind === 'audio');
  if (imported && !edl.audio.some((t) => t.track === 'user-music')) {
    const source = {
      id: 'creator-user-music',
      path: imported.path.replaceAll('\\', '/'),
      kind: 'audio',
      duration: imported.duration,
      audio: true,
    };
    edl.sources.push(source);
    edl.audio.push({
      track: 'user-music',
      name: 'MUSIC',
      role: 'MUSIC',
      clips: [
        {
          id: 'creator-imported-music',
          src: source.id,
          at: 0,
          in: 0,
          out: imported.duration,
          dur: duration(edl),
          speed: 1,
        },
      ],
    });
  }

  const eventAt = (anchor) => {
    const [k, i] = anchor.split(':');
    return k === 'sentence'
      ? sentenceAt(+i)
      : k === 'graphic'
        ? calls[+i]?.at
        : k === 'emphasis'
          ? sentenceAt(plan.emphasis[+i]?.sentence)
          : edl.video[0].clips[+i]?.at;
  };
  planSound(edl, {
    template: t.legacy_style,
    note: plan.music.enabled ? '' : 'no music',
    ctx,
    music: plan.music,
    settings: t.audio,
    events: [
      ...plan.sfx,
      ...plan.emphasis
        .filter((e) => e.treat.includes('sfx_pop'))
        .map((e) => ({ at_event: `sentence:${e.sentence}`, kind: 'pop' })),
    ]
      .map((s, i) => ({
        id: `creator:${i}`,
        at: eventAt(s.at_event),
        kind: s.kind,
      }))
      .filter((s) => Number.isFinite(s.at)),
  });
  const dropAt =
    plan.music.drop_at_sentence == null
      ? null
      : sentenceAt(plan.music.drop_at_sentence);
  if (dropAt != null)
    for (const track of edl.audio.filter((t) => t.role === 'MUSIC'))
      for (const c of track.clips) {
        c.at = dropAt;
        c.dur = Math.max(1 / fps, duration({ ...edl, audio: [] }) - dropAt);
      }
  edl.color_finish = previous?.color_finish?.locked
    ? previous.color_finish
    : {
        ...colorConfig({ template: t.legacy_style }),
        ...t.color,
        look: plan.look.id,
        strength: plan.look.strength,
      };
  edl.creator_plan = structuredClone(plan);
  edl.creator_context = context;
  edl.creator_clips = clips.map((c) => ({
    ...c,
    transcript: c.transcript
      ? { ...c.transcript, samples: undefined, energy: undefined }
      : null,
  }));
  edl.creator_template = t.id;
  return {
    edl: validate(edl),
    cut,
    ctx,
    chapters: plan.title_pack.chapters
      .map((c) => ({ time: sentenceAt(c.sentence), title: c.title }))
      .filter((c) => c.time != null),
  };
}

/** Translate the compact plan vocabulary into existing local diagram families. */
function explainProps(e) {
  const texts = e.items.map((i) => i.text),
    joined = texts.join(' ');
  const numeric = (text) => {
    const m = String(text).match(/([+-]?\d+(?:[.,]\d+)*)/);
    return m
      ? Number(
          /^[-+]?\d{1,3}(?:,\d{3})+(?:\.\d+)?$/.test(m[1])
            ? m[1].replaceAll(',', '')
            : m[1].replace(',', '.'),
        )
      : null;
  };
  if (e.family === 'stat') return { value: numeric(joined), label: e.title };
  if (e.family === 'chart')
    return {
      items: e.items.map((i) => ({
        ...i,
        label: i.text,
        value: numeric(i.text),
      })),
    };
  if (e.family === 'compare')
    return {
      left: {
        title: texts[0] ?? e.title,
        say_word_idx: e.items[0]?.say_word_idx,
        points: [],
      },
      right: {
        title: texts[1] ?? '',
        say_word_idx: e.items[1]?.say_word_idx,
        points: [],
      },
    };
  if (e.family === 'definition') return { term: e.title, definition: joined };
  if (e.family === 'quote') return { quote: joined };
  if (e.family === 'question') return { question: e.title, label: joined };
  return {};
}
