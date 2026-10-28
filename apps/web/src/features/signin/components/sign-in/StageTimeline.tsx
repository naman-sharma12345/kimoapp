import { AnimatePresence, motion, useReducedMotion } from 'motion/react';
import { DUR, EASE, SPRING } from '../../lib/motion';
import {
  LOFI_WAVEFORM,
  TIMELINE_TOTAL_SEC,
  VO_WAVEFORM,
} from '../../lib/stage-logic';
import type { StageFrameState } from '../../types/sign-in';

export interface StageTimelineProps {
  frame: StageFrameState;
}

const TOTAL_TICKS = 36; // 0.0s to 7.2s in 0.2s increments -> 37 tick positions (0..36)

function secToPct(sec: number): number {
  return (sec / TIMELINE_TOTAL_SEC) * 100;
}

/**
 * Part B of the Stage:
 * A strip 640 x 112, bg --ink-1, r12, border 1px --line, padding 12px.
 * Contains ruler (0s..7s), 4 tracks (v1, t1, a1, a2), clips, waveforms, fx bar, and playhead.
 */
export function StageTimeline({ frame }: StageTimelineProps) {
  const prefersReducedMotion = useReducedMotion();

  const playheadPct = secToPct(frame.playheadSec);

  // V1 clip geometry before and after 2.0s ripple trim
  const dawnStartPct = secToPct(0);
  const dawnWidthPct = secToPct(2.4);

  const roadStartPct = secToPct(2.4);
  const roadWidthPct = secToPct(frame.isRoadTrimmed ? 2.4 : 2.8);

  const titleStartPct = secToPct(frame.isRoadTrimmed ? 4.8 : 5.2);
  const titleWidthPct = secToPct(frame.isRoadTrimmed ? 2.4 : 2.0);

  return (
    <div
      className="relative w-full select-none"
      style={{
        minHeight: 112,
        backgroundColor: 'var(--ink-1)',
        borderRadius: 'var(--r-12)',
        border: '1px solid var(--line)',
        padding: 'var(--space-12)',
      }}
    >
      <div className="relative flex flex-col" style={{ gap: 'var(--space-4)' }}>
        {/* RULER ROW (16px tall) */}
        <div className="flex items-center" style={{ height: 16 }}>
          {/* 24px left gutter */}
          <div style={{ width: 24, flexShrink: 0 }} />

          {/* Ruler ticks lane */}
          <div className="relative flex-1 h-full">
            {Array.from({ length: TOTAL_TICKS + 1 }, (_, i) => {
              const sec = +(i * 0.2).toFixed(1);
              const isMajor = i % 5 === 0;
              const pct = secToPct(sec);
              return (
                <div
                  key={i}
                  className="absolute inset-y-0"
                  style={{ left: `${pct}%` }}
                >
                  {isMajor && (
                    <span
                      className="font-mono-kimo absolute top-0"
                      style={{
                        fontSize: 10,
                        lineHeight: '10px',
                        color: 'var(--cream-38)',
                        left: 3,
                      }}
                    >
                      {Math.round(sec)}s
                    </span>
                  )}
                  <div
                    className="absolute bottom-0"
                    style={{
                      width: 1,
                      height: isMajor ? 8 : 4,
                      backgroundColor: isMajor
                        ? 'var(--cream-38)'
                        : 'var(--cream-16)',
                    }}
                  />
                </div>
              );
            })}
          </div>
        </div>

        {/* TRACK 1: V1 VIDEO */}
        <div className="flex items-center" style={{ height: 16 }}>
          <div
            className="t-11"
            style={{
              width: 24,
              flexShrink: 0,
              color: 'var(--cream-38)',
              textTransform: 'lowercase',
            }}
          >
            v1
          </div>
          <div className="relative flex-1 h-full">
            <AnimatePresence>
              {frame.v1DawnVisible && (
                <motion.div
                  key="v1-dawn"
                  initial={
                    prefersReducedMotion
                      ? { opacity: 1, y: 0 }
                      : { opacity: 0, y: -12 }
                  }
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0 }}
                  transition={
                    prefersReducedMotion
                      ? { duration: DUR.dur2 }
                      : SPRING.snappy
                  }
                  className="absolute top-0 bottom-0 flex items-center overflow-hidden"
                  style={{
                    left: `${dawnStartPct}%`,
                    width: `calc(${dawnWidthPct}% - 2px)`,
                    backgroundColor: 'var(--track-video)',
                    borderRadius: 'var(--r-6)',
                    boxShadow: 'inset 0 1px 0 0 var(--viewer-hairline)',
                    padding: '0 6px',
                  }}
                >
                  <span
                    className="t-11 truncate"
                    style={{
                      color: 'var(--cream-60)',
                      textTransform: 'lowercase',
                    }}
                  >
                    dawn
                  </span>
                </motion.div>
              )}

              {frame.v1RoadVisible && (
                <motion.div
                  key="v1-road"
                  initial={
                    prefersReducedMotion
                      ? {
                          opacity: 1,
                          y: 0,
                          left: `${roadStartPct}%`,
                          width: `calc(${roadWidthPct}% - 2px)`,
                        }
                      : {
                          opacity: 0,
                          y: -12,
                          left: `${roadStartPct}%`,
                          width: `calc(${secToPct(2.8)}% - 2px)`,
                        }
                  }
                  animate={{
                    opacity: 1,
                    y: 0,
                    left: `${roadStartPct}%`,
                    width: `calc(${roadWidthPct}% - 2px)`,
                  }}
                  exit={{ opacity: 0 }}
                  transition={
                    prefersReducedMotion
                      ? { duration: DUR.dur2 }
                      : SPRING.snappy
                  }
                  className="absolute top-0 bottom-0 flex items-center overflow-hidden"
                  style={{
                    backgroundColor: 'var(--track-video)',
                    borderRadius: 'var(--r-6)',
                    boxShadow: 'inset 0 1px 0 0 var(--viewer-hairline)',
                    padding: '0 6px',
                  }}
                >
                  {/* FX adjustment bar across v1 top edge over road clip at 5.0s */}
                  {frame.fxBarVisible && (
                    <motion.div
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                      transition={{
                        duration: prefersReducedMotion ? DUR.dur2 : DUR.dur3,
                        ease: EASE.easeOut,
                      }}
                      style={{
                        position: 'absolute',
                        top: 0,
                        left: 0,
                        right: 0,
                        height: 4,
                        backgroundColor: 'var(--track-fx)',
                      }}
                    />
                  )}
                  <span
                    className="t-11 truncate relative z-10"
                    style={{
                      color: 'var(--cream-60)',
                      textTransform: 'lowercase',
                    }}
                  >
                    road
                  </span>

                  {/* 1px cream-60 "trim" bracket flashing on trimmed right edge for 300ms */}
                  {frame.showTrimBracket && (
                    <div
                      style={{
                        position: 'absolute',
                        top: 1,
                        bottom: 1,
                        right: 0,
                        width: 3,
                        borderRight: '1px solid var(--cream-60)',
                        borderTop: '1px solid var(--cream-60)',
                        borderBottom: '1px solid var(--cream-60)',
                      }}
                    />
                  )}
                </motion.div>
              )}

              {frame.v1TitleVisible && (
                <motion.div
                  key="v1-title"
                  initial={
                    prefersReducedMotion
                      ? {
                          opacity: 1,
                          y: 0,
                          left: `${titleStartPct}%`,
                          width: `${titleWidthPct}%`,
                        }
                      : {
                          opacity: 0,
                          y: -12,
                          left: `${secToPct(5.2)}%`,
                          width: `${secToPct(2.0)}%`,
                        }
                  }
                  animate={{
                    opacity: 1,
                    y: 0,
                    left: `${titleStartPct}%`,
                    width: `${titleWidthPct}%`,
                  }}
                  exit={{ opacity: 0 }}
                  transition={
                    prefersReducedMotion
                      ? { duration: DUR.dur2 }
                      : SPRING.snappy
                  }
                  className="absolute top-0 bottom-0 flex items-center overflow-hidden"
                  style={{
                    backgroundColor: 'var(--track-video)',
                    borderRadius: 'var(--r-6)',
                    boxShadow: 'inset 0 1px 0 0 var(--viewer-hairline)',
                    padding: '0 6px',
                  }}
                >
                  <span
                    className="t-11 truncate"
                    style={{
                      color: 'var(--cream-60)',
                      textTransform: 'lowercase',
                    }}
                  >
                    title
                  </span>
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        </div>

        {/* TRACK 2: T1 TEXT */}
        <div className="flex items-center" style={{ height: 16 }}>
          <div
            className="t-11"
            style={{
              width: 24,
              flexShrink: 0,
              color: 'var(--cream-38)',
              textTransform: 'lowercase',
            }}
          >
            t1
          </div>
          <div className="relative flex-1 h-full">
            <AnimatePresence>
              {frame.t1Visible && (
                <>
                  <motion.div
                    key="t1-caption"
                    initial={
                      prefersReducedMotion
                        ? { opacity: 1, scaleX: 1 }
                        : { opacity: 1, scaleX: 0 }
                    }
                    animate={{ opacity: 1, scaleX: 1 }}
                    exit={{ opacity: 0 }}
                    transition={{
                      duration: prefersReducedMotion ? DUR.dur2 : DUR.dur4,
                      ease: EASE.easeOut,
                    }}
                    className="absolute top-0 bottom-0 flex items-center overflow-hidden origin-left"
                    style={{
                      left: `${secToPct(0.4)}%`,
                      width: `${secToPct(4.2)}%`,
                      backgroundColor: 'var(--track-text)',
                      borderRadius: 'var(--r-6)',
                      boxShadow: 'inset 0 1px 0 0 var(--viewer-hairline)',
                      padding: '0 6px',
                    }}
                  >
                    <span
                      className="t-11 truncate"
                      style={{
                        color: 'var(--cream-60)',
                        textTransform: 'lowercase',
                      }}
                    >
                      caption
                    </span>
                  </motion.div>

                  <motion.div
                    key="t1-title"
                    initial={
                      prefersReducedMotion
                        ? { opacity: 1, scaleX: 1 }
                        : { opacity: 1, scaleX: 0 }
                    }
                    animate={{ opacity: 1, scaleX: 1 }}
                    exit={{ opacity: 0 }}
                    transition={{
                      duration: prefersReducedMotion ? DUR.dur2 : DUR.dur4,
                      ease: EASE.easeOut,
                    }}
                    className="absolute top-0 bottom-0 flex items-center overflow-hidden origin-left"
                    style={{
                      left: `${secToPct(4.8)}%`,
                      width: `${secToPct(2.4)}%`,
                      backgroundColor: 'var(--track-text)',
                      borderRadius: 'var(--r-6)',
                      boxShadow: 'inset 0 1px 0 0 var(--viewer-hairline)',
                      padding: '0 6px',
                    }}
                  >
                    <span
                      className="t-11 truncate"
                      style={{
                        color: 'var(--cream-60)',
                        textTransform: 'lowercase',
                      }}
                    >
                      title
                    </span>
                  </motion.div>
                </>
              )}
            </AnimatePresence>
          </div>
        </div>

        {/* TRACK 3: A1 MUSIC ("lofi bed", 40 waveform bars) */}
        <div className="flex items-center" style={{ height: 16 }}>
          <div
            className="t-11"
            style={{
              width: 24,
              flexShrink: 0,
              color: 'var(--cream-38)',
              textTransform: 'lowercase',
            }}
          >
            a1
          </div>
          <div className="relative flex-1 h-full">
            <AnimatePresence>
              {frame.a1Visible && (
                <motion.div
                  key="a1-lofi"
                  initial={
                    prefersReducedMotion
                      ? { opacity: 1, x: 0 }
                      : { opacity: 0, x: -24 }
                  }
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0 }}
                  transition={{
                    duration: prefersReducedMotion ? DUR.dur2 : DUR.dur4,
                    ease: EASE.easeOut,
                  }}
                  className="absolute inset-0 flex items-center overflow-hidden"
                  style={{
                    backgroundColor: 'var(--track-music)',
                    borderRadius: 'var(--r-6)',
                    boxShadow: 'inset 0 1px 0 0 var(--viewer-hairline)',
                    padding: '0 6px',
                  }}
                >
                  {/* 40 vertical waveform bars in cream-16 */}
                  <svg
                    viewBox="0 0 200 16"
                    preserveAspectRatio="none"
                    className="absolute inset-0 w-full h-full pointer-events-none"
                  >
                    {LOFI_WAVEFORM.map((pctHeight, idx) => {
                      const barH = (pctHeight / 100) * 12;
                      const y = 14 - barH;
                      const x = 4 + idx * 4.8;
                      return (
                        <motion.rect
                          key={idx}
                          x={x}
                          width={1.6}
                          rx={0.8}
                          fill="var(--cream-16)"
                          initial={
                            prefersReducedMotion
                              ? { y, height: barH }
                              : { y: 14, height: 0 }
                          }
                          animate={{ y, height: barH }}
                          transition={{
                            duration: prefersReducedMotion
                              ? DUR.dur2
                              : DUR.dur3,
                            ease: EASE.easeOut,
                            delay: prefersReducedMotion ? 0 : idx * 0.006,
                          }}
                        />
                      );
                    })}
                  </svg>
                  <span
                    className="t-11 truncate relative z-10"
                    style={{
                      color: 'var(--cream-60)',
                      textTransform: 'lowercase',
                    }}
                  >
                    lofi bed
                  </span>
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        </div>

        {/* TRACK 4: A2 VOICE ("vo" from 0.6 to 4.2s) */}
        <div className="flex items-center" style={{ height: 16 }}>
          <div
            className="t-11"
            style={{
              width: 24,
              flexShrink: 0,
              color: 'var(--cream-38)',
              textTransform: 'lowercase',
            }}
          >
            a2
          </div>
          <div className="relative flex-1 h-full">
            <AnimatePresence>
              {frame.a2Visible && (
                <motion.div
                  key="a2-vo"
                  initial={
                    prefersReducedMotion
                      ? { opacity: 1, x: 0 }
                      : { opacity: 0, x: -24 }
                  }
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0 }}
                  transition={{
                    duration: prefersReducedMotion ? DUR.dur2 : DUR.dur4,
                    ease: EASE.easeOut,
                  }}
                  className="absolute top-0 bottom-0 flex items-center overflow-hidden"
                  style={{
                    left: `${secToPct(0.6)}%`,
                    width: `${secToPct(3.6)}%`,
                    backgroundColor: 'var(--track-voice)',
                    borderRadius: 'var(--r-6)',
                    boxShadow: 'inset 0 1px 0 0 var(--viewer-hairline)',
                    padding: '0 6px',
                  }}
                >
                  {/* Seeded waveform inside vo clip */}
                  <svg
                    viewBox="0 0 120 16"
                    preserveAspectRatio="none"
                    className="absolute inset-0 w-full h-full pointer-events-none"
                  >
                    {VO_WAVEFORM.map((pctHeight, idx) => {
                      const barH = (pctHeight / 100) * 12;
                      const y = 14 - barH;
                      const x = 4 + idx * 4.8;
                      return (
                        <motion.rect
                          key={idx}
                          x={x}
                          width={1.6}
                          rx={0.8}
                          fill="var(--cream-16)"
                          initial={
                            prefersReducedMotion
                              ? { y, height: barH }
                              : { y: 14, height: 0 }
                          }
                          animate={{ y, height: barH }}
                          transition={{
                            duration: prefersReducedMotion
                              ? DUR.dur2
                              : DUR.dur3,
                            ease: EASE.easeOut,
                            delay: prefersReducedMotion ? 0 : idx * 0.006,
                          }}
                        />
                      );
                    })}
                  </svg>
                  <span
                    className="t-11 truncate relative z-10"
                    style={{
                      color: 'var(--cream-60)',
                      textTransform: 'lowercase',
                    }}
                  >
                    vo
                  </span>
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        </div>

        {/* PLAYHEAD OVERLAY (1.5px cream-100 vertical line over all tracks + 7px downward triangle in ruler) */}
        <div
          className="pointer-events-none absolute top-0 bottom-0 z-20"
          style={{
            left: 24,
            right: 0,
          }}
        >
          <div
            className="absolute top-0 bottom-0"
            style={{
              left: `${playheadPct}%`,
              transform: 'translateX(-0.75px)',
            }}
          >
            {/* 7px downward triangle on top in the ruler */}
            <svg
              width={7}
              height={6}
              viewBox="0 0 7 6"
              style={{
                position: 'absolute',
                top: 0,
                left: '50%',
                transform: 'translateX(-50%)',
                fill: 'var(--cream-100)',
              }}
            >
              <path d="M0 0H7L3.5 6Z" />
            </svg>
            {/* 1.5px vertical line */}
            <div
              style={{
                width: 1.5,
                height: '100%',
                backgroundColor: 'var(--cream-100)',
              }}
            />
          </div>
        </div>
      </div>
    </div>
  );
}
