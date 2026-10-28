'use client';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { motion } from 'motion/react';
import { Download, Link2, Share2, Pencil } from 'lucide-react';
import { KimoApiError, KimoClient, type DeliveredVideo } from '@kimo/client';
import { Button } from '@/components/ui/button';
import { Popover } from '@/components/ui/popover';
import { Section } from '@/components/ui/section';
import { Tooltip } from '@/components/ui/tooltip';
import { useToast } from '@/components/ui/toast';
import { useReducedMotion } from '@/lib/use-reduced-motion';
import { durations, easings } from '@/lib/motion';
import { renderTiming, videoFilename, videoTime } from '@/lib/render';
import { OutputAtmosphere, OutputBrand, OutputFooter } from './output-shell';
import { DeliveryPlayer } from './delivery-player';
export function DeliveryPage({
  videoId,
  video,
}: {
  videoId: string;
  video: DeliveredVideo;
}) {
  const router = useRouter();
  const { toast } = useToast();
  const reduced = useReducedMotion();
  const [fromTransition] = useState(
    () =>
      typeof document !== 'undefined' &&
      Boolean(document.documentElement.dataset.renderTransition),
  );
  const [sheen, setSheen] = useState(false);
  const [expired, setExpired] = useState(!video.sessionId);
  const [editing, setEditing] = useState(false);
  const [shareOpen, setShareOpen] = useState(false);
  const [url, setUrl] = useState('');
  useEffect(() => {
    setUrl(location.href);
    try {
      if (sessionStorage.getItem(`kimo.just-rendered.${videoId}`)) {
        sessionStorage.removeItem(`kimo.just-rendered.${videoId}`);
        setSheen(!reduced);
      }
    } catch {
      /* Storage is optional. */
    }
  }, [videoId, reduced]);
  useEffect(() => {
    if (video.sessionExpiresAt === undefined) return;
    const remaining = video.sessionExpiresAt - Date.now();
    if (remaining <= 0) {
      setExpired(true);
      return;
    }
    const timer = setTimeout(
      () => setExpired(true),
      Math.min(remaining, 2147483647),
    );
    return () => clearTimeout(timer);
  }, [video.sessionExpiresAt]);
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(location.href);
      toast({ message: 'link copied' });
    } catch {
      toast({ message: 'could not copy link', tone: 'error' });
    }
  };
  const share = async () => {
    if (navigator.share) {
      try {
        await navigator.share({
          title: video.title,
          text: 'made with kimo, the ai video editor',
          url: location.href,
        });
        return;
      } catch (error) {
        if (error instanceof Error && error.name === 'AbortError') return;
      }
    }
    setShareOpen(true);
  };
  const edit = async () => {
    if (!video.sessionId) return;
    setEditing(true);
    try {
      await new KimoClient().reopenSession(video.sessionId);
      router.push(`/studio/${encodeURIComponent(video.sessionId)}`);
    } catch (error) {
      if (error instanceof KimoApiError && error.status === 404)
        setExpired(true);
      toast({
        message:
          error instanceof KimoApiError && error.status === 404
            ? 'this edit has expired'
            : 'could not reopen this edit · try again',
        tone: 'error',
      });
      setEditing(false);
    }
  };
  const enter = (
    index: number,
    stagger: number = renderTiming.entranceStagger,
  ) => ({
    initial: fromTransition
      ? (false as const)
      : { opacity: 0, y: reduced ? 0 : 10 },
    animate: { opacity: 1, y: 0 },
    transition: {
      duration: reduced ? durations['dur-2'] : durations['dur-4'],
      delay: reduced || fromTransition ? 0 : (index * stagger) / 1000,
      ease: easings['ease-out'],
    },
  });
  return (
    <main
      id="main"
      className="output-page delivery-page"
      data-delivery-ready
      data-ready="true"
    >
      <OutputAtmosphere />
      <div className="delivery-container">
        <header className="delivery-nav">
          <OutputBrand wordmark />
          <Link href="/" className="ui-button ui-button-secondary ui-size-sm">
            make another
          </Link>
        </header>
        <div className="delivery-heading">
          <motion.p {...enter(0)}>your video is ready</motion.p>
          <motion.h1 {...enter(1)}>{video.title}</motion.h1>
        </div>
        <DeliveryPlayer video={video} fromTransition={fromTransition} />
        <div className="delivery-actions">
          <motion.a
            href={video.url}
            download={videoFilename(video.title)}
            className="ui-button ui-button-primary ui-size-lg delivery-download"
            data-sheen={sheen || undefined}
            {...enter(0)}
          >
            <span className="ui-button-label">
              <Download size={16} aria-hidden />
              download mp4
            </span>
          </motion.a>
          <motion.div {...enter(1, renderTiming.actionStagger)}>
            <Button size="lg" icon={Link2} onClick={() => void copy()}>
              copy link
            </Button>
          </motion.div>
          <motion.div {...enter(2, renderTiming.actionStagger)}>
            <Popover
              label="share this video"
              open={shareOpen}
              onOpenChange={(open) => {
                if (!open || !navigator.share) setShareOpen(open);
              }}
              trigger={
                <Button size="lg" icon={Share2} onClick={() => void share()}>
                  share
                </Button>
              }
            >
              <div className="delivery-share-links">
                <a
                  href={`https://twitter.com/intent/tweet?url=${encodeURIComponent(url)}&text=${encodeURIComponent(video.title)}`}
                  target="_blank"
                  rel="noreferrer"
                >
                  X
                </a>
                <a
                  href={`https://wa.me/?text=${encodeURIComponent(`${video.title} ${url}`)}`}
                  target="_blank"
                  rel="noreferrer"
                >
                  WhatsApp
                </a>
                <a
                  href={`https://www.linkedin.com/sharing/share-offsite/?url=${encodeURIComponent(url)}`}
                  target="_blank"
                  rel="noreferrer"
                >
                  LinkedIn
                </a>
                <Button variant="ghost" size="sm" onClick={() => void copy()}>
                  copy link
                </Button>
              </div>
            </Popover>
          </motion.div>
          <motion.div {...enter(3, renderTiming.actionStagger)}>
            {expired ? (
              <Tooltip content="this edit has expired">
                <Button
                  size="lg"
                  variant="ghost"
                  icon={Pencil}
                  aria-disabled="true"
                >
                  edit again
                </Button>
              </Tooltip>
            ) : (
              <Button
                size="lg"
                variant="ghost"
                icon={Pencil}
                loading={editing}
                onClick={() => void edit()}
              >
                edit again
              </Button>
            )}
          </motion.div>
        </div>
        <p className="delivery-meta">
          <span>
            {video.width} × {video.height}
          </span>
          <span>{videoTime(video.durationSec)}</span>
          <span>
            {(video.sizeBytes / 1024 ** 2).toFixed(
              video.sizeBytes < 1024 ** 2 ? 1 : 0,
            )}{' '}
            MB
          </span>
          <span>
            made with kimo
            {video.madeInSec !== undefined
              ? ` in ${Math.max(1, Math.ceil(video.madeInSec / 60))} min`
              : ''}
          </span>
        </p>
        <div className="delivery-history">
          <Section label="how kimo made it" collapsible defaultOpen={false}>
            <ul>
              {video.actionGroups?.map((group, index) => (
                <li key={index}>
                  {group.summary} · {group.stepCount}{' '}
                  {group.stepCount === 1 ? 'step' : 'steps'}
                </li>
              ))}
            </ul>
            {video.models?.length ? (
              <p>models used: {video.models.join(', ')}</p>
            ) : null}
          </Section>
        </div>
        <OutputFooter />
      </div>
    </main>
  );
}
