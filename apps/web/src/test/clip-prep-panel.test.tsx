import { act, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { ClipPrepPanel } from '@/components/studio/clip-prep-panel';
import { resetClipPrep, setClipStage } from '@/lib/clip-prep';

afterEach(() => act(() => resetClipPrep()));

describe('clip prep panel', () => {
  it('shows a row per clip, hides when dismissed, and comes back for new clips', () => {
    const { container } = render(<ClipPrepPanel />);
    expect(container.querySelector('[data-clip-prep]')).toBeNull();
    act(() => {
      setClipStage('a', 'screen-1.mp4', 'analysing', 0.5);
      setClipStage('b', 'screen-2.mp4', 'reading');
    });
    expect(
      screen.getByText(/getting your clips ready, they stay on this device/),
    ).toBeTruthy();
    expect(screen.getByText('analysing audio')).toBeTruthy();
    expect(screen.getAllByRole('progressbar')).toHaveLength(3);
    expect(container.textContent).not.toMatch(/upload/i);
    fireEvent.click(screen.getByRole('button', { name: 'keep working' }));
    expect(container.querySelector('[data-clip-prep]')).toBeNull();
    act(() => setClipStage('c', 'song.mp3', 'reading'));
    expect(container.querySelector('[data-clip-prep]')).not.toBeNull();
    act(() => {
      for (const id of ['a', 'b', 'c']) setClipStage(id, id, 'ready');
    });
    expect(container.querySelector('[data-clip-prep]')).toBeNull();
  });
});
