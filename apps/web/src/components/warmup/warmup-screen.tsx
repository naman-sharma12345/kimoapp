'use client';
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
} from 'react';
import { useRouter } from 'next/navigation';
import { flushSync } from 'react-dom';
import {
  KimoClient,
  ProjectSync,
  type ServerEvent,
  type SessionSnapshot,
} from '@kimo/client';
import { Button } from '@/components/ui/button';
import { Dialog, DialogClose, DialogContent } from '@/components/ui/dialog';
import { Spinner } from '@/components/ui/spinner';
import { FullScreenError } from '@/components/errors/full-screen-error';
import { Ready } from '@/app/dev/tokens/ready';
import { uiTiming } from '@/lib/motion';
import { useReducedMotion } from '@/lib/use-reduced-motion';
import { uploadManager, useUploads } from '@/lib/uploads/manager';
import { useSessionStore } from '@/stores/session';
import { useProjectStore } from '@/stores/project';
import { WarmupConnection, sessionSocketUrl } from '@/lib/warmup/connection';
import {
  aggregateUpload,
  initialWarmup,
  updateWarmup,
  type WarmupStep,
} from '@/lib/warmup/state';
import { navigateToStudio } from '@/lib/warmup/transition';
import { WarmupReel, type ReelAsset } from './warmup-reel';

const fallbacks = [
  'reading every frame…',
  'listening to the audio…',
  'looking for the best moments…',
] as const;
const labels = [
  { active: 'uploading your files', done: 'files uploaded' },
  { active: 'watching your footage', done: 'footage watched' },
  { active: 'planning the edit', done: 'plan ready' },
  { active: 'opening the studio', done: 'opening the studio' },
] as const;
const steps: WarmupStep[] = ['upload', 'watch', 'plan', 'ready'];
function useNotice(notice: string, step: WarmupStep, reduced: boolean) {
  const [fallback, setFallback] = useState('');
  const [display, setDisplay] = useState('');
  const [visible, setVisible] = useState(false);
  const [typed, setTyped] = useState('');
  useEffect(() => {
    if (step !== 'watch' || notice) return;
    let index = 0;
    let interval: ReturnType<typeof setInterval> | undefined;
    const timer = setTimeout(() => {
      setFallback(fallbacks[0]);
      interval = setInterval(() => {
        index = (index + 1) % fallbacks.length;
        setFallback(fallbacks[index] ?? '');
      }, uiTiming.warmupNoticeFallback);
    }, uiTiming.warmupNoticeFallback);
    return () => {
      clearTimeout(timer);
      if (interval) clearInterval(interval);
    };
  }, [step, notice]);
  const content = notice || (step === 'watch' ? fallback : '');
  useEffect(() => {
    if (!content) {
      setVisible(false);
      return;
    }
    setVisible(false);
    let interval: ReturnType<typeof setInterval> | undefined;
    const timer = setTimeout(
      () => {
        setDisplay(content);
        setVisible(true);
        if (reduced) {
          setTyped(content);
          return;
        }
        let cursor = 0;
        setTyped('');
        interval = setInterval(() => {
          cursor++;
          setTyped(content.slice(0, cursor));
          if (cursor >= content.length && interval) clearInterval(interval);
        }, uiTiming.warmupNoticeType);
      },
      reduced ? 0 : uiTiming.placeholderFade,
    );
    return () => {
      clearTimeout(timer);
      if (interval) clearInterval(interval);
    };
  }, [content, reduced]);
  return { display, visible, typed };
}
export function WarmupScreen({
  sessionId,
  snapshot,
}: {
  sessionId: string;
  snapshot: SessionSnapshot | null;
}) {
  const router = useRouter();
  const reduced = useReducedMotion();
  const saved = useSessionStore((store) => store.saved);
  const items = useUploads((store) => store.items);
  const restoring = useUploads((store) => store.restoring);
  const online = useUploads((store) => store.online);
  const record = saved?.sessionId === sessionId ? saved : null;
  const ownItems = items.filter(
    (item) => record?.assetLocalMap[item.localId] && item.status !== 'canceled',
  );
  const errors = ownItems.filter((item) => item.status === 'error');
  const pending = restoring || ownItems.some((item) => item.status !== 'done');
  const [state, setState] = useState(initialWarmup);
  const [connectionFailed, setConnectionFailed] = useState(false);
  const [long, setLong] = useState(false);
  const [exiting, setExiting] = useState(false);
  const [canceling, setCanceling] = useState(false);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [unfoldStyle, setUnfoldStyle] = useState<CSSProperties>({});
  const connection = useRef<WarmupConnection | null>(null);
  const prefetched = useRef(false);
  const navigating = useRef(false);
  const stopped = useRef(false);
  const currentSnapshot = useRef(snapshot);
  const notice = useNotice(state.notice, state.step, reduced);
  const sourceAssets = useMemo(
    () => (snapshot?.assets ?? []).filter((asset) => asset.source === 'user'),
    [snapshot],
  );
  const media: ReelAsset[] = sourceAssets
    .map((asset): ReelAsset => {
      const localId = record
        ? Object.keys(record.assetLocalMap).find(
            (id) => record.assetLocalMap[id] === asset.id,
          )
        : undefined;
      const local = items.find(
        (item) => item.localId === localId && item.status !== 'canceled',
      );
      return {
        assetId: asset.id,
        name: asset.name,
        kind:
          asset.kind === 'video' ||
          asset.kind === 'image' ||
          asset.kind === 'audio'
            ? asset.kind
            : 'doc',
        thumbnail: local?.meta.thumbBlobUrl,
        waveform: local?.meta.waveform,
        localId: local?.localId,
      };
    })
    .filter(
      (asset) =>
        !record || Object.values(record.assetLocalMap).includes(asset.assetId),
    );
  const progress = aggregateUpload(
    ownItems,
    sourceAssets.length === 0,
    state.step === 'upload' ? state.serverProgress : 1,
  );

  useEffect(() => {
    if (!snapshot || snapshot.status === 'failed') return;
    useProjectStore.getState().replace(snapshot.project);
    const sync = new ProjectSync(
      new KimoClient(),
      sessionId,
      () => currentSnapshot.current ?? snapshot,
      (next) => {
        currentSnapshot.current = next;
        useProjectStore.getState().replace(next.project);
      },
    );
    const onEvent = (event: ServerEvent) => {
      if (event.t === 'hello' || event.t === 'project.ops')
        void sync.receive(event).catch(() => setConnectionFailed(true));
      setState((current) => updateWarmup(current, event));
    };
    const socket = new WarmupConnection(
      sessionSocketUrl(sessionId, snapshot.wsUrl),
      onEvent,
      () => setConnectionFailed(true),
    );
    connection.current = socket;
    socket.start();
    return () => {
      socket.dispose();
      connection.current = null;
    };
  }, [sessionId, snapshot]);
  useEffect(() => {
    if (
      (state.step !== 'plan' && state.step !== 'ready') ||
      prefetched.current ||
      !snapshot
    )
      return;
    prefetched.current = true;
    router.prefetch(`/studio/${encodeURIComponent(sessionId)}`);
    void import('@kimo/compositor').then((cache) => {
      if (!stopped.current)
        cache.preloadVideoAssets(sessionId, snapshot.assets);
    });
  }, [router, sessionId, snapshot, state.step]);
  useEffect(() => {
    if (
      state.step !== 'ready' ||
      pending ||
      errors.length ||
      !online ||
      dialogOpen ||
      navigating.current ||
      stopped.current
    )
      return;
    const timer = setTimeout(
      () => {
        if (stopped.current || navigating.current) return;
        navigating.current = true;
        const strip = document
          .querySelector<HTMLElement>('[data-reel-strip]')
          ?.getBoundingClientRect();
        const bars = document
          .querySelector<HTMLElement>('[data-reel-bars]')
          ?.getBoundingClientRect();
        const playhead = document
          .querySelector<HTMLElement>('[data-reel-playhead]')
          ?.getBoundingClientRect();
        const left = innerWidth >= 1024 ? 168 : 8;
        const timeline = innerWidth >= 1600 ? 320 : 280;
        const top = innerHeight - 28 - 8 - timeline + 36 + 28;
        const targetStyle =
          strip && bars && playhead
            ? ({
                '--unfold-strip-x': `${left - strip.left}px`,
                '--unfold-strip-y': `${top - strip.top}px`,
                '--unfold-strip-scale': (innerWidth - left - 8) / strip.width,
                '--unfold-bars-x': `${16 - bars.left}px`,
                '--unfold-bars-y': `${16 - bars.top}px`,
                '--unfold-playhead-x': `${left - playhead.left}px`,
                '--unfold-playhead-y': `${top - 8 - playhead.top}px`,
              } as CSSProperties)
            : {};
        flushSync(() => {
          setUnfoldStyle(targetStyle);
          setExiting(true);
        });
        navigateToStudio(router, sessionId, reduced);
      },
      reduced ? 0 : uiTiming.warmupBeat,
    );
    return () => clearTimeout(timer);
  }, [
    state.step,
    pending,
    errors.length,
    online,
    dialogOpen,
    reduced,
    router,
    sessionId,
  ]);
  useEffect(() => {
    const key = `kimo.warmup.started.${sessionId}`;
    let start = Date.now();
    try {
      const existing = Number(sessionStorage.getItem(key));
      if (existing > 0 && existing <= start) start = existing;
      else sessionStorage.setItem(key, String(start));
    } catch {
      /* Browser storage may be disabled. */
    }
    const remaining = uiTiming.warmupLong - (Date.now() - start);
    if (remaining <= 0) {
      setLong(true);
      return;
    }
    const timer = setTimeout(() => setLong(true), remaining);
    return () => clearTimeout(timer);
  }, [sessionId]);
  const startOver = useCallback(() => {
    uploadManager.reset();
    useSessionStore.getState().reset();
    router.push('/');
  }, [router]);
  const retrySession = async () => {
    if (!record) {
      startOver();
      return;
    }
    try {
      const next = await new KimoClient().createSession({
        prompt: record.prompt.trim()
          ? record.prompt
          : 'make a great video from these',
        assetIds: Object.values(record.assetLocalMap),
        aspect: record.aspect,
        durationHint: record.durationHint,
      });
      useSessionStore
        .getState()
        .startSession({ ...record, sessionId: next.sessionId });
      useSessionStore.getState().setWsUrl(next.wsUrl);
      router.replace(`/warmup/${encodeURIComponent(next.sessionId)}`);
    } catch {
      setConnectionFailed(true);
    }
  };
  const stop = async () => {
    if (canceling) return;
    setCanceling(true);
    stopped.current = true;
    try {
      await new KimoClient().cancelSession(sessionId);
      connection.current?.dispose();
      void import('@kimo/compositor').then((cache) =>
        cache.clearVideoAssets(sessionId),
      );
      useSessionStore.getState().reset();
      router.push('/');
    } catch {
      stopped.current = false;
      setCanceling(false);
      setConnectionFailed(true);
    }
  };
  if (
    !snapshot ||
    snapshot.status === 'failed' ||
    connectionFailed ||
    state.error !== undefined
  )
    return (
      <FullScreenError
        variant="session"
        onPrimary={() => void retrySession()}
        onSecondary={startOver}
      >
        {state.error ? (
          <p className="warmup-error-detail">{state.error}</p>
        ) : null}
      </FullScreenError>
    );
  const activeIndex = steps.indexOf(state.step);
  return (
    <main
      id="main"
      className="warmup-page"
      data-ready="false"
      data-warmup-ready="true"
      data-unfold={exiting || undefined}
      style={
        {
          ...unfoldStyle,
          '--warmup-progress': Math.max(
            0.5,
            0.5 + Math.max(progress, state.serverProgress) * 0.5,
          ),
        } as CSSProperties
      }
    >
      <Ready />
      <div className="landing-grain" aria-hidden="true" />
      <div className="warmup-horizon" aria-hidden="true" />
      <header className="warmup-header">
        <div className="warmup-brand">
          <span className="warmup-brand-mark" aria-hidden="true" />
          <span>kimo</span>
        </div>
        <Dialog
          open={dialogOpen}
          onOpenChange={setDialogOpen}
          trigger={
            <Button variant="ghost" size="xs">
              cancel
            </Button>
          }
        >
          <DialogContent
            title="stop this edit?"
            description="your files stay uploaded for 24 hours."
            actions={
              <>
                <Button
                  variant="danger"
                  loading={canceling}
                  onClick={() => void stop()}
                >
                  stop
                </Button>
                <DialogClose asChild>
                  <Button>keep going</Button>
                </DialogClose>
              </>
            }
          />
        </Dialog>
      </header>
      <div className="warmup-content">
        <h1 className="landing-sr-only">getting your video ready</h1>
        <WarmupReel
          assets={media}
          step={state.step}
          progress={progress}
          exiting={exiting}
          onRemove={(id) => uploadManager.cancel(id)}
        />
        <ol className="warmup-steps" aria-label="edit preparation">
          {labels.map((label, index) => {
            const status =
              index < activeIndex
                ? 'done'
                : index === activeIndex
                  ? 'active'
                  : 'pending';
            const uploadError = index === 0 && errors.length > 0;
            return (
              <li
                key={label.active}
                data-state={status}
                data-error={uploadError || undefined}
              >
                <span className="warmup-status-icon" aria-hidden="true">
                  {uploadError ? (
                    <span className="warmup-error-dot" />
                  ) : status === 'done' ? (
                    <svg viewBox="0 0 14 14" width="14" height="14">
                      <path
                        className="warmup-check"
                        d="M2.5 7.2 5.5 10 11.5 3.5"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="1.5"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                      />
                    </svg>
                  ) : status === 'active' ? (
                    <Spinner size={14} label={label.active} />
                  ) : (
                    <span className="warmup-pending-dot" />
                  )}
                </span>
                <span>
                  {uploadError ? (
                    <>
                      <span>
                        {errors.length} {errors.length === 1 ? 'file' : 'files'}{' '}
                        failed ·{' '}
                      </span>
                      <button
                        className="warmup-retry"
                        onClick={() => {
                          for (const item of errors)
                            void uploadManager.retry(item.localId);
                        }}
                      >
                        retry
                      </button>
                    </>
                  ) : status === 'done' ? (
                    label.done
                  ) : (
                    label.active
                  )}
                  {!uploadError && status === 'active' && index === 0 ? (
                    <span className="warmup-percent">
                      {' '}
                      · {Math.round(progress * 100)}%
                    </span>
                  ) : null}
                  {!uploadError &&
                  status === 'active' &&
                  index === 1 &&
                  state.clipIndex &&
                  state.clipCount ? (
                    <span className="warmup-percent">
                      {' '}
                      · clip {state.clipIndex} of {state.clipCount}
                    </span>
                  ) : null}
                </span>
              </li>
            );
          })}
        </ol>
        <div
          className="warmup-notice"
          data-visible={notice.visible || undefined}
        >
          <span
            key={notice.display}
            className="warmup-notice-dot"
            aria-hidden="true"
          />
          <span aria-hidden="true">{notice.typed}</span>
          <span className="landing-sr-only" aria-live="polite">
            {notice.display}
          </span>
        </div>
      </div>
      <p className="warmup-bottom" data-long={long || undefined}>
        {long
          ? 'taking longer than usual, big files take a moment'
          : 'usually ready in under a minute · you can leave this tab open'}
      </p>
    </main>
  );
}
