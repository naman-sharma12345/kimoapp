import type { FormEvent } from 'react';
import { useEffect, useRef, useState } from 'react';
import { AnimatePresence, motion, useReducedMotion } from 'motion/react';
import { Loader2 } from 'lucide-react';
import { dur, ease } from '../../lib/motion';
import { isDeleteConfirmationValid } from '../../lib/account-utils';

export interface DeleteAccountDialogProps {
  open: boolean;
  forceDeleting?: boolean;
  onClose: () => void;
  onConfirmDelete: () => Promise<void>;
  onDeleted: () => void;
}

export function DeleteAccountDialog({
  open,
  forceDeleting = false,
  onClose,
  onConfirmDelete,
  onDeleted,
}: DeleteAccountDialogProps) {
  const reduceMotion = useReducedMotion();
  const [confirmText, setConfirmText] = useState<string>('');
  const [isDeleting, setIsDeleting] = useState<boolean>(false);
  const inputRef = useRef<HTMLInputElement | null>(null);

  const effectiveDeleting = isDeleting || forceDeleting;
  const effectiveConfirmText = forceDeleting ? 'delete' : confirmText;
  const canDelete = isDeleteConfirmationValid(effectiveConfirmText);

  useEffect(() => {
    if (open) {
      if (!forceDeleting) {
        setConfirmText('');
        setIsDeleting(false);
      }
      const focusTimer = window.setTimeout(() => {
        inputRef.current?.focus();
      }, 30);
      return () => window.clearTimeout(focusTimer);
    }
  }, [open, forceDeleting]);

  useEffect(() => {
    if (!open) return;

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && !effectiveDeleting) {
        event.preventDefault();
        onClose();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [open, effectiveDeleting, onClose]);

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault();
    if (!canDelete || effectiveDeleting) return;
    setIsDeleting(true);
    try {
      await onConfirmDelete();
      onDeleted();
    } finally {
      setIsDeleting(false);
    }
  };

  return (
    <AnimatePresence>
      {open && (
        // Backdrop click closes; keyboard users close with Escape.
        // eslint-disable-next-line jsx-a11y/no-static-element-interactions
        <div
          className="fixed inset-0 z-40 flex items-center justify-center p-[var(--space-24)]"
          style={{ backgroundColor: 'var(--backdrop-scrim)' }}
          onMouseDown={(event) => {
            if (event.target === event.currentTarget && !effectiveDeleting) {
              onClose();
            }
          }}
        >
          <motion.div
            role="dialog"
            aria-modal="true"
            aria-labelledby="delete-dialog-title"
            aria-describedby="delete-dialog-description"
            initial={
              reduceMotion ? { opacity: 0 } : { opacity: 0, scale: 0.98, y: 8 }
            }
            animate={
              reduceMotion ? { opacity: 1 } : { opacity: 1, scale: 1, y: 0 }
            }
            exit={
              reduceMotion ? { opacity: 0 } : { opacity: 0, scale: 0.98, y: 8 }
            }
            transition={{
              duration: reduceMotion ? dur.dur2 : dur.dur4,
              ease: ease.out,
            }}
            className="w-full rounded-[var(--r-12)] bg-[var(--ink-1)] p-[var(--space-24)]"
            style={{
              maxWidth: 'var(--w-dialog)',
              boxShadow: 'var(--shadow-pop)',
            }}
          >
            <h2
              id="delete-dialog-title"
              className="t-20 text-[var(--cream-100)] m-0"
            >
              delete your kimo account?
            </h2>
            <p
              id="delete-dialog-description"
              className="t-12 text-[var(--cream-60)] mt-[var(--space-8)] mb-0"
            >
              removes your projects, videos and preferences. this can&apos;t be
              undone.
            </p>

            <form
              onSubmit={(e) => void handleSubmit(e)}
              className="mt-[var(--space-20)]"
            >
              <label
                htmlFor="delete-confirm-input"
                className="block t-12 text-[var(--cream-60)] mb-[var(--space-8)]"
              >
                type delete to confirm
              </label>
              <input
                ref={inputRef}
                id="delete-confirm-input"
                type="text"
                autoComplete="off"
                spellCheck={false}
                disabled={effectiveDeleting}
                value={effectiveConfirmText}
                onChange={(e) => setConfirmText(e.target.value)}
                className="kimo-input"
              />

              <div className="flex items-center justify-end gap-[var(--space-8)] mt-[var(--space-24)]">
                <button
                  type="button"
                  disabled={effectiveDeleting}
                  onClick={onClose}
                  className="kimo-btn kimo-btn-sm kimo-btn-ghost"
                >
                  cancel
                </button>
                <button
                  type="submit"
                  disabled={!canDelete || effectiveDeleting}
                  className="kimo-btn kimo-btn-sm kimo-btn-danger"
                >
                  {effectiveDeleting ? (
                    <>
                      <Loader2
                        size={14}
                        strokeWidth={1.5}
                        className="animate-spin"
                        aria-hidden="true"
                      />
                      <span>delete account</span>
                    </>
                  ) : (
                    <span>delete account</span>
                  )}
                </button>
              </div>
            </form>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
}
