import { duration, validate, applyEdits, rate } from './edl.mjs';
import { getTemplate, TEMPLATE_IDS } from './planner/templates.mjs';
import { defaultPlan } from './planner.mjs';
import { applyPlanPatches } from './planner/patch.mjs';
import { compilePlan } from './planner/compile.mjs';
import {
  captionStyles,
  captionStats,
  captionStyle,
  placeChunks,
} from './captions.mjs';
import { frameFor, headAt, coverGeometry, zoomCap } from './camera.mjs';
import { libraries } from './audio/plan.mjs';
import { TRACKS } from './studio-model.mjs';
import { changeColor } from './color/plan.mjs';
export const ACCENTS = { template: null, cream: '#F5F1E7', orange: '#FF5A24' };
const finite = (n, a, b) =>
  typeof n === 'number' && Number.isFinite(n) && n >= a && n <= b;
const fail = (message) => {
  throw new Error(`Studio patch: ${message}`);
};
function shape(p, keys) {
  if (
    !p ||
    typeof p !== 'object' ||
    Array.isArray(p) ||
    Object.keys(p).some((k) => !keys.includes(k))
  )
    fail('unknown fields');
}
const find = (edl, id) =>
  edl.video.flatMap((t) => t.clips).find((c) => c.id === id) ??
  edl.overlays.find((o) => o.id === id) ??
  edl.audio.flatMap((t) => t.clips).find((c) => c.id === id);
export function studioCatalog() {
  return {
    templates: TEMPLATE_IDS.map((id) => getTemplate(id)),
    music: libraries().music.map((m) => ({ ...m })),
    accents: Object.keys(ACCENTS),
  };
}
export function cleanCreatorOptions(value = {}) {
  shape(value, ['length', 'look', 'music']);
  const result = {};
  if (value.length !== undefined) {
    if (!['auto', 'full', 30, 45, 60].includes(value.length))
      fail('unknown target length');
    result.length = value.length;
  }
  if (value.look !== undefined) {
    if (
      ![
        'auto',
        'clean',
        'warm-creator',
        'mkbhd-crisp',
        'cinematic-teal-orange',
        'vlog-bright',
        'moody-doc',
        'kimo',
      ].includes(value.look)
    )
      fail('unknown look');
    result.look = value.look;
  }
  if (value.music !== undefined) {
    if (!['on', 'off', 'file'].includes(value.music))
      fail('unknown music mode');
    result.music = value.music;
  }
  return result;
}
function compile(edl, plan, context = edl.creator_context) {
  const result = compilePlan({
    plan,
    context,
    files: edl.sources
      .filter(
        (s) =>
          s.kind === 'video' ||
          (s.kind === 'audio' && s.id === 'creator-user-music'),
      )
      .map((s) => ({
        path: s.path,
        kind: s.kind,
        width: s.w,
        height: s.h,
        duration: s.duration,
        fps: s.fps,
        audio: s.audio,
      })),
    clips: edl.creator_clips ?? [],
    P: { width: edl.canvas.w, height: edl.canvas.h },
    fps: rate(edl.canvas.fps),
    heads: edl.camera_plan?.heads ?? {},
    screenRegions: edl.camera_plan?.screenRegions ?? {},
    previous: edl,
  }).edl;
  return applyStoredStudio(result, edl);
}
// Generated IDs follow output order. Anchor manual changes to source content so a
// new hook cannot inherit the previous hook's caption or camera adjustment.
function contentAnchor(edl, c) {
  const round = (n) => Math.round(n * 1000) / 1000;
  if (c.src)
    return { kind: 'media', src: c.src, in: round(c.in), out: round(c.out) };
  if (c.kind === 'caption_word_group') {
    return {
      kind: c.kind,
      words: (c.props.words ?? []).map((w) => {
        const middle = (w.start + w.end) / 2,
          v = edl.video[0].clips.find(
            (v) =>
              middle >= v.at - 0.001 &&
              middle < v.at + (v.out - v.in) / (v.speed ?? 1),
          );
        return v
          ? [v.src, round(v.in + (middle - v.at) * (v.speed ?? 1))]
          : null;
      }),
    };
  }
  return {
    kind: c.kind ?? 'sound',
    text: c.props?.text,
    asset: c.asset,
    event: c.sound_sfx?.event,
  };
}
function replayManual(edl, stored) {
  const { _anchor, ...op } = structuredClone(stored);
  if (op.clip_id && _anchor) {
    const same = (c) =>
      JSON.stringify(contentAnchor(edl, c)) === JSON.stringify(_anchor);
    const candidates = [
      ...edl.video.flatMap((t) => t.clips),
      ...edl.overlays,
      ...edl.audio.flatMap((t) => t.clips),
    ];
    const c =
      candidates.find((c) => c.id === op.clip_id && same(c)) ??
      candidates.find(same);
    if (!c) fail(`manual ${op.type} skipped: its source content changed`);
    op.clip_id = c.id;
  } else if (op.clip_id)
    fail(`manual ${op.type} skipped: older edit has no source anchor`);
  manual(edl, op);
}
function applyCaptionSettings(edl) {
  for (const o of edl.overlays.filter((o) => o.kind === 'caption_word_group'))
    if (edl.studio?.accent && edl.studio.accent !== 'template')
      o.props.accent_color = ACCENTS[edl.studio.accent];
}
export function applyStoredStudio(edl, previous) {
  edl.studio = structuredClone(previous?.studio ?? edl.studio ?? {});
  edl.studio.warnings = [];
  for (const op of edl.studio.overrides ?? [])
    try {
      replayManual(edl, op);
    } catch (error) {
      (edl.studio.warnings ??= []).push(error.message);
    }
  if (edl.studio.levels && edl.sound) edl.sound.mix_gains = edl.studio.levels;
  applyCaptionSettings(edl);
  return edl;
}
function manual(edl, p) {
  const c = p.clip_id ? find(edl, p.clip_id) : null;
  if (p.type === 'track') {
    shape(p, ['type', 'track', 'muted', 'solo', 'hidden']);
    if (
      !TRACKS.includes(p.track) ||
      ['muted', 'solo', 'hidden'].some(
        (k) => p[k] !== undefined && typeof p[k] !== 'boolean',
      )
    )
      fail('invalid track state');
    edl.studio ??= {};
    edl.studio.tracks ??= {};
    edl.studio.tracks[p.track] = {
      ...edl.studio.tracks[p.track],
      ...Object.fromEntries(
        ['muted', 'solo', 'hidden']
          .filter((k) => p[k] !== undefined)
          .map((k) => [k, p[k]]),
      ),
    };
    return;
  }
  if (p.type === 'restore') {
    shape(p, ['type', 'index', 'segment']);
    const r = p.segment ?? edl.cut_plan?.removed?.[p.index];
    if (!r || !(r.out > r.in)) fail('unknown removed segment');
    const sourcePath = edl.creator_clips
        ?.find((c) => c.src === r.src)
        ?.file.path.replaceAll('\\', '/'),
      source = edl.sources.find((s) => s.path === sourcePath);
    if (!source) fail('removed source unavailable');
    const lane = edl.video[0],
      fps = rate(edl.canvas.fps),
      tolerance = 1 / fps + 0.001,
      prev = lane.clips.find(
        (c) => c.src === source.id && Math.abs(c.out - r.in) <= tolerance,
      ),
      next = lane.clips.find(
        (c) => c.src === source.id && Math.abs(c.in - r.out) <= tolerance,
      ),
      endOf = (c) => c.at + (c.out - c.in) / (c.speed ?? 1);
    if (
      (!prev && r.in > tolerance) ||
      (!next && Math.abs(r.out - source.duration) > tolerance) ||
      (prev && next && Math.abs(endOf(prev) - next.at) > 0.001)
    )
      fail('removed segment is no longer adjacent to its source footage');
    const start = prev?.out ?? 0,
      end = next?.in ?? source.duration,
      at = next?.at ?? endOf(prev),
      d = Math.round((end - start) * fps) / fps,
      total = duration(edl);
    if (d < 1 / fps || Math.abs(start + d - end) > 0.001)
      fail('removed segment has no complete source frames');
    for (const t of [...edl.video, ...edl.audio])
      for (const c of t.clips) {
        if (t.role === 'MUSIC' && c.at === 0 && c.dur >= total - 0.001)
          c.dur += d;
        else if (c.at >= at - 0.001) c.at += d;
      }
    for (const o of edl.overlays) {
      const crosses = o.at < at - 0.001 && o.at + o.dur > at + 0.001;
      if (o.at >= at - 0.001) o.at += d;
      else if (crosses) o.dur += d;
      for (const w of o.props?.words ?? [])
        for (const key of ['at', 'until', 'start', 'end'])
          if (w[key] >= at - 0.001) w[key] += d;
    }
    for (const k of edl.cut_plan.keep) if (k.at >= at - 0.001) k.at += d;
    const id = `restored-${source.id}-${Math.round(r.in * 1000)}`;
    if (find(edl, id)) fail('already restored');
    lane.clips.push({
      id,
      src: source.id,
      in: start,
      out: end,
      at,
      speed: 1,
      fit: 'cover',
      camera: [{ t: 0, x: 0.5, y: 0.5, zoom: 1, ease: 'hold' }],
      camera_by: 'user',
    });
    lane.clips.sort((a, b) => a.at - b.at);
    const voice = edl.audio.find((t) => t.role === 'VOICE');
    if (voice && source.audio)
      voice.clips.push({
        id: id + ':audio',
        linked: id,
        src: source.id,
        in: start,
        out: end,
        at,
        speed: 1,
      });
    edl.cut_plan.removed = edl.cut_plan.removed.filter(
      (x) => x.src !== r.src || x.in !== r.in || x.out !== r.out,
    );
    p.segment = structuredClone(r);
    return;
  }
  if (!c) fail('unknown clip');
  if (p.type === 'camera') {
    shape(p, ['type', 'clip_id', 'index', 'time', 'framing']);
    if (
      !Array.isArray(c.camera) ||
      !Number.isInteger(p.index) ||
      !c.camera[p.index]
    )
      fail('unknown keyframe');
    const key = c.camera[p.index],
      end = (c.out - c.in) / (c.speed ?? 1);
    if (p.time !== undefined) {
      if (!finite(p.time, 0, Math.max(0, end - 1 / rate(edl.canvas.fps))))
        fail('keyframe outside clip');
      key.t = Math.round(p.time * rate(edl.canvas.fps)) / rate(edl.canvas.fps);
    }
    if (p.framing !== undefined) {
      if (!['wide', 'medium', 'tight'].includes(p.framing))
        fail('unknown framing');
      const source = edl.sources.find((s) => s.id === c.src),
        geom = coverGeometry(source, edl.canvas, c.fit);
      Object.assign(
        key,
        frameFor(
          p.framing,
          headAt(edl.camera_plan?.heads?.[source.path], c.in + key.t),
          geom,
          { cap: zoomCap(geom, edl.canvas) },
        ),
      );
    }
    c.camera.sort((a, b) => a.t - b.t);
    c.camera = c.camera.filter((k, i, a) => !i || k.t !== a[i - 1].t);
    c.camera_by = 'user';
    return;
  }
  if (p.type === 'caption') {
    shape(p, ['type', 'clip_id', 'text', 'style', 'word', 'accent']);
    if (c.kind !== 'caption_word_group') fail('not a caption');
    if (p.text !== undefined) {
      if (typeof p.text !== 'string' || !p.text.trim() || p.text.length > 300)
        fail('invalid caption text');
      const changed = applyEdits(edl, [
        { tool: 'edit_caption', args: { clip_id: c.id, text: p.text } },
      ]);
      Object.assign(
        c,
        changed.overlays.find((o) => o.id === c.id),
      );
    }
    if (p.style !== undefined) {
      if (!captionStyles().has(p.style)) fail('unknown caption style');
      c.props.style = p.style;
      const placed = placeChunks(
        [
          {
            start: c.at,
            end: c.at + c.dur,
            words: c.props.words,
            lines: c.props.lines,
          },
        ],
        captionStyle(p.style),
        { edl, ctx: edl.camera_plan },
      );
      c.props.place = placed[0].place;
    }
    if (p.word !== undefined) {
      if (
        !Number.isInteger(p.word) ||
        !c.props.words[p.word] ||
        typeof p.accent !== 'boolean'
      )
        fail('unknown caption word');
      c.props.words[p.word].accent = p.accent;
    }
    c.props.edited = true;
    return;
  }
  if (p.type === 'block') {
    shape(p, ['type', 'clip_id', 'action', 'at']);
    if (!['move', 'delete', 'duplicate'].includes(p.action))
      fail('unknown block action');
    if (p.action === 'move') {
      if (
        !finite(
          p.at,
          0,
          Math.max(
            0,
            duration(edl) - (c.dur ?? (c.out - c.in) / (c.speed ?? 1)),
          ),
        )
      )
        fail('block outside edit');
      const changed = applyEdits(edl, [
        { tool: 'move_clip', args: { clip_id: c.id, start: p.at } },
      ]);
      Object.assign(edl, changed);
    }
    if (p.action === 'delete')
      Object.assign(
        edl,
        applyEdits(edl, [{ tool: 'delete_clip', args: { clip_id: c.id } }]),
      );
    if (p.action === 'duplicate') {
      const total = duration(edl),
        copy = structuredClone(c);
      let n = 2;
      while (find(edl, `${c.id}-copy${n}`)) n++;
      copy.id = `${c.id}-copy${n}`;
      copy.at = Math.min(
        Math.max(0, total - (c.dur ?? (c.out - c.in) / (c.speed ?? 1))),
        c.at + 0.25,
      );
      if (edl.overlays.includes(c)) edl.overlays.push(copy);
      else {
        const t = edl.audio.find((t) => t.clips.includes(c));
        if (!t || t.role === 'VOICE')
          fail('only graphics and sound blocks can duplicate');
        edl.audio.push({
          track: copy.id,
          name: t.name,
          role: t.role,
          clips: [copy],
        });
      }
    }
    return;
  }
  fail('unknown manual patch');
}
export function applyStudioPatch(original, input) {
  let edl = structuredClone(original);
  if (!edl.creator_plan)
    fail('re-run this older edit to enable creator controls');
  const p = structuredClone(input);
  edl.studio ??= {};
  if (['track', 'camera', 'caption', 'block', 'restore'].includes(p?.type)) {
    const anchor =
      p.clip_id && find(edl, p.clip_id)
        ? contentAnchor(edl, find(edl, p.clip_id))
        : null;
    manual(edl, p);
    if (anchor) p._anchor = anchor;
    edl.studio.overrides = [...(edl.studio.overrides ?? []), p].slice(-200);
  } else if (p?.type === 'look') {
    shape(p, ['type', 'look', 'strength', 'grain', 'vignette', 'sharpen']);
    edl = changeColor(edl, p);
    edl.creator_plan.look = { id: p.look, strength: p.strength };
  } else if (p?.type === 'levels') {
    shape(p, ['type', 'voice', 'music', 'sfx']);
    for (const k of ['voice', 'music', 'sfx'])
      if (!finite(p[k], -60, 6)) fail('level must be -60 to +6 dB');
    edl.sound.mix_gains = { voice: p.voice, music: p.music, sfx: p.sfx };
    edl.studio.levels = edl.sound.mix_gains;
  } else if (p?.type === 'edit') {
    shape(p, ['type', 'energy', 'pause']);
    const context = structuredClone(edl.creator_context),
      plan = structuredClone(edl.creator_plan);
    if (p.energy !== undefined) {
      if (!Number.isInteger(p.energy) || !finite(p.energy, 1, 5))
        fail('energy must be 1–5');
      plan.camera.energy = p.energy;
      context.template.cut.max_pause = Math.max(
        0.05,
        Math.min(1, (context.template.cut.max_pause * 3) / p.energy),
      );
    }
    if (p.pause !== undefined) {
      if (!finite(p.pause, 0.05, 1)) fail('pause must be 0.05–1 seconds');
      context.template.cut.max_pause = p.pause;
    }
    edl = compile(edl, plan, context);
  } else if (p?.type === 'template') {
    shape(p, ['type', 'id']);
    const context = { ...edl.creator_context, template: getTemplate(p.id) },
      plan = {
        ...defaultPlan(context),
        story: edl.creator_plan.story,
        title_pack: edl.creator_plan.title_pack,
      };
    edl = compile(edl, plan, context);
  } else if (p?.type === 'captions') {
    shape(p, ['type', 'style', 'size', 'position', 'accent']);
    const patches = [];
    for (const [k, path] of [
      ['style', 'style'],
      ['size', 'font_scale'],
      ['position', 'position'],
    ])
      if (p[k] !== undefined)
        patches.push({ op: 'replace', path: `/captions/${path}`, value: p[k] });
    if (p.accent !== undefined) {
      if (!Object.hasOwn(ACCENTS, p.accent)) fail('unknown accent');
      edl.studio.accent = p.accent;
    }
    edl = compile(
      edl,
      applyPlanPatches(edl.creator_plan, patches, edl.creator_context),
    );
  } else if (p?.type === 'music') {
    shape(p, ['type', 'enabled', 'track']);
    const patches = [];
    if (p.enabled !== undefined) {
      if (typeof p.enabled !== 'boolean') fail('invalid music switch');
      patches.push({ op: 'replace', path: '/music/enabled', value: p.enabled });
    }
    if (p.track !== undefined) {
      if (!libraries().music.some((m) => m.id === p.track))
        fail('unknown track');
      patches.push({ op: 'replace', path: '/music/track', value: p.track });
    }
    edl = compile(
      edl,
      applyPlanPatches(edl.creator_plan, patches, edl.creator_context),
    );
  } else fail('unknown patch type');
  edl.creator_settings = {
    template: edl.creator_plan.template,
    energy: edl.creator_plan.camera.energy,
    pause: edl.creator_context.template.cut.max_pause,
    captions: edl.creator_plan.captions,
    music: edl.creator_plan.music,
    levels: edl.studio.levels ?? { voice: 0, music: 0, sfx: 0 },
    accent: edl.studio.accent ?? 'template',
  };
  if (edl.captions)
    edl.captions.stats = captionStats(
      edl.overlays,
      captionStyle(edl.captions.style),
      edl.canvas,
      rate(edl.canvas.fps),
    );
  return validate(edl);
}
export function studioHistory(current, previous, command) {
  const history = structuredClone(
    previous ?? { entries: [current], cursor: 0 },
  );
  if (command.type === 'undo' || command.type === 'redo') {
    shape(command, ['type']);
    const cursor = history.cursor + (command.type === 'undo' ? -1 : 1);
    if (cursor < 0 || cursor >= history.entries.length)
      fail('no history in that direction');
    history.cursor = cursor;
    return { edl: structuredClone(history.entries[cursor]), history };
  }
  const edl = applyStudioPatch(current, command);
  history.entries = history.entries.slice(0, history.cursor + 1);
  history.entries.push(edl);
  if (history.entries.length > 20) history.entries.shift();
  history.cursor = history.entries.length - 1;
  return { edl, history };
}
