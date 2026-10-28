import { applyOps, type KimoProject, type Op } from '@kimo/client';

/** Build an inverse for a single user-authored group, without reverting agent work. */
export function inverseOps(project: KimoProject, ops: Op[]): Op[] {
  let state = project;
  const inverse: Op[] = [];
  for (const op of ops) {
    const id = 'id' in op ? op.id : 'clipId' in op ? op.clipId : undefined;
    const clip = id ? state.clips[id] : undefined;
    let undo: Op[] = [];
    if (op.op === 'marker.add') {
      const old = state.markers.find((item) => item.id === op.marker.id);
      undo = old
        ? [{ op: 'marker.add', marker: old }]
        : [{ op: 'marker.remove', id: op.marker.id }];
    } else if (op.op === 'marker.remove') {
      const old = state.markers.find((item) => item.id === op.id);
      if (old) undo = [{ op: 'marker.add', marker: old }];
    } else if (op.op === 'effect.set' && clip)
      undo = [
        {
          op: 'clip.update',
          id: clip.id,
          patch: { effects: structuredClone(clip.effects) },
        },
      ];
    else if (op.op === 'keyframe.set' && clip)
      undo = [
        {
          op: 'clip.update',
          id: clip.id,
          patch: { keyframes: structuredClone(clip.keyframes) },
        },
      ];
    else if (op.op === 'project.update')
      undo = [
        {
          op: 'project.update',
          patch: Object.fromEntries(
            Object.keys(op.patch).map((key) => [
              key,
              state[key as keyof KimoProject] ??
                (key === 'background' ? 'black' : ''),
            ]),
          ),
        },
      ];
    else if (op.op === 'track.add')
      undo = [{ op: 'track.remove', id: op.track.id }];
    else if (op.op === 'track.remove') {
      const track = state.tracks.find((item) => item.id === op.id);
      if (track)
        undo = [
          { op: 'track.add', track },
          ...Object.values(state.clips)
            .filter((item) => item.trackId === op.id)
            .map((clip) => ({ op: 'clip.add' as const, clip })),
        ];
    } else if (op.op === 'clip.add')
      undo = [{ op: 'clip.remove', id: op.clip.id }];
    else if (op.op === 'clip.remove' && clip) undo = [{ op: 'clip.add', clip }];
    else if (op.op === 'clip.split' && clip)
      undo = [
        { op: 'clip.remove', id: op.newId },
        { op: 'clip.update', id: clip.id, patch: { duration: clip.duration } },
      ];
    else if (
      (op.op === 'clip.unset' ||
        op.op === 'clip.update' ||
        op.op === 'clip.move' ||
        op.op === 'clip.trim') &&
      clip
    ) {
      const keys =
        op.op === 'clip.unset'
          ? op.fields
          : op.op === 'clip.update'
            ? Object.keys(op.patch)
            : op.op === 'clip.move'
              ? ['start', 'trackId']
              : ['start', 'duration', 'in'];
      const patch = Object.fromEntries(
        keys.map((key) => [
          key,
          key === 'locked'
            ? Boolean(clip.locked)
            : key === 'transitionIn' || key === 'transitionOut'
              ? (clip[key] ?? null)
              : clip[key as keyof typeof clip],
        ]),
      );
      const optionalKeys = [
        'keepPitch',
        'cropAspectLock',
        'fadeIn',
        'fadeOut',
        'duckUnderVoice',
        'volume',
        'transitionIn',
        'transitionOut',
        'locked',
        'mask',
        'text',
        'assetId',
      ] as const;
      const fields = optionalKeys.filter(
        (key) =>
          keys.includes(key) && key !== 'locked' && clip[key] === undefined,
      );
      undo = [
        { op: 'clip.update', id: clip.id, patch },
        ...(fields.length
          ? [{ op: 'clip.unset' as const, id: clip.id, fields }]
          : []),
      ];
    } else if (op.op === 'text.update' && clip?.text)
      undo = [
        {
          op: 'clip.update',
          id: clip.id,
          patch: { text: structuredClone(clip.text) },
        },
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
