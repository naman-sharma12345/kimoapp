import type { Clip, KimoProject } from '@kimo/client';

export interface SceneLayer {
  clip: Clip;
  sourceTime: number;
  localTime: number;
  x: number;
  y: number;
  scale: number;
  rotation: number;
  opacity: number;
  transition: number;
  transitionOut: number;
}

const clamp = (value: number, low: number, high: number) =>
  Math.max(low, Math.min(high, value));
function ease(
  value: number,
  easing: Clip['keyframes'][number]['easing'],
  out?: [number, number],
  incoming?: [number, number],
) {
  if (easing === 'hold') return 0;
  if (easing === 'bezier') {
    const a = out ?? [1 / 3, 1 / 3];
    const b = incoming ?? [2 / 3, 2 / 3];
    const cubic = (t: number, p: number, q: number) =>
      3 * (1 - t) ** 2 * t * p + 3 * (1 - t) * t ** 2 * q + t ** 3;
    let low = 0;
    let high = 1;
    for (let i = 0; i < 20; i++) {
      const middle = (low + high) / 2;
      if (cubic(middle, a[0], b[0]) < value) low = middle;
      else high = middle;
    }
    return cubic((low + high) / 2, a[1], b[1]);
  }
  if (easing === 'ease-in') return value ** 3;
  if (easing === 'ease-out') return 1 - (1 - value) ** 3;
  if (easing === 'ease-in-out')
    return value < 0.5 ? 4 * value ** 3 : 1 - (-2 * value + 2) ** 3 / 2;
  return value;
}

export function interpolate(
  clip: Clip,
  property: string,
  time: number,
  fallback: number,
): number {
  const points = clip.keyframes
    .filter(
      (item) =>
        item.property === property || item.property === `transform.${property}`,
    )
    .toSorted((a, b) => a.time - b.time);
  if (!points.length) return fallback;
  const first = points[0];
  if (!first) return fallback;
  if (time <= first.time) return first.value;
  const last = points.at(-1);
  if (!last || time >= last.time) return last?.value ?? fallback;
  for (let i = 1; i < points.length; i++) {
    const before = points[i - 1];
    const after = points[i];
    if (before && after && time <= after.time) {
      if (time === after.time) return after.value;
      const fraction = ease(
        clamp((time - before.time) / (after.time - before.time), 0, 1),
        before.easing,
        before.out,
        after.in,
      );
      return before.value + (after.value - before.value) * fraction;
    }
  }
  return fallback;
}

export function buildScene(project: KimoProject, time: number): SceneLayer[] {
  const order = new Map(
    project.tracks.map((track, index) => [track.id, index]),
  );
  const visible = new Set(
    project.tracks.filter((track) => !track.hidden).map((track) => track.id),
  );
  return Object.values(project.clips)
    .filter(
      (clip) =>
        clip.kind !== 'audio' &&
        visible.has(clip.trackId) &&
        time >= clip.start &&
        time < clip.start + clip.duration,
    )
    .sort(
      (a, b) =>
        (order.get(a.trackId) ?? 0) - (order.get(b.trackId) ?? 0) ||
        a.start - b.start ||
        a.id.localeCompare(b.id),
    )
    .map((clip) => {
      const localTime = time - clip.start;
      const transition = clip.transitionIn
        ? clamp(localTime / clip.transitionIn.duration, 0, 1)
        : 1;
      const transitionOut = clip.transitionOut
        ? clamp((clip.duration - localTime) / clip.transitionOut.duration, 0, 1)
        : 1;
      const opacity = interpolate(
        clip,
        'opacity',
        localTime,
        clip.transform.opacity,
      );
      return {
        clip,
        localTime,
        sourceTime: clip.in + localTime * clip.speed,
        x: interpolate(clip, 'x', localTime, clip.transform.x),
        y: interpolate(clip, 'y', localTime, clip.transform.y),
        scale: interpolate(clip, 'scale', localTime, clip.transform.scale),
        rotation: interpolate(
          clip,
          'rotation',
          localTime,
          clip.transform.rotation,
        ),
        opacity: clamp(opacity, 0, 1),
        transition,
        transitionOut,
      };
    });
}
