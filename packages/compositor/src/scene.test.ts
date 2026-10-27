import { describe, expect, it } from 'vitest';
import { emptyProject, sampleClip } from '../../mock-server/src/fixtures.ts';
import { buildScene, interpolate } from './scene.ts';

describe('scene builder', () => {
  const clip = {
    ...sampleClip('clip-1', 'video', 2),
    duration: 4,
    in: 3,
    speed: 2,
  };
  const project = {
    ...emptyProject('test'),
    duration: 6,
    tracks: [
      {
        id: 'video',
        kind: 'video' as const,
        name: 'video',
        muted: false,
        hidden: false,
        locked: false,
        height: 88 as const,
      },
    ],
    clips: { [clip.id]: clip },
  };
  it('uses half-open clip boundaries and source trim and speed', () => {
    expect(buildScene(project, 1.99)).toHaveLength(0);
    expect(buildScene(project, 2)[0]?.sourceTime).toBe(3);
    expect(buildScene(project, 3)[0]?.sourceTime).toBe(5);
    expect(buildScene(project, 6)).toHaveLength(0);
  });
  it('interpolates keyframes and dissolve independently', () => {
    const animated = {
      ...clip,
      transitionIn: { type: 'dissolve', duration: 2 },
      keyframes: [
        {
          id: 'a',
          property: 'scale',
          time: 0,
          value: 1,
          easing: 'linear' as const,
        },
        {
          id: 'b',
          property: 'scale',
          time: 2,
          value: 2,
          easing: 'linear' as const,
        },
      ],
    };
    expect(interpolate(animated, 'scale', 1, 1)).toBe(1.5);
    expect(
      buildScene({ ...project, clips: { [clip.id]: animated } }, 3)[0],
    ).toMatchObject({ scale: 1.5, transition: 0.5 });
  });
  it('computes an outgoing fade near the end of the clip', () => {
    const outgoing = {
      ...clip,
      transitionOut: { type: 'dissolve', duration: 2 },
    };
    expect(
      buildScene({ ...project, clips: { [clip.id]: outgoing } }, 5)[0]
        ?.transitionOut,
    ).toBe(0.5);
  });
  it('holds until the next keyframe and supports cubic handles', () => {
    const hold = {
      ...clip,
      keyframes: [
        { id: 'a', property: 'x', time: 0, value: 0, easing: 'hold' as const },
        {
          id: 'b',
          property: 'x',
          time: 1,
          value: 100,
          easing: 'linear' as const,
        },
        {
          id: 'c',
          property: 'x',
          time: 2,
          value: 200,
          easing: 'linear' as const,
        },
      ],
    };
    expect(interpolate(hold, 'x', 0.9, 0)).toBe(0);
    expect(interpolate(hold, 'x', 1, 0)).toBe(100);
    const [first, second] = hold.keyframes;
    if (!first || !second) throw new Error('Missing keyframes');
    const bezier = {
      ...hold,
      keyframes: [
        {
          ...first,
          easing: 'bezier' as const,
          out: [0.33, 0.33] as [number, number],
        },
        { ...second, in: [0.67, 0.67] as [number, number] },
      ],
    };
    expect(interpolate(bezier, 'x', 0.5, 0)).toBeCloseTo(50);
  });
  it('omits hidden tracks and orders simultaneous layers by track', () => {
    const track = project.tracks[0];
    if (!track) throw new Error('Missing track');
    const hidden = { ...track, hidden: true };
    expect(buildScene({ ...project, tracks: [hidden] }, 3)).toHaveLength(0);
    const top = { ...clip, id: 'top', trackId: 'overlay' };
    expect(
      buildScene(
        {
          ...project,
          tracks: [
            ...project.tracks,
            { ...hidden, id: 'overlay', hidden: false },
          ],
          clips: { top, [clip.id]: clip },
        },
        3,
      ).map((layer) => layer.clip.id),
    ).toEqual(['clip-1', 'top']);
  });
});
