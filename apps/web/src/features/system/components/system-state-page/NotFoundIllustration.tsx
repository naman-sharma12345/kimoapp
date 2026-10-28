import { useEffect, useState } from 'react';
import { useReducedMotion } from 'motion/react';
import { loop } from '../../lib/motion';
import {
  computePlayheadState,
  NOT_FOUND_SEGMENTS,
  type PlayheadFrameState,
} from '../../lib/system-state-logic';

/**
 * VARIANT "not-found" (404) illustration:
 * - Above the timeline: a 160 x 90 viewer rectangle (#0B0B0C, r8, hairline inset)
 *   shows each clip as a flat tint while the playhead is over a clip and, over the gap,
 *   shows Geist Mono t-12 cream-38 "no media" with a 2-frame flicker (opacity 1, 0.4, 1 at 60ms steps).
 * - Mini timeline (320px wide, bg --ink-1, border --line, r12, padding 12) with one video track.
 *   Three clips (#3A3833, r6) sit on the track with a visible gap in the middle where a clip is missing;
 *   the gap has a 1px dashed --line-strong outline.
 * - Playhead (1.5px cream-100 with a 7px triangle) sweeps from left to right over 3s linear,
 *   loops with a 600ms pause at the end. Reduced motion: playhead parked in the gap.
 */
export function NotFoundIllustration() {
  const shouldReduceMotion = Boolean(useReducedMotion());
  const [frame, setFrame] = useState<PlayheadFrameState>(() =>
    computePlayheadState(0, shouldReduceMotion),
  );

  useEffect(() => {
    if (shouldReduceMotion) {
      setFrame(computePlayheadState(0, true));
      return;
    }

    const startTime = performance.now();
    // Update at 30ms intervals (~33fps) to accurately hit 60ms flicker steps
    // without saturating software headless Chromium RAF queues.
    const intervalId = window.setInterval(() => {
      const elapsed = performance.now() - startTime;
      setFrame(
        computePlayheadState(
          elapsed,
          false,
          loop.notFoundSweepSec * 1000,
          loop.notFoundPauseMs,
          loop.notFoundFlickerStepMs,
        ),
      );
    }, 30);

    return () => {
      window.clearInterval(intervalId);
    };
  }, [shouldReduceMotion]);

  // Track inner width = 320 - 24 (padding 12 * 2) - 2 (border) = 294px
  const trackWidthPx = 294;
  const playheadX = frame.progress * trackWidthPx;

  return (
    <div
      data-testid="not-found-illustration"
      aria-label="timeline with missing media clip"
      style={{
        width: '320px',
        maxWidth: '100%',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        gap: 'var(--sp-8)',
      }}
    >
      {/* 160 x 90 viewer rectangle (#0B0B0C, r8, hairline inset) */}
      <div
        style={{
          width: '160px',
          height: '90px',
          borderRadius: 'var(--r-8)',
          backgroundColor: frame.isOverClip
            ? 'var(--track-video)'
            : 'var(--viewer-bg)',
          boxShadow: 'inset 0 0 0 1px var(--line)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          position: 'relative',
          overflow: 'hidden',
          transition: shouldReduceMotion
            ? 'none'
            : 'background-color var(--dur-1) var(--ease-out)',
        }}
      >
        {frame.isInGap && (
          <span
            className="t-12 font-mono-kimo"
            style={{
              color: 'var(--cream-38)',
              opacity: frame.noMediaOpacity,
              userSelect: 'none',
            }}
          >
            no media
          </span>
        )}
      </div>

      {/* Mini timeline: 320w, bg --ink-1, border --line, r12, padding 12 */}
      <div
        style={{
          width: '320px',
          maxWidth: '100%',
          height: '48px',
          backgroundColor: 'var(--ink-1)',
          border: '1px solid var(--line)',
          borderRadius: 'var(--r-12)',
          padding: 'var(--sp-12)',
          position: 'relative',
          display: 'flex',
          alignItems: 'center',
        }}
      >
        {/* Single video track */}
        <div
          style={{
            position: 'relative',
            width: '100%',
            height: '24px',
          }}
        >
          {NOT_FOUND_SEGMENTS.map((seg) => {
            const leftPct = `${seg.start * 100}%`;
            const widthPct = `${(seg.end - seg.start) * 100}%`;

            if (seg.kind === 'gap') {
              return (
                <div
                  key={seg.id}
                  style={{
                    position: 'absolute',
                    top: 0,
                    bottom: 0,
                    left: leftPct,
                    width: widthPct,
                    borderRadius: 'var(--r-6)',
                    border: '1px dashed var(--line-strong)',
                  }}
                />
              );
            }

            return (
              <div
                key={seg.id}
                style={{
                  position: 'absolute',
                  top: 0,
                  bottom: 0,
                  left: leftPct,
                  width: widthPct,
                  borderRadius: 'var(--r-6)',
                  backgroundColor: 'var(--track-video)',
                }}
              />
            );
          })}

          {/* Playhead: 1.5px cream-100 with a 7px triangle */}
          <div
            style={{
              position: 'absolute',
              top: '-6px',
              bottom: '-6px',
              left: 0,
              transform: `translate3d(${playheadX}px, 0, 0)`,
              width: '1.5px',
              backgroundColor: 'var(--cream-100)',
              pointerEvents: 'none',
            }}
          >
            <svg
              width="7"
              height="5"
              viewBox="0 0 7 5"
              fill="var(--cream-100)"
              style={{
                position: 'absolute',
                top: '-2px',
                left: '50%',
                transform: 'translateX(-50%)',
                display: 'block',
              }}
            >
              <path d="M0 0H7L3.5 5Z" />
            </svg>
          </div>
        </div>
      </div>
    </div>
  );
}
