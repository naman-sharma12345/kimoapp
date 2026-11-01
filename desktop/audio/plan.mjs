import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';
import { beatGrid, speechIntervals } from './music.mjs';
import { hash, planSfx } from './sfx.mjs';
import { frameCount, rate } from '../edl.mjs';

const root = fileURLToPath(new URL('../', import.meta.url));
const asset = (path) =>
  join(root, path).replace(/app\.asar([\\/])/, 'app.asar.unpacked$1');
let catalogs;
export function libraries() {
  return (catalogs ??= {
    music: JSON.parse(readFileSync(join(root, 'data/music.json'), 'utf8')),
    sfx: JSON.parse(readFileSync(join(root, 'data/sfx.json'), 'utf8')),
  });
}
/** The black-box planner does not own imported music; keep it across follow-ups. */
export function retainUserMusic(edl, previous) {
  const tracks = previous?.audio?.filter((t) => t.track === 'user-music') ?? [];
  if (!tracks.length || edl.audio.some((t) => t.track === 'user-music'))
    return edl;
  const duration = frameCount({ ...edl, audio: [] }) / rate(edl.canvas.fps);
  if (previous.sound?.beat_grid)
    edl.sound = {
      ...edl.sound,
      beat_grid: previous.sound.beat_grid,
      beat_grid_estimated: previous.sound.beat_grid_estimated,
    };
  edl.audio = edl.audio.filter((t) => t.role !== 'MUSIC');
  for (const track of structuredClone(tracks)) {
    for (const c of track.clips) {
      const source = previous.sources.find((s) => s.id === c.src);
      if (source && !edl.sources.some((s) => s.id === source.id))
        edl.sources.push(structuredClone(source));
      c.dur = Math.max(0, duration - c.at);
    }
    track.clips = track.clips.filter((c) => c.dur > 0);
    edl.audio.push(track);
  }
  return edl;
}
export function chooseMusic(
  tracks,
  { template = '', tone = '', seed = '', mood: requestedMood, track } = {},
) {
  const text =
    `${template} ${typeof tone === 'string' ? tone : JSON.stringify(tone)}`.toLowerCase();
  const mood = /documentary|serious|reflective/.test(text)
    ? 'documentary'
    : /cinematic|emotional/.test(text)
      ? 'cinematic'
      : /hype|gaming|energetic|fast/.test(text)
        ? 'energetic'
        : /calm|podcast/.test(text)
          ? 'calm'
          : /tutorial|explain|curious/.test(text)
            ? 'curious'
            : /vlog|playful|funny/.test(text)
              ? 'playful'
              : /upbeat|shorts/.test(text)
                ? 'upbeat'
                : 'warm';
  if(track&&track!=='auto'&&tracks.some(t=>t.id===track))return tracks.find(t=>t.id===track);
  const matching = tracks.filter((t) => t.mood === ({'chill-lofi':'calm',tech:'curious'}[requestedMood]??requestedMood??mood));
  return (matching.length ? matching : tracks)[
    hash(seed) % Math.max(1, matching.length || tracks.length)
  ];
}
/** Safe boundary adjustment: preserve picture duration and linked audio, reject missing handles. */
export function snapCuts(edl, grid, { musicLed = false, sections = [] } = {}) {
  const changes = [],
    fps = rate(edl.canvas.fps),
    words = speechIntervals(edl);
  const clips = edl.video[0]?.clips ?? [];
  for (let i = 1; i < clips.length; i++) {
    const a = clips[i - 1],
      b = clips[i],
      at = b.at;
    if (
      Math.abs(a.at + (a.out - a.in) / (a.speed ?? 1) - at) > 1 / fps ||
      a.ramp ||
      b.ramp
    )
      continue;
    const section = sections.some((t) => Math.abs(t - at) < 0.15);
    if (!musicLed && !section) continue;
    const limit = musicLed ? 0.06 : 0.12;
    const candidates = grid
      .filter((x) => musicLed || x.downbeat)
      .filter((x) => Math.abs(x.t - at) <= limit)
      .sort((x, y) => Math.abs(x.t - at) - Math.abs(y.t - at));
    if (!candidates.length) continue;
    const target = Math.round(candidates[0].t * fps) / fps,
      delta = target - at;
    if (Math.abs(delta) > limit || Math.abs(delta) < 1e-6) continue;
    // Talking edits move only in a pause. A beat never takes a spoken syllable.
    if (
      !musicLed &&
      words.some(
        ([x, y]) =>
          x < Math.max(at, target) + 0.06 && y > Math.min(at, target) - 0.06,
      )
    )
      continue;
    const aOut = a.out + delta * (a.speed ?? 1),
      bIn = b.in + delta * (b.speed ?? 1),
      source = edl.sources.find((s) => s.id === a.src);
    if (
      aOut <= a.in + 0.2 ||
      bIn < 0 ||
      bIn >= b.out - 0.2 ||
      !source?.duration ||
      aOut > source.duration
    )
      continue;
    const linked = edl.audio
      .flatMap((t) => t.clips)
      .filter((c) => c.linked === a.id || c.linked === b.id);
    if (linked.some((c) => c.fade_in > 0.01 || c.fade_out > 0.01)) continue; // preserve J/L audio handles
    a.out = aOut;
    b.at = target;
    b.in = bIn;
    if (a.dur != null) a.dur = (a.out - a.in) / (a.speed ?? 1);
    if (b.dur != null) b.dur = (b.out - b.in) / (b.speed ?? 1);
    for (const c of linked) {
      if (c.linked === a.id) {
        c.out = aOut;
        c.dur = (aOut - c.in) / (c.speed ?? 1);
      } else {
        c.at = target;
        c.in = bIn;
        c.dur = (c.out - bIn) / (c.speed ?? 1);
      }
    }
    changes.push({ clip: b.id, from: at, to: target });
  }
  return changes;
}
export function planSound(
  edl,
  { template = 'clean', tone = '', note = '', ctx = {}, enabled = true, music: musicChoice={}, settings={}, events: requestedEvents=[] } = {},
) {
  if (!enabled) return edl;
  const duration = frameCount(edl) / rate(edl.canvas.fps),
    previous = edl.sound ?? {},
    library = libraries();
  edl.audio = edl.audio.filter((t) => !t.sound_auto);
  const hasMusic = edl.audio.some((t) => t.role === 'MUSIC' && t.clips.length);
  const existingMusicId = edl.audio.find(
    (t) => t.role === 'MUSIC' && t.clips.length,
  )?.clips[0]?.src;
  const noMusic =
    /\b(no|without|remove|disable)\s+(background\s+)?music\b/i.test(note);
  if (noMusic) edl.audio = edl.audio.filter((t) => t.role !== 'MUSIC');
  const music =
    noMusic || hasMusic
      ? null
      : chooseMusic(library.music, {
          template,
          tone,
          seed: edl.video[0]?.clips[0]?.src ?? '',
          mood:musicChoice.mood,track:musicChoice.track,
        });
  const grid = music
    ? beatGrid(music, duration)
    : noMusic
      ? []
      : (previous.beat_grid ?? []);
  edl.camera_plan ??= ctx;
  const speech = speechIntervals({ ...edl, sound: undefined });
  edl.sound = {
    version: 8,
    enabled: true,
    template,
    target_lufs: /podcast/.test(template) ? -16 : -14,
    studio: /documentary|cinematic/.test(template),
    hook: /hook|full bed/i.test(note),
    music_id: noMusic ? null : (music?.id ?? existingMusicId ?? null),
    beat_grid: grid,
    speech,
    music_envelope:{under_db:settings.music_under_db??-16,gap_db:settings.music_gap_db??-9,ramp_s:settings.envelope_ramp_s??.25},
    cut_snaps: previous.cut_snaps ?? [],
  };
  if (music)
    edl.audio.push({
      track: 'sound-music',
      name: 'MUSIC',
      role: 'MUSIC',
      sound_auto: true,
      clips: [
        {
          id: 'sound-music-bed',
          asset: asset(music.path),
          at: 0,
          in: 0,
          out: music.duration,
          dur: duration,
          speed: 1,
          sound_music: music,
        },
      ],
    });
  // Keep an empty MUSIC lane available for the user's file.
  if (!edl.audio.some((t) => t.role === 'MUSIC'))
    edl.audio.push({
      track: 'sound-music',
      name: 'MUSIC',
      role: 'MUSIC',
      sound_auto: true,
      clips: [],
    });
  const events = [...requestedEvents];
  for (const t of edl.video)
    for (const c of t.clips) {
      if (c.transition_in && /whip|zoom/.test(c.transition_in.kind))
        events.push({
          id: `transition:${c.id}`,
          at: c.at,
          kind: c.transition_in.kind,
          direction: c.transition_in.direction ?? 'right',
        });
      else if (c.at > 0) {
        const path = edl.sources
          .find((s) => s.id === c.src)
          ?.path?.replaceAll('\\', '/');
        const chapter = (ctx.chapters ?? []).some(
          (ch) =>
            String(ch.path).replaceAll('\\', '/') === path &&
            Math.abs(ch.t - c.in) < 0.2,
        );
        if (chapter)
          events.push({ id: `section:${c.id}`, at: c.at, kind: 'section' });
      }
      if (c.freeze)
        events.push({ id: `freeze:${c.id}`, at: c.at, kind: 'freeze' });
    }
  for (const p of edl.cut_plan?.screen_punch ?? [])
    if (Number.isFinite(p.at))
      events.push({ id: `screen:${p.clip_id}`, at: p.at, kind: 'screen' });
  for (const o of edl.overlays)
    if (o.kind === 'graphic' && !o.props?.explain)
      events.push({ id: `graphic:${o.id}`, at: o.at, kind: 'graphic' });
  for (const beat of edl.explain?.placed ?? [])
    if (beat.major_reveal || beat.reveal)
      events.push({ id: `reveal:${beat.id}`, at: beat.at, kind: 'reveal' });
  const existing = edl.audio
    .filter((t) => t.role === 'SFX')
    .flatMap((t) => t.clips);
  const effects = planSfx(events, library.sfx, {
    fps: rate(edl.canvas.fps),
    duration,
    template,
    cap:settings.sfx_per_min,
  }).filter(
    (e) => e.mandatory || !existing.some((c) => Math.abs(c.at - e.at) < 0.5),
  );
  edl.audio.push({
    track: 'sound-sfx',
    name: 'SFX',
    role: 'SFX',
    sound_auto: true,
    clips: effects.map((e, i) => ({
      id: `sound-sfx-${i}`,
      asset: asset(e.path),
      at: e.at,
      in: 0,
      out: e.dur,
      dur: e.dur,
      speed: 1,
      sound_sfx: { id: e.id, peak_db: e.peak_db, pan: e.pan, event: e.event },
    })),
  });
  edl.sound.sfx_count = effects.length;
  return edl;
}
