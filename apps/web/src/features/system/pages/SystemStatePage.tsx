/**
 * NEW COPY (short, lowercase, plain strings required for interactive feedback & accessibility):
 * - "copied" (feedback label on the error digest copy button after copying)
 * - "simulate reconnect" (state switcher helper action when testing offline state)
 */

import { useEffect, useId, useRef, useState } from 'react';
import { AnimatePresence, motion, useReducedMotion } from 'motion/react';
import { ChevronDown, Loader2 } from 'lucide-react';
import { dur, durMs, ease, loop } from '../lib/motion';
import {
  formatErrorDigest,
  stepOfflineStatus,
  type OfflineStatusState,
} from '../lib/system-state-logic';
import { FilmGrain } from '../components/system-state-page/FilmGrain';
import { KimoMark } from '../components/system-state-page/KimoMark';
import { NotFoundIllustration } from '../components/system-state-page/NotFoundIllustration';
import { ErrorIllustration } from '../components/system-state-page/ErrorIllustration';
import { OfflineIllustration } from '../components/system-state-page/OfflineIllustration';
import { SystemBanner } from '../components/system-state-page/SystemBanner';
import type {
  SystemErrorInfo,
  SystemStatePageProps,
} from '../types/system-state-page';

export { SystemBanner };

const DEFAULT_ERROR: SystemErrorInfo = {
  digest: 'kimo_err_0x7f3d91b2',
  message:
    'pipeline_fault: decoder ring buffer stalled on track v1 (frame 00:01:18:14) — timeline state committed to local journal',
};

export default function SystemStatePage({
  variant,
  error = DEFAULT_ERROR,
  reset,
  onReport,
  onReconnected,
  defaultDetailsOpen = false,
  onNavigate,
}: SystemStatePageProps) {
  const shouldReduceMotion = Boolean(useReducedMotion());
  const [dataReady, setDataReady] = useState<boolean>(false);
  const [detailsOpen, setDetailsOpen] = useState<boolean>(defaultDetailsOpen);
  const [copied, setCopied] = useState<boolean>(false);
  const [offlineStatus, setOfflineStatus] = useState<OfflineStatusState>({
    phase: 'countdown',
    secondsRemaining: loop.offlineCountdownSec,
  });

  const headingRef = useRef<HTMLHeadingElement | null>(null);
  const detailsButtonRef = useRef<HTMLButtonElement | null>(null);
  const reportedRef = useRef<boolean>(false);
  const detailsPanelId = useId();

  // Sync defaultDetailsOpen prop when switched via State Switcher
  useEffect(() => {
    setDetailsOpen(Boolean(defaultDetailsOpen));
  }, [defaultDetailsOpen, variant]);

  // Move focus to the page heading on load & manage data-ready after entry animation
  useEffect(() => {
    setDataReady(false);
    headingRef.current?.focus({ preventScroll: true });

    const totalEntryMs = shouldReduceMotion
      ? durMs.dur2 + 40
      : durMs.dur4 + 4 * 50 + 40;

    const timer = window.setTimeout(() => {
      setDataReady(true);
    }, totalEntryMs);

    return () => {
      window.clearTimeout(timer);
    };
  }, [variant, shouldReduceMotion]);

  // Call onReport(error) once on mount when variant === "error"
  useEffect(() => {
    if (variant !== 'error') {
      reportedRef.current = false;
      return;
    }
    if (!reportedRef.current) {
      reportedRef.current = true;
      onReport?.(error);
    }
  }, [variant, error, onReport]);

  // Close error details disclosure on Escape and return focus to toggle button
  useEffect(() => {
    if (variant !== 'error' || !detailsOpen) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        setDetailsOpen(false);
        detailsButtonRef.current?.focus();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [variant, detailsOpen]);

  // Offline countdown & window online event handling
  useEffect(() => {
    if (variant !== 'offline') return;

    setOfflineStatus({
      phase: 'countdown',
      secondsRemaining: loop.offlineCountdownSec,
    });

    const intervalId = window.setInterval(() => {
      setOfflineStatus((prev) => stepOfflineStatus(prev));
    }, 1000);

    let reconnectTimeoutId: number | undefined;

    const handleOnline = () => {
      window.clearInterval(intervalId);
      setOfflineStatus({ phase: 'online', secondsRemaining: 0 });
      reconnectTimeoutId = window.setTimeout(() => {
        onReconnected?.();
      }, loop.offlineReconnectedDelayMs);
    };

    window.addEventListener('online', handleOnline);

    return () => {
      window.clearInterval(intervalId);
      if (reconnectTimeoutId !== undefined) {
        window.clearTimeout(reconnectTimeoutId);
      }
      window.removeEventListener('online', handleOnline);
    };
  }, [variant, onReconnected]);

  const handleCopyDigest = async () => {
    const text = formatErrorDigest(error);
    try {
      await navigator.clipboard?.writeText(text);
    } catch {
      // Clipboard fallback in restricted iframe environments
    }
    setCopied(true);
    window.setTimeout(() => {
      setCopied(false);
    }, 1600);
  };

  const handleLinkClick = (
    e: React.MouseEvent<HTMLAnchorElement>,
    href: string,
  ) => {
    if (onNavigate) {
      e.preventDefault();
      onNavigate(href);
    }
  };

  const getLineInitial = () =>
    shouldReduceMotion ? { opacity: 0 } : { opacity: 0, y: 8 };

  const getLineAnimate = () =>
    shouldReduceMotion ? { opacity: 1 } : { opacity: 1, y: 0 };

  const getLineTransition = (staggerIndex: number) => ({
    duration: shouldReduceMotion ? dur.dur2 : dur.dur4,
    ease: ease.out,
    delay: shouldReduceMotion ? 0 : staggerIndex * 0.05,
  });

  const renderHorizonGlow = () => (
    <div
      aria-hidden="true"
      style={{
        position: 'absolute',
        top: 'calc(50% + 120px)',
        left: '50%',
        width: '1400px',
        height: '520px',
        transform: 'translate(-50%, -50%)',
        background: 'var(--horizon-glow)',
        filter: 'blur(40px)',
        opacity: 0.6,
        pointerEvents: 'none',
        zIndex: 0,
      }}
    />
  );

  return (
    <div
      className="kimo-system"
      data-ready={dataReady ? 'true' : 'false'}
      data-variant={variant}
      style={{
        minHeight: '100vh',
        width: '100%',
        backgroundColor: 'var(--ink-0)',
        color: 'var(--cream-100)',
        display: 'flex',
        flexDirection: 'column',
        position: 'relative',
        overflow: 'hidden',
      }}
    >
      <FilmGrain />

      {/* Light top bar: mark 20 + wordmark t-17 linking "/" */}
      <header
        style={{
          width: '100%',
          padding: 'var(--sp-20) var(--sp-24)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          position: 'relative',
          zIndex: 10,
        }}
      >
        <a
          href="/"
          onClick={(e) => handleLinkClick(e, '/')}
          className="focus-ring"
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: 'var(--sp-8)',
            textDecoration: 'none',
            color: 'var(--cream-100)',
            borderRadius: 'var(--r-6)',
            minHeight: 'var(--h-32)',
          }}
        >
          <KimoMark size={20} />
          <span className="t-17 wordmark-kimo">kimo</span>
        </a>
      </header>

      {/* Centered content container, max-width 480, text centered */}
      <main
        style={{
          flex: 1,
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          padding: 'var(--sp-24) var(--sp-20) var(--sp-64)',
          position: 'relative',
          zIndex: 10,
        }}
      >
        <div
          key={variant}
          style={{
            width: '100%',
            maxWidth: '480px',
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            textAlign: 'center',
            position: 'relative',
          }}
        >
          {/* Illustration fades in dur-4 */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{
              duration: shouldReduceMotion ? dur.dur2 : dur.dur4,
              ease: ease.out,
            }}
            style={{
              marginBottom: 'var(--sp-24)',
              display: 'flex',
              justifyContent: 'center',
              width: '100%',
            }}
          >
            {variant === 'not-found' && <NotFoundIllustration />}
            {variant === 'error' && <ErrorIllustration />}
            {variant === 'offline' && <OfflineIllustration />}
          </motion.div>

          {/* VARIANT "not-found" (404) */}
          {variant === 'not-found' && (
            <>
              <motion.div
                initial={getLineInitial()}
                animate={getLineAnimate()}
                transition={getLineTransition(1)}
                className="t-20 font-mono-kimo"
                style={{
                  color: 'var(--cream-38)',
                  marginBottom: 'var(--sp-8)',
                }}
              >
                404
              </motion.div>

              <motion.h1
                ref={headingRef}
                tabIndex={-1}
                initial={getLineInitial()}
                animate={getLineAnimate()}
                transition={getLineTransition(2)}
                className="t-28"
                style={{
                  color: 'var(--cream-100)',
                  margin: '0 0 var(--sp-8) 0',
                  outline: 'none',
                  textWrap: 'balance',
                }}
              >
                this frame isn&apos;t in the cut
              </motion.h1>

              <motion.p
                initial={getLineInitial()}
                animate={getLineAnimate()}
                transition={getLineTransition(3)}
                className="t-15"
                style={{
                  color: 'var(--cream-60)',
                  margin: '0 0 var(--sp-32) 0',
                  fontWeight: 400,
                  textWrap: 'balance',
                }}
              >
                the page you&apos;re looking for was moved, deleted, or never
                rendered.
              </motion.p>

              {/* Main action button row with horizon glow centered 120px below */}
              <motion.div
                initial={getLineInitial()}
                animate={getLineAnimate()}
                transition={getLineTransition(4)}
                style={{
                  position: 'relative',
                  display: 'flex',
                  flexWrap: 'wrap',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: 'var(--sp-8)',
                }}
              >
                {renderHorizonGlow()}
                <a
                  href="/"
                  onClick={(e) => handleLinkClick(e, '/')}
                  className="kimo-btn kimo-btn-md kimo-btn-primary"
                  style={{ position: 'relative', zIndex: 1 }}
                >
                  back to kimo
                </a>
                <a
                  href="/projects"
                  onClick={(e) => handleLinkClick(e, '/projects')}
                  className="kimo-btn kimo-btn-md kimo-btn-ghost"
                  style={{ position: 'relative', zIndex: 1 }}
                >
                  your projects
                </a>
              </motion.div>
            </>
          )}

          {/* VARIANT "error" (500, error boundary) */}
          {variant === 'error' && (
            <>
              <motion.h1
                ref={headingRef}
                tabIndex={-1}
                initial={getLineInitial()}
                animate={getLineAnimate()}
                transition={getLineTransition(1)}
                className="t-28"
                style={{
                  color: 'var(--cream-100)',
                  margin: '0 0 var(--sp-8) 0',
                  outline: 'none',
                  textWrap: 'balance',
                }}
              >
                something broke mid-edit
              </motion.h1>

              <motion.p
                initial={getLineInitial()}
                animate={getLineAnimate()}
                transition={getLineTransition(2)}
                className="t-15"
                style={{
                  color: 'var(--cream-60)',
                  margin: '0 0 var(--sp-32) 0',
                  fontWeight: 400,
                  textWrap: 'balance',
                }}
              >
                it&apos;s not you. your project is saved, so you can pick up
                where it stopped.
              </motion.p>

              {/* Main button row with horizon glow centered 120px below */}
              <motion.div
                initial={getLineInitial()}
                animate={getLineAnimate()}
                transition={getLineTransition(3)}
                style={{
                  position: 'relative',
                  display: 'flex',
                  flexWrap: 'wrap',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: 'var(--sp-8)',
                }}
              >
                {renderHorizonGlow()}
                <button
                  type="button"
                  onClick={() => reset?.()}
                  className="kimo-btn kimo-btn-md kimo-btn-primary"
                  style={{ position: 'relative', zIndex: 1 }}
                >
                  try again
                </button>
                <a
                  href="/projects"
                  onClick={(e) => handleLinkClick(e, '/projects')}
                  className="kimo-btn kimo-btn-md kimo-btn-ghost"
                  style={{ position: 'relative', zIndex: 1 }}
                >
                  your projects
                </a>
              </motion.div>

              {/* Collapsible "details" (ghost xs with ChevronDown 12) */}
              <motion.div
                initial={getLineInitial()}
                animate={getLineAnimate()}
                transition={getLineTransition(4)}
                style={{
                  marginTop: 'var(--sp-16)',
                  width: '100%',
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: 'center',
                  position: 'relative',
                  zIndex: 1,
                }}
              >
                <button
                  ref={detailsButtonRef}
                  type="button"
                  aria-expanded={detailsOpen}
                  aria-controls={detailsPanelId}
                  onClick={() => setDetailsOpen((prev) => !prev)}
                  className="kimo-btn kimo-btn-xs kimo-btn-ghost"
                >
                  <span>details</span>
                  <ChevronDown
                    size={12}
                    strokeWidth={1.5}
                    style={{
                      transform: detailsOpen
                        ? 'rotate(180deg)'
                        : 'rotate(0deg)',
                      transition: shouldReduceMotion
                        ? 'none'
                        : 'transform var(--dur-2) var(--ease-out)',
                    }}
                  />
                </button>

                <AnimatePresence initial={false}>
                  {detailsOpen && (
                    <motion.div
                      id={detailsPanelId}
                      role="region"
                      aria-label="error details"
                      initial={
                        shouldReduceMotion
                          ? { opacity: 0 }
                          : { opacity: 0, y: -4 }
                      }
                      animate={
                        shouldReduceMotion
                          ? { opacity: 1 }
                          : { opacity: 1, y: 0 }
                      }
                      exit={
                        shouldReduceMotion
                          ? { opacity: 0 }
                          : { opacity: 0, y: -4 }
                      }
                      transition={{
                        duration: shouldReduceMotion ? dur.dur2 : dur.dur3,
                        ease: ease.out,
                      }}
                      className="t-12 font-mono-kimo"
                      style={{
                        marginTop: 'var(--sp-8)',
                        width: '100%',
                        backgroundColor: 'var(--ink-1)',
                        border: '1px solid var(--line)',
                        borderRadius: 'var(--r-8)',
                        padding: 'var(--sp-12)',
                        maxHeight: '160px',
                        overflowY: 'auto',
                        color: 'var(--cream-38)',
                        textAlign: 'left',
                        display: 'flex',
                        alignItems: 'flex-start',
                        justifyContent: 'space-between',
                        gap: 'var(--sp-12)',
                      }}
                    >
                      <pre
                        style={{
                          margin: 0,
                          whiteSpace: 'pre-wrap',
                          wordBreak: 'break-word',
                          fontFamily: 'inherit',
                          fontSize: 'inherit',
                          lineHeight: 'inherit',
                          flex: 1,
                        }}
                      >
                        {formatErrorDigest(error)}
                      </pre>
                      <button
                        type="button"
                        onClick={handleCopyDigest}
                        className="kimo-btn kimo-btn-xs kimo-btn-ghost"
                        style={{ flexShrink: 0 }}
                      >
                        {copied ? 'copied' : 'copy'}
                      </button>
                    </motion.div>
                  )}
                </AnimatePresence>
              </motion.div>
            </>
          )}

          {/* VARIANT "offline" */}
          {variant === 'offline' && (
            <>
              <motion.h1
                ref={headingRef}
                tabIndex={-1}
                initial={getLineInitial()}
                animate={getLineAnimate()}
                transition={getLineTransition(1)}
                className="t-28"
                style={{
                  color: 'var(--cream-100)',
                  margin: '0 0 var(--sp-8) 0',
                  outline: 'none',
                  textWrap: 'balance',
                }}
              >
                you&apos;re offline
              </motion.h1>

              <motion.p
                initial={getLineInitial()}
                animate={getLineAnimate()}
                transition={getLineTransition(2)}
                className="t-15"
                style={{
                  color: 'var(--cream-60)',
                  margin: '0 0 var(--sp-32) 0',
                  fontWeight: 400,
                  textWrap: 'balance',
                }}
              >
                kimo will reconnect and pick up the edit as soon as you&apos;re
                back. nothing is lost.
              </motion.p>

              {/* Live status row with horizon glow centered 120px below */}
              <motion.div
                role="status"
                aria-live="polite"
                initial={getLineInitial()}
                animate={getLineAnimate()}
                transition={getLineTransition(3)}
                style={{
                  position: 'relative',
                  display: 'inline-flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: 'var(--sp-8)',
                  minHeight: 'var(--h-32)',
                }}
              >
                {renderHorizonGlow()}

                {offlineStatus.phase === 'reconnecting' ? (
                  <Loader2
                    size={14}
                    strokeWidth={1.5}
                    aria-hidden="true"
                    style={{
                      color: 'var(--cream-60)',
                      animation: shouldReduceMotion
                        ? 'none'
                        : 'kimo-spin 1s linear infinite',
                      position: 'relative',
                      zIndex: 1,
                    }}
                  />
                ) : (
                  <span
                    aria-hidden="true"
                    style={{
                      width: '6px',
                      height: '6px',
                      borderRadius: 'var(--r-999)',
                      backgroundColor:
                        offlineStatus.phase === 'online'
                          ? 'var(--success)'
                          : 'var(--cream-38)',
                      transition:
                        'background-color var(--dur-2) var(--ease-out)',
                      position: 'relative',
                      zIndex: 1,
                    }}
                  />
                )}

                <span
                  className="t-13"
                  style={{
                    color:
                      offlineStatus.phase === 'online'
                        ? 'var(--cream-100)'
                        : 'var(--cream-60)',
                    position: 'relative',
                    zIndex: 1,
                  }}
                >
                  {offlineStatus.phase === 'countdown' &&
                    `trying again in ${offlineStatus.secondsRemaining}s`}
                  {offlineStatus.phase === 'reconnecting' && 'reconnecting…'}
                  {offlineStatus.phase === 'online' && 'back online'}
                </span>
              </motion.div>
            </>
          )}
        </div>
      </main>
    </div>
  );
}
