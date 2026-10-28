'use client';
import { useEffect, useRef, useState, type CSSProperties } from 'react';
import { useRouter } from 'next/navigation';
import Image from 'next/image';
import { AnimatePresence, motion } from 'motion/react';
import { KimoClient, type RenderSnapshot } from '@kimo/client';
import { Button } from '@/components/ui/button';
import { Dialog, DialogClose, DialogContent } from '@/components/ui/dialog';
import { useToast } from '@/components/ui/toast';
import { useReducedMotion } from '@/lib/use-reduced-motion';
import { cancelNavigationGuard } from '@/lib/navigation';
import { durations, easings, springs } from '@/lib/motion';
import {
  navigateRendered,
  readRenderContext,
  renderStage,
  renderTiming,
  saveRenderContext,
  videoTime,
  type RenderContext,
} from '@/lib/render';
import { OutputAtmosphere, OutputBrand } from './output-shell';
type PrintedFrame = { n: number; url: string };
export function RenderScreen({
  sessionId,
  initialRenderId,
  initial,
}: {
  sessionId: string;
  initialRenderId: string;
  initial: RenderSnapshot;
}) {
  const router = useRouter();
  const reduced = useReducedMotion();
  const { toast } = useToast();
  const [renderId, setRenderId] = useState(initialRenderId);
  const [snapshot, setSnapshot] = useState(initial);
  const [context, setContext] = useState<RenderContext>();
  const [frames, setFrames] = useState<PrintedFrame[]>([]);
  const [networkError, setNetworkError] = useState('');
  const [cancelOpen, setCancelOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const announcedDone = useRef(false);
  const frameElement = useRef<HTMLDivElement>(null);
  const [rise, setRise] = useState(240);
  useEffect(() => {
    if (!frameElement.current) return;
    const observer = new ResizeObserver(([entry]) => {
      if (entry) setRise(entry.contentRect.height / 2 + 40);
    });
    observer.observe(frameElement.current);
    return () => observer.disconnect();
  }, []);
  useEffect(() => {
    const saved = readRenderContext(sessionId);
    setContext(
      saved?.renderId === initialRenderId
        ? saved
        : {
            renderId: initialRenderId,
            title: initial.title ?? 'untitled video',
            burnInCaptions: initial.burnInCaptions ?? true,
          },
    );
  }, [sessionId, initialRenderId, initial.title, initial.burnInCaptions]);
  useEffect(() => {
    let active = true;
    let timer: ReturnType<typeof setTimeout>;
    const client = new KimoClient();
    const poll = async () => {
      try {
        const next = await client.render(renderId);
        if (!active) return;
        setSnapshot(next);
        setNetworkError('');
        if (next.status === 'cancelled') {
          cancelNavigationGuard();
          router.replace(`/studio/${encodeURIComponent(sessionId)}`);
          return;
        }
        if (next.status === 'done' || next.status === 'failed') return;
      } catch {
        if (active) setNetworkError('connection lost · retrying…');
      }
      if (active) timer = setTimeout(() => void poll(), renderTiming.poll);
    };
    timer = setTimeout(() => void poll(), renderTiming.poll);
    return () => {
      active = false;
      clearTimeout(timer);
    };
  }, [renderId, router, sessionId]);
  useEffect(() => {
    if (!snapshot.frame || snapshot.status === 'failed') return;
    let active = true;
    const url = new KimoClient().renderFrameUrl(renderId, snapshot.frame);
    const frame = new window.Image();
    frame.onload = () => {
      if (active)
        setFrames((items) =>
          items.some((item) => item.n === snapshot.frame)
            ? items
            : [...items, { n: snapshot.frame, url }].slice(-8),
        );
    };
    frame.src = url;
    return () => {
      active = false;
      frame.onload = null;
    };
  }, [snapshot.frame, snapshot.status, renderId]);
  useEffect(() => {
    if (
      snapshot.status !== 'done' ||
      !snapshot.videoId ||
      announcedDone.current
    )
      return;
    const videoId = snapshot.videoId;
    router.prefetch(`/v/${encodeURIComponent(videoId)}`);
    const timer = setTimeout(
      () => {
        announcedDone.current = true;
        try {
          sessionStorage.setItem(`kimo.just-rendered.${videoId}`, 'yes');
        } catch {
          /* Optional delight flag. */
        }
        navigateRendered(
          router,
          `/v/${encodeURIComponent(videoId)}`,
          'delivery',
          reduced,
        );
      },
      reduced ? 0 : renderTiming.completion - renderTiming.frameFade,
    );
    return () => clearTimeout(timer);
  }, [snapshot.status, snapshot.videoId, reduced, router]);
  const latest = frames.at(-1);
  const failed = snapshot.status === 'failed';
  const done = snapshot.status === 'done';
  const current =
    latest?.url ??
    context?.poster ??
    new KimoClient().renderFrameUrl(renderId, 0);
  const chunk = Math.floor(snapshot.frame / 30);
  const retry = async () => {
    setBusy(true);
    try {
      const next = await new KimoClient().approve(sessionId, {
        title: context?.title,
        burnInCaptions: context?.burnInCaptions,
      });
      const saved = {
        renderId: next.renderId,
        title: context?.title ?? 'untitled video',
        poster: context?.poster,
        burnInCaptions: context?.burnInCaptions ?? true,
      };
      saveRenderContext(sessionId, saved);
      setContext(saved);
      setFrames([]);
      setRenderId(next.renderId);
      setSnapshot({
        ...initial,
        status: 'queued',
        progress: 0,
        frame: 0,
        videoId: undefined,
      });
      announcedDone.current = false;
    } catch {
      toast({
        message: 'could not restart the render · try again',
        tone: 'error',
      });
    } finally {
      setBusy(false);
    }
  };
  const cancel = async () => {
    setBusy(true);
    try {
      await new KimoClient().cancelRender(renderId);
      cancelNavigationGuard();
      router.push(`/studio/${encodeURIComponent(sessionId)}`);
    } catch {
      toast({
        message: 'could not cancel the render · try again',
        tone: 'error',
      });
      setBusy(false);
    }
  };
  return (
    <main
      id="main"
      className="output-page render-page"
      data-render-ready
      data-ready="true"
      data-status={snapshot.status}
    >
      <OutputAtmosphere />
      <header className="output-nav">
        <OutputBrand />
        <Dialog
          open={cancelOpen}
          onOpenChange={setCancelOpen}
          trigger={
            <Button size="xs" variant="ghost">
              back to editing
            </Button>
          }
        >
          <DialogContent
            title="cancel the render?"
            description="you’ll return to the studio with everything as it was."
            actions={
              <div className="agent-button-row">
                <DialogClose asChild>
                  <Button disabled={busy}>keep rendering</Button>
                </DialogClose>
                <Button
                  variant="danger"
                  loading={busy}
                  onClick={() => void cancel()}
                >
                  cancel render
                </Button>
              </div>
            }
          />
        </Dialog>
      </header>
      <section className="render-content" aria-label="render progress">
        <motion.div
          className="render-frame"
          ref={frameElement}
          data-output-frame
          data-dimmed={!latest || failed || undefined}
          style={{
            aspectRatio: `${snapshot.width ?? 1920}/${snapshot.height ?? 1080}`,
          }}
          animate={done && !reduced ? { scale: [1, 1.03, 1] } : { scale: 1 }}
          transition={{
            duration: renderTiming.completion / 1000,
            ease: easings['ease-out'],
            times: [0, 0.7, 1],
          }}
        >
          <AnimatePresence initial={false}>
            <motion.div
              className="render-frame-image"
              key={current}
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{
                duration:
                  (reduced
                    ? renderTiming.completionReduced
                    : renderTiming.frameFade) / 1000,
              }}
            >
              <Image
                src={current}
                alt="most recently rendered frame"
                fill
                sizes="640px"
                unoptimized
              />
              {!reduced && latest && !failed ? (
                <div
                  className="render-print"
                  key={`${done ? 'final' : 'chunk'}-${chunk}`}
                  style={
                    {
                      '--print-duration': `${done ? renderTiming.finalSweep : renderTiming.chunk}ms`,
                    } as CSSProperties
                  }
                >
                  <Image
                    className="render-print-bright"
                    src={current}
                    alt=""
                    fill
                    sizes="640px"
                    unoptimized
                  />
                  <div className="render-scan">
                    <div />
                  </div>
                </div>
              ) : null}
            </motion.div>
          </AnimatePresence>
          {done ? (
            <div className="render-completion" aria-hidden>
              {!reduced ? (
                <motion.div
                  className="render-done-bars"
                  initial={{ scaleY: 1, opacity: 1 }}
                  animate={{ scaleY: [1, 1, 0], opacity: [1, 1, 0] }}
                  transition={{
                    duration: renderTiming.barsCollapse / 1000,
                    times: [0, 0.88, 1],
                  }}
                >
                  {[1, 1, 0.84, 0.68, 0.52, 0.68, 0.84, 1, 1].map(
                    (height, index) => (
                      <motion.span
                        key={index}
                        style={{ height: `${height * 100}%` }}
                        initial={{ y: rise, scaleY: 0 }}
                        animate={{ y: 0, scaleY: 1 }}
                        transition={{
                          ...springs.snappy,
                          delay:
                            (Math.floor((index * 4) / 9) *
                              renderTiming.barStagger) /
                            1000,
                        }}
                      />
                    ),
                  )}
                </motion.div>
              ) : null}
              <motion.svg
                className="render-done-check"
                viewBox="0 0 24 24"
                initial={{ opacity: reduced ? 1 : 0 }}
                animate={{ opacity: 1 }}
                transition={{
                  delay: reduced ? 0 : renderTiming.checkDelay / 1000,
                  duration: durations['dur-3'],
                }}
              >
                <motion.path
                  d="m5 12 4 4 10-10"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  initial={{ pathLength: reduced ? 1 : 0 }}
                  animate={{ pathLength: 1 }}
                  transition={{
                    delay: reduced ? 0 : renderTiming.checkDelay / 1000,
                    duration: durations['dur-3'],
                  }}
                />
              </motion.svg>
            </div>
          ) : null}
        </motion.div>
        <div
          className="render-progress"
          role="progressbar"
          aria-label="final video render"
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={Math.round(snapshot.progress * 100)}
          data-done={done || undefined}
          data-failed={failed || undefined}
        >
          <div style={{ transform: `scaleX(${snapshot.progress})` }} />
        </div>
        <div className="render-statistics">
          <span>
            frame {snapshot.frame} of {snapshot.totalFrames}
          </span>
          <span>about {videoTime(snapshot.etaSec)} left</span>
        </div>
        {failed ? (
          <div className="render-failure" role="alert">
            <h1>the render hit a problem</h1>
            <p>{snapshot.error ?? 'the server could not finish this render'}</p>
            <div className="agent-button-row">
              <Button
                variant="primary"
                onClick={() => void retry()}
                loading={busy}
              >
                try again
              </Button>
              <Button onClick={() => void cancel()}>back to editing</Button>
            </div>
          </div>
        ) : (
          <div className="render-stage-wrap">
            <AnimatePresence initial={false}>
              <motion.h1
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                transition={{ duration: durations['dur-3'] }}
                className="render-stage"
                key={renderStage(snapshot.progress)}
                aria-live="polite"
              >
                {renderStage(snapshot.progress)}
              </motion.h1>
            </AnimatePresence>
          </div>
        )}
        <div className="render-filmstrip" aria-label="rendered frames">
          {frames.map((frame, index) => (
            <motion.div
              key={frame.n}
              initial={{ x: reduced ? 0 : 24, opacity: reduced ? 1 : 0 }}
              animate={{
                x: 0,
                opacity: 0.4 + ((index + 1) / frames.length) * 0.6,
              }}
              transition={
                reduced ? { duration: durations['dur-2'] } : springs.snappy
              }
            >
              <Image
                src={frame.url}
                alt={`rendered frame ${frame.n}`}
                width={64}
                height={36}
                unoptimized
              />
            </motion.div>
          ))}
        </div>
        {networkError ? (
          <p role="status" className="output-secondary">
            {networkError}
          </p>
        ) : null}
      </section>
      <div className="render-return-note">
        <p>
          you can close this tab, we’ll keep rendering. come back to this link
          anytime.
        </p>
        <Button
          variant="ghost"
          size="xs"
          onClick={() => {
            void navigator.clipboard
              .writeText(location.href)
              .then(() => toast({ message: 'link copied' }))
              .catch(() =>
                toast({ message: 'could not copy link', tone: 'error' }),
              );
          }}
        >
          copy link
        </Button>
      </div>
      {done ? (
        <span className="sr-only" role="status">
          render complete
        </span>
      ) : null}
    </main>
  );
}
