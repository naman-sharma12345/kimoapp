import { AnimatePresence, motion, useReducedMotion } from 'motion/react';
import { dur, ease } from '../../lib/motion';

export interface ToastBannerProps {
  message: string | null;
}

export function ToastBanner({ message }: ToastBannerProps) {
  const reduceMotion = useReducedMotion();

  return (
    <div
      aria-live="polite"
      aria-atomic="true"
      className="fixed bottom-[var(--space-24)] right-[var(--space-24)] z-40 pointer-events-none"
    >
      <AnimatePresence mode="wait">
        {message && (
          <motion.div
            key={message}
            role="status"
            initial={
              reduceMotion ? { opacity: 0 } : { opacity: 0, y: 8, scale: 0.98 }
            }
            animate={
              reduceMotion ? { opacity: 1 } : { opacity: 1, y: 0, scale: 1 }
            }
            exit={
              reduceMotion ? { opacity: 0 } : { opacity: 0, y: 4, scale: 0.98 }
            }
            transition={{
              duration: reduceMotion ? dur.dur2 : dur.dur3,
              ease: ease.out,
            }}
            className="pointer-events-auto rounded-[var(--r-12)] bg-[var(--ink-1)] px-[var(--space-16)] py-[var(--space-12)] t-13 text-[var(--cream-100)]"
            style={{ boxShadow: 'var(--shadow-pop)' }}
          >
            {message}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
