import React from 'react';
import { AnimatePresence, motion, useReducedMotion } from 'motion/react';
import { DUR, EASE, SPRING, TRANSITION } from '../../lib/motion';
import type { ToastItem } from '../../types/projects';

export type ToastContainerProps = {
  toast: ToastItem | null;
  onUndoDelete: (projectId: string) => void;
  onDismiss: () => void;
};

export function ToastContainer({
  toast,
  onUndoDelete,
  onDismiss,
}: ToastContainerProps) {
  const reducedMotion = useReducedMotion();

  return (
    <div
      aria-live="polite"
      style={{
        position: 'fixed',
        left: '50%',
        bottom: '24px',
        transform: 'translateX(-50%)',
        zIndex: 55,
        pointerEvents: 'none',
      }}
    >
      <AnimatePresence mode="wait">
        {toast && (
          <motion.div
            key={toast.id}
            initial={reducedMotion ? { opacity: 0 } : { opacity: 0, y: 12 }}
            animate={reducedMotion ? { opacity: 1 } : { opacity: 1, y: 0 }}
            exit={
              reducedMotion
                ? { opacity: 0 }
                : {
                    opacity: 0,
                    y: 8,
                    transition: { duration: DUR.dur2, ease: EASE.in },
                  }
            }
            transition={reducedMotion ? TRANSITION.reducedFade : SPRING.soft}
            style={{
              position: 'relative',
              height: '44px',
              padding: '0 8px 0 16px',
              backgroundColor: 'var(--ink-1)',
              border: '1px solid var(--line)',
              borderRadius: '12px',
              boxShadow: 'var(--shadow-pop)',
              display: 'inline-flex',
              alignItems: 'center',
              gap: '12px',
              overflow: 'hidden',
              pointerEvents: 'auto',
            }}
          >
            <span className="t-13" style={{ color: 'var(--cream-100)' }}>
              {toast.message}
            </span>

            {toast.undoProjectId && (
              <button
                type="button"
                onClick={() => {
                  if (toast.undoProjectId) {
                    onUndoDelete(toast.undoProjectId);
                  }
                  onDismiss();
                }}
                className="btn-base btn-ghost h-24 t-12"
              >
                undo
              </button>
            )}

            {/* 2px cream-16 timer line along the bottom that shrinks over 6s */}
            <motion.div
              initial={{ width: '100%' }}
              animate={{ width: '0%' }}
              transition={{ duration: 6, ease: 'linear' }}
              style={{
                position: 'absolute',
                left: 0,
                bottom: 0,
                height: '2px',
                backgroundColor: 'var(--cream-16)',
              }}
            />
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
