'use client';
import { useState, type ReactNode } from 'react';
import {
  ArrowUp,
  Copy,
  Download,
  MoreHorizontal,
  Play,
  Plus,
  Settings,
  Trash2,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Pill } from '@/components/ui/pill';
import { AttachmentChip } from '@/components/ui/attachment-chip';
import { Tooltip } from '@/components/ui/tooltip';
import { Menu, MenuItem, MenuSeparator } from '@/components/ui/menu';
import { Popover, PopoverClose } from '@/components/ui/popover';
import {
  ContextMenu,
  ContextMenuItem,
  ContextMenuSeparator,
} from '@/components/ui/context-menu';
import { Dialog, DialogContent, DialogClose } from '@/components/ui/dialog';
import { Toast, ToastProvider, useToast } from '@/components/ui/toast';
import { Spinner } from '@/components/ui/spinner';
import { Progress } from '@/components/ui/progress';
import { Skeleton } from '@/components/ui/skeleton';
import { SegmentedControl } from '@/components/ui/segmented-control';
import { Toggle } from '@/components/ui/toggle';
import { Slider } from '@/components/ui/slider';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { Panel } from '@/components/ui/panel';
import { Section } from '@/components/ui/section';
import { Row } from '@/components/ui/row';
import { Kbd } from '@/components/ui/kbd';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Avatar } from '@/components/ui/avatar';

function Group({
  title,
  id,
  children,
}: {
  title: string;
  id: string;
  children: ReactNode;
}) {
  return (
    <section className="ui-gallery-group" aria-labelledby={id}>
      <h2 id={id} className="text-t20">
        {title}
      </h2>
      <div className="ui-story-grid">{children}</div>
    </section>
  );
}
function Demo({
  label,
  children,
  wide = false,
}: {
  label: string;
  children: ReactNode;
  wide?: boolean;
}) {
  return (
    <div className="ui-story" data-wide={wide || undefined}>
      <p className="ui-story-label">{label}</p>
      <div className="ui-story-content">{children}</div>
    </div>
  );
}
const aspects = [
  { value: '16:9', label: '16:9' },
  { value: '9:16', label: '9:16' },
  { value: '1:1', label: '1:1' },
];
function GalleryContent() {
  const { toast } = useToast();
  const [lastAction, setLastAction] = useState('ready to try the components');
  const [removed, setRemoved] = useState<string[]>([]);
  const [upload, setUpload] = useState(0.56);
  const [aspect, setAspect] = useState('16:9');
  const [volume, setVolume] = useState(72);
  const acted = (message: string) => setLastAction(message);
  return (
    <>
      <nav className="ui-gallery-nav" aria-label="component groups">
        {[
          ['buttons', 'buttons'],
          ['fields', 'fields'],
          ['status', 'status & files'],
          ['overlays', 'overlays'],
          ['feedback', 'feedback'],
          ['controls', 'controls'],
          ['layout', 'layout'],
          ['identity', 'identity'],
        ].map(([id, label]) => (
          <a key={id} href={`#${id}`}>
            {label}
          </a>
        ))}
      </nav>
      <p className="ui-gallery-result" role="status">
        {lastAction}
      </p>
      <Group title="buttons" id="buttons">
        {(['primary', 'secondary', 'ghost', 'danger'] as const).flatMap(
          (variant) =>
            (
              [
                'default',
                'hover',
                'pressed',
                'focus',
                'disabled',
                'loading',
              ] as const
            ).map((state) => (
              <Demo key={`${variant}-${state}`} label={`${variant} / ${state}`}>
                <Button
                  variant={variant}
                  data-state={state}
                  disabled={state === 'disabled'}
                  loading={state === 'loading'}
                  icon={
                    variant === 'danger'
                      ? Trash2
                      : variant === 'primary'
                        ? ArrowUp
                        : undefined
                  }
                  onClick={() => acted(`${variant} action selected`)}
                >
                  {variant === 'primary'
                    ? 'send'
                    : variant === 'danger'
                      ? 'discard'
                      : 'add to timeline'}
                </Button>
              </Demo>
            )),
        )}
        {(['xs', 'sm', 'md', 'lg'] as const).map((size) => (
          <Demo key={size} label={`size / ${size}`}>
            <Button
              size={size}
              icon={Plus}
              onClick={() => acted(`added from ${size} button`)}
            >
              add clip
            </Button>
            <Button
              size={size}
              iconOnly
              icon={Play}
              aria-label={`play ${size} preview`}
              tooltip={`play ${size} preview`}
              onClick={() => acted(`playing ${size} preview`)}
            />
          </Demo>
        ))}
      </Group>
      <Group title="inputs & textareas" id="fields">
        {(['default', 'hover', 'focus', 'disabled', 'error'] as const).map(
          (state) => (
            <Demo key={state} label={`input / ${state}`}>
              <label className="ui-demo-field" htmlFor={`project-${state}`}>
                project name
                <Input
                  id={`project-${state}`}
                  name={`project-${state}`}
                  autoComplete="off"
                  aria-label={`project name ${state}`}
                  defaultValue={
                    state === 'default' ? 'a quieter kind of motion' : undefined
                  }
                  placeholder="name your project"
                  data-state={state}
                  disabled={state === 'disabled'}
                  error={state === 'error' ? 'enter a project name' : undefined}
                />
              </label>
            </Demo>
          ),
        )}
        <Demo label="input / numeric">
          <label className="ui-demo-field" htmlFor="duration">
            duration
            <Input
              id="duration"
              name="duration"
              autoComplete="off"
              type="number"
              min={1}
              defaultValue={24}
              aria-label="duration"
            />
          </label>
        </Demo>
        <Demo label="textarea / auto-grow, max 3 rows" wide>
          <label className="ui-demo-field" htmlFor="direction">
            direction
            <Textarea
              id="direction"
              name="direction"
              autoComplete="off"
              aria-label="editing direction"
              placeholder="describe the next cut"
              maxRows={3}
              defaultValue={
                'give the opening room to breathe.\nkeep the quiet moments.\nlet the music settle.\nend on the final shot.'
              }
            />
          </label>
        </Demo>
        <Demo label="textarea / error">
          <label className="ui-demo-field" htmlFor="note">
            note
            <Textarea
              id="note"
              name="note"
              autoComplete="off"
              aria-label="empty note"
              error="add a note before sending"
            />
          </label>
        </Demo>
        <Demo label="textarea / disabled">
          <label className="ui-demo-field" htmlFor="saved-note">
            saved note
            <Textarea
              id="saved-note"
              name="saved-note"
              autoComplete="off"
              aria-label="saved note"
              disabled
              defaultValue="keep this version"
            />
          </label>
        </Demo>
      </Group>
      <Group title="status & attachments" id="status">
        <Demo label="pill / default">
          <Pill>ready</Pill>
        </Demo>
        <Demo label="pill / live, idle">
          <Pill variant="live">live</Pill>
        </Demo>
        <Demo label="pill / live, active">
          <Pill variant="live" active>
            live
          </Pill>
        </Demo>
        <Demo label="upload / complete">
          <AttachmentChip
            kind="doc"
            name="creative-brief.pdf"
            meta="4 pages · 2 MB"
            progress={1}
            onRemove={() => acted('creative brief removed')}
          />
        </Demo>
        {(['video', 'image', 'audio', 'doc'] as const).map((kind) => {
          const name = {
            video: 'opening-shot.mp4',
            image: 'closing-frame.png',
            audio: 'quiet-study.wav',
            doc: 'direction.pdf',
          }[kind];
          return (
            <Demo key={kind} label={`attachment / ${kind}`} wide>
              {removed.includes(name) ? (
                <Button
                  variant="ghost"
                  onClick={() =>
                    setRemoved((current) =>
                      current.filter((item) => item !== name),
                    )
                  }
                >
                  restore {kind} attachment
                </Button>
              ) : (
                <AttachmentChip
                  kind={kind}
                  name={name}
                  meta={
                    kind === 'video'
                      ? '0:12 · 24 MB'
                      : kind === 'audio'
                        ? '0:24 · 1 MB'
                        : kind === 'image'
                          ? '1920 × 1080 · 2 MB'
                          : '4 pages · 2 MB'
                  }
                  thumbnail={
                    kind === 'video' || kind === 'image'
                      ? '/dev/still.png'
                      : undefined
                  }
                  progress={kind === 'video' ? upload : undefined}
                  onRemove={() => {
                    setRemoved((current) => [...current, name]);
                    acted(`removed ${name}`);
                  }}
                />
              )}
            </Demo>
          );
        })}
        <Demo label="upload / in progress">
          <Progress label="attachment upload" value={upload} />
          <Button
            size="xs"
            variant="ghost"
            onClick={() => setUpload((current) => (current === 1 ? 0.56 : 1))}
          >
            {upload === 1 ? 'restart upload demo' : 'complete upload demo'}
          </Button>
        </Demo>
      </Group>
      <Group title="tooltips, menus & dialogs" id="overlays">
        <Demo label="tooltip / keyboard shortcut">
          <Tooltip content="play preview" shortcut="Space">
            <Button icon={Play} onClick={() => acted('preview playing')}>
              play preview
            </Button>
          </Tooltip>
        </Demo>
        <Demo label="menu / default, highlighted, disabled">
          <Menu trigger={<Button icon={MoreHorizontal}>open menu</Button>}>
            <MenuItem
              icon={Copy}
              shortcut="⌘C"
              onSelect={() => acted('clip copied')}
            >
              copy clip
            </MenuItem>
            <MenuItem icon={Download} onSelect={() => acted('clip downloaded')}>
              download clip
            </MenuItem>
            <MenuSeparator />
            <MenuItem icon={Trash2} disabled>
              remove locked clip
            </MenuItem>
          </Menu>
        </Demo>
        <Demo label="popover / anchored content">
          <Popover
            label="project details"
            trigger={<Button icon={Settings}>project details</Button>}
          >
            <div className="ui-demo-stack">
              <p className="text-t15">project details</p>
              <Row label="frame rate" value="30 fps" />
              <Row label="canvas" value="1920 × 1080" />
              <PopoverClose asChild>
                <Button size="sm">close details</Button>
              </PopoverClose>
            </div>
          </Popover>
        </Demo>
        <Demo label="context menu / right click or Shift+F10">
          <ContextMenu trigger={<Button>clip context menu</Button>}>
            <ContextMenuItem
              icon={Copy}
              onSelect={() => acted('clip duplicated')}
            >
              duplicate clip
            </ContextMenuItem>
            <ContextMenuItem
              icon={Play}
              onSelect={() => acted('clip preview playing')}
            >
              play clip
            </ContextMenuItem>
            <ContextMenuSeparator />
            <ContextMenuItem disabled>locked clip</ContextMenuItem>
          </ContextMenu>
        </Demo>
        {(['sm', 'md'] as const).map((size) => (
          <Demo label={`dialog / ${size}`} key={size}>
            <Dialog trigger={<Button>review {size} dialog</Button>}>
              <DialogContent
                size={size}
                title="discard this edit?"
                description="your current changes will be removed. the original footage stays in your project."
                actions={
                  <>
                    <DialogClose asChild>
                      <Button>keep editing</Button>
                    </DialogClose>
                    <DialogClose asChild>
                      <Button
                        variant="danger"
                        onClick={() => acted('edit discarded')}
                      >
                        discard edit
                      </Button>
                    </DialogClose>
                  </>
                }
              />
            </Dialog>
          </Demo>
        ))}
      </Group>
      <Group title="feedback & loading" id="feedback">
        <Demo label="toast / info" wide>
          <Toast
            message="your edit is saved"
            action={{ label: 'undo', onClick: () => acted('save undone') }}
          />
        </Demo>
        <Demo label="toast / success" wide>
          <Toast tone="success" message="your video is ready" />
        </Demo>
        <Demo label="toast / error" wide>
          <Toast
            tone="error"
            message="upload failed. check your connection and try again."
            action={{ label: 'retry', onClick: () => acted('upload retried') }}
          />
        </Demo>
        <Demo label="toast / live stack, max 3" wide>
          {(['info', 'success', 'error'] as const).map((tone) => (
            <Button
              key={tone}
              size="sm"
              onClick={() =>
                toast({
                  tone,
                  message:
                    tone === 'error'
                      ? 'connection lost. try again.'
                      : tone === 'success'
                        ? 'your render is complete'
                        : 'project saved',
                  action: {
                    label: 'undo',
                    onClick: () => acted('notification action selected'),
                  },
                })
              }
            >
              show {tone}
            </Button>
          ))}
        </Demo>
        <Demo label="spinner / 14">
          <Spinner />
        </Demo>
        <Demo label="spinner / 20">
          <Spinner size={20} />
        </Demo>
        <Demo label="progress / thin">
          <Progress thin label="thin upload progress" value={0.48} />
        </Demo>
        <Demo label="progress / default">
          <Progress label="upload progress" value={0.72} />
        </Demo>
        <Demo label="progress / running agent">
          <Progress label="agent progress" value={0.64} running />
        </Demo>
        <Demo label="progress / indeterminate">
          <Progress label="waiting for media" />
        </Demo>
        {([4, 6, 8, 12, 20, 'pill'] as const).map((radius) => (
          <Demo key={radius} label={`skeleton / r-${radius}`}>
            <Skeleton radius={radius} className="w-full h-8" />
          </Demo>
        ))}
      </Group>
      <Group title="selection controls" id="controls">
        <Demo label="segmented / single selection" wide>
          <SegmentedControl
            aria-label="video aspect ratio"
            options={aspects}
            value={aspect}
            onValueChange={setAspect}
          />
          <span className="text-t12 text-cream-60">selected: {aspect}</span>
        </Demo>
        <Demo label="segmented / disabled" wide>
          <SegmentedControl
            aria-label="locked aspect ratio"
            options={aspects}
            defaultValue="16:9"
            disabled
          />
        </Demo>
        <Demo label="toggle / off">
          <Toggle
            aria-label="enable captions"
            onCheckedChange={(checked) =>
              acted(checked ? 'captions enabled' : 'captions disabled')
            }
          />
        </Demo>
        <Demo label="toggle / on">
          <Toggle aria-label="enable snapping" defaultChecked />
        </Demo>
        <Demo label="toggle / disabled">
          <Toggle aria-label="locked toggle" disabled defaultChecked />
        </Demo>
        <Demo label="slider / drag & keyboard" wide>
          <div className="ui-demo-field">
            <span>clip volume</span>
            <Slider
              aria-label="clip volume"
              min={0}
              max={100}
              step={1}
              value={volume}
              onValueChange={setVolume}
              formatValue={(value) => `${value}%`}
            />
          </div>
          <output className="font-mono text-t12" aria-label="volume value">
            {volume}%
          </output>
        </Demo>
        <Demo label="slider / disabled">
          <Slider aria-label="locked volume" defaultValue={35} disabled />
        </Demo>
        <Demo label="tabs / arrows, Home & End" wide>
          <Tabs defaultValue="video" className="w-full">
            <TabsList aria-label="media types">
              <TabsTrigger value="video">video</TabsTrigger>
              <TabsTrigger value="audio">audio</TabsTrigger>
              <TabsTrigger value="captions">captions</TabsTrigger>
              <TabsTrigger value="locked" disabled>
                locked
              </TabsTrigger>
            </TabsList>
            <TabsContent value="video">
              three shots, ready for the timeline.
            </TabsContent>
            <TabsContent value="audio">one quiet music bed.</TabsContent>
            <TabsContent value="captions">
              every word stays editable.
            </TabsContent>
          </Tabs>
        </Demo>
      </Group>
      <Group title="panels & layout" id="layout">
        <Demo label="panel / header, body, sections" wide>
          <Panel
            title="clip inspector"
            className="w-full"
            actions={
              <Button
                variant="ghost"
                size="sm"
                iconOnly
                icon={MoreHorizontal}
                aria-label="inspector options"
                tooltip="inspector options"
                onClick={() => acted('inspector options selected')}
              />
            }
          >
            <Section label="transform">
              <Row label="scale" value="100%" />
              <Row label="rotation" value="0°" />
            </Section>
            <Section label="audio" collapsible>
              <Row label="volume" value="72%" />
            </Section>
          </Panel>
        </Demo>
        <Demo label="panel / flush, dense & hovered rows" wide>
          <Panel title="project" flush className="w-full">
            <Row label="frame rate" value="30 fps" />
            <Row label="duration" value="00:00:24:00" dense />
            <Row label="canvas" value="1920 × 1080" data-state="hover" />
          </Panel>
        </Demo>
        <Demo label="section / collapsed">
          <Section label="advanced settings" collapsible defaultOpen={false}>
            <Row label="opacity" value="100%" />
          </Section>
        </Demo>
        <Demo label="kbd / shortcuts">
          <Kbd>Space</Kbd>
          <Kbd>⌘</Kbd>
          <Kbd>Z</Kbd>
        </Demo>
        <Demo label="scroll area / hover or scroll" wide>
          <ScrollArea
            className="h-32 w-full"
            aria-label="sample timeline clips"
          >
            {Array.from({ length: 12 }, (_, index) => (
              <Row
                key={index}
                label={`clip ${index + 1}`}
                value={`00:00:${String(index * 2).padStart(2, '0')}:00`}
              />
            ))}
          </ScrollArea>
        </Demo>
      </Group>
      <Group title="agent & user identity" id="identity">
        <Demo label="agent / idle">
          <Avatar identity="agent" />
          <span>kimo</span>
        </Demo>
        <Demo label="agent / acting">
          <Avatar identity="agent" acting />
          <span>kimo</span>
        </Demo>
        <Demo label="user / initial">
          <Avatar identity="user" name="naman" />
          <span>naman</span>
        </Demo>
        <Demo label="user / fallback">
          <Avatar identity="user" />
          <span>you</span>
        </Demo>
      </Group>
      <footer className="ui-gallery-footer">
        each component owns its appearance. compose them with layout, named
        variants and real state.
      </footer>
    </>
  );
}
export function UiGallery() {
  const [paused, setPaused] = useState(false);
  return (
    <ToastProvider>
      <div data-motion-paused={paused || undefined}>
        <Button
          className="mt-6"
          size="sm"
          variant="ghost"
          onClick={() => setPaused(!paused)}
          aria-pressed={paused}
        >
          {paused ? 'resume motion demos' : 'pause motion demos'}
        </Button>
        <GalleryContent />
      </div>
    </ToastProvider>
  );
}
