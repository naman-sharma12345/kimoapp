'use client';

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type PointerEvent,
} from 'react';
import { useRouter } from 'next/navigation';
import {
  ArrowUp,
  Grid3X3,
  History,
  Link2,
  Magnet,
  Maximize2,
  MousePointer2,
  MoveHorizontal,
  PanelLeft,
  PanelLeftClose,
  PanelLeftOpen,
  PanelRight,
  Pause,
  Pencil,
  Play,
  Redo2,
  Repeat,
  ScanEye,
  Scissors,
  SkipBack,
  SkipForward,
  StepBack,
  StepForward,
  Type,
  Undo2,
  Volume2,
  ZoomIn,
  ZoomOut,
} from 'lucide-react';
import {
  KimoClient,
  ProjectSync,
  type ClientEvent,
  type ServerEvent,
  type SessionSnapshot,
} from '@kimo/client';
import { Button } from '@/components/ui/button';
import { Avatar } from '@/components/ui/avatar';
import { Dialog, DialogClose, DialogContent } from '@/components/ui/dialog';
import { Kbd } from '@/components/ui/kbd';
import { Popover } from '@/components/ui/popover';
import { SegmentedControl } from '@/components/ui/segmented-control';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Toggle } from '@/components/ui/toggle';
import { FullScreenError } from '@/components/errors/full-screen-error';
import { Ready } from '@/app/dev/tokens/ready';
import { keyboardCommand, shortcuts, type StudioCommand } from '@/lib/keyboard';
import { sessionSocketUrl, WarmupConnection } from '@/lib/warmup/connection';
import { useSessionStore } from '@/stores/session';
import { useUploads } from '@/lib/uploads/manager';
import { isUnfolding } from '@/lib/warmup/transition';
import { assetTransitionName } from '@/components/warmup/warmup-reel';

type AgentState = 'thinking' | 'acting' | 'waiting_user' | 'idle';
type Sizes = { agent: number; inspector: number; timeline: number };
type Tool = 'select' | 'blade' | 'slip' | 'text';
const STORAGE = 'kimo.studio.layout.v1';
const clamp = (value: number, min: number, max: number) =>
  Math.max(min, Math.min(max, value));
function defaults(width: number): Sizes {
  return width >= 1600
    ? { agent: 360, inspector: 320, timeline: 320 }
    : { agent: width >= 1280 ? 320 : 300, inspector: 280, timeline: 280 };
}
function timecode(seconds: number) {
  const frames = Math.max(0, Math.round(seconds * 30));
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${pad(Math.floor(frames / 108000))}:${pad(Math.floor(frames / 1800) % 60)}:${pad(Math.floor(frames / 30) % 60)}:${pad(frames % 30)}`;
}

function Resizer({
  label,
  vertical,
  value,
  min,
  max,
  onChange,
  onReset,
}: {
  label: string;
  vertical?: boolean;
  value: number;
  min: number;
  max: number;
  onChange: (value: number) => void;
  onReset: () => void;
}) {
  const drag = useRef<{ origin: number; value: number } | null>(null);
  const pointer = (event: PointerEvent<HTMLDivElement>) => {
    if (!drag.current) return;
    const delta =
      (vertical
        ? drag.current.origin - event.clientY
        : event.clientX - drag.current.origin) *
      (label === 'resize inspector' ? -1 : 1);
    onChange(clamp(drag.current.value + delta, min, max));
  };
  return (
    <div
      role="slider"
      tabIndex={0}
      aria-label={label}
      aria-orientation={vertical ? 'horizontal' : 'vertical'}
      aria-valuemin={min}
      aria-valuemax={max}
      aria-valuenow={Math.round(value)}
      className={`studio-resizer ${vertical ? 'studio-resizer-horizontal' : ''}`}
      onPointerDown={(event) => {
        drag.current = {
          origin: vertical ? event.clientY : event.clientX,
          value,
        };
        event.currentTarget.setPointerCapture(event.pointerId);
      }}
      onPointerMove={pointer}
      onPointerUp={() => {
        drag.current = null;
      }}
      onPointerCancel={() => {
        drag.current = null;
      }}
      onDoubleClick={onReset}
      onKeyDown={(event) => {
        const direction =
          event.key === 'ArrowRight' || event.key === 'ArrowUp'
            ? 1
            : event.key === 'ArrowLeft' || event.key === 'ArrowDown'
              ? -1
              : 0;
        if (direction) {
          event.preventDefault();
          onChange(clamp(value + direction * 8, min, max));
        }
      }}
    />
  );
}

export function StudioShell({
  sessionId,
  snapshot,
}: {
  sessionId: string;
  snapshot: SessionSnapshot | null;
}) {
  const router = useRouter();
  const saved = useSessionStore((state) => state.saved);
  const uploads = useUploads((state) => state.items);
  const online = useUploads((state) => state.online);
  const [current, setCurrent] = useState(snapshot);
  const [connection, setConnection] = useState(false);
  const [agentState, setAgentState] = useState<AgentState>(
    snapshot?.agentState ??
      (snapshot?.status === 'awaiting_review' ? 'waiting_user' : 'thinking'),
  );
  const [paused, setPaused] = useState(snapshot?.paused ?? false);
  const [actionCount, setActionCount] = useState(snapshot?.actionCount ?? 0);
  const [actions, setActions] = useState<string[]>([]);
  const [sizes, setSizes] = useState<Sizes>({
    agent: 360,
    inspector: 320,
    timeline: 320,
  });
  const [savedSizes, setSavedSizes] = useState<Partial<Sizes>>({});
  const [width, setWidth] = useState(1920);
  const [height, setHeight] = useState(1080);
  const [agentOpen, setAgentOpen] = useState(true);
  const [unread, setUnread] = useState(false);
  const [inspectorOpen, setInspectorOpen] = useState(true);
  const [timelineOpen, setTimelineOpen] = useState(true);
  const [banner, setBanner] = useState(true);
  const [watchTab, setWatchTab] = useState('chat');
  const [agentTab, setAgentTab] = useState('chat');
  const [selection, setSelection] = useState<string | null>(null);
  const [follow, setFollow] = useState(true);
  const [tool, setTool] = useState<Tool>('select');
  const [snap, setSnap] = useState(true);
  const [linked, setLinked] = useState(true);
  const [zoom, setZoom] = useState(50);
  const [viewerZoom, setViewerZoom] = useState('fit');
  const [guides, setGuides] = useState(false);
  const [overlays, setOverlays] = useState(true);
  const [loop, setLoop] = useState(false);
  const [playhead, setPlayhead] = useState(0);
  const [volume, setVolume] = useState(100);
  const [speed, setSpeed] = useState('1');
  const [title, setTitle] = useState('untitled video');
  const [titleDraft, setTitleDraft] = useState('');
  const [editingTitle, setEditingTitle] = useState(false);
  const [shortcutsOpen, setShortcutsOpen] = useState(false);
  const [leaveOpen, setLeaveOpen] = useState(false);
  const [finishOpen, setFinishOpen] = useState(false);
  const [note, setNote] = useState('');
  const [seconds, setSeconds] = useState(0);
  const [latency, setLatency] = useState<number | null>(null);
  const [version, setVersion] = useState(snapshot?.project.version ?? 0);
  const socket = useRef<WarmupConnection | null>(null);
  const snapshotRef = useRef(snapshot);
  const composer = useRef<HTMLTextAreaElement>(null);
  const titleInput = useRef<HTMLInputElement>(null);
  const sessionStart = useRef(snapshot?.createdAt ?? 0);
  const followRef = useRef(follow);
  followRef.current = follow;
  const agentOpenRef = useRef(agentOpen);
  agentOpenRef.current = agentOpen;
  const pinch = useRef<{ distance: number; zoom: number } | null>(null);
  const pingAt = useRef(0);
  const seen = useRef(new Set<string>());
  const breakpoint = useRef<number | null>(null);
  const project = current?.project;
  const projectClips = Object.values(project?.clips ?? {});
  const files = useMemo(
    () =>
      (current?.assets ?? []).filter(
        (asset) =>
          asset.source === 'user' &&
          (saved?.sessionId !== sessionId ||
            Object.values(saved.assetLocalMap).includes(asset.id)),
      ),
    [current, saved, sessionId],
  );
  const thumbnail = files
    .map((asset) => {
      const local = uploads.find((item) => item.assetId === asset.id);
      return local?.meta.thumbBlobUrl ?? asset.thumbUrl;
    })
    .find(Boolean);
  const duration = project?.duration ?? 0;
  const hasProject = Boolean(project && project.version > 0);
  const actionEnabled = actionCount > 0 || hasProject;
  const active =
    !paused && (agentState === 'acting' || agentState === 'thinking');
  const status = paused
    ? 'paused'
    : agentState === 'waiting_user'
      ? 'waiting for you'
      : agentState === 'acting'
        ? 'kimo is editing'
        : 'kimo is thinking';

  useEffect(() => {
    const resize = () => {
      const next = window.innerWidth;
      setWidth(next);
      setHeight(window.innerHeight);
      setSizes({ ...defaults(next), ...savedSizes });
      const mode = next < 1024 ? 0 : next < 1280 ? 1 : 2;
      if (breakpoint.current !== mode) {
        if (mode === 1) setInspectorOpen(false);
        else if (mode === 2 && breakpoint.current === 1) setInspectorOpen(true);
        breakpoint.current = mode;
      }
    };
    resize();
    window.addEventListener('resize', resize);
    return () => window.removeEventListener('resize', resize);
  }, [savedSizes]);
  useEffect(() => {
    try {
      const value: unknown = JSON.parse(localStorage.getItem(STORAGE) ?? '{}');
      if (value && typeof value === 'object') {
        const raw = value as Record<string, unknown>;
        const next: Partial<Sizes> = {};
        if (typeof raw.agent === 'number' && Number.isFinite(raw.agent))
          next.agent = clamp(raw.agent, 300, 480);
        if (typeof raw.inspector === 'number' && Number.isFinite(raw.inspector))
          next.inspector = clamp(raw.inspector, 280, 420);
        if (typeof raw.timeline === 'number' && Number.isFinite(raw.timeline))
          next.timeline = clamp(raw.timeline, 200, window.innerHeight * 0.6);
        setSavedSizes(next);
      }
      const storedTitle = localStorage.getItem(
        `kimo.studio.title.${sessionId}`,
      );
      if (storedTitle) setTitle(storedTitle);
    } catch {
      /* Storage may be disabled. */
    }
  }, [sessionId]);
  useEffect(() => {
    if (isUnfolding()) {
      const node = document.querySelector<HTMLElement>(
        '[data-studio-transition-ready]',
      );
      if (node) node.dataset.studioMounted = 'true';
    }
  }, []);
  useEffect(() => {
    if (!snapshot) return;
    let alive = true;
    const replace = (next: SessionSnapshot) => {
      if (!alive) return;
      if (
        snapshotRef.current &&
        next.project.version < snapshotRef.current.project.version
      )
        return;
      snapshotRef.current = next;
      setCurrent(next);
      setVersion(next.project.version);
    };
    const client = new KimoClient();
    const sync = new ProjectSync(
      client,
      sessionId,
      () => snapshotRef.current ?? snapshot,
      replace,
    );
    const event = (message: ServerEvent) => {
      if (message.t === 'hello' || message.t === 'project.ops') {
        void sync.receive(message).catch(() => undefined);
        if (message.t === 'project.ops' && followRef.current) {
          const operation = message.ops.find(
            (op) =>
              op.op === 'clip.update' ||
              op.op === 'clip.move' ||
              op.op === 'clip.trim' ||
              op.op === 'text.update',
          );
          if (operation && 'id' in operation) setSelection(operation.id);
          else if (operation && 'clipId' in operation)
            setSelection(operation.clipId);
        }
        if (message.t === 'hello') {
          setVersion(message.version);
          if (pingAt.current) {
            setLatency(Date.now() - pingAt.current);
            pingAt.current = 0;
          }
        }
      }
      if (message.t === 'agent.status') setAgentState(message.state);
      if (message.t === 'agent.action.start' && !seen.current.has(message.id)) {
        seen.current.add(message.id);
        setActionCount((count) => count + 1);
        setAgentState('acting');
        setActions((items) => [...items, message.title]);
        if (!agentOpenRef.current) setUnread(true);
        if (followRef.current && message.target?.clipId)
          setSelection(message.target.clipId);
      }
      if (message.t === 'agent.message' && message.kind === 'ask_review')
        setAgentState('waiting_user');
    };
    const connection = new WarmupConnection(
      sessionSocketUrl(sessionId, snapshot.wsUrl),
      event,
      () => setConnection(false),
      (connected) => {
        setConnection(connected);
        if (connected) {
          pingAt.current = Date.now();
          socket.current?.send({ t: 'ping' });
        }
      },
      true,
    );
    socket.current = connection;
    connection.start();
    void client
      .session(sessionId)
      .then((next) => {
        replace(next);
        if (!alive) return;
        if (next.createdAt) sessionStart.current = next.createdAt;
        if (next.actionCount !== undefined)
          setActionCount((count) => Math.max(count, next.actionCount ?? 0));
        if (next.paused !== undefined) setPaused(next.paused);
        if (next.agentState) setAgentState(next.agentState);
        if (next.status === 'awaiting_review') setAgentState('waiting_user');
      })
      .catch(() => undefined);
    return () => {
      alive = false;
      connection.dispose();
      socket.current = null;
    };
  }, [sessionId, snapshot]);
  useEffect(() => {
    if (!sessionStart.current) sessionStart.current = Date.now();
    const timer = setInterval(
      () =>
        setSeconds(
          Math.max(0, Math.floor((Date.now() - sessionStart.current) / 1000)),
        ),
      1000,
    );
    return () => clearInterval(timer);
  }, []);
  const resize = useCallback((key: keyof Sizes, value: number) => {
    setSavedSizes((old) => {
      const next = { ...old, [key]: value };
      try {
        localStorage.setItem(STORAGE, JSON.stringify(next));
      } catch {
        /* Storage may be disabled. */
      }
      return next;
    });
  }, []);
  const resetSize = useCallback((key: keyof Sizes) => {
    setSavedSizes((old) => {
      const next = Object.fromEntries(
        Object.entries(old).filter(([name]) => name !== key),
      ) as Partial<Sizes>;
      try {
        localStorage.setItem(STORAGE, JSON.stringify(next));
      } catch {
        /* Storage may be disabled. */
      }
      return next;
    });
  }, []);
  useEffect(() => {
    if (editingTitle) titleInput.current?.focus();
  }, [editingTitle]);
  useEffect(() => {
    if (agentOpen) setUnread(false);
  }, [agentOpen]);
  const send = useCallback(
    (message: ClientEvent) => socket.current?.send(message) ?? false,
    [],
  );
  const togglePause = useCallback(() => {
    if (send({ t: paused ? 'resume' : 'pause' })) setPaused(!paused);
  }, [paused, send]);
  const command = useCallback(
    (value: StudioCommand) => {
      if (value === 'focusComposer') {
        setAgentOpen(true);
        setWatchTab('chat');
        requestAnimationFrame(() => composer.current?.focus());
      } else if (value === 'pauseAgent') togglePause();
      else if (value === 'shortcuts') setShortcutsOpen(true);
      else if (value === 'start') setPlayhead(0);
      else if (value === 'end') setPlayhead(duration);
      else if (
        value === 'previous' ||
        value === 'next' ||
        value === 'previousSecond' ||
        value === 'nextSecond'
      )
        setPlayhead((old) =>
          clamp(
            old +
              (value === 'previous'
                ? -1 / 30
                : value === 'next'
                  ? 1 / 30
                  : value === 'previousSecond'
                    ? -1
                    : 1),
            0,
            duration,
          ),
        );
      else if (
        value === 'select' ||
        value === 'blade' ||
        value === 'slip' ||
        value === 'text'
      )
        setTool(value);
      else if (value === 'snap') setSnap((old) => !old);
      else if (value === 'loop') setLoop((old) => !old);
      else if (value === 'fit') setZoom(50);
    },
    [duration, togglePause],
  );
  useEffect(() => {
    const listener = (event: KeyboardEvent) => {
      const action = keyboardCommand(event);
      if (
        !action ||
        shortcutsOpen ||
        leaveOpen ||
        finishOpen ||
        ['fullscreen', 'undo', 'redo', 'play'].includes(action)
      )
        return;
      event.preventDefault();
      command(action);
    };
    window.addEventListener('keydown', listener);
    return () => window.removeEventListener('keydown', listener);
  }, [command, shortcutsOpen, leaveOpen, finishOpen]);
  if (!current || current.status === 'failed')
    return (
      <FullScreenError
        variant="session"
        onPrimary={() => router.refresh()}
        onSecondary={() => router.push('/')}
      />
    );
  const selected = selection ? project?.clips[selection] : undefined;
  const inspectorTitle = selected
    ? `${selected.kind === 'text' ? 'text' : selected.kind === 'audio' ? 'audio' : 'clip'} · ${current.assets.find((asset) => asset.id === selected.assetId)?.name ?? selected.text?.content ?? selected.id}`
    : 'project';
  const style = {
    '--studio-agent-width': `${agentOpen ? sizes.agent : 48}px`,
    '--studio-inspector-width': `${inspectorOpen ? sizes.inspector : 0}px`,
    '--studio-timeline-size': `${timelineOpen ? clamp(sizes.timeline, 200, height * 0.6) : 36}px`,
  } as CSSProperties;

  const agentPanel = (
    <section className="studio-panel studio-agent" aria-label="agent panel">
      <header className="studio-panel-header">
        <Avatar identity="agent" />
        <span className="studio-heading">kimo</span>
        <span className="studio-spacer" />
        <Button
          variant="ghost"
          size="sm"
          iconOnly
          icon={History}
          aria-label="action history"
          tooltip="action history"
          onClick={() => setAgentTab('actions')}
        />
        <Button
          variant="ghost"
          size="sm"
          iconOnly
          icon={PanelLeftClose}
          aria-label="collapse agent panel"
          tooltip="collapse agent panel"
          onClick={() => setAgentOpen(false)}
        />
      </header>
      <Tabs value={agentTab} onValueChange={setAgentTab} data-studio-agent-tabs>
        <TabsList aria-label="agent panel views">
          <TabsTrigger value="chat">chat</TabsTrigger>
          <TabsTrigger value="actions">actions</TabsTrigger>
        </TabsList>
        <TabsContent value="chat" data-studio-agent-content>
          {saved?.sessionId === sessionId && saved.prompt ? (
            <p className="studio-first-message">{saved.prompt}</p>
          ) : null}
        </TabsContent>
        <TabsContent value="actions" data-studio-agent-content>
          <ol className="studio-action-list">
            {actions.map((action, index) => (
              <li key={`${index}-${action}`}>{action}</li>
            ))}
          </ol>
        </TabsContent>
      </Tabs>
      <div className="studio-agent-footer">
        {active ? (
          <p>kimo will stop after the current step and read your note</p>
        ) : null}
        <div className="studio-composer">
          <textarea
            ref={composer}
            value={note}
            onChange={(event) => setNote(event.target.value)}
            placeholder={
              active ? 'type to interrupt kimo…' : 'tell kimo what to change…'
            }
            aria-label="tell kimo what to change"
          />
          <div className="studio-composer-actions">
            <Button
              variant="ghost"
              size="sm"
              iconOnly
              icon={Link2}
              aria-label="attach files"
              tooltip="attachments available in a later phase"
              disabled
            />
            <Button
              variant={note.trim() ? 'primary' : 'secondary'}
              size="sm"
              iconOnly
              icon={ArrowUp}
              aria-label="send note"
              tooltip="agent chat available in a later phase"
              disabled
            />
          </div>
        </div>
      </div>
    </section>
  );
  const inspector = (
    <section className="studio-panel studio-inspector" aria-label="inspector">
      <header className="studio-panel-header">
        <span className="studio-heading studio-inspector-title">
          {inspectorTitle}
        </span>
        <span className="studio-spacer" />
        <label className="studio-follow">
          follow kimo{' '}
          <Toggle
            aria-label="follow kimo"
            checked={follow}
            onCheckedChange={setFollow}
          />
        </label>
      </header>
    </section>
  );
  const viewer = (
    <section className="studio-panel studio-viewer" aria-label="viewer">
      <div className="studio-viewer-overlay">
        <span>
          {project?.width ?? 1920} × {project?.height ?? 1080} · 30 fps
        </span>
        <div className="studio-viewer-options">
          <SegmentedControl
            aria-label="viewer zoom"
            value={viewerZoom}
            onValueChange={setViewerZoom}
            options={[
              { value: 'fit', label: 'fit' },
              { value: '50', label: '50%' },
              { value: '100', label: '100%' },
            ]}
          />
          <Button
            variant="ghost"
            size="sm"
            iconOnly
            icon={Grid3X3}
            aria-label="toggle guides"
            tooltip="toggle guides"
            aria-pressed={guides}
            onClick={() => setGuides(!guides)}
          />
          <Button
            variant="ghost"
            size="sm"
            iconOnly
            icon={ScanEye}
            aria-label="toggle AI overlays"
            tooltip="toggle AI overlays"
            aria-pressed={overlays}
            onClick={() => setOverlays(!overlays)}
          />
        </div>
      </div>
      {!hasProject ? <div className="studio-loading-line" /> : null}
      <div className="studio-frame-area">
        <div
          className="studio-frame"
          style={{
            aspectRatio: `${project?.width ?? 1920} / ${project?.height ?? 1080}`,
          }}
        >
          {thumbnail && !hasProject ? (
            <div
              className="studio-thumbnail"
              style={{ backgroundImage: `url(${JSON.stringify(thumbnail)})` }}
            />
          ) : null}
          {!hasProject ? <span>kimo is laying out the first cut…</span> : null}
        </div>
      </div>
      <div className="studio-transport">
        <div className="studio-time">
          <span>{timecode(playhead)}</span>
          <small> / {timecode(duration)}</small>
        </div>
        <div className="studio-transport-controls">
          <Button
            variant="ghost"
            size="md"
            iconOnly
            icon={SkipBack}
            aria-label="go to start"
            tooltip="go to start"
            onClick={() => command('start')}
          />
          <Button
            variant="ghost"
            size="md"
            iconOnly
            icon={StepBack}
            aria-label="previous frame"
            tooltip="previous frame"
            onClick={() => command('previous')}
          />
          <Button
            size="lg"
            iconOnly
            icon={Play}
            aria-label="play"
            tooltip="preview available in a later phase"
            disabled
          />
          <Button
            variant="ghost"
            size="md"
            iconOnly
            icon={StepForward}
            aria-label="next frame"
            tooltip="next frame"
            onClick={() => command('next')}
          />
          <Button
            variant="ghost"
            size="md"
            iconOnly
            icon={SkipForward}
            aria-label="go to end"
            tooltip="go to end"
            onClick={() => command('end')}
          />
        </div>
        <div className="studio-transport-extra">
          <Button
            variant="ghost"
            size="sm"
            iconOnly
            icon={Repeat}
            aria-label="toggle loop"
            tooltip="toggle loop"
            aria-pressed={loop}
            onClick={() => setLoop(!loop)}
          />
          <Popover
            label="volume"
            trigger={
              <Button
                variant="ghost"
                size="sm"
                iconOnly
                icon={Volume2}
                aria-label="volume"
                tooltip="volume"
              />
            }
          >
            <label>
              volume{' '}
              <input
                type="range"
                min="0"
                max="100"
                value={volume}
                onChange={(event) => setVolume(Number(event.target.value))}
              />
            </label>
          </Popover>
          <label className="studio-speed">
            <span className="landing-sr-only">playback speed</span>
            <select
              value={speed}
              onChange={(event) => setSpeed(event.target.value)}
            >
              <option value="0.5">0.5×</option>
              <option value="1">1×</option>
              <option value="1.5">1.5×</option>
              <option value="2">2×</option>
            </select>
          </label>
        </div>
      </div>
    </section>
  );
  const timeline = (
    <section className="studio-panel studio-timeline" aria-label="timeline">
      <div className="studio-timeline-toolbar">
        <div className="studio-tools" role="group" aria-label="timeline tools">
          {(
            [
              { id: 'select', icon: MousePointer2 },
              { id: 'blade', icon: Scissors },
              { id: 'slip', icon: MoveHorizontal },
              { id: 'text', icon: Type },
            ] as const
          ).map(({ id, icon }) => (
            <Button
              key={id}
              variant="ghost"
              size="sm"
              iconOnly
              icon={icon}
              aria-label={id}
              tooltip={id}
              aria-pressed={tool === id}
              onClick={() => setTool(id)}
            />
          ))}
          <span className="studio-divider" />
          <Button
            variant="ghost"
            size="sm"
            iconOnly
            icon={Magnet}
            aria-label="toggle snapping"
            tooltip="toggle snapping"
            aria-pressed={snap}
            onClick={() => setSnap(!snap)}
          />
          <Button
            variant="ghost"
            size="sm"
            iconOnly
            icon={Link2}
            aria-label="toggle linked selection"
            tooltip="toggle linked selection"
            aria-pressed={linked}
            onClick={() => setLinked(!linked)}
          />
        </div>
        <span className="studio-tool-hint">{tool}</span>
        <div className="studio-zoom">
          <ZoomOut size={14} aria-hidden="true" />
          <input
            type="range"
            min="0"
            max="100"
            value={zoom}
            aria-label="timeline zoom"
            onChange={(event) => setZoom(Number(event.target.value))}
          />
          <ZoomIn size={14} aria-hidden="true" />
          <Button variant="ghost" size="xs" onClick={() => setZoom(50)}>
            fit
          </Button>
          <button
            className="studio-collapse-timeline"
            aria-label={timelineOpen ? 'collapse timeline' : 'expand timeline'}
            onClick={() => setTimelineOpen(!timelineOpen)}
          >
            {timelineOpen ? '−' : '+'}
          </button>
        </div>
      </div>
      {timelineOpen ? (
        <>
          <div className="studio-ruler">
            <span>00:00</span>
            <span>00:10</span>
            <span>00:20</span>
            <span>00:30</span>
          </div>
          <div className="studio-tracks">
            <div className="studio-track-headers">
              {(project?.tracks ?? []).slice(0, 4).map((track) => (
                <div key={track.id}>
                  {hasProject ? (
                    track.name
                  ) : (
                    <span className="studio-skeleton-header" />
                  )}
                </div>
              ))}
            </div>
            <div
              className="studio-track-content"
              data-timeline-content
              onTouchStart={(event) => {
                const first = event.touches[0];
                const second = event.touches[1];
                if (event.touches.length === 2 && first && second)
                  pinch.current = {
                    distance: Math.abs(first.clientX - second.clientX),
                    zoom,
                  };
              }}
              onTouchMove={(event) => {
                const first = event.touches[0];
                const second = event.touches[1];
                if (
                  event.touches.length === 2 &&
                  first &&
                  second &&
                  pinch.current?.distance
                )
                  setZoom(
                    clamp(
                      pinch.current.zoom +
                        (Math.abs(first.clientX - second.clientX) -
                          pinch.current.distance) /
                          2,
                      0,
                      100,
                    ),
                  );
              }}
              onTouchEnd={() => {
                pinch.current = null;
              }}
            >
              <div className="studio-clips">
                {hasProject
                  ? projectClips.map((clip, index) => (
                      <button
                        key={clip.id}
                        className="studio-clip"
                        onClick={() => {
                          setSelection(clip.id);
                          setInspectorOpen(true);
                        }}
                        style={{
                          viewTransitionName:
                            clip.assetId &&
                            projectClips.findIndex(
                              (item) => item.assetId === clip.assetId,
                            ) === index
                              ? assetTransitionName(clip.assetId)
                              : undefined,
                        }}
                      >
                        {current.assets.find(
                          (asset) => asset.id === clip.assetId,
                        )?.name ??
                          clip.text?.content ??
                          clip.kind}
                      </button>
                    ))
                  : Array.from({ length: 3 }, (_, index) => (
                      <span
                        className="studio-skeleton-clip"
                        key={index}
                        style={{
                          viewTransitionName: files[index]
                            ? assetTransitionName(files[index].id)
                            : undefined,
                        }}
                      />
                    ))}
              </div>
              <svg
                className="studio-timeline-playhead"
                viewBox="0 0 7 80"
                aria-hidden="true"
              >
                <path d="M3.5 6v74" stroke="currentColor" strokeWidth="1.5" />
                <path d="M0 0h7L3.5 7z" fill="currentColor" />
              </svg>
            </div>
          </div>
          <div className="studio-timeline-footer">
            <span />
          </div>
        </>
      ) : null}
    </section>
  );

  return (
    <main
      id="main"
      data-ready="false"
      data-studio-transition-ready
      className="studio-shell"
      data-agent-open={agentOpen}
      data-inspector-open={inspectorOpen}
      style={style}
    >
      <Ready />
      <h1 className="landing-sr-only">{title}</h1>
      <header className="studio-topbar">
        <div className="studio-top-left">
          <Dialog
            open={leaveOpen}
            onOpenChange={setLeaveOpen}
            trigger={
              <button className="studio-mark" aria-label="leave studio" />
            }
          >
            <DialogContent
              title="leave the studio?"
              description="your edit keeps its place for 24 hours."
              actions={
                <>
                  <Button variant="danger" onClick={() => router.push('/')}>
                    leave
                  </Button>
                  <DialogClose asChild>
                    <Button>stay</Button>
                  </DialogClose>
                </>
              }
            />
          </Dialog>
          <span className="studio-divider" />
          {editingTitle ? (
            <input
              className="studio-title-input"
              ref={titleInput}
              aria-label="project title"
              value={titleDraft}
              onChange={(event) => setTitleDraft(event.target.value)}
              onBlur={() => {
                const next = titleDraft.trim() || 'untitled video';
                setTitle(next);
                setEditingTitle(false);
                try {
                  localStorage.setItem(`kimo.studio.title.${sessionId}`, next);
                } catch {
                  /* Storage may be disabled. */
                }
              }}
              onKeyDown={(event) => {
                if (event.key === 'Enter') event.currentTarget.blur();
                if (event.key === 'Escape') {
                  setEditingTitle(false);
                }
              }}
            />
          ) : (
            <button
              className="studio-title"
              onClick={() => {
                setTitleDraft(title);
                setEditingTitle(true);
              }}
            >
              {title}
              <Pencil size={12} aria-hidden="true" />
            </button>
          )}
          <span className="studio-save" data-offline={!online || undefined}>
            {online ? 'saved' : 'offline · changes kept locally'}
          </span>
        </div>
        <div className="studio-top-center">
          <button
            className="studio-status-pill"
            data-state={paused ? 'paused' : agentState}
            onClick={() => setAgentOpen(true)}
          >
            <span className="studio-status-dot" />
            {status}
            {agentState === 'acting' && !paused ? (
              <small> · {actionCount} actions</small>
            ) : null}
          </button>
          <Button
            variant="ghost"
            size="sm"
            iconOnly
            icon={paused ? Play : Pause}
            aria-label={paused ? 'let kimo continue' : 'pause kimo'}
            tooltip={paused ? 'let kimo continue' : 'pause kimo'}
            onClick={togglePause}
            disabled={!connection}
          />
        </div>
        <div className="studio-top-right">
          <Button
            variant="ghost"
            size="sm"
            iconOnly
            icon={Undo2}
            aria-label="undo"
            tooltip="undo available in a later phase"
            disabled
          />
          <Button
            variant="ghost"
            size="sm"
            iconOnly
            icon={Redo2}
            aria-label="redo"
            tooltip="redo available in a later phase"
            disabled
          />
          <span className="studio-divider" />
          <Button
            variant="ghost"
            size="sm"
            iconOnly
            icon={PanelRight}
            aria-label="toggle inspector"
            tooltip="toggle inspector"
            aria-pressed={inspectorOpen}
            onClick={() => setInspectorOpen(!inspectorOpen)}
          />
          <Button
            variant="ghost"
            size="sm"
            iconOnly
            icon={PanelLeft}
            aria-label="toggle agent panel"
            tooltip="toggle agent panel"
            aria-pressed={agentOpen}
            onClick={() => setAgentOpen(!agentOpen)}
          />
          <Button size="sm" icon={Maximize2} disabled>
            preview full
          </Button>
          <Dialog
            open={finishOpen}
            onOpenChange={setFinishOpen}
            trigger={
              <Button
                data-review={agentState === 'waiting_user' || undefined}
                size="sm"
                variant={actionEnabled ? 'primary' : 'secondary'}
                disabled={!actionEnabled}
              >
                finish
              </Button>
            }
          >
            <DialogContent
              title="finish"
              description="review will be available in a later phase."
              actions={
                <DialogClose asChild>
                  <Button>close</Button>
                </DialogClose>
              }
            />
          </Dialog>
        </div>
      </header>
      {width < 1024 && banner ? (
        <div className="studio-watch-banner">
          <span>for full editing, open kimo on a bigger screen</span>
          <button aria-label="dismiss notice" onClick={() => setBanner(false)}>
            ×
          </button>
        </div>
      ) : null}
      <div className="studio-workspace">
        <div className="studio-upper">
          {agentOpen ? (
            agentPanel
          ) : (
            <aside
              className="studio-panel studio-agent-rail"
              aria-label="collapsed agent panel"
            >
              <Avatar identity="agent" />
              {unread ? (
                <span
                  className="studio-unread-dot"
                  role="status"
                  aria-label="new agent activity"
                />
              ) : null}
              <Button
                variant="ghost"
                size="sm"
                iconOnly
                icon={PanelLeftOpen}
                aria-label="expand agent panel"
                tooltip="expand agent panel"
                onClick={() => setAgentOpen(true)}
              />
            </aside>
          )}
          <Resizer
            label="resize agent panel"
            value={sizes.agent}
            min={300}
            max={
              width >= 1280
                ? Math.min(
                    480,
                    Math.max(
                      300,
                      width - (inspectorOpen ? sizes.inspector : 0) - 592,
                    ),
                  )
                : 480
            }
            onChange={(value) => resize('agent', value)}
            onReset={() => resetSize('agent')}
          />
          {viewer}
          <Resizer
            label="resize inspector"
            value={sizes.inspector}
            min={280}
            max={
              width >= 1280
                ? Math.min(
                    420,
                    Math.max(280, width - (agentOpen ? sizes.agent : 48) - 592),
                  )
                : 420
            }
            onChange={(value) => resize('inspector', value)}
            onReset={() => resetSize('inspector')}
          />
          {inspectorOpen ? inspector : null}
        </div>
        <Resizer
          label="resize timeline"
          vertical
          value={sizes.timeline}
          min={200}
          max={height * 0.6}
          onChange={(value) => resize('timeline', value)}
          onReset={() => resetSize('timeline')}
        />
        {timeline}
      </div>
      {width < 1024 ? (
        <div className="studio-watch-content">
          <Tabs value={watchTab} onValueChange={setWatchTab}>
            <TabsList aria-label="watch mode views">
              <TabsTrigger value="chat">chat</TabsTrigger>
              <TabsTrigger value="timeline">timeline</TabsTrigger>
              <TabsTrigger value="edit">edit</TabsTrigger>
            </TabsList>
            <TabsContent value="chat">{agentPanel}</TabsContent>
            <TabsContent value="timeline">{timeline}</TabsContent>
            <TabsContent value="edit">{inspector}</TabsContent>
          </Tabs>
        </div>
      ) : null}
      <footer className="studio-statusbar">
        <div>
          <span>preview — fps</span>
          <span>·</span>
          <span>
            proxies ready{' '}
            {
              files.filter(
                (asset) =>
                  asset.proxyUrl ||
                  uploads.some(
                    (item) =>
                      item.assetId === asset.id && item.status === 'done',
                  ),
              ).length
            }
            /{files.length}
          </span>
          <span>·</span>
          <span>session {timecode(seconds).slice(0, 8)}</span>
        </div>
        <div>
          <Popover
            label="connection details"
            trigger={
              <button className="studio-connection">
                <span data-connected={connection || undefined} />
                {connection ? 'connected' : 'reconnecting…'}
              </button>
            }
          >
            <div>latency {latency === null ? '—' : `${latency} ms`}</div>
            <div>WS version {version}</div>
          </Popover>
          <Dialog
            open={shortcutsOpen}
            onOpenChange={setShortcutsOpen}
            trigger={
              <button
                className="studio-shortcuts-trigger"
                aria-label="keyboard shortcuts"
              >
                ?
              </button>
            }
          >
            <DialogContent
              size="md"
              title="keyboard shortcuts"
              description=""
              actions={
                <DialogClose asChild>
                  <Button>close</Button>
                </DialogClose>
              }
            >
              <div className="studio-shortcuts">
                {shortcuts.map(([keys, description]) => (
                  <div key={keys}>
                    <span>{description}</span>
                    <Kbd>{keys}</Kbd>
                  </div>
                ))}
              </div>
            </DialogContent>
          </Dialog>
        </div>
      </footer>
    </main>
  );
}
