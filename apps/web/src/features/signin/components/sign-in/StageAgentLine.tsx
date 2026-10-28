import { Check } from 'lucide-react';
import { AnimatePresence, motion, useReducedMotion } from 'motion/react';
import { DUR, EASE } from '../../lib/motion';
import type { AgentStep } from '../../types/sign-in';

export interface StageAgentLineProps {
  step: AgentStep;
}

/**
 * Part C of the Stage:
 * One row 640 wide under the timeline, height 32, showing what the AI is doing right now.
 * Left: an orange 6px dot that pulses (scale 1 to 1.6 and opacity 1 to 0, 1.2s, ease-out, infinite,
 * a second static dot under it), crossfading over dur-3 to a cream-100 Check 14 icon at 6.0s.
 * Middle: t-13 cream-100 text that swaps with a vertical slot transition.
 * Right: Geist Mono t-12 cream-38 showing the tool name.
 */
export function StageAgentLine({ step }: StageAgentLineProps) {
  const prefersReducedMotion = useReducedMotion();

  return (
    <div
      className="flex items-center justify-between w-full select-none overflow-hidden"
      style={{
        height: 'var(--h-32)',
        paddingLeft: 'var(--space-4)',
        paddingRight: 'var(--space-4)',
      }}
    >
      {/* Left: status indicator + slot-transitioning step text */}
      <div
        className="flex items-center min-w-0"
        style={{ gap: 'var(--space-8)' }}
      >
        {/* Status Indicator: Pulsing 6px orange dot or Check 14 icon */}
        <div
          className="relative flex items-center justify-center shrink-0"
          style={{ width: 14, height: 14 }}
        >
          <AnimatePresence mode="wait" initial={false}>
            {step.statusIcon === 'check' ? (
              <motion.span
                key="check"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                transition={{
                  duration: prefersReducedMotion ? DUR.dur2 : DUR.dur3,
                  ease: EASE.easeOut,
                }}
                className="inline-flex items-center justify-center"
                style={{ color: 'var(--cream-100)' }}
              >
                <Check size={14} strokeWidth={1.5} />
              </motion.span>
            ) : (
              <motion.span
                key="pulse"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                transition={{
                  duration: prefersReducedMotion ? DUR.dur2 : DUR.dur3,
                  ease: EASE.easeOut,
                }}
                className="relative inline-flex items-center justify-center"
                style={{ width: 6, height: 6 }}
              >
                {/* Pulsing ring dot */}
                {!prefersReducedMotion && (
                  <motion.span
                    animate={{
                      scale: [1, 1.6],
                      opacity: [1, 0],
                    }}
                    transition={{
                      duration: 1.2,
                      ease: EASE.easeOut,
                      repeat: Infinity,
                    }}
                    style={{
                      position: 'absolute',
                      inset: 0,
                      borderRadius: 'var(--r-pill)',
                      backgroundColor: 'var(--orange)',
                    }}
                  />
                )}
                {/* Static dot underneath */}
                <span
                  style={{
                    width: 6,
                    height: 6,
                    borderRadius: 'var(--r-pill)',
                    backgroundColor: 'var(--orange)',
                    position: 'relative',
                  }}
                />
              </motion.span>
            )}
          </AnimatePresence>
        </div>

        {/* Vertical slot transition for agent step text */}
        <div
          className="relative overflow-hidden flex items-center"
          style={{ height: 22 }}
        >
          <AnimatePresence mode="wait" initial={false}>
            <motion.span
              key={step.id}
              initial={
                prefersReducedMotion
                  ? { opacity: 0, y: 0 }
                  : { opacity: 0, y: 8 }
              }
              animate={{ opacity: 1, y: 0 }}
              exit={
                prefersReducedMotion
                  ? { opacity: 0, y: 0, transition: { duration: DUR.dur2 } }
                  : {
                      opacity: 0,
                      y: -8,
                      transition: { duration: DUR.dur2, ease: EASE.easeIn },
                    }
              }
              transition={{
                duration: prefersReducedMotion ? DUR.dur2 : DUR.dur3,
                ease: EASE.easeOut,
              }}
              className="t-13 whitespace-nowrap"
              style={{ color: 'var(--cream-100)' }}
            >
              {step.text}
            </motion.span>
          </AnimatePresence>
        </div>
      </div>

      {/* Right: Geist Mono t-12 cream-38 tool name */}
      <div
        className="relative overflow-hidden flex items-center justify-end shrink-0"
        style={{ height: 20 }}
      >
        <AnimatePresence mode="wait" initial={false}>
          <motion.span
            key={step.tool || 'none'}
            initial={
              prefersReducedMotion ? { opacity: 0, y: 0 } : { opacity: 0, y: 8 }
            }
            animate={{ opacity: 1, y: 0 }}
            exit={
              prefersReducedMotion
                ? { opacity: 0, y: 0, transition: { duration: DUR.dur2 } }
                : {
                    opacity: 0,
                    y: -8,
                    transition: { duration: DUR.dur2, ease: EASE.easeIn },
                  }
            }
            transition={{
              duration: prefersReducedMotion ? DUR.dur2 : DUR.dur3,
              ease: EASE.easeOut,
            }}
            className="font-mono-kimo t-12"
            style={{ color: 'var(--cream-38)' }}
          >
            {step.tool}
          </motion.span>
        </AnimatePresence>
      </div>
    </div>
  );
}
