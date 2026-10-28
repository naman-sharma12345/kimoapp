import {
  projectSchema,
  clipSchema,
  type Clip,
  type KimoProject,
  type Op,
} from './schema.ts';

/** Atomic: an invalid batch throws without modifying the caller's project. */
export function applyOps(
  current: KimoProject,
  ops: readonly Op[],
  version = current.version + 1,
): KimoProject {
  const project = structuredClone(current);
  const clip = (id: string): Clip => {
    const found = project.clips[id];
    if (!found) throw new Error(`Unknown clip: ${id}`);
    return found;
  };
  for (const op of ops) {
    switch (op.op) {
      case 'project.update':
        Object.assign(project, op.patch);
        break;
      case 'track.remove':
        project.tracks = project.tracks.filter((track) => track.id !== op.id);
        project.clips = Object.fromEntries(
          Object.entries(project.clips).filter(
            ([, clip]) => clip.trackId !== op.id,
          ),
        );
        break;
      case 'clip.unset': {
        const item = clip(op.id);
        project.clips[op.id] = clipSchema.parse(
          Object.fromEntries(
            Object.entries(item).filter(
              ([key]) => !op.fields.some((field) => field === key),
            ),
          ),
        );
        break;
      }
      case 'clip.add':
        if (project.clips[op.clip.id]) throw new Error('Duplicate clip ID');
        project.clips[op.clip.id] = structuredClone(op.clip);
        break;
      case 'clip.update':
        Object.assign(clip(op.id), structuredClone(op.patch));
        break;
      case 'clip.remove':
        clip(op.id);
        project.clips = Object.fromEntries(
          Object.entries(project.clips).filter(([id]) => id !== op.id),
        );
        break;
      case 'clip.move':
        Object.assign(clip(op.id), { trackId: op.trackId, start: op.start });
        break;
      case 'clip.trim': {
        const item = clip(op.id);
        if (op.edge === 'in') {
          const delta = (op.value - item.in) / item.speed;
          item.start += delta;
          item.duration -= delta;
          item.in = op.value;
        } else item.duration = (op.value - item.in) / item.speed;
        break;
      }
      case 'clip.split': {
        const item = clip(op.id);
        if (
          project.clips[op.newId] ||
          op.at <= item.start ||
          op.at >= item.start + item.duration
        )
          throw new Error('Invalid split');
        const elapsed = op.at - item.start;
        project.clips[op.newId] = {
          ...structuredClone(item),
          id: op.newId,
          start: op.at,
          in: item.in + elapsed * item.speed,
          duration: item.duration - elapsed,
        };
        item.duration = elapsed;
        break;
      }
      case 'track.add':
        if (project.tracks.some((item) => item.id === op.track.id))
          throw new Error('Duplicate track ID');
        project.tracks.push(structuredClone(op.track));
        break;
      case 'track.update': {
        const track = project.tracks.find((item) => item.id === op.id);
        if (!track) throw new Error('Unknown track');
        Object.assign(track, op.patch);
        break;
      }
      case 'text.update': {
        const item = clip(op.clipId);
        if (!item.text) throw new Error('Clip has no text');
        const words = op.content.trim().split(/\s+/).filter(Boolean);
        if (item.text.words?.length && words.length) {
          const previous = item.text.words;
          const start = previous[0]?.t ?? 0;
          const last = previous.at(-1);
          const length = (last ? last.t + last.d : item.duration) - start;
          item.text.words = words.map((w, index) =>
            words.length === previous.length && previous[index]
              ? { ...previous[index], w }
              : {
                  w,
                  t: start + (index * length) / words.length,
                  d: Math.max(1 / 1000, length / words.length),
                },
          );
        } else if (!words.length) item.text.words = undefined;
        item.text.content = op.content;
        break;
      }
      case 'effect.set': {
        const item = clip(op.clipId);
        item.effects = [
          ...item.effects.filter((effect) => effect.id !== op.effect.id),
          structuredClone(op.effect),
        ];
        break;
      }
      case 'keyframe.set': {
        const item = clip(op.clipId);
        item.keyframes = [
          ...item.keyframes.filter((key) => key.id !== op.keyframe.id),
          structuredClone(op.keyframe),
        ];
        break;
      }
      case 'marker.remove':
        project.markers = project.markers.filter(
          (marker) => marker.id !== op.id,
        );
        break;
      case 'marker.add':
        project.markers = [
          ...project.markers.filter((marker) => marker.id !== op.marker.id),
          structuredClone(op.marker),
        ];
        break;
    }
  }
  project.version = version;
  project.duration = Math.max(
    0,
    ...Object.values(project.clips).map((item) => item.start + item.duration),
  );
  return projectSchema.parse(project);
}
