import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { createRef } from 'react';
import { Play } from 'lucide-react';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { Textarea } from '../components/ui/textarea';
import { Toggle } from '../components/ui/toggle';
import { Section } from '../components/ui/section';
import { SegmentedControl } from '../components/ui/segmented-control';
import { Slider } from '../components/ui/slider';
import {
  Tabs,
  TabsList,
  TabsTrigger,
  TabsContent,
} from '../components/ui/tabs';
import { Menu, MenuItem } from '../components/ui/menu';
import { ContextMenu, ContextMenuItem } from '../components/ui/context-menu';
import { Popover, PopoverClose } from '../components/ui/popover';
import { Dialog, DialogClose, DialogContent } from '../components/ui/dialog';
import { Tooltip } from '../components/ui/tooltip';
import { AttachmentChip } from '../components/ui/attachment-chip';
import { Toast, ToastProvider, useToast } from '../components/ui/toast';
import { Pill } from '../components/ui/pill';
import { Progress } from '../components/ui/progress';
import { Spinner } from '../components/ui/spinner';
import { Skeleton } from '../components/ui/skeleton';
import { Panel } from '../components/ui/panel';
import { Row } from '../components/ui/row';
import { Kbd } from '../components/ui/kbd';
import { Avatar } from '../components/ui/avatar';
import { ScrollArea } from '../components/ui/scroll-area';
import { uiClassName, variants } from '../lib/variants';

beforeAll(() => {
  Object.defineProperty(window, 'matchMedia', {
    writable: true,
    value: (media: string) => ({
      matches: false,
      media,
      addEventListener() {},
      removeEventListener() {},
    }),
  });
  vi.stubGlobal(
    'ResizeObserver',
    class {
      observe() {}
      unobserve() {}
      disconnect() {}
    },
  );
  vi.stubGlobal('PointerEvent', MouseEvent);
  HTMLElement.prototype.hasPointerCapture = () => false;
  HTMLElement.prototype.setPointerCapture = () => undefined;
  HTMLElement.prototype.releasePointerCapture = () => undefined;
  HTMLElement.prototype.scrollIntoView = () => undefined;
});
afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

describe('button and field keyboard behavior', () => {
  it('Tabs past disabled buttons and activates with Enter and Space', async () => {
    const user = userEvent.setup();
    const click = vi.fn();
    const ref = createRef<HTMLButtonElement>();
    render(
      <>
        <Button disabled>unavailable</Button>
        <Button ref={ref} onClick={click}>
          add clip
        </Button>
        <Button loading>send</Button>
      </>,
    );
    await user.tab();
    expect(document.activeElement).toBe(ref.current);
    await user.keyboard('{Enter} ');
    expect(click).toHaveBeenCalledTimes(2);
    expect(
      screen.getByRole('button', { name: /send/ }).getAttribute('aria-busy'),
    ).toBe('true');
    expect(
      screen.getByRole('button', { name: /send/ }).hasAttribute('disabled'),
    ).toBe(true);
  });
  it('requires labelled icon buttons with their tooltip', async () => {
    const user = userEvent.setup();
    render(
      <Button
        iconOnly
        icon={Play}
        aria-label="play clip"
        tooltip="play clip"
      />,
    );
    await user.tab();
    expect(document.activeElement).toBe(
      screen.getByRole('button', { name: 'play clip' }),
    );
    expect(await screen.findByRole('tooltip')).toBeTruthy();
    await user.keyboard('{Escape}');
    await waitFor(() => expect(screen.queryByRole('tooltip')).toBeNull());
  });
  it('forwards input refs, links errors and allows text editing', async () => {
    const user = userEvent.setup();
    const ref = createRef<HTMLInputElement>();
    render(
      <Input ref={ref} aria-label="project title" error="enter a title" />,
    );
    await user.tab();
    await user.keyboard('quiet cut');
    expect(ref.current?.value).toBe('quiet cut');
    expect(ref.current?.getAttribute('aria-invalid')).toBe('true');
    expect(
      document.getElementById(
        ref.current?.getAttribute('aria-describedby') ?? '',
      )?.textContent,
    ).toBe('enter a title');
  });
  it('edits multiline text and preserves a caller description alongside an error', async () => {
    const user = userEvent.setup();
    const ref = createRef<HTMLTextAreaElement>();
    render(
      <>
        <p id="hint">describe the edit</p>
        <Textarea
          ref={ref}
          aria-label="note"
          aria-describedby="hint"
          error="add more detail"
          maxRows={3}
        />
      </>,
    );
    await user.tab();
    await user.keyboard('first line{Enter}second line');
    expect(ref.current?.value).toBe('first line\nsecond line');
    expect(
      ref.current?.getAttribute('aria-describedby')?.split(' '),
    ).toHaveLength(2);
  });
});

describe('selection and structural controls', () => {
  it('toggles with Space and Enter and skips disabled switches', async () => {
    const user = userEvent.setup();
    const change = vi.fn();
    render(
      <>
        <Toggle aria-label="captions" onCheckedChange={change} />
        <Toggle aria-label="locked" disabled />
      </>,
    );
    await user.tab();
    await user.keyboard(' ');
    expect(
      screen
        .getByRole('switch', { name: 'captions' })
        .getAttribute('aria-checked'),
    ).toBe('true');
    await user.keyboard('{Enter}');
    expect(change).toHaveBeenLastCalledWith(false);
  });
  it('collapses and expands a section with Enter and Space', async () => {
    const user = userEvent.setup();
    render(
      <Section label="transform" collapsible>
        <p>scale controls</p>
      </Section>,
    );
    await user.tab();
    await user.keyboard('{Enter}');
    expect(screen.getByRole('button').getAttribute('aria-expanded')).toBe(
      'false',
    );
    await user.keyboard(' ');
    expect(screen.getByRole('button').getAttribute('aria-expanded')).toBe(
      'true',
    );
  });
  it('uses arrows in a segmented group, skips disabled choices and prevents deselection', async () => {
    const user = userEvent.setup();
    const change = vi.fn();
    render(
      <SegmentedControl
        aria-label="aspect"
        options={[
          { value: 'wide', label: 'wide' },
          { value: 'locked', label: 'locked', disabled: true },
          { value: 'tall', label: 'tall' },
        ]}
        onValueChange={change}
      />,
    );
    await user.tab();
    await user.keyboard('{ArrowRight} ');
    expect(change).toHaveBeenLastCalledWith('tall');
    await user.keyboard(' ');
    expect(
      screen.getByRole('radio', { name: 'tall' }).getAttribute('aria-checked'),
    ).toBe('true');
  });
  it('moves a slider with arrows, Home and End', async () => {
    const user = userEvent.setup();
    render(<Slider aria-label="volume" defaultValue={40} min={0} max={100} />);
    await user.tab();
    await user.keyboard('{ArrowRight}');
    expect(screen.getByRole('slider').getAttribute('aria-valuenow')).toBe('41');
    await user.keyboard('{Home}');
    expect(screen.getByRole('slider').getAttribute('aria-valuenow')).toBe('0');
    await user.keyboard('{End}');
    expect(screen.getByRole('slider').getAttribute('aria-valuenow')).toBe(
      '100',
    );
  });
  it('selects tabs using arrows and exposes the matching panel', async () => {
    const user = userEvent.setup();
    render(
      <Tabs defaultValue="video">
        <TabsList aria-label="media">
          <TabsTrigger value="video">video</TabsTrigger>
          <TabsTrigger value="audio">audio</TabsTrigger>
          <TabsTrigger value="locked" disabled>
            locked
          </TabsTrigger>
        </TabsList>
        <TabsContent value="video">video clips</TabsContent>
        <TabsContent value="audio">audio tracks</TabsContent>
      </Tabs>,
    );
    await user.tab();
    await user.keyboard('{ArrowRight}');
    await waitFor(() =>
      expect(
        screen
          .getByRole('tab', { name: 'audio' })
          .getAttribute('aria-selected'),
      ).toBe('true'),
    );
    expect(screen.getByRole('tabpanel').textContent).toBe('audio tracks');
  });
  it('makes a scroll viewport keyboard reachable', async () => {
    const user = userEvent.setup();
    render(
      <ScrollArea aria-label="clips">
        <Row label="clip" value="00:00:02:00" />
      </ScrollArea>,
    );
    await user.tab();
    expect(document.activeElement).toBe(
      screen.getByRole('region', { name: 'clips' }),
    );
  });
});

describe('overlay focus and keyboard dismissal', () => {
  it('opens a menu with Enter, navigates with arrows and selects with Enter', async () => {
    const user = userEvent.setup();
    const select = vi.fn();
    render(
      <Menu trigger={<Button>clip actions</Button>}>
        <MenuItem>copy</MenuItem>
        <MenuItem disabled>locked</MenuItem>
        <MenuItem onSelect={select}>download</MenuItem>
      </Menu>,
    );
    await user.tab();
    await user.keyboard('{Enter}');
    await screen.findByRole('menu');
    await user.keyboard('{ArrowDown}{Enter}');
    expect(select).toHaveBeenCalledOnce();
    await waitFor(() => expect(screen.queryByRole('menu')).toBeNull());
    expect(document.activeElement).toBe(
      screen.getByRole('button', { name: 'clip actions' }),
    );
  });
  it('supports Shift+F10 and Escape on context menus', async () => {
    const user = userEvent.setup();
    render(
      <ContextMenu trigger={<Button>clip</Button>}>
        <ContextMenuItem>duplicate</ContextMenuItem>
      </ContextMenu>,
    );
    await user.tab();
    await user.keyboard('{Shift>}{F10}{/Shift}');
    await screen.findByRole('menu');
    await user.keyboard('{Escape}');
    await waitFor(() => expect(screen.queryByRole('menu')).toBeNull());
  });
  it('opens and dismisses a popover with focus restored to the trigger', async () => {
    const user = userEvent.setup();
    render(
      <Popover label="details" trigger={<Button>details</Button>}>
        <PopoverClose asChild>
          <Button>close</Button>
        </PopoverClose>
      </Popover>,
    );
    await user.tab();
    await user.keyboard(' ');
    await screen.findByRole('dialog', { name: 'details' });
    await user.keyboard('{Escape}');
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    expect(document.activeElement).toBe(
      screen.getByRole('button', { name: 'details' }),
    );
  });
  it('traps Tab inside a dialog, handles Escape and restores trigger focus', async () => {
    const user = userEvent.setup();
    render(
      <Dialog trigger={<Button>discard</Button>}>
        <DialogContent
          title="discard edit?"
          description="original footage is preserved"
          actions={
            <>
              <DialogClose asChild>
                <Button>cancel</Button>
              </DialogClose>
              <Button>confirm</Button>
            </>
          }
        />
      </Dialog>,
    );
    await user.tab();
    await user.keyboard('{Enter}');
    await screen.findByRole('dialog', { name: 'discard edit?' });
    await waitFor(() =>
      expect(document.activeElement).toBe(
        screen.getByRole('button', { name: 'cancel' }),
      ),
    );
    await user.tab({ shift: true });
    expect(document.activeElement).toBe(
      screen.getByRole('button', { name: 'confirm' }),
    );
    await user.tab();
    expect(document.activeElement).toBe(
      screen.getByRole('button', { name: 'cancel' }),
    );
    await user.keyboard('{Escape}');
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    expect(document.activeElement).toBe(
      screen.getByRole('button', { name: 'discard' }),
    );
  });
  it('shows a shortcut tooltip on keyboard focus', async () => {
    const user = userEvent.setup();
    render(
      <Tooltip content="play preview" shortcut="Space">
        <Button>play</Button>
      </Tooltip>,
    );
    await user.tab();
    expect((await screen.findByRole('tooltip')).textContent).toContain('Space');
  });
});

describe('feedback, attachments and public contracts', () => {
  it('removes an attachment with a named keyboard action', async () => {
    const user = userEvent.setup();
    const remove = vi.fn();
    render(
      <AttachmentChip
        kind="audio"
        name="music.wav"
        meta="0:12 · 24 MB"
        onRemove={remove}
        progress={0.5}
      />,
    );
    await user.tab();
    await user.keyboard('{Enter}');
    expect(remove).toHaveBeenCalledOnce();
    expect(screen.getByRole('progressbar').getAttribute('aria-valuenow')).toBe(
      '50',
    );
  });
  it('auto-dismisses after four seconds and pauses for hover', () => {
    vi.useFakeTimers();
    const dismiss = vi.fn();
    render(<Toast message="saved" onDismiss={dismiss} />);
    act(() => vi.advanceTimersByTime(3000));
    fireEvent.mouseEnter(screen.getByRole('status'));
    act(() => vi.advanceTimersByTime(5000));
    expect(dismiss).not.toHaveBeenCalled();
    fireEvent.mouseLeave(screen.getByRole('status'));
    act(() => vi.advanceTimersByTime(1001));
    expect(dismiss).toHaveBeenCalledOnce();
  });
  it('keeps errors for eight seconds and announces them assertively', () => {
    vi.useFakeTimers();
    const dismiss = vi.fn();
    render(<Toast tone="error" message="upload failed" onDismiss={dismiss} />);
    expect(screen.getByRole('status').getAttribute('aria-live')).toBe(
      'assertive',
    );
    act(() => vi.advanceTimersByTime(7999));
    expect(dismiss).not.toHaveBeenCalled();
    act(() => vi.advanceTimersByTime(1));
    expect(dismiss).toHaveBeenCalledOnce();
  });
  it('limits notifications to three and supports their action', () => {
    const action = vi.fn();
    function Example() {
      const { toast } = useToast();
      return (
        <Button
          onClick={() =>
            toast({
              message: 'saved',
              action: { label: 'undo', onClick: action },
            })
          }
        >
          notify
        </Button>
      );
    }
    render(
      <ToastProvider>
        <Example />
      </ToastProvider>,
    );
    for (let index = 0; index < 4; index++)
      fireEvent.click(screen.getByRole('button', { name: 'notify' }));
    expect(screen.getAllByRole('status')).toHaveLength(3);
    fireEvent.click(
      screen.getAllByRole('button', { name: 'undo' })[0] ?? document.body,
    );
    expect(action).toHaveBeenCalledOnce();
  });
  it('exports accessible passive primitives with stable forwarded refs', () => {
    const ref = createRef<HTMLDivElement>();
    render(
      <Panel title="inspector">
        <Pill>ready</Pill>
        <Progress ref={ref} label="render" value={0.25} />
        <Spinner label="loading media" />
        <Skeleton />
        <Row label="duration" value="24s" />
        <Kbd>Space</Kbd>
        <Avatar identity="agent" />
        <Avatar identity="user" name="naman" />
      </Panel>,
    );
    expect(ref.current).toBe(screen.getByRole('progressbar'));
    expect(screen.getByRole('img', { name: 'kimo' })).toBeTruthy();
    expect(screen.getByRole('region', { name: 'inspector' })).toBeTruthy();
    expect(screen.getByRole('status', { name: 'loading media' })).toBeTruthy();
  });
  it('restricts overrides to layout and selects only declared variants', () => {
    const style = variants('button', { size: { sm: 'small', lg: 'large' } });
    expect(style({ size: 'sm' })).toBe('button small');
    expect(uiClassName('button', 'w-full md:col-span-2')).toBe(
      'button w-full md:col-span-2',
    );
    expect(() => uiClassName('button', 'bg-orange')).toThrow('layout-only');
    expect(() => uiClassName('button', 'text-t28')).toThrow('layout-only');
  });
});
