import { applyOps, type KimoProject, type Op } from '@kimo/client';

/** Build an inverse for a single user-authored group, without reverting agent work. */
export function inverseOps(project: KimoProject, ops: Op[]): Op[] {
  let state = project;
  const inverse: Op[] = [];
  for (const op of ops) {
    const id = 'id' in op ? op.id : 'clipId' in op ? op.clipId : undefined;
    const clip = id ? state.clips[id] : undefined;
    let undo: Op[] = [];
    if (op.op === 'clip.add') undo = [{ op: 'clip.remove', id: op.clip.id }];
    else if (op.op === 'clip.remove' && clip) undo = [{ op: 'clip.add', clip }];
    else if (op.op === 'clip.split' && clip)
      undo = [
        { op: 'clip.remove', id: op.newId },
        { op: 'clip.update', id: clip.id, patch: { duration: clip.duration } },
      ];
    else if (
      (op.op === 'clip.update' ||
        op.op === 'clip.move' ||
        op.op === 'clip.trim') &&
      clip
    ) {
      const keys =
        op.op === 'clip.update'
          ? Object.keys(op.patch)
          : op.op === 'clip.move'
            ? ['start', 'trackId']
            : ['start', 'duration', 'in'];
      const patch = Object.fromEntries(
        keys.map((key) => [
          key,
          key === 'locked'
            ? Boolean(clip.locked)
            : clip[key as keyof typeof clip],
        ]),
      );
      undo = [{ op: 'clip.update', id: clip.id, patch }];
    } else if (op.op === 'text.update' && clip?.text)
      undo = [
        { op: 'text.update', clipId: clip.id, content: clip.text.content },
      ];
    else if (op.op === 'track.update') {
      const track = state.tracks.find((item) => item.id === op.id);
      if (track)
        undo = [
          {
            op: 'track.update',
            id: op.id,
            patch: Object.fromEntries(
              Object.keys(op.patch).map((key) => [
                key,
                track[key as keyof typeof track],
              ]),
            ),
          },
        ];
    }
    inverse.unshift(...undo);
    state = applyOps(state, [op]);
  }
  return inverse;
}
