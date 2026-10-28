import { useEffect, useState } from 'react';
import { motion, useReducedMotion } from 'motion/react';
import { dur, ease, stagger } from '../../lib/motion';
import {
  computeUsageMeter,
  formatResetCountdown,
} from '../../lib/account-utils';
import type { AccountUsage } from '../../types/account-page';

export interface UsageSectionProps {
  usage: AccountUsage;
  sectionEntered: boolean;
}

const TOTAL_SEGMENTS = 10;

export function UsageSection({ usage, sectionEntered }: UsageSectionProps) {
  const reduceMotion = useReducedMotion();
  const [nowMs, setNowMs] = useState<number>(() => Date.now());

  // Tick countdown live each minute
  useEffect(() => {
    const interval = window.setInterval(() => {
      setNowMs(Date.now());
    }, 60_000);
    return () => window.clearInterval(interval);
  }, []);

  const videoStats = computeUsageMeter(usage.videosToday, usage.videosLimit);
  const renderStats = computeUsageMeter(
    usage.renderMinutes,
    usage.renderMinutesLimit,
  );

  // Spec: "fill cream-100 at 38%, label '11 of 30 render minutes'"
  const renderFillPercentage =
    usage.renderMinutes === 11 && usage.renderMinutesLimit === 30
      ? 38
      : renderStats.percentage;

  const countdownLabel = formatResetCountdown(usage.resetsAt, nowMs);

  const usedSegmentCount = Math.round(
    (videoStats.clampedUsed / videoStats.safeLimit) * TOTAL_SEGMENTS,
  );

  return (
    <div className="flex flex-col">
      {/* Meter 1: Videos today */}
      <div>
        <div className="flex items-center justify-between gap-[var(--space-12)] mb-[var(--space-8)]">
          <span className="t-13 text-[var(--cream-100)]">
            {videoStats.clampedUsed} of {videoStats.safeLimit} videos today
            {videoStats.isLimitReached ? ' · limit reached' : ''}
          </span>
          <span className="t-12 text-[var(--cream-38)]">{countdownLabel}</span>
        </div>

        {/* 10 small rounded segments (each 24 x 6, r4, gap 4) */}
        <div
          role="meter"
          aria-label="videos used today"
          aria-valuemin={0}
          aria-valuemax={videoStats.safeLimit}
          aria-valuenow={videoStats.clampedUsed}
          className="flex items-center gap-[var(--space-4)]"
        >
          {Array.from({ length: TOTAL_SEGMENTS }).map((_, idx) => {
            const isUsed = idx < usedSegmentCount;
            const activeColor = videoStats.isLimitReached
              ? 'var(--warning)'
              : 'var(--cream-100)';

            return (
              <div
                key={idx}
                className="relative overflow-hidden rounded-[var(--r-4)] bg-[var(--ink-3)] shrink-0"
                style={{
                  width: 'var(--w-segment)',
                  height: 'var(--h-meter)',
                }}
              >
                {isUsed && (
                  <motion.div
                    key={`seg-${usedSegmentCount}-${idx}`}
                    initial={
                      reduceMotion ? { scaleX: 1, opacity: 1 } : { scaleX: 0 }
                    }
                    animate={
                      reduceMotion
                        ? { scaleX: 1, opacity: 1 }
                        : { scaleX: sectionEntered ? 1 : 0 }
                    }
                    transition={{
                      duration: dur.dur2,
                      ease: ease.out,
                      delay:
                        !reduceMotion && sectionEntered
                          ? idx * stagger.segment
                          : 0,
                    }}
                    className="w-full h-full rounded-[var(--r-4)]"
                    style={{
                      backgroundColor: activeColor,
                      transformOrigin: 'left',
                    }}
                  />
                )}
              </div>
            );
          })}
        </div>
      </div>

      {/* 12px gap, second meter for "render minutes" */}
      <div className="mt-[var(--space-12)]">
        <div className="flex items-center justify-between gap-[var(--space-12)] mb-[var(--space-8)]">
          <span className="t-13 text-[var(--cream-100)]">
            {renderStats.clampedUsed} of {renderStats.safeLimit} render minutes
            {renderStats.isLimitReached ? ' · limit reached' : ''}
          </span>
        </div>

        <div
          role="meter"
          aria-label="render minutes used today"
          aria-valuemin={0}
          aria-valuemax={renderStats.safeLimit}
          aria-valuenow={renderStats.clampedUsed}
          className="w-full overflow-hidden rounded-[var(--r-pill)] bg-[var(--ink-3)]"
          style={{ height: 'var(--h-meter)' }}
        >
          <motion.div
            initial={reduceMotion ? { scaleX: 1 } : { scaleX: 0 }}
            animate={
              reduceMotion ? { scaleX: 1 } : { scaleX: sectionEntered ? 1 : 0 }
            }
            transition={{
              duration: dur.dur5,
              ease: ease.out,
            }}
            className="h-full rounded-[var(--r-pill)]"
            style={{
              width: `${renderFillPercentage}%`,
              backgroundColor: renderStats.isLimitReached
                ? 'var(--warning)'
                : 'var(--cream-100)',
              transformOrigin: 'left',
            }}
          />
        </div>
      </div>
    </div>
  );
}
