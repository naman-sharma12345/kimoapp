import { describe, expect, it } from 'vitest';
import { waveformPeaks } from '../lib/uploads/peaks';
import { sessionDestination } from '../lib/session-routing';
import type { SessionSnapshot } from '@kimo/client';
import { project } from '../../../../packages/kimo-client/src/samples';

describe('media preparation and session navigation', () => {
  it('calculates 64 chip peaks and one peak per 10 ms with clamped amplitudes', () => {
    const samples = new Float32Array(8000);
    samples[100] = -0.75;
    samples[500] = 2;
    const { waveform, timeline } = waveformPeaks(samples);
    expect(waveform).toHaveLength(64);
    expect(timeline).toHaveLength(100);
    expect(Math.max(...waveform)).toBe(1);
    expect(timeline[1]).toBe(0.75);
  });
  it('resolves warming, editing, rendering, done and failed deep links', () => {
    const snapshot: SessionSnapshot = {
      status: 'warming',
      project,
      assets: [],
    };
    expect(sessionDestination(snapshot, 'id')).toBe('/warmup/id');
    expect(sessionDestination({ ...snapshot, status: 'editing' }, 'id')).toBe(
      '/studio/id',
    );
    expect(
      sessionDestination(
        { ...snapshot, status: 'rendering', renderId: 'render' },
        'id',
      ),
    ).toBe('/render/render');
    expect(
      sessionDestination(
        { ...snapshot, status: 'done', videoId: 'video' },
        'id',
      ),
    ).toBe('/v/video');
    expect(
      sessionDestination({ ...snapshot, status: 'failed' }, 'id'),
    ).toBeNull();
  });
});
