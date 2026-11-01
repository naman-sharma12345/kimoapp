/** Stable hash: planning is reproducible and makes no random or AI calls. */
export function hash(value) {
  let h = 2166136261;
  for (const c of String(value)) h = Math.imul(h ^ c.charCodeAt(0), 16777619);
  return h >>> 0;
}
export function planSfx(
  events,
  library,
  { fps = 30, duration, template = 'clean', cap: requestedCap } = {},
) {
  const cap = requestedCap ?? (/podcast|documentary/.test(template)
    ? 4
    : /hype|gaming|energetic/.test(template)
      ? 14
      : 8);
  const gap = 60 / cap,
    result = [],
    last = new Map();
  const eligible = events.filter(
    (e) => !e.caption && !/caption|word/.test(e.kind ?? ''),
  );
  for (const e of eligible.sort((a, b) => a.at - b.at)) {
    if (e.kind === 'section' && hash(e.id) % 100 >= 40) continue;
    const mandatory = /whip|zoom/.test(e.kind);
    if (!mandatory && result.some((r) => Math.abs(r.at - e.at) < gap)) continue;
    const kind = library.some(s=>s.kind===e.kind)?e.kind:/whip|zoom|section/.test(e.kind)
      ? 'whoosh'
      : /reveal/.test(e.kind)
        ? 'impact'
        : /freeze/.test(e.kind)
          ? 'shutter'
          : /screen/.test(e.kind)
            ? 'keyboard'
            : 'pop';
    const candidates = library.filter(
      (s) => s.kind === kind && s.id !== last.get(kind),
    );
    if (!candidates.length) continue;
    const s = candidates[hash(e.id) % candidates.length];
    last.set(kind, s.id);
    const at = Math.max(0, e.at - 2 / fps);
    if (at >= duration) continue;
    result.push({
      ...s,
      at,
      dur: Math.min(s.duration, duration - at),
      pan: e.direction === 'left' ? -0.75 : e.direction === 'right' ? 0.75 : 0,
      event: e.id,
      mandatory,
    });
    if (kind === 'impact' && e.at > 1.1) {
      const risers = library.filter((s) => s.kind === 'riser');
      const r = risers[hash(e.id) % risers.length];
      if (r)
        result.push({
          ...r,
          at: Math.max(0, at - Math.min(2, r.duration)),
          dur: Math.min(2, r.duration),
          pan: 0,
          event: `${e.id}:riser`,
        });
    }
  }
  return result.sort((a, b) => a.at - b.at);
}
export function sfxGain(
  { peak_db = -3 },
  localVoiceDb,
  { onset = false } = {},
) {
  const ceiling = Number.isFinite(localVoiceDb)
    ? localVoiceDb - (onset ? 9 : 7)
    : -32;
  return Math.min(0, ceiling - peak_db);
}
