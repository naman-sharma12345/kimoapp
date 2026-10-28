import React from 'react';
import { AnimatePresence, motion, useReducedMotion } from 'motion/react';
import { DUR_2, DUR_3, EASE_IN, EASE_OUT } from '../../lib/motion';

export interface ToastProps {
  message: string | null;
}

export const Toast: React.FC<ToastProps> = ({ message }) => {
  const prefersReducedMotion = useReducedMotion();

  return (
    <div
      aria-live="polite"
      aria-atomic="true"
      className="fixed bottom-[var(--space-24)] right-[var(--space-24)] z-50 pointer-events-none"
    >
      <AnimatePresence>
        {message && (
          <motion.div
            key={message}
            role="status"
            initial={
              prefersReducedMotion ? { opacity: 0 } : { opacity: 0, y: 8 }
            }
            animate={
              prefersReducedMotion ? { opacity: 1 } : { opacity: 1, y: 0 }
            }
            exit={prefersReducedMotion ? { opacity: 0 } : { opacity: 0, y: 4 }}
            transition={{
              duration: prefersReducedMotion ? DUR_2 : DUR_3,
              ease: message ? EASE_OUT : EASE_IN,
            }}
            style={{ boxShadow: 'var(--shadow-pop)' }}
            className="pointer-events-auto h-[var(--h-32)] px-[var(--space-12)] rounded-[var(--r-8)] bg-[var(--ink-2)] text-[var(--cream-100)] t-13 inline-flex items-center"
          >
            {message}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};
