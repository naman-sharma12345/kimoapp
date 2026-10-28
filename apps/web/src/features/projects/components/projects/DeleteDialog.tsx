import React, { useEffect, useRef } from 'react';
import { AnimatePresence, motion, useReducedMotion } from 'motion/react';
import { DUR, EASE, TRANSITION } from '../../lib/motion';
import type { Project } from '../../types/projects';

export type DeleteDialogProps = {
  project: Project | null;
  onCancel: () => void;
  onConfirm: (project: Project) => void;
};

export function DeleteDialog({
  project,
  onCancel,
  onConfirm,
}: DeleteDialogProps) {
  const cancelBtnRef = useRef<HTMLButtonElement | null>(null);
  const reducedMotion = useReducedMotion();

  useEffect(() => {
    if (!project) return;
    // Focus starts on "cancel"
    const timer = window.setTimeout(() => {
      cancelBtnRef.current?.focus();
    }, 10);

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        e.stopPropagation();
        onCancel();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => {
      window.clearTimeout(timer);
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [project, onCancel]);

  return (
    <AnimatePresence>
      {project && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            zIndex: 60,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: '16px',
          }}
        >
          {/* Overlay rgb(8 8 9 / 0.72), fades dur-3 */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: DUR.dur3, ease: EASE.out }}
            onClick={onCancel}
            style={{
              position: 'fixed',
              inset: 0,
              backgroundColor: 'var(--scrim-72)',
            }}
          />

          {/* Dialog: 420 wide, bg --ink-1, border --line, r12, shadow-pop, padding 24 */}
          <motion.div
            role="dialog"
            aria-modal="true"
            aria-labelledby="delete-dialog-title"
            aria-describedby="delete-dialog-desc"
            initial={
              reducedMotion ? { opacity: 0 } : { opacity: 0, scale: 0.98, y: 8 }
            }
            animate={
              reducedMotion ? { opacity: 1 } : { opacity: 1, scale: 1, y: 0 }
            }
            exit={
              reducedMotion
                ? { opacity: 0 }
                : {
                    opacity: 0,
                    scale: 0.98,
                    y: 8,
                    transition: TRANSITION.dialogOut,
                  }
            }
            transition={
              reducedMotion ? TRANSITION.reducedFade : TRANSITION.dialogIn
            }
            style={{
              position: 'relative',
              width: '100%',
              maxWidth: '420px',
              backgroundColor: 'var(--ink-1)',
              border: '1px solid var(--line)',
              borderRadius: '12px',
              boxShadow: 'var(--shadow-pop)',
              padding: '24px',
              zIndex: 61,
            }}
          >
            <h2
              id="delete-dialog-title"
              className="t-20"
              style={{
                margin: 0,
                color: 'var(--cream-100)',
              }}
            >
              delete &ldquo;{project.title}&rdquo;?
            </h2>

            <p
              id="delete-dialog-desc"
              className="t-13"
              style={{
                margin: '8px 0 0 0',
                color: 'var(--cream-60)',
              }}
            >
              the project and its edit history will be removed. finished videos
              you downloaded stay on your device.
            </p>

            <div
              className="flex items-center justify-end"
              style={{
                marginTop: '24px',
                gap: '8px',
              }}
            >
              <button
                ref={cancelBtnRef}
                type="button"
                onClick={onCancel}
                className="btn-base btn-ghost h-32 t-13"
              >
                cancel
              </button>
              <button
                type="button"
                onClick={() => onConfirm(project)}
                className="btn-base btn-danger h-32 t-13"
              >
                delete
              </button>
            </div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
}
