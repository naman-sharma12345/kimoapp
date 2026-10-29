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
import { useRouter } from '@/lib/app-router';
import {
  Activity,
  Grid3X3,
  FolderOpen,
  Link2,
  Magnet,
  Maximize2,
  MousePointer2,
  MoveHorizontal,
  PanelLeft,
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
  X,
} from 'lucide-react';
import type { CompositorController, PreviewMetrics } from '@kimo/compositor';
import {
  KimoApiError,
  KimoClient,
  ProjectSync,
  resolveAsset,
  resolveAssets,
  type AiCredentials,
  type AssetAnalysis,
  type ClientEvent,
  type Clip,
  type Op,
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
import { useUploads, uploadManager } from '@/lib/uploads/manager';
import { isUnfolding } from '@/lib/warmup/transition';
import { assetTransitionName } from '@/components/warmup/warmup-reel';
import { track, rememberPrompt } from '@/lib/telemetry';
import {
  CommandPalette,
  ComparePreview,
  StudioCoach,
  readCuts,
  restoreCut,
  type Cut,
} from './launch-tools';
import { offlineOutbox } from '@/lib/offline-outbox';
import { EditingTimeline } from './editing-timeline';
import { EditingInspector } from './editing-inspector';
import { inverseOps } from './edit-history';
import { AgentFeed } from '@/lib/agent-feed';
import { AgentPresence } from './agent-presence';
import { AgentPanel } from './agent-panel';
import { ReviewDialog, WatchFirstCut } from '@/components/render/review-dialog';
import { useReducedMotion } from '@/lib/use-reduced-motion';
import {
  navigateRendered,
  renderTiming,
  saveRenderContext,
} from '@/lib/render';
import { ViewerTextEditor } from './viewer-text-editor';
import { LocalClipsNotice } from './local-clips-notice';
import { NoteError } from './agent-panel';
import { AiSettings, activeAi, aiErrorCopy, readAiChoice } from './ai-settings';
import {
  hasLocalMedia,
  localFile,
  missingAssets,
  onLocalMediaChange,
} from '@/lib/local-media';
import { analyzeBytes } from '@/lib/media-analysis';
import { videoPoster } from '@/lib/landing-files';
import { PERCEIVE_NOTE, perceiveClips } from '@/lib/perceive';
import { checkCut } from '@/lib/render-check';
import { editWithRealKimo } from '@/lib/real-engine';
import {
  CLIPS_WAIT_NOTE,
  firstPromptGate,
  isPreparing,
  prepareClip,
  setClipStage,
} from '@/lib/clip-prep';
import { ClipPrepPanel } from './clip-prep-panel';
import { exportedVersion, setExportJob } from '@/lib/export-job';

/** Clips already measured in this tab, and prompts already run. */
const analyzed = new Set<string>();
const promptsRun = new Set<string>();
const holdNoted = new Set<string>();
const preparing = new Map<string, Promise<AssetAnalysis | undefined>>();
let prepQueue: Promise<unknown> = Promise.resolve();
export const AI_OFF_NOTICE =
  'ai editing isn’t switched on yet. you can still edit by hand, preview and export.';
function noteError(error: unknown) {
  if (!(error instanceof KimoApiError)) return error;
  const copy: Record<string, string> = {
    ai_unavailable: AI_OFF_NOTICE,
    ai_quota: 'you’ve used today’s ai edits. manual editing still works.',
    ai_invalid_edit:
      'kimo couldn’t turn that into a safe edit, so nothing changed. try saying it another way.',
    ai_upstream: 'the ai editor didn’t answer. try again in a moment.',
    rate_limited: 'that’s a lot of notes at once. give it a minute.',
    too_large: 'that note is too long. try a shorter one.',
  };
  if (copy[error.code]) return new NoteError(copy[error.code]);
  if (error.code.startsWith('ai_')) return new NoteError(aiErrorCopy(error));
  return error;
}
import { isTypingTarget } from '@/lib/keyboard';

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
  const [aiClips, setAiClips] = useState<string[]>([]);
  const [agentState, setAgentState] = useState<AgentState>(
    snapshot?.agentState ??
      (snapshot?.status === 'awaiting_review' ? 'waiting_user' : 'thinking'),
  );
  const [paused, setPaused] = useState(snapshot?.paused ?? false);
  const [actionCount, setActionCount] = useState(snapshot?.actionCount ?? 0);
  const [feed] = useState(() => new AgentFeed());
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
  const [assetsOpen, setAssetsOpen] = useState(false);
  const [assetTab, setAssetTab] = useState<'user' | 'web'>('user');
  const [snap, setSnap] = useState(true);
  const [linked, setLinked] = useState(true);
  const [zoom, setZoom] = useState(50);
  const [viewerZoom, setViewerZoom] = useState('fit');
  const [guides, setGuides] = useState(false);
  const [overlays, setOverlays] = useState(true);
  const [loop, setLoop] = useState(false);
  const [inPoint, setInPoint] = useState<number | null>(null);
  const [outPoint, setOutPoint] = useState<number | null>(null);
  const [playhead, setPlayhead] = useState(0);
  const [previewPlaying, setPreviewPlaying] = useState(false);
  const [previewReady, setPreviewReady] = useState(false);
  const [metrics, setMetrics] = useState<PreviewMetrics | null>(null);
  const [fullscreen, setFullscreen] = useState(false);
  const [fullscreenControls, setFullscreenControls] = useState(true);
  const [editAt, setEditAt] = useState<number | null>(null);
  const [region, setRegion] = useState<{
    x: number;
    y: number;
    w: number;
    h: number;
  } | null>(null);
  const [maskPolygon, setMaskPolygon] = useState<number[][] | null>(null);
  const [volume, setVolume] = useState(100);
  const [speed, setSpeed] = useState('1');
  const [title, setTitle] = useState('untitled video');
  const [titleDraft, setTitleDraft] = useState('');
  const [editingTitle, setEditingTitle] = useState(false);
  const [shortcutsOpen, setShortcutsOpen] = useState(false);
  const [leaveOpen, setLeaveOpen] = useState(false);
  const [finishOpen, setFinishOpen] = useState(false);
  const [watchReview, setWatchReview] = useState(
    snapshot?.status === 'awaiting_review',
  );
  const [reviewHovered, setReviewHovered] = useState(false);
  const reducedMotion = useReducedMotion();
  const [note, setNote] = useState('');
  const [seconds, setSeconds] = useState(0);
  const [latency, setLatency] = useState<number | null>(null);
  const [version, setVersion] = useState(snapshot?.project.version ?? 0);
  const socket = useRef<WarmupConnection | null>(null);
  const canvas = useRef<HTMLCanvasElement>(null);
  const preview = useRef<CompositorController | null>(null);
  const previewPlayingRef = useRef(false);
  const scrubbingRef = useRef(false);
  const followFrame = useRef(0);
  const playheadRef = useRef(0);
  playheadRef.current = playhead;
  const overlayTimer = useRef<ReturnType<typeof setTimeout> | undefined>(
    undefined,
  );
  const lastOpReceived = useRef<number | undefined>(undefined);
  const snapshotRef = useRef(snapshot);
  const syncRef = useRef<ProjectSync | null>(null);
  const editingRef = useRef(false);
  const selectedRef = useRef(selection);
  selectedRef.current = selection;
  const [suggestion, setSuggestion] = useState<{
    id: string;
    content: string;
    mine: string;
  } | null>(null);
  const [agentSteps, setAgentSteps] = useState<{ id: string; undo: Op[] }[]>(
    [],
  );
  const [systemLines, setSystemLines] = useState<string[]>([]);
  const removedClip = useRef<Clip | null>(null);
  const filePicker = useRef<HTMLInputElement>(null);
  const replaceClip = useRef<string | null>(null);
  const [uploadError, setUploadError] = useState('');
  const pendingEvents = useRef<
    Extract<ServerEvent, { t: 'project.ops' | 'hello' }>[]
  >([]);
  const undoStack = useRef<{ undo: Op[]; redo: Op[] }[]>([]);
  const redoStack = useRef<{ undo: Op[]; redo: Op[] }[]>([]);
  const [historyCount, setHistoryCount] = useState(0);
  const [editError, setEditError] = useState('');
  const composer = useRef<HTMLDivElement>(null);
  const titleInput = useRef<HTMLInputElement>(null);
  const sessionStart = useRef(snapshot?.createdAt ?? 0);
  const followRef = useRef(follow);
  followRef.current = follow;
  const agentOpenRef = useRef(agentOpen);
  agentOpenRef.current = agentOpen;
  const pingAt = useRef(0);
  const seen = useRef(new Set<string>());
  const breakpoint = useRef<number | null>(null);
  const [cuts, setCuts] = useState<Cut[]>([]);
  const [viewedCut, setViewedCut] = useState<Cut | null>(null);
  const viewedRef = useRef(viewedCut);
  viewedRef.current = viewedCut;
  const [compareCut, setCompareCut] = useState<Cut | null>(null);
  const [palette, setPalette] = useState(false);
  const [beatGrid, setBeatGrid] = useState(false);
  const [pendingCount, setPendingCount] = useState(0);
  const [aiAvailable, setAiAvailable] = useState<boolean>();
  // The user's own AI key: in-memory React state for this tab only. It is
  // never written to storage or cookies, and a refresh clears it.
  const [aiSettings, setAiSettings] = useState<AiCredentials>({
    provider: 'openai',
    key: '',
    model: '',
  });
  const userAi = activeAi(aiSettings);
  const userAiRef = useRef(userAi);
  userAiRef.current = userAi;
  const userAiReady = Boolean(userAi);
  useEffect(() => {
    setAiSettings((value) => ({ ...value, ...readAiChoice() }));
  }, []);
  const [clipsInTab, setClipsInTab] = useState(hasLocalMedia);
  useEffect(() => {
    let alive = true;
    void new KimoClient()
      .aiStatus()
      .then((status) => {
        if (alive) setAiAvailable(status.available);
      })
      .catch(() => undefined);
    return () => {
      alive = false;
    };
  }, []);
  // Clips added (or added again) in this tab swap in their object URLs.
  useEffect(
    () =>
      onLocalMediaChange(() => {
        setClipsInTab(hasLocalMedia());
        const old = snapshotRef.current;
        if (!old) return;
        const next = { ...old, assets: resolveAssets(old.assets) };
        snapshotRef.current = next;
        setCurrent(next);
      }),
    [],
  );
  // Leaving with clips in the tab and an unexported cut loses the clips.
  useEffect(() => {
    const warn = (event: BeforeUnloadEvent) => {
      const version = snapshotRef.current?.project.version;
      if (!hasLocalMedia() || version === exportedVersion(sessionId)) return;
      event.preventDefault();
      event.returnValue = '';
    };
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, [sessionId]);
  const assetKey = (current?.assets ?? [])
    .map((asset) => `${asset.id}:${asset.url}`)
    .join('|');
  // Get each clip ready in the browser (read, poster, sound measured as
  // numbers only), then run the landing prompt as the first AI edit once
  // every clip is here and ready.
  useEffect(() => {
    const snap = snapshotRef.current;
    if (!snap) return;
    let alive = true;
    const started: Promise<AssetAnalysis | undefined>[] = [];
    const waiting: Promise<unknown>[] = [];
    for (const asset of snap.assets) {
      if (asset.kind !== 'video' && asset.kind !== 'audio') continue;
      const file = localFile(asset.id);
      if (!file) continue;
      const running = preparing.get(asset.id);
      if (running) {
        waiting.push(running);
        continue;
      }
      if (analyzed.has(asset.id)) continue;
      analyzed.add(asset.id);
      const kind = asset.kind;
      const hasPoster =
        Boolean(asset.thumbUrl) ||
        uploadManager.store
          .getState()
          .items.some(
            (item) => item.assetId === asset.id && item.meta.thumbBlobUrl,
          );
      setClipStage(asset.id, asset.name, 'reading');
      const job = prepQueue
        .then(() =>
          prepareClip({ id: asset.id, name: asset.name, kind }, file, {
            thumbnail: (picked) =>
              hasPoster ? Promise.resolve() : videoPoster(picked),
            analyze: (bytes, onProgress) =>
              analyzeBytes(asset.id, bytes, kind, onProgress),
          }),
        )
        .finally(() => preparing.delete(asset.id));
      prepQueue = job.catch(() => undefined);
      preparing.set(asset.id, job);
      started.push(job);
      waiting.push(job);
    }
    const gate = () =>
      firstPromptGate({
        prompt: snap.pendingPrompt,
        aiReady: aiAvailable === true || Boolean(userAiRef.current),
        alreadyRun: promptsRun.has(sessionId),
        missingClips: missingAssets(snap.assets).length,
        preparing: preparing.size > 0 || isPreparing(),
      });
    if (gate() === 'wait' && !holdNoted.has(sessionId)) {
      holdNoted.add(sessionId);
      feed.system(CLIPS_WAIT_NOTE);
    }
    void (async () => {
      // Clips get ready one after another so long ones never pile up in memory.
      const analyses = (await Promise.all(started)).filter(
        (result): result is AssetAnalysis => Boolean(result),
      );
      await Promise.all(waiting);
      if (analyses.length)
        await new KimoClient()
          .sendAnalysis(sessionId, { analyses })
          .catch(() => undefined);
      const prompt = snap.pendingPrompt;
      if (!alive || !prompt || gate() !== 'run') return;
      promptsRun.add(sessionId);
      feed.system(`working on: ${prompt}`);
      if (
        await editWithRealKimo({
          sessionId,
          note: prompt,
          snapshot: snapshotRef.current,
          ai: userAiRef.current,
          say: (line) => feed.system(line),
        })
      )
        return;
      if (!alive) return;
      await perceiveClips(sessionId, snap.assets, userAiRef.current, () =>
        feed.system(PERCEIVE_NOTE),
      );
      if (!alive) return;
      await new KimoClient()
        .message(sessionId, { text: prompt }, userAiRef.current)
        .then(() =>
          checkCut({
            sessionId,
            note: prompt,
            snapshot: () => snapshotRef.current,
            ai: userAiRef.current,
            say: (line) => feed.system(line),
          }).catch(() =>
            feed.error(
              'the render check could not finish · the cut is ready to review',
            ),
          ),
        )
        .catch((error: unknown) => {
          setAgentState('idle');
          const friendly = noteError(error);
          feed.error(
            friendly instanceof NoteError
              ? friendly.message
              : 'could not run your first note · send it again',
          );
        });
    })();
    return () => {
      alive = false;
    };
  }, [assetKey, aiAvailable, sessionId, feed, userAiReady]);
  const recordCut = useCallback(() => {
    const next = snapshotRef.current;
    if (!next) return;
    setCuts((previous) => {
      if (previous.at(-1)?.project.version === next.project.version)
        return previous;
      const result = [
        ...previous,
        {
          name: `cut ${previous.length + 1}`,
          project: structuredClone(next.project),
          assets: structuredClone(next.assets),
        },
      ];
      try {
        localStorage.setItem(`kimo.cuts.${sessionId}`, JSON.stringify(result));
      } catch {
        setEditError('could not keep this cut on this device');
      }
      return result;
    });
  }, [sessionId]);
  useEffect(() => {
    setCuts(readCuts(sessionId));
  }, [sessionId]);
  const project = viewedCut?.project ?? current?.project;
  // Fit the whole project to the timeline width on load and whenever clips
  // are added (resizes re-fit on their own while zoom stays at fit).
  const mediaCount = current?.assets.length ?? 0;
  useEffect(() => {
    if (mediaCount) setZoom(50);
  }, [mediaCount]);
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
  const status = paused
    ? 'paused'
    : agentState === 'waiting_user'
      ? 'waiting for you'
      : agentState === 'acting'
        ? 'kimo is editing'
        : agentState === 'thinking'
          ? 'kimo is thinking'
          : 'kimo is ready';

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
    let receivedAgentState = false;
    const replace = (next: SessionSnapshot, force = false) => {
      if (!alive) return;
      if (
        !force &&
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
      (next) => replace(next, true),
      offlineOutbox,
    );
    syncRef.current = sync;
    let outstanding = 0;
    let replaying = false;
    sync.onPending = (count) => {
      outstanding = count;
      setPendingCount(count);
    };
    const replayTimer = setInterval(() => {
      if (!outstanding || !navigator.onLine || replaying) return;
      replaying = true;
      void sync
        .restore()
        .catch(() => {
          if (alive)
            setEditError('changes are kept locally · reconnect to sync');
        })
        .finally(() => {
          replaying = false;
        });
    }, 15000);
    sync.onSuggestion = (id, content) =>
      setSuggestion({
        id,
        content,
        mine: snapshotRef.current?.project.clips[id]?.text?.content ?? '',
      });
    sync.onRemoved = (id) => {
      removedClip.current = snapshotRef.current?.project.clips[id] ?? null;
      setEditError('kimo removed a clip you were editing · undo');
    };
    sync.onAgentBatch = (project, ops, id) => {
      try {
        const undo = inverseOps(project, ops);
        if (undo.length && id)
          setAgentSteps((steps) => [...steps, { id, undo }]);
      } catch {
        /* Invalidated agent groups cannot be safely reverted. */
      }
    };
    const event = (message: ServerEvent) => {
      feed.receive(message);
      if (message.t === 'asset.added' && snapshotRef.current) {
        const existing = snapshotRef.current;
        replace({
          ...existing,
          assets: [
            ...existing.assets.filter((asset) => asset.id !== message.asset.id),
            resolveAsset(message.asset),
          ],
        });
      }
      if (message.t === 'hello' || message.t === 'project.ops') {
        if (message.t === 'project.ops') {
          lastOpReceived.current = performance.now();
          if (message.actionId !== 'user')
            setAiClips(
              message.ops.flatMap((op) =>
                'clipId' in op
                  ? [op.clipId]
                  : 'id' in op && op.op.startsWith('clip.')
                    ? [op.id]
                    : op.op === 'clip.add'
                      ? [op.clip.id]
                      : [],
              ),
            );
        }
        void sync.receive(message).catch(() => undefined);
        if (
          message.t === 'project.ops' &&
          followRef.current &&
          !editingRef.current
        ) {
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
      if (message.t === 'agent.status') {
        receivedAgentState = true;
        setAgentState(message.state);
        if (message.label === 'paused') setPaused(true);
        if (message.label === 'continuing') setPaused(false);
      }
      if (message.t === 'agent.action.start' && !seen.current.has(message.id)) {
        receivedAgentState = true;
        seen.current.add(message.id);
        setActionCount((count) => count + 1);
        setAgentState('acting');
        setPaused(false);
        setAiClips(message.target?.clipId ? [message.target.clipId] : []);
        if (!agentOpenRef.current) setUnread(true);
        if (followRef.current && message.target?.clipId)
          setSelection(message.target.clipId);
        if (overlayTimer.current) clearTimeout(overlayTimer.current);
        setRegion(message.target?.region ?? null);
        setMaskPolygon(null);
        const targetClip = message.target?.clipId
          ? snapshotRef.current?.project.clips[message.target.clipId]
          : undefined;
        if (targetClip && followRef.current && !scrubbingRef.current) {
          if (previewPlayingRef.current) setEditAt(targetClip.start);
          else {
            cancelAnimationFrame(followFrame.current);
            const from = preview.current?.current ?? 0;
            const started = performance.now();
            const tick = (now: number) => {
              if (previewPlayingRef.current || scrubbingRef.current) return;
              const progress = Math.min(1, (now - started) / 240);
              const time =
                from + (targetClip.start - from) * (1 - (1 - progress) ** 3);
              preview.current?.seek(time);
              setPlayhead(time);
              if (progress < 1)
                followFrame.current = requestAnimationFrame(tick);
            };
            if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
              preview.current?.seek(targetClip.start);
              setPlayhead(targetClip.start);
            } else followFrame.current = requestAnimationFrame(tick);
          }
        }
      }
      if (message.t === 'sam.mask')
        setMaskPolygon(message.previewPolygon ?? null);
      if (message.t === 'agent.action.end') {
        setTimeout(() => {
          if (alive && !feed.getSnapshot().runningId) setAiClips([]);
        }, 600);
        if (overlayTimer.current) clearTimeout(overlayTimer.current);
        overlayTimer.current = setTimeout(() => {
          setRegion(null);
          setMaskPolygon(null);
        }, 600);
      }
      if (message.t === 'agent.message' && message.kind === 'ask_review') {
        receivedAgentState = true;
        setAgentState('waiting_user');
        setWatchReview(true);
        track('review_shown');
        void sync
          .whenIdle()
          .then(recordCut)
          .catch(() => undefined);
      }
    };
    let wasConnected = false;
    const connection = new WarmupConnection(
      sessionSocketUrl(sessionId, snapshot.wsUrl),
      event,
      () => setConnection(false),
      (connected) => {
        setConnection(connected);
        if (connected) {
          if (wasConnected) feed.system('reconnected');
          wasConnected = true;
          pingAt.current = Date.now();
          socket.current?.send({ t: 'ping' });
        }
      },
      true,
      () => sync.restore(),
    );
    socket.current = connection;
    void sync
      .restore()
      .then(() => connection.start())
      .catch(() => connection.start());
    void client
      .session(sessionId)
      .then((next) => {
        replace(next);
        if (!alive) return;
        if (next.createdAt) sessionStart.current = next.createdAt;
        if (next.actionCount !== undefined)
          setActionCount((count) => Math.max(count, next.actionCount ?? 0));
        if (!receivedAgentState) {
          if (next.paused !== undefined) setPaused(next.paused);
          if (next.agentState) setAgentState(next.agentState);
        }
        if (next.status === 'awaiting_review') {
          setAgentState('waiting_user');
          recordCut();
        }
      })
      .catch(() => undefined);
    return () => {
      alive = false;
      clearInterval(replayTimer);
      connection.dispose();
      socket.current = null;
      syncRef.current = null;
      if (overlayTimer.current) clearTimeout(overlayTimer.current);
      cancelAnimationFrame(followFrame.current);
    };
  }, [sessionId, snapshot, feed, recordCut]);
  useEffect(() => {
    if (!canvas.current || !snapshot) return;
    let canceled = false;
    let controller: CompositorController | undefined;
    const element = canvas.current;
    void import('@kimo/compositor').then(async ({ CompositorController }) => {
      if (canceled) return;
      const initial = snapshotRef.current ?? snapshot;
      controller = new CompositorController(
        element,
        initial.project,
        initial.assets,
        (next) => {
          if (!canceled) {
            setMetrics(next);
            setPlayhead(next.time);
            setPreviewPlaying(next.playing);
            previewPlayingRef.current = next.playing;
          }
        },
      );
      preview.current = controller;
      if (lastOpReceived.current !== undefined) {
        controller.update(
          initial.project,
          initial.assets,
          lastOpReceived.current,
        );
        lastOpReceived.current = undefined;
      }
      void Promise.allSettled([
        new FontFace('Geist', 'url(/preview-fonts/Geist-Regular.ttf)').load(),
        new FontFace(
          'Geist Mono',
          'url(/preview-fonts/GeistMono-Regular.woff2)',
        ).load(),
        new FontFace(
          'Instrument Serif',
          'url(/preview-fonts/InstrumentSerif-Italic.ttf)',
          { style: 'italic' },
        ).load(),
        new FontFace('Anton', 'url(/preview-fonts/Anton-Regular.ttf)').load(),
        new FontFace(
          'DM Serif Display',
          'url(/preview-fonts/DMSerifDisplay-Regular.ttf)',
        ).load(),
      ]).then((fonts) => {
        for (const font of fonts)
          if (font.status === 'fulfilled') document.fonts.add(font.value);
        controller?.invalidate();
      });
      try {
        await controller.mount();
        if (!canceled) setPreviewReady(true);
      } catch {
        if (!canceled) setPreviewReady(false);
      }
    });
    const observer = new ResizeObserver(() => controller?.invalidate());
    observer.observe(element);
    return () => {
      canceled = true;
      observer.disconnect();
      controller?.destroy();
      if (preview.current === controller) preview.current = null;
    };
  }, [sessionId, snapshot]);
  useEffect(() => {
    if (current && preview.current) {
      preview.current.update(
        viewedCut?.project ?? current.project,
        viewedCut?.assets ?? current.assets,
        lastOpReceived.current,
      );
      lastOpReceived.current = undefined;
    }
  }, [current, viewedCut]);
  useEffect(() => {
    preview.current?.setLoop(
      loop,
      inPoint !== null && outPoint !== null && outPoint > inPoint
        ? [inPoint, outPoint]
        : undefined,
    );
  }, [loop, inPoint, outPoint]);
  useEffect(() => {
    preview.current?.setSpeed(Number(speed));
  }, [speed]);
  useEffect(() => {
    preview.current?.setVolume(volume / 100);
  }, [volume]);
  useEffect(() => {
    if (!fullscreen) return;
    let timer: ReturnType<typeof setTimeout>;
    const reveal = () => {
      setFullscreenControls(true);
      clearTimeout(timer);
      timer = setTimeout(() => setFullscreenControls(false), 2000);
    };
    reveal();
    window.addEventListener('pointermove', reveal);
    window.addEventListener('keydown', reveal);
    return () => {
      clearTimeout(timer);
      window.removeEventListener('pointermove', reveal);
      window.removeEventListener('keydown', reveal);
    };
  }, [fullscreen]);
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
    (message: ClientEvent) =>
      viewedRef.current && message.t !== 'ping'
        ? false
        : (socket.current?.send(message) ?? false),
    [],
  );
  const edit = useCallback((ops: Op[], record = true, onSaved?: () => void) => {
    const sync = syncRef.current;
    if (!sync || !ops.length || viewedRef.current) return;
    for (const op of ops) track('user_edit', { op: op.op });
    let undo: Op[] = [];
    void sync
      .edit(ops, (project) => {
        undo = inverseOps(project, ops);
      })
      .then(() => {
        if (record && undo.length) {
          undoStack.current.push({ undo, redo: ops });
          redoStack.current = [];
          setHistoryCount(undoStack.current.length);
        }
        setSystemLines((lines) => [
          ...lines,
          ops.some((op) => op.op === 'text.update')
            ? 'you changed the title text'
            : 'you changed the edit',
        ]);
        onSaved?.();
      })
      .catch(() => setEditError('could not save edit · try again'));
  }, []);
  const history = useCallback(
    (redo: boolean) => {
      if (viewedRef.current) return;
      const source = redo ? redoStack.current : undoStack.current;
      const target = redo ? undoStack.current : redoStack.current;
      const item = source.pop();
      if (!item) return;
      target.push(item);
      setHistoryCount(undoStack.current.length);
      edit(redo ? item.redo : item.undo, false);
    },
    [edit],
  );
  const interaction = useCallback((active: boolean, ids?: string[]) => {
    editingRef.current = active;
    if (active)
      syncRef.current?.lock(
        ids ?? (selectedRef.current ? [selectedRef.current] : []),
      );
    else {
      void syncRef.current?.unlock();
      pendingEvents.current = [];
    }
  }, []);
  const messageAgent = useCallback(
    (text: string) => {
      if (viewedRef.current) return;
      void (async () => {
        const real = await editWithRealKimo({
          sessionId,
          note: text,
          snapshot: snapshotRef.current,
          ai: userAiRef.current,
          say: (line) => feed.system(line),
        });
        if (real) return;
        await perceiveClips(
          sessionId,
          snapshotRef.current?.assets ?? [],
          userAiRef.current,
          () => feed.system(PERCEIVE_NOTE),
        );
        await new KimoClient().message(sessionId, { text }, userAiRef.current);
        void checkCut({
          sessionId,
          note: text,
          snapshot: () => snapshotRef.current,
          ai: userAiRef.current,
          say: (line) => feed.system(line),
        }).catch(() =>
          feed.error(
            'the render check could not finish · the cut is ready to review',
          ),
        );
      })()
        .then(() => setSystemLines((lines) => [...lines, text]))
        .catch(() => setEditError('could not send message · try again'));
    },
    [sessionId, feed],
  );
  const uploadFiles = useCallback(
    async (files: File[]) => {
      if (viewedRef.current) return;
      setUploadError('');
      try {
        const { localIds, rejected } = uploadManager.add(files);
        if (rejected.length) setUploadError('some files could not be added');
        if (!localIds.length) return;
        const registered = await uploadManager.start(localIds);
        await new Promise<void>((resolve, reject) => {
          let unsubscribe = () => {};
          const check = () => {
            const items = uploadManager.store
              .getState()
              .items.filter((item) => localIds.includes(item.localId));
            if (
              items.some(
                (item) => item.status === 'error' || item.status === 'canceled',
              )
            ) {
              unsubscribe();
              reject(new Error('couldn’t add those clips · try again'));
            } else if (
              items.length === localIds.length &&
              items.every((item) => item.status === 'done')
            ) {
              unsubscribe();
              resolve();
            }
          };
          unsubscribe = uploadManager.store.subscribe(check);
          check();
        });
        const result = await new KimoClient().attachAssets(
          sessionId,
          Object.values(registered),
        );
        const old = snapshotRef.current;
        if (old) {
          const next = {
            ...old,
            assets: [
              ...old.assets.filter(
                (asset) => !result.assets.some((item) => item.id === asset.id),
              ),
              ...result.assets,
            ],
          };
          snapshotRef.current = next;
          setCurrent(next);
        }
        const replaceId = replaceClip.current;
        replaceClip.current = null;
        const asset = result.assets[0];
        if (replaceId && asset && asset.kind !== 'doc')
          edit([
            {
              op: 'clip.update',
              id: replaceId,
              patch: { assetId: asset.id, kind: asset.kind, in: 0 },
            },
          ]);
        setAssetsOpen(true);
      } catch (error) {
        setUploadError(
          error instanceof Error
            ? error.message
            : 'couldn’t add those clips · try again',
        );
      }
    },
    [sessionId, edit],
  );
  const draftClip = useCallback((clip: Clip | null) => {
    const snapshot = snapshotRef.current;
    if (!snapshot) return;
    preview.current?.update(
      clip
        ? {
            ...snapshot.project,
            clips: { ...snapshot.project.clips, [clip.id]: clip },
          }
        : snapshot.project,
      snapshot.assets,
    );
  }, []);
  const togglePause = useCallback(() => {
    if (send({ t: paused ? 'resume' : 'pause' })) {
      setPaused(!paused);
      feed.system(paused ? 'you resumed kimo' : 'you paused kimo');
    }
  }, [paused, send, feed]);
  const seekPreview = useCallback(
    (time: number) => {
      const next = clamp(time, 0, duration);
      setPlayhead(next);
      preview.current?.seek(next);
    },
    [duration],
  );
  const togglePlayback = useCallback(() => {
    const controller = preview.current;
    if (!controller) return;
    if (previewPlayingRef.current) controller.pause();
    else void controller.play();
  }, []);
  const command = useCallback(
    (value: StudioCommand) => {
      if (value === 'focusComposer') {
        setAgentOpen(true);
        setWatchTab('chat');
        requestAnimationFrame(() => composer.current?.focus());
      } else if (value === 'pauseAgent') togglePause();
      else if (value === 'shortcuts') setShortcutsOpen(true);
      else if (value === 'play') togglePlayback();
      else if (value === 'fullscreen') setFullscreen((old) => !old);
      else if (value === 'start') seekPreview(0);
      else if (value === 'end') seekPreview(duration);
      else if (
        value === 'previous' ||
        value === 'next' ||
        value === 'previousSecond' ||
        value === 'nextSecond'
      )
        seekPreview(
          playheadRef.current +
            (value === 'previous'
              ? -1 / 30
              : value === 'next'
                ? 1 / 30
                : value === 'previousSecond'
                  ? -1
                  : 1),
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
      else if (value === 'inPoint') setInPoint(playheadRef.current);
      else if (value === 'outPoint') setOutPoint(playheadRef.current);
      else if (value === 'fit') setZoom(50);
      else if (value === 'undo' || value === 'redo') history(value === 'redo');
    },
    [duration, togglePause, togglePlayback, seekPreview, history],
  );
  useEffect(() => {
    const listener = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'p') {
        event.preventDefault();
        setPalette((old) => !old);
        return;
      }
      if (palette) return;
      if (
        viewedRef.current &&
        ![' ', 'Escape', 'j', 'k', 'l', 'f'].includes(event.key.toLowerCase())
      )
        return;
      if (event.key === 'Escape' && fullscreen) {
        setFullscreen(false);
        return;
      }
      if (
        !isTypingTarget(event.target) &&
        (event.ctrlKey || event.metaKey) &&
        event.key.toLowerCase() === 't' &&
        project
      ) {
        event.preventDefault();
        const existing = project.tracks.find(
          (track) => track.kind === 'text' && !track.locked,
        );
        const track = existing ?? {
          id: crypto.randomUUID(),
          kind: 'text' as const,
          name: 'text',
          height: 48 as const,
          hidden: false,
          muted: false,
          locked: false,
        };
        const clip: Clip = {
          id: crypto.randomUUID(),
          kind: 'text',
          trackId: track.id,
          start: playheadRef.current,
          duration: 3,
          in: 0,
          speed: 1,
          transform: { x: 0, y: 0, scale: 1, rotation: 0, opacity: 1 },
          effects: [],
          keyframes: [],
          text: { content: 'your text', style: 'caption-clean' },
        };
        edit([
          ...(existing ? [] : [{ op: 'track.add' as const, track }]),
          { op: 'clip.add', clip },
        ]);
        setSelection(clip.id);
        return;
      }
      if (!isTypingTarget(event.target) && selection && project) {
        const clip = project.clips[selection];
        const mod = event.metaKey || event.ctrlKey;
        if (clip && !clip.locked && (event.key === '[' || event.key === ']')) {
          const at = playheadRef.current;
          if (at > clip.start && at < clip.start + clip.duration) {
            event.preventDefault();
            edit([
              {
                op: 'clip.trim',
                id: clip.id,
                edge: event.key === '[' ? 'in' : 'out',
                value: clip.in + (at - clip.start) * clip.speed,
              },
            ]);
            return;
          }
        }
        if (clip && !clip.locked && mod && event.key.toLowerCase() === 'd') {
          event.preventDefault();
          const copy = {
            ...clip,
            id: crypto.randomUUID(),
            start: clip.start + clip.duration,
          };
          edit([{ op: 'clip.add', clip: copy }]);
          setSelection(copy.id);
          return;
        }
        if (
          clip &&
          !clip.locked &&
          (event.key === 'Delete' || event.key === 'Backspace')
        ) {
          event.preventDefault();
          const operations: Op[] = [{ op: 'clip.remove', id: clip.id }];
          if (
            !event.shiftKey &&
            project.tracks.find((t) => t.kind === 'video')?.id === clip.trackId
          )
            for (const other of Object.values(project.clips))
              if (
                other.trackId === clip.trackId &&
                other.start >= clip.start + clip.duration &&
                other.id !== clip.id
              )
                operations.push({
                  op: 'clip.move',
                  id: other.id,
                  trackId: other.trackId,
                  start: other.start - clip.duration,
                });
          edit(operations);
          setSelection(null);
          return;
        }
        if (
          clip &&
          mod &&
          event.key.toLowerCase() === 'b' &&
          playheadRef.current > clip.start &&
          playheadRef.current < clip.start + clip.duration
        ) {
          event.preventDefault();
          edit([
            {
              op: 'clip.split',
              id: clip.id,
              at: playheadRef.current,
              newId: crypto.randomUUID(),
            },
          ]);
          return;
        }
        if (clip && !mod && event.key.toLowerCase() === 'l') {
          event.preventDefault();
          edit([
            { op: 'clip.update', id: clip.id, patch: { locked: !clip.locked } },
          ]);
          return;
        }
        if (
          clip &&
          !clip.locked &&
          !mod &&
          (event.key === ',' || event.key === '.')
        ) {
          event.preventDefault();
          edit([
            {
              op: 'clip.move',
              id: clip.id,
              trackId: clip.trackId,
              start: Math.max(
                0,
                clip.start +
                  ((event.key === ',' ? -1 : 1) * (event.shiftKey ? 10 : 1)) /
                    project.fps,
              ),
            },
          ]);
          return;
        }
      }
      const action = keyboardCommand(event);
      if (!action || shortcutsOpen || leaveOpen || finishOpen) return;
      event.preventDefault();
      command(action);
    };
    window.addEventListener('keydown', listener);
    return () => window.removeEventListener('keydown', listener);
  }, [
    command,
    shortcutsOpen,
    leaveOpen,
    finishOpen,
    palette,
    fullscreen,
    selection,
    project,
    edit,
  ]);
  const captureReview = useCallback(
    async () => preview.current?.captureFrame(1),
    [],
  );
  useEffect(() => {
    if (!watchReview || reviewHovered) return;
    const timer = setTimeout(
      () => setWatchReview(false),
      renderTiming.reviewOverlay,
    );
    return () => clearTimeout(timer);
  }, [watchReview, reviewHovered]);
  const emittedLines = useRef(0);
  useEffect(() => {
    for (const line of systemLines.slice(emittedLines.current))
      feed.system(line);
    emittedLines.current = systemLines.length;
  }, [systemLines, feed]);
  const promptSent = useRef(false);
  useEffect(() => {
    if (!promptSent.current && saved?.sessionId === sessionId && saved.prompt) {
      promptSent.current = true;
      feed.user(saved.prompt, [], false);
    }
  }, [saved, sessionId, feed]);
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

  const approve = async (
    burnInCaptions: boolean,
    poster?: string,
    options?: {
      resolution: '1080p' | '720p';
      format: 'mp4' | 'webm';
      alsoVertical: boolean;
    },
  ) => {
    if (viewedRef.current) return;
    if (agentState === 'acting') send({ t: 'pause' });
    await syncRef.current?.whenIdle();
    const latest = snapshotRef.current;
    if (!latest) throw new Error('nothing to export yet');
    if (missingAssets(latest.assets).length)
      throw new Error('add your clips again before exporting');
    // Exported in this tab: nothing is sent to a server to render.
    setExportJob({
      sessionId,
      project: latest.project,
      assets: latest.assets,
      title,
      burnInCaptions,
      resolution: options?.resolution ?? '1080p',
      format: options?.format ?? 'mp4',
    });
    track('render_started');
    saveRenderContext(sessionId, {
      renderId: 'local',
      poster,
      title,
      burnInCaptions,
    });
    setFinishOpen(false);
    navigateRendered(
      router,
      `/render/${encodeURIComponent(sessionId)}`,
      'render',
      reducedMotion,
    );
  };
  const agentPanel = project ? (
    <AgentPanel
      feed={feed}
      project={project}
      assets={current.assets}
      acting={agentState === 'acting'}
      paused={paused}
      readOnly={Boolean(viewedCut)}
      connected={connection && !viewedCut}
      tab={agentTab}
      onTab={setAgentTab}
      onCollapse={() => setAgentOpen(false)}
      composerRef={composer}
      note={note}
      onNote={setNote}
      onSend={async (text, attachments, interrupt) => {
        if (viewedRef.current)
          throw new Error('return to the current cut to edit');
        // The realtime socket never carries the user's key, so with their
        // own key an interrupt goes over HTTPS like any other note.
        if (interrupt && !userAiRef.current) {
          rememberPrompt(text);
          track('interrupt_sent');
          if (!send({ t: 'interrupt', text })) throw new Error('Disconnected');
        } else {
          // Attachments are clips already in this session, so the engine
          // job (every session clip) covers them.
          if (
            await editWithRealKimo({
              sessionId,
              note: text,
              snapshot: snapshotRef.current,
              ai: userAiRef.current,
              say: (line) => feed.system(line),
            })
          )
            return;
          await perceiveClips(
            sessionId,
            snapshotRef.current?.assets ?? [],
            userAiRef.current,
            () => feed.system(PERCEIVE_NOTE),
          );
          await new KimoClient()
            .message(
              sessionId,
              {
                text,
                attachments: attachments.map((asset) => asset.id),
              },
              userAiRef.current,
            )
            .catch((error: unknown) => {
              setAgentState('idle');
              throw noteError(error);
            });
          void checkCut({
            sessionId,
            note: text,
            snapshot: () => snapshotRef.current,
            ai: userAiRef.current,
            say: (line) => feed.system(line),
          }).catch(() =>
            feed.error(
              'the render check could not finish · the cut is ready to review',
            ),
          );
        }
      }}
      onControl={(event) => {
        if (viewedRef.current) return;
        if (send(event)) {
          if (event.t === 'pause') {
            setPaused(true);
            setAgentState('idle');
          }
          if (event.t === 'resume') setPaused(false);
        } else feed.error('connection lost · try again');
      }}
      onUndo={() => history(false)}
      onRender={() => setFinishOpen(true)}
      onShow={(id, mask) => {
        const clip = id ? project.clips[id] : undefined;
        if (!clip) return;
        setSelection(clip.id);
        seekPreview(clip.start);
        setInspectorOpen(true);
        if (mask)
          requestAnimationFrame(() => {
            for (const section of document.querySelectorAll<HTMLDetailsElement>(
              '.studio-inspector details',
            ))
              if (
                section.querySelector('summary')?.textContent?.includes('mask')
              )
                section.open = true;
          });
      }}
      onRevert={(ids) => {
        const groups = ids.toReversed().flatMap((id) =>
          agentSteps
            .filter((step) => step.id === id)
            .toReversed()
            .flatMap((step) => step.undo),
        );
        if (groups.length) {
          edit(groups, true, () => {
            setAgentSteps((steps) =>
              steps.filter((step) => !ids.includes(step.id)),
            );
            feed.system('you reverted a step');
          });
        } else feed.error('this step has no project changes to revert');
      }}
      onUpload={async (files) => {
        const before = new Set(
          snapshotRef.current?.assets.map((asset) => asset.id) ?? [],
        );
        await uploadFiles(files);
        const added =
          snapshotRef.current?.assets.filter(
            (asset) => !before.has(asset.id),
          ) ?? [];
        if (!added.length) throw new Error('No attachments uploaded');
        return added;
      }}
      onPlay={() => {
        seekPreview(0);
        void preview.current?.play();
      }}
      notice={aiAvailable === false && !userAi ? AI_OFF_NOTICE : undefined}
      aiSettings={<AiSettings value={aiSettings} onChange={setAiSettings} />}
    />
  ) : null;
  const inspector = (
    <section
      className="studio-panel studio-inspector"
      aria-label="inspector"
      inert={Boolean(viewedCut)}
      data-active-target={aiClips[0]}
    >
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
      {project ? (
        <EditingInspector
          clip={selected}
          project={project}
          assets={current.assets}
          onEdit={edit}
          onDraft={draftClip}
          onInteraction={interaction}
          playhead={playhead}
          levelDb={metrics?.levelDb ?? -60}
          ai={
            Boolean(selected && aiClips.includes(selected.id)) &&
            !editingRef.current
          }
          onSeek={seekPreview}
          onMessage={messageAgent}
          onUpload={() => {
            replaceClip.current = selected?.id ?? null;
            filePicker.current?.click();
          }}
          suggestion={
            suggestion && suggestion.id === selected?.id
              ? suggestion.content
              : undefined
          }
          onSuggestion={(use, mine) => {
            const item = suggestion;
            if (item) {
              editingRef.current = false;
              void syncRef.current?.unlock(item.id);
            }
            if (item)
              edit([
                {
                  op: 'text.update',
                  clipId: item.id,
                  content: use ? item.content : (mine ?? item.mine),
                },
              ]);
            setSuggestion(null);
          }}
        />
      ) : null}
    </section>
  );
  const viewer = (
    <section
      className="studio-panel studio-viewer"
      data-active-target={aiClips[0]}
      aria-label="viewer"
      data-fullscreen={fullscreen || undefined}
      data-controls-visible={fullscreenControls || undefined}
    >
      {current ? (
        <LocalClipsNotice
          sessionId={sessionId}
          assets={current.assets}
          hasClips={clipsInTab}
        />
      ) : null}
      <ClipPrepPanel />
      <div className="studio-viewer-overlay">
        <span>
          {project?.width ?? 1920} × {project?.height ?? 1080} · 30 fps
        </span>
        <div className="studio-viewer-options">
          {metrics?.approximate ? (
            <span className="studio-preview-approx">preview approx.</span>
          ) : null}
          {fullscreen ? (
            <Button
              variant="ghost"
              size="sm"
              iconOnly
              icon={X}
              aria-label="close fullscreen preview"
              tooltip="close fullscreen preview"
              onClick={() => setFullscreen(false)}
            />
          ) : null}
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
      {viewedCut ? (
        <div className="launch-version-banner">
          <span>viewing {viewedCut.name} · read-only</span>
          <Button
            size="sm"
            onClick={() => {
              const cut = viewedCut;
              setViewedCut(null);
              viewedRef.current = null;
              if (current) edit(restoreCut(current.project, cut.project));
            }}
          >
            restore this cut
          </Button>
          <Button size="sm" onClick={() => setViewedCut(null)}>
            back to current cut
          </Button>
        </div>
      ) : null}
      {cuts.length && !viewedCut ? (
        <div className="launch-compare-menu">
          <select
            className="launch-select"
            aria-label="compare cuts"
            value={compareCut?.name ?? ''}
            onChange={(e) =>
              setCompareCut(cuts.find((c) => c.name === e.target.value) ?? null)
            }
          >
            <option value="">compare cuts</option>
            {cuts.map((c) => (
              <option key={c.name} value={c.name}>
                compare with {c.name}
              </option>
            ))}
          </select>
        </div>
      ) : null}
      <div className="studio-frame-area">
        <div
          className="studio-frame"
          style={{
            aspectRatio: `${project?.width ?? 1920} / ${project?.height ?? 1080}`,
          }}
        >
          <canvas
            ref={canvas}
            className="studio-preview-canvas"
            aria-label="live video preview"
          />
          {compareCut && !viewedCut ? (
            <ComparePreview
              cut={compareCut}
              source={() => ({
                time: preview.current?.current ?? playhead,
                playing: preview.current?.isPlaying ?? false,
                rate: preview.current?.playbackRate ?? 1,
              })}
              onClose={() => setCompareCut(null)}
            />
          ) : null}
          <WatchFirstCut
            visible={watchReview}
            onHover={setReviewHovered}
            onPlay={() => {
              setWatchReview(false);
              seekPreview(0);
              void preview.current?.play();
            }}
          />
          {selected?.text && project && !viewedCut ? (
            <ViewerTextEditor
              key={selected.id}
              clip={selected}
              project={project}
              onEdit={edit}
              onDraft={viewedCut ? () => {} : draftClip}
              onInteraction={interaction}
            />
          ) : null}
          {thumbnail && !hasProject ? (
            <div
              className="studio-thumbnail"
              style={{ backgroundImage: `url(${JSON.stringify(thumbnail)})` }}
            />
          ) : null}
          {!hasProject ? <span>kimo is laying out the first cut…</span> : null}
          {guides ||
          (overlays && (region || maskPolygon || selected?.kind === 'text')) ? (
            <svg
              className="studio-preview-overlays"
              viewBox="0 0 1000 1000"
              preserveAspectRatio="none"
              aria-hidden="true"
            >
              {guides ? (
                <g className="studio-guide-lines">
                  <path d="M333 0v1000M667 0v1000M0 333h1000M0 667h1000" />
                  <rect x="50" y="50" width="900" height="900" />
                </g>
              ) : null}
              {overlays && region ? (
                <path
                  className="studio-ai-region"
                  d={(() => {
                    const x = region.x * 1000,
                      y = region.y * 1000,
                      w = region.w * 1000,
                      h = region.h * 1000,
                      l = 12;
                    return `M${x + l} ${y}H${x}V${y + l}M${x + w - l} ${y}H${x + w}V${y + l}M${x} ${y + h - l}V${y + h}H${x + l}M${x + w - l} ${y + h}H${x + w}V${y + h - l}`;
                  })()}
                />
              ) : null}
              {overlays && maskPolygon ? (
                <polygon
                  className="studio-mask-preview"
                  points={maskPolygon
                    .map(
                      (point) =>
                        `${(point[0] ?? 0) * 1000},${(point[1] ?? 0) * 1000}`,
                    )
                    .join(' ')}
                />
              ) : null}
              {overlays && selected?.kind === 'text' ? (
                <g className="studio-text-handles">
                  <rect x="150" y="400" width="700" height="200" />
                  <rect x="147" y="397" width="6" height="6" />
                  <rect x="847" y="397" width="6" height="6" />
                  <rect x="147" y="597" width="6" height="6" />
                  <rect x="847" y="597" width="6" height="6" />
                  <path d="M500 400v-16" />
                  <rect x="497" y="381" width="6" height="6" />
                </g>
              ) : null}
            </svg>
          ) : null}
          {overlays && maskPolygon ? (
            <span className="studio-mask-label">sam 3.1 · person</span>
          ) : null}
          {editAt !== null ? (
            <button
              className="studio-edit-chip"
              onClick={() => {
                seekPreview(editAt);
                setEditAt(null);
              }}
            >
              edit at {timecode(editAt).slice(3, 8)}
            </button>
          ) : null}
          {metrics?.latencyMs !== null &&
          metrics?.latencyMs !== undefined &&
          typeof window !== 'undefined' &&
          new URLSearchParams(window.location.search).get('debug') === '1' ? (
            <span className="studio-debug">
              op → frame {Math.round(metrics.latencyMs)} ms
            </span>
          ) : null}
        </div>
      </div>
      {fullscreen ? (
        <input
          className="studio-fullscreen-scrub"
          type="range"
          min="0"
          max={Math.max(duration, 0.01)}
          step="0.033333"
          value={Math.min(playhead, Math.max(duration, 0.01))}
          aria-label="seek preview"
          onChange={(event) => seekPreview(Number(event.target.value))}
        />
      ) : null}
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
            icon={previewPlaying ? Pause : Play}
            aria-label={previewPlaying ? 'pause playback' : 'play'}
            tooltip={previewPlaying ? 'pause playback' : 'play'}
            onClick={togglePlayback}
            disabled={!previewReady || !duration}
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
    <section
      className="studio-panel studio-timeline"
      aria-label="timeline"
      data-active-target={aiClips[0]}
    >
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
            icon={FolderOpen}
            aria-label="toggle assets"
            tooltip="toggle assets"
            aria-pressed={assetsOpen}
            onClick={() => setAssetsOpen(!assetsOpen)}
          />
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
            icon={Activity}
            aria-label="toggle beat grid"
            tooltip="toggle beat grid"
            aria-pressed={beatGrid}
            onClick={() => setBeatGrid(!beatGrid)}
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
          <input
            ref={filePicker}
            type="file"
            multiple
            hidden
            aria-label="add more clips"
            onChange={(event) => {
              void uploadFiles(Array.from(event.target.files ?? []));
              event.target.value = '';
            }}
          />
          {uploadError ? <p role="status">{uploadError}</p> : null}
          {assetsOpen ? (
            <div className="editor-assets">
              <div className="editor-asset-tabs">
                <button
                  aria-pressed={assetTab === 'user'}
                  onClick={() => setAssetTab('user')}
                >
                  your files
                </button>
                <button
                  aria-pressed={assetTab === 'web'}
                  onClick={() => setAssetTab('web')}
                >
                  found by kimo
                </button>
              </div>
              <div className="editor-assets-grid">
                <button onClick={() => filePicker.current?.click()}>
                  <span>+</span>add clips
                </button>
                {current.assets
                  .filter(
                    (asset) =>
                      asset.source === assetTab && asset.kind !== 'doc',
                  )
                  .map((asset) => (
                    <button
                      key={asset.id}
                      draggable
                      onDragStart={(event) => {
                        event.dataTransfer.setData(
                          'application/x-kimo-asset',
                          asset.id,
                        );
                        event.dataTransfer.effectAllowed = 'copy';
                      }}
                      title={asset.attribution?.site ?? asset.name}
                      onClick={() => {
                        const existing = project?.tracks.find(
                          (item) =>
                            !item.locked &&
                            (asset.kind === 'audio'
                              ? item.kind === 'audio'
                              : item.kind === 'video' ||
                                item.kind === 'overlay'),
                        );
                        if (asset.kind === 'doc') return;
                        const track = existing ?? {
                          id: crypto.randomUUID(),
                          kind:
                            asset.kind === 'audio'
                              ? ('audio' as const)
                              : asset.kind === 'image'
                                ? ('overlay' as const)
                                : ('video' as const),
                          name:
                            asset.kind === 'audio'
                              ? 'audio'
                              : asset.kind === 'image'
                                ? 'images'
                                : 'video',
                          height:
                            asset.kind === 'video'
                              ? (88 as const)
                              : (64 as const),
                          hidden: false,
                          muted: false,
                          locked: false,
                        };
                        const clip: Clip = {
                          id: crypto.randomUUID(),
                          trackId: track.id,
                          assetId: asset.id,
                          kind: asset.kind,
                          start: playhead,
                          duration: asset.durationSec ?? 3,
                          in: 0,
                          transform: {
                            x: 0,
                            y: 0,
                            scale: 1,
                            rotation: 0,
                            opacity: 1,
                          },
                          effects: [],
                          keyframes: [],
                          speed: 1,
                        };
                        edit([
                          ...(existing
                            ? []
                            : [{ op: 'track.add' as const, track }]),
                          { op: 'clip.add', clip },
                        ]);
                        setSelection(clip.id);
                      }}
                    >
                      <span>
                        {asset.thumbUrl || asset.kind === 'image' ? (
                          <span
                            className="editor-asset-image"
                            style={{
                              backgroundImage: `url(${JSON.stringify(asset.thumbUrl ?? asset.url)})`,
                            }}
                          />
                        ) : (
                          asset.kind
                        )}
                      </span>
                      {asset.name}
                    </button>
                  ))}
              </div>
            </div>
          ) : null}
          {project && hasProject ? (
            <EditingTimeline
              readOnly={Boolean(viewedCut)}
              beatGrid={beatGrid}
              aiClips={aiClips}
              project={project}
              assets={current.assets}
              selected={selection}
              onSelect={(id) => {
                setSelection(id);
                setInspectorOpen(true);
              }}
              tool={tool}
              snap={snap}
              zoom={zoom}
              playhead={playhead}
              onSeek={seekPreview}
              onEdit={edit}
              onDraft={viewedCut ? () => {} : draftClip}
              onInteraction={interaction}
              onAsk={(name) => {
                setNote(`@${name} `);
                composer.current?.focus();
              }}
              onReplace={(id) => {
                replaceClip.current = id;
                setSelection(id);
                filePicker.current?.click();
              }}
            />
          ) : (
            <div className="studio-tracks">
              <div className="studio-track-headers">
                <span className="studio-skeleton-header" />
              </div>
              <div className="studio-clips">
                {Array.from({ length: 3 }, (_, index) => (
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
            </div>
          )}
          {editError ? (
            <button
              className="editor-error"
              onClick={() => {
                if (removedClip.current) {
                  edit([{ op: 'clip.add', clip: removedClip.current }]);
                  removedClip.current = null;
                }
                setEditError('');
              }}
            >
              {editError}
            </button>
          ) : null}
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
      <StudioCoach />
      {project && current ? (
        <CommandPalette
          open={palette}
          onOpenChange={setPalette}
          project={project}
          assets={current.assets}
          readonly={Boolean(viewedCut)}
          onClip={(id) => {
            setSelection(id);
            seekPreview(project.clips[id]?.start ?? 0);
            setInspectorOpen(true);
          }}
          onPrompt={(text) => {
            setNote(text);
            composer.current?.focus();
          }}
          onAction={(action) => {
            if (action === 'render') setFinishOpen(true);
            if (action === 'toggle captions')
              for (const t of project.tracks.filter((t) => t.kind === 'text'))
                edit([
                  {
                    op: 'track.update',
                    id: t.id,
                    patch: { hidden: !t.hidden },
                  },
                ]);
            if (action === 'split' && selection) {
              const c = project.clips[selection];
              if (
                c &&
                !c.locked &&
                playhead > c.start &&
                playhead < c.start + c.duration
              )
                edit([
                  {
                    op: 'clip.split',
                    id: c.id,
                    at: playhead,
                    newId: crypto.randomUUID(),
                  },
                ]);
            }
            if (action === 'add text') {
              const t = project.tracks.find(
                (t) => t.kind === 'text' && !t.locked,
              ) ?? {
                id: crypto.randomUUID(),
                kind: 'text' as const,
                name: 'text',
                height: 48 as const,
                hidden: false,
                muted: false,
                locked: false,
              };
              const id = crypto.randomUUID();
              edit([
                ...(project.tracks.some((x) => x.id === t.id)
                  ? []
                  : [{ op: 'track.add' as const, track: t }]),
                {
                  op: 'clip.add',
                  clip: {
                    id,
                    trackId: t.id,
                    kind: 'text',
                    start: playhead,
                    duration: 3,
                    in: 0,
                    speed: 1,
                    transform: {
                      x: 0,
                      y: 0,
                      scale: 1,
                      rotation: 0,
                      opacity: 1,
                    },
                    text: { content: 'your text', style: 'caption-clean' },
                    effects: [],
                    keyframes: [],
                  },
                },
              ]);
              setSelection(id);
            }
          }}
        />
      ) : null}
      <Ready />
      <h1 className="landing-sr-only">{title}</h1>
      {project ? (
        <AgentPresence feed={feed} project={project} assets={current.assets} />
      ) : null}
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
              description="your edits are saved to your account. your clips only live in this tab, so export before you go."
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
              disabled={Boolean(viewedCut)}
              onClick={() => {
                setTitleDraft(title);
                setEditingTitle(true);
              }}
            >
              <span className="launch-truncate" title={title}>
                {title}
              </span>
              <Pencil size={12} aria-hidden="true" />
            </button>
          )}
          <select
            className="launch-select"
            aria-label="versions"
            value={viewedCut?.name ?? ''}
            onChange={(e) => {
              setViewedCut(cuts.find((c) => c.name === e.target.value) ?? null);
              setSelection(null);
            }}
          >
            <option value="">current cut</option>
            {cuts.map((c) => (
              <option key={c.name}>{c.name}</option>
            ))}
          </select>
          <span className="studio-save" data-offline={!online || undefined}>
            {pendingCount
              ? `${pendingCount} edits kept locally`
              : online
                ? 'saved'
                : 'offline · changes kept locally'}
          </span>
        </div>
        <div className="studio-top-center">
          <button
            className="studio-status-pill"
            data-active-target={aiClips[0]}
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
            disabled={!connection || Boolean(viewedCut)}
          />
        </div>
        <div className="studio-top-right">
          <Button
            variant="ghost"
            size="sm"
            iconOnly
            icon={Undo2}
            aria-label="undo"
            tooltip="undo"
            disabled={!historyCount || Boolean(viewedCut)}
            onClick={() => history(false)}
          />
          <Button
            variant="ghost"
            size="sm"
            iconOnly
            icon={Redo2}
            aria-label="redo"
            tooltip="redo"
            disabled={!redoStack.current.length || Boolean(viewedCut)}
            onClick={() => history(true)}
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
          <Button
            size="sm"
            icon={Maximize2}
            onClick={() => setFullscreen(true)}
            disabled={!previewReady}
          >
            preview full
          </Button>
          {project ? (
            <ReviewDialog
              open={finishOpen}
              onOpenChange={setFinishOpen}
              project={project}
              acting={!paused && agentState === 'acting'}
              summary={(() => {
                const state = feed.getSnapshot();
                const latest = state.entries.findLast(
                  (entry) => entry.type === 'group',
                );
                const latestId =
                  latest?.type === 'group' ? latest.actions.at(-1) : undefined;
                return (
                  state.actions[state.runningId ?? latestId ?? '']?.title ??
                  'the current edit'
                );
              })()}
              capture={captureReview}
              onApprove={approve}
              trigger={
                <Button
                  data-review={agentState === 'waiting_user' || undefined}
                  size="sm"
                  variant={actionEnabled ? 'primary' : 'secondary'}
                  disabled={!actionEnabled || Boolean(viewedCut)}
                >
                  finish
                </Button>
              }
            />
          ) : null}
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
            width >= 1024 ? (
              agentPanel
            ) : null
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
          <span
            data-slow={
              Boolean(
                metrics?.playing && metrics.fps < 30 && metrics.fps > 0,
              ) || undefined
            }
          >
            preview {metrics?.fps ? metrics.fps : '—'} fps
          </span>
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
