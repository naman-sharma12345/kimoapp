import { describe, it, expect } from 'vitest';
import { applyOps } from './ops';
import { clip, project, track } from './samples';

describe('atomic timeline operations', () => {
  it('adds and removes a clip without mutating the previous project', () => {
    const next = applyOps(project, [
      { op: 'clip.add', clip: { ...clip, id: 'new', start: 8 } },
    ]);
    expect(next.duration).toBe(16);
    expect(next.version).toBe(1);
    expect(project.clips.new).toBeUndefined();
    expect(
      applyOps(next, [{ op: 'clip.remove', id: 'new' }]).clips.new,
    ).toBeUndefined();
  });
  it('splits at timeline time with speed-aware source offsets', () => {
    const fast = { ...project, clips: { clip: { ...clip, speed: 2 } } };
    const next = applyOps(fast, [
      { op: 'clip.split', id: 'clip', at: 3, newId: 'tail' },
    ]);
    expect(next.clips.tail).toMatchObject({ in: 6, start: 3, duration: 5 });
    expect(next.clips.clip?.duration).toBe(3);
  });
  it('trims source boundaries and moves clips', () => {
    const next = applyOps(project, [
      { op: 'clip.trim', id: 'clip', edge: 'in', value: 2 },
      { op: 'clip.trim', id: 'clip', edge: 'out', value: 7 },
      { op: 'clip.move', id: 'clip', trackId: 'video', start: 1 },
    ]);
    expect(next.clips.clip).toMatchObject({ in: 2, duration: 5, start: 1 });
    expect(next.duration).toBe(6);
  });
  it('updates tracks, text, effects, keyframes and markers by stable ID', () => {
    const next = applyOps(project, [
      { op: 'track.add', track: { ...track, id: 'captions', kind: 'text' } },
      { op: 'track.update', id: 'captions', patch: { name: 'titles' } },
      {
        op: 'clip.update',
        id: 'clip',
        patch: { kind: 'text', text: { content: 'before', style: 'title' } },
      },
      { op: 'text.update', clipId: 'clip', content: 'after' },
      {
        op: 'effect.set',
        clipId: 'clip',
        effect: { id: 'grade', type: 'grade', params: { exposure: 1 } },
      },
      {
        op: 'effect.set',
        clipId: 'clip',
        effect: { id: 'grade', type: 'grade', params: { exposure: 2 } },
      },
      {
        op: 'keyframe.set',
        clipId: 'clip',
        keyframe: {
          id: 'scale',
          time: 1,
          property: 'scale',
          value: 1.1,
          easing: 'linear',
        },
      },
      { op: 'marker.add', marker: { id: 'm', time: 1, label: 'beat' } },
    ]);
    expect(next.clips.clip?.text?.content).toBe('after');
    expect(next.clips.clip?.effects).toHaveLength(1);
    expect(next.clips.clip?.effects[0]?.params.exposure).toBe(2);
    expect(next.clips.clip?.keyframes).toHaveLength(1);
    expect(next.tracks[1]?.name).toBe('titles');
    expect(next.markers).toHaveLength(1);
  });
  it('rejects invalid and duplicate operations atomically', () => {
    expect(() =>
      applyOps(project, [
        { op: 'clip.update', id: 'clip', patch: { duration: 2 } },
        { op: 'clip.move', id: 'missing', trackId: 'video', start: 0 },
      ]),
    ).toThrow();
    expect(project.clips.clip?.duration).toBe(8);
    expect(() => applyOps(project, [{ op: 'clip.add', clip }])).toThrow();
    expect(() =>
      applyOps(project, [
        { op: 'clip.split', id: 'clip', at: 0, newId: 'tail' },
      ]),
    ).toThrow();
    expect(() =>
      applyOps(project, [
        { op: 'clip.move', id: 'clip', trackId: 'missing', start: 0 },
      ]),
    ).toThrow();
  });
});
