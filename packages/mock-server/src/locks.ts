import type { KimoProject, Op } from '@kimo/client';
export function filterAgentOps(project: KimoProject, ops: Op[]): Op[] {
  return ops.filter((op) => {
    const id =
      'clipId' in op
        ? op.clipId
        : 'id' in op && op.op.startsWith('clip.')
          ? op.id
          : undefined;
    const clip = id
      ? project.clips[id]
      : op.op === 'clip.add'
        ? op.clip
        : undefined;
    if (
      clip?.locked ||
      project.tracks.find((track) => track.id === clip?.trackId)?.locked
    )
      return false;
    if (
      (op.op === 'track.update' || op.op === 'track.remove') &&
      project.tracks.find((track) => track.id === op.id)?.locked
    )
      return false;
    return true;
  });
}
