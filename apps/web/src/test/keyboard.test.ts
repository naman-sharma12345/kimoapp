import { describe, expect, it } from 'vitest';
import { keyboardCommand } from '../lib/keyboard';

describe('studio keyboard registry', () => {
  it('maps editor shortcuts without stealing normal typing', () => {
    expect(keyboardCommand(new KeyboardEvent('keydown', { key: 'b' }))).toBe(
      'blade',
    );
    expect(
      keyboardCommand(
        new KeyboardEvent('keydown', { key: 'ArrowRight', shiftKey: true }),
      ),
    ).toBe('nextSecond');
    expect(
      keyboardCommand(
        new KeyboardEvent('keydown', {
          key: 'z',
          ctrlKey: true,
          shiftKey: true,
        }),
      ),
    ).toBe('redo');
    const input = document.createElement('textarea');
    let action: ReturnType<typeof keyboardCommand>;
    input.addEventListener('keydown', (event) => {
      action = keyboardCommand(event);
    });
    input.dispatchEvent(new KeyboardEvent('keydown', { key: 'b' }));
    expect(action).toBeUndefined();
    input.dispatchEvent(
      new KeyboardEvent('keydown', { key: 'k', ctrlKey: true }),
    );
    expect(action).toBe('focusComposer');
  });
});
