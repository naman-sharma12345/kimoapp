import { describe, expect, it } from 'vitest';
import { applyOps } from '@kimo/client';
import { project } from '../../../../packages/kimo-client/src/samples';
import { inverseOps } from '../components/studio/edit-history';

describe('user edit history', () => {
  it('undoes a trim and lock without undoing a later agent edit', () => {
    const edits = [
      {
        op: 'clip.update' as const,
        id: 'clip',
        patch: { duration: 4, locked: true },
      },
    ];
    const inverse = inverseOps(project, edits);
    const edited = applyOps(project, edits);
    const agent = applyOps(edited, [
      { op: 'track.update', id: 'video', patch: { name: 'new agent name' } },
    ]);
    const undone = applyOps(agent, inverse);
    expect(undone.clips.clip?.duration).toBe(8);
    expect(undone.clips.clip?.locked).toBe(false);
    expect(undone.tracks[0]?.name).toBe('new agent name');
  });
  it('undoes a split and restores the original timing', () => {
    const edits = [
      { op: 'clip.split' as const, id: 'clip', at: 3, newId: 'second' },
    ];
    const undone = applyOps(
      applyOps(project, edits),
      inverseOps(project, edits),
    );
    expect(undone.clips.clip?.duration).toBe(8);
    expect(undone.clips.second).toBeUndefined();
  });
});
