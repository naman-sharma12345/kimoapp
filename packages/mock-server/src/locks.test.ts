import { describe, it, expect } from 'vitest';
import { project, clip } from '../../kimo-client/src/samples';
import { filterAgentOps } from './locks';
describe('agent clip locks', () => {
  it('protects locked clips and tracks while allowing other agent work', () => {
    const locked = {
      ...project,
      clips: { clip: { ...clip, locked: true } },
    };
    expect(
      filterAgentOps(locked, [
        { op: 'clip.remove', id: 'clip' },
        { op: 'clip.update', id: 'clip', patch: { duration: 1 } },
        { op: 'track.update', id: 'video', patch: { name: 'renamed' } },
      ]),
    ).toEqual([
      { op: 'track.update', id: 'video', patch: { name: 'renamed' } },
    ]);
    const trackLocked = {
      ...project,
      tracks: project.tracks.map((track) => ({ ...track, locked: true })),
    };
    expect(
      filterAgentOps(trackLocked, [
        { op: 'clip.remove', id: 'clip' },
        { op: 'track.remove', id: 'video' },
      ]),
    ).toEqual([]);
  });
});
