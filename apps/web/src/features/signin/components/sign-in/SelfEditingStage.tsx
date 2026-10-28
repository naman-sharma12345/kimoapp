import { useEffect, useRef, useState } from 'react';
import { motion, useReducedMotion } from 'motion/react';
import { DUR, EASE } from '../../lib/motion';
import { getStageFrameAtTime, LOOP_DURATION_SEC } from '../../lib/stage-logic';
import { StageAgentLine } from './StageAgentLine';
import { StageTimeline } from './StageTimeline';
import { StageViewer } from './StageViewer';

/**
 * The Stage (left column): "the film that edits itself".
 * Vertically centered inside the left column, a composition 640px wide
 * (scales down proportionally with the column, never wider than column width minus 96px).
 * Under 1024px: 16:9 strip above the door, 100% width, max-height 42vh.
 * Under 640px: shrinks to a 120px-tall "timeline only" version (no viewer, only the animated timeline).
 */
export function SelfEditingStage() {
  const prefersReducedMotion = Boolean(useReducedMotion());
  const containerRef = useRef<HTMLDivElement | null>(null);
  const [elapsedSec, setElapsedSec] = useState<number>(0);

  useEffect(() => {
    if (prefersReducedMotion) return;

    let rafId = 0;
    let isTabVisible = !document.hidden;
    let isInViewport = true;
    let lastTimestamp: number | null = null;
    let accumulatedSec = 0;

    // Wait 200ms entry delay before starting the 0.0s sequence
    const startDelayMs = 200;
    const mountTime = performance.now();

    const tick = (now: number) => {
      if (now - mountTime >= startDelayMs && isTabVisible && isInViewport) {
        if (lastTimestamp !== null) {
          const deltaSec = (now - lastTimestamp) / 1000;
          accumulatedSec = (accumulatedSec + deltaSec) % LOOP_DURATION_SEC;
          setElapsedSec(accumulatedSec);
        }
        lastTimestamp = now;
      } else {
        lastTimestamp = null;
      }
      rafId = window.requestAnimationFrame(tick);
    };

    const handleVisibilityChange = () => {
      isTabVisible = !document.hidden;
      if (!isTabVisible) {
        lastTimestamp = null;
      }
    };

    const observer = new IntersectionObserver(
      (entries) => {
        const entry = entries[0];
        if (entry) {
          isInViewport = entry.isIntersecting;
          if (!isInViewport) {
            lastTimestamp = null;
          }
        }
      },
      { threshold: 0.05 },
    );

    if (containerRef.current) {
      observer.observe(containerRef.current);
    }
    document.addEventListener('visibilitychange', handleVisibilityChange);
    rafId = window.requestAnimationFrame(tick);

    return () => {
      window.cancelAnimationFrame(rafId);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      observer.disconnect();
    };
  }, [prefersReducedMotion]);

  const frame = getStageFrameAtTime(elapsedSec, prefersReducedMotion);

  return (
    <div
      ref={containerRef}
      className="relative w-full flex items-center justify-center"
    >
      {/* Screen-reader description for the self-editing stage */}
      <span className="sr-only">
        a preview of kimo editing a short film by itself: cutting clips, adding
        captions, music, a voiceover and a color grade, then playing it back.
      </span>

      {/* Interactive-free visual stage container */}
      <motion.div
        aria-hidden="true"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{
          duration: prefersReducedMotion ? DUR.dur2 : DUR.dur5,
          ease: EASE.easeOut,
          delay: prefersReducedMotion ? 0 : 0.2,
        }}
        className="relative w-full flex flex-col items-center justify-center pointer-events-none"
      >
        {/* Horizon glow behind the stage, centered horizontally, center 120px below bottom of agent line */}
        <motion.div
          animate={
            prefersReducedMotion
              ? { opacity: 0.7 }
              : { opacity: [0.6, 0.8, 0.6] }
          }
          transition={
            prefersReducedMotion
              ? { duration: 0 }
              : {
                  duration: 8,
                  ease: EASE.easeInOut,
                  repeat: Infinity,
                }
          }
          className="pointer-events-none absolute left-1/2 -translate-x-1/2 z-0"
          style={{
            width: 1400,
            height: 520,
            bottom: -380,
            background: 'var(--horizon-glow)',
            filter: 'blur(40px)',
          }}
        />

        {/* Loop fade container (fades out at 13.6s over dur-4 ease-in, back in at 0.0s over dur-4 ease-out) */}
        <motion.div
          animate={{ opacity: frame.stageFadingOut ? 0 : 1 }}
          transition={{
            duration: prefersReducedMotion ? DUR.dur2 : DUR.dur4,
            ease: frame.stageFadingOut ? EASE.easeIn : EASE.easeOut,
          }}
          className="relative z-10 w-full max-w-[640px] lg:max-w-[min(640px,calc(100%-96px))] flex flex-col"
          style={{ gap: 'var(--space-16)' }}
        >
          {/* A. The Viewer: hidden on <640px ("timeline only" 120px version) */}
          <div className="hidden sm:block w-full">
            <StageViewer frame={frame} />
          </div>

          {/* B. The Timeline: visible at all breakpoints */}
          <div className="w-full">
            <StageTimeline frame={frame} />
          </div>

          {/* C. The Agent Line: hidden on <640px where stage is 120px timeline-only */}
          <div className="hidden sm:block w-full">
            <StageAgentLine step={frame.agentStep} />
          </div>
        </motion.div>
      </motion.div>
    </div>
  );
}
