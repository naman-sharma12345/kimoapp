import React, { useEffect, useRef } from 'react';
import { AnimatePresence, motion, useReducedMotion } from 'motion/react';
import { DUR, EASE, TRANSITION } from '../../lib/motion';

export type ShortcutSheetDialogProps = {
  open: boolean;
  onClose: () => void;
};

const SHORTCUTS = [
  { keys: ['/'], label: 'search' },
  { keys: ['n'], label: 'new video' },
  { keys: ['g', 'l'], label: 'grid or list' },
  { keys: ['←', '→', '↑', '↓'], label: 'move focus' },
  { keys: ['enter'], label: 'open' },
  { keys: ['r'], label: 'rename' },
  { keys: ['delete'], label: 'delete' },
  { keys: ['?'], label: 'shortcuts' },
] as const;

export function ShortcutSheetDialog({
  open,
  onClose,
}: ShortcutSheetDialogProps) {
  const closeBtnRef = useRef<HTMLButtonElement | null>(null);
  const reducedMotion = useReducedMotion();

  useEffect(() => {
    if (!open) return;
    const timer = window.setTimeout(() => {
      closeBtnRef.current?.focus();
    }, 10);

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        e.stopPropagation();
        onClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => {
      window.clearTimeout(timer);
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [open, onClose]);

  return (
    <AnimatePresence>
      {open && (
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
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: DUR.dur3, ease: EASE.out }}
            onClick={onClose}
            style={{
              position: 'fixed',
              inset: 0,
              backgroundColor: 'var(--scrim-72)',
            }}
          />

          <motion.div
            role="dialog"
            aria-modal="true"
            aria-labelledby="shortcut-sheet-title"
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
              maxWidth: '360px',
              backgroundColor: 'var(--ink-1)',
              border: '1px solid var(--line)',
              borderRadius: '12px',
              boxShadow: 'var(--shadow-pop)',
              padding: '24px',
              zIndex: 61,
            }}
          >
            <div className="flex items-center justify-between">
              <h2
                id="shortcut-sheet-title"
                className="t-20"
                style={{ margin: 0, color: 'var(--cream-100)' }}
              >
                shortcuts
              </h2>
              <button
                ref={closeBtnRef}
                type="button"
                onClick={onClose}
                className="btn-base btn-ghost h-28 t-12"
              >
                esc
              </button>
            </div>

            <div
              className="flex flex-col"
              style={{ marginTop: '16px', gap: '8px' }}
            >
              {SHORTCUTS.map((row) => (
                <div
                  key={row.label}
                  className="flex items-center justify-between"
                  style={{ height: '28px' }}
                >
                  <span className="t-13" style={{ color: 'var(--cream-60)' }}>
                    {row.label}
                  </span>
                  <div className="flex items-center" style={{ gap: '4px' }}>
                    {row.keys.map((k) => (
                      <kbd
                        key={k}
                        className="t-11 font-mono-code"
                        style={{
                          padding: '0 6px',
                          height: '20px',
                          display: 'inline-flex',
                          alignItems: 'center',
                          borderRadius: '4px',
                          backgroundColor: 'var(--ink-2)',
                          border: '1px solid var(--line)',
                          color: 'var(--cream-100)',
                          textTransform: 'lowercase',
                        }}
                      >
                        {k}
                      </kbd>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
}
