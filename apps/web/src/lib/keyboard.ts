export const shortcuts = [
  ['space', 'play or pause'],
  ['J / K / L', 'shuttle playback'],
  ['← / →', 'step one frame'],
  ['⇧ ← / →', 'step one second'],
  ['Home / End', 'go to start or end'],
  ['I / O', 'set in or out'],
  ['V / B / Y / T', 'select, blade, slip or text'],
  ['S', 'toggle snapping'],
  ['⌘ Z / ⇧ ⌘ Z', 'undo or redo'],
  ['⌘ C / ⌘ V / ⌘ D', 'copy, paste or duplicate'],
  ['Delete', 'ripple delete'],
  ['⌘ K', 'focus the agent composer'],
  ['⌘ .', 'pause or resume kimo'],
  ['F', 'fullscreen preview'],
  ['⇧ Z', 'fit timeline'],
  ['?', 'show keyboard shortcuts'],
] as const;

export type StudioCommand =
  | 'focusComposer'
  | 'pauseAgent'
  | 'shortcuts'
  | 'play'
  | 'start'
  | 'end'
  | 'previous'
  | 'next'
  | 'previousSecond'
  | 'nextSecond'
  | 'select'
  | 'blade'
  | 'slip'
  | 'text'
  | 'snap'
  | 'fit'
  | 'fullscreen'
  | 'loop'
  | 'undo'
  | 'redo'
  | 'inPoint'
  | 'outPoint';

export function isTypingTarget(target: EventTarget | null): boolean {
  return (
    target instanceof HTMLElement &&
    (target.isContentEditable ||
      ['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName))
  );
}

export function keyboardCommand(
  event: KeyboardEvent,
): StudioCommand | undefined {
  const key = event.key.toLowerCase();
  const mod = event.metaKey || event.ctrlKey;
  if (mod && key === 'k') return 'focusComposer';
  if (isTypingTarget(event.target) || event.altKey) return;
  if (mod && key === '.') return 'pauseAgent';
  if (mod && key === 'z') return event.shiftKey ? 'redo' : 'undo';
  if (mod) return;
  if (event.key === '?') return 'shortcuts';
  if (event.shiftKey && key === 'z') return 'fit';
  if (event.shiftKey && key === 'arrowleft') return 'previousSecond';
  if (event.shiftKey && key === 'arrowright') return 'nextSecond';
  const mapping: Record<string, StudioCommand> = {
    ' ': 'play',
    home: 'start',
    end: 'end',
    arrowleft: 'previous',
    arrowright: 'next',
    v: 'select',
    b: 'blade',
    y: 'slip',
    t: 'text',
    s: 'snap',
    f: 'fullscreen',
    l: 'loop',
    i: 'inPoint',
    o: 'outPoint',
  };
  return mapping[key];
}
