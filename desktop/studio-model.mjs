// Shared by the renderer and IPC. No filesystem, network or renderer graphs.
export const TRACKS = ['V1', 'BROLL', 'GFX', 'CAP', 'VOICE', 'MUSIC', 'SFX'];
export const STAGES = [
  'Listening',
  'Cutting',
  'Directing camera',
  'Captions',
  'Graphics & b-roll',
  'Sound',
  'Colour',
  'Rendering',
  'Reviewing',
  'Done',
];
export const stageForTool = (tool) =>
  /transcrib|diarise/.test(tool)
    ? 0
    : /cut|plan|planner_frames|creator_ai/.test(tool)
      ? 1
      : /camera/.test(tool)
        ? 2
        : /caption/.test(tool)
          ? 3
          : /graphic|broll|explain/.test(tool)
            ? 4
            : /sound|audio|voice|music|remix/.test(tool)
              ? 5
              : /colour|color/.test(tool)
                ? 6
                : /critic|review/.test(tool)
                  ? 8
                  : /delivery|compose|render/.test(tool)
                    ? 7
                    : 1;
export const trackOf = (family, item) =>
  family === 'video'
    ? item.track === 'BROLL'
      ? 'BROLL'
      : 'V1'
    : family === 'overlay'
      ? item.kind === 'caption_word_group'
        ? 'CAP'
        : 'GFX'
      : ['VOICE', 'MUSIC'].includes(item.role)
        ? item.role
        : 'SFX';
export function studioTracks(edl) {
  const tracks = Object.fromEntries(
    TRACKS.map((id) => [
      id,
      { id, clips: [], state: edl?.studio?.tracks?.[id] ?? {} },
    ]),
  );
  for (const t of edl?.video ?? [])
    for (const c of t.clips)
      tracks[trackOf('video', t)].clips.push({
        ...c,
        end: c.at + (c.out - c.in) / (c.speed ?? 1),
        type: 'video',
        label:
          edl.sources
            .find((s) => s.id === c.src)
            ?.path?.split(/[\\/]/)
            .at(-1) ?? c.id,
      });
  for (const o of edl?.overlays ?? [])
    tracks[trackOf('overlay', o)].clips.push({
      ...o,
      end: o.at + o.dur,
      type: 'overlay',
      label: o.props?.text ?? o.props?.title ?? o.props?.element ?? o.id,
    });
  for (const t of edl?.audio ?? [])
    for (const c of t.clips)
      tracks[trackOf('audio', t)].clips.push({
        ...c,
        end: c.at + (c.dur ?? (c.out - c.in) / (c.speed ?? 1)),
        type: 'audio',
        label:
          c.sound_sfx?.id ?? c.asset?.split(/[\\/]/).at(-1) ?? t.name ?? c.id,
      });
  return TRACKS.map((id) => tracks[id]);
}
export function visibleStudioEdl(original) {
  const edl = structuredClone(original),
    states = edl.studio?.tracks ?? {};
  const anyVideoSolo = ['V1', 'BROLL', 'GFX', 'CAP'].some(
      (id) => states[id]?.solo,
    ),
    anyAudioSolo = ['VOICE', 'MUSIC', 'SFX'].some((id) => states[id]?.solo);
  const hidden = (id) =>
      states[id]?.hidden || (anyVideoSolo && !states[id]?.solo),
    muted = (id) => states[id]?.muted || (anyAudioSolo && !states[id]?.solo);
  for (const t of edl.video)
    if (hidden(trackOf('video', t))) for (const c of t.clips) c.opacity = 0;
  edl.overlays = edl.overlays.filter((o) => !hidden(trackOf('overlay', o)));
  const mutedLinks = new Set(
    edl.video
      .filter((t) => states[trackOf('video', t)]?.muted)
      .flatMap((t) => t.clips.map((c) => c.id)),
  );
  for (const t of edl.audio)
    for (const c of t.clips)
      if (muted(trackOf('audio', t)) || mutedLinks.has(c.linked))
        c.gain_db = -120;
  return edl;
}
