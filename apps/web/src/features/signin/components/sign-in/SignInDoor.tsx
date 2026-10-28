import { useEffect, useRef } from 'react';
import {
  AlertCircle,
  Clock,
  FolderOpen,
  Infinity as InfinityIcon,
  LogIn,
  RotateCcw,
} from 'lucide-react';
import { AnimatePresence, motion, useReducedMotion } from 'motion/react';
import { DUR, EASE } from '../../lib/motion';
import { getErrorCopy } from '../../lib/stage-logic';
import type {
  SignInError,
  SignInReason,
  SignInState,
  SignInUser,
} from '../../types/sign-in';
import { GoogleMark } from './GoogleMark';
import { GitHubMark } from './GitHubMark';
import { AUTH_PROVIDER, AUTH_PROVIDER_LABEL } from '@/lib/auth-provider';
import { KimoMark } from './KimoMark';

export interface SignInDoorProps {
  state: SignInState;
  reason?: SignInReason;
  user?: SignInUser | null;
  error?: SignInError | null;
  onGoogleClick: () => void;
  onSkipClick: () => void;
  onUseDifferentAccountClick: () => void;
  onEntryComplete: () => void;
}

const BENEFITS = [
  {
    icon: FolderOpen,
    label: 'every project saved for 30 days',
  },
  {
    icon: InfinityIcon,
    label: 'more than one video a day',
  },
  {
    icon: RotateCcw,
    label: 'full undo history on every edit',
  },
] as const;

function getInitials(name: string): string {
  const parts = name.trim().split(/\s+/);
  if (parts.length === 0) return 'k';
  if (parts.length === 1) return (parts[0]?.[0] ?? 'k').toLowerCase();
  return `${parts[0]?.[0] ?? ''}${parts[parts.length - 1]?.[0] ?? ''}`.toLowerCase();
}

/**
 * The Door (right column): the sign-in card.
 * Width 400px (max 100% minus 40px). Floats on ink-0 with no card box.
 */
export function SignInDoor({
  state,
  reason = null,
  user = null,
  error = null,
  onGoogleClick,
  onSkipClick,
  onUseDifferentAccountClick,
  onEntryComplete,
}: SignInDoorProps) {
  const prefersReducedMotion = Boolean(useReducedMotion());
  const headlineRef = useRef<HTMLHeadingElement | null>(null);
  const hasCalledReadyRef = useRef(false);

  // Focus the headline on initial mount
  useEffect(() => {
    headlineRef.current?.focus({ preventScroll: true });
  }, []);

  // Ensure data-ready is marked even if initialState starts in returning/already-signed-in
  useEffect(() => {
    const timer = window.setTimeout(
      () => {
        if (!hasCalledReadyRef.current) {
          hasCalledReadyRef.current = true;
          onEntryComplete();
        }
      },
      prefersReducedMotion ? 160 : 850,
    );
    return () => window.clearTimeout(timer);
  }, [onEntryComplete, prefersReducedMotion]);

  const isRedirecting = state === 'redirecting';
  const isReturning = state === 'returning';
  const isBusy = isRedirecting || isReturning;

  const isLimitReached = state === 'limit-reached' || reason === 'limit';
  const isExpired = reason === 'expired' && state !== 'limit-reached';
  const showReasonPill = isLimitReached || isExpired;

  const activeError: SignInError | null =
    state === 'error' ? (error ?? { kind: 'popup_closed' }) : null;
  const errorInfo = activeError ? getErrorCopy(activeError.kind) : null;

  const dimOtherOpacity = isRedirecting ? 0.6 : 1;

  const getStaggerTransition = (index: number) => ({
    duration: prefersReducedMotion ? DUR.dur2 : DUR.dur4,
    ease: EASE.easeOut,
    delay: prefersReducedMotion ? 0 : 0.12 + index * 0.05,
  });

  // Live polite announcement string
  const liveStatusText =
    state === 'redirecting'
      ? `opening ${AUTH_PROVIDER_LABEL}`
      : state === 'returning'
        ? 'signing you in. one second'
        : state === 'error' && errorInfo
          ? errorInfo.message
          : '';

  return (
    <div
      aria-busy={isBusy}
      className="relative w-full max-w-[400px] px-[20px] sm:px-0 mx-auto"
    >
      {/* Polite aria-live region for async status announcements */}
      <div className="sr-only" role="status" aria-live="polite">
        {liveStatusText}
      </div>

      <AnimatePresence mode="wait" initial={false}>
        {state === 'returning' ? (
          /* STATE 3: RETURNING (centered stack with level-meter kimo mark) */
          <motion.div
            key="door-returning"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{
              duration: prefersReducedMotion ? DUR.dur2 : DUR.dur4,
              ease: EASE.easeOut,
            }}
            className="flex flex-col items-center justify-center text-center py-12"
          >
            <KimoMark size={24} animatedMeter />
            <h1
              ref={headlineRef}
              tabIndex={-1}
              className="t-15"
              style={{
                marginTop: 'var(--space-16)',
                color: 'var(--cream-100)',
              }}
            >
              signing you in
            </h1>
            <p
              className="t-13"
              style={{
                marginTop: 'var(--space-4)',
                color: 'var(--cream-38)',
              }}
            >
              one second
            </p>
          </motion.div>
        ) : state === 'already-signed-in' ? (
          /* STATE 6: ALREADY SIGNED IN */
          <motion.div
            key="door-already-signed-in"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{
              duration: prefersReducedMotion ? DUR.dur2 : DUR.dur4,
              ease: EASE.easeOut,
            }}
            className="flex flex-col items-start text-left"
          >
            {/* 1. Eyebrow */}
            <span className="t-11" style={{ color: 'var(--cream-38)' }}>
              sign in
            </span>

            {/* Avatar + Name + Email */}
            <div
              className="flex items-center"
              style={{
                marginTop: 'var(--space-16)',
                gap: 'var(--space-12)',
              }}
            >
              {user?.avatarUrl ? (
                <span
                  role="img"
                  aria-label={user.name}
                  style={{
                    backgroundImage: `url(${JSON.stringify(user.avatarUrl)})`,
                    backgroundSize: 'cover',
                    backgroundPosition: 'center',
                    display: 'inline-block',
                    width: 40,
                    height: 40,
                    borderRadius: 'var(--r-pill)',
                    backgroundColor: 'var(--ink-3)',
                  }}
                />
              ) : (
                <div
                  aria-hidden="true"
                  className="t-15 flex items-center justify-center shrink-0"
                  style={{
                    width: 40,
                    height: 40,
                    borderRadius: 'var(--r-pill)',
                    backgroundColor: 'var(--ink-3)',
                    color: 'var(--cream-100)',
                  }}
                >
                  {getInitials(user?.name ?? 'maya lin')}
                </div>
              )}

              <div className="flex flex-col min-w-0">
                <h1
                  ref={headlineRef}
                  tabIndex={-1}
                  className="t-15 truncate"
                  style={{ color: 'var(--cream-100)' }}
                >
                  {(user?.name ?? 'maya lin').toLowerCase()}
                </h1>
                <span
                  className="t-13 truncate"
                  style={{ color: 'var(--cream-60)' }}
                >
                  {(user?.email ?? 'maya@getkimo.tech').toLowerCase()}
                </span>
              </div>
            </div>

            {/* 24px gap, primary "go to your projects" (links /projects) */}
            <a
              href="/projects"
              onClick={(e) => {
                e.preventDefault();
                onSkipClick();
              }}
              className="kimo-btn kimo-btn-primary t-15 w-full"
              style={{
                marginTop: 'var(--space-24)',
                height: 'var(--h-48)',
                paddingLeft: 'var(--space-16)',
                paddingRight: 'var(--space-16)',
              }}
            >
              go to your projects
            </a>

            {/* Ghost "use a different account" */}
            <button
              type="button"
              onClick={onUseDifferentAccountClick}
              className="kimo-btn kimo-btn-ghost t-15 w-full"
              style={{
                marginTop: 'var(--space-12)',
                height: 'var(--h-48)',
                paddingLeft: 'var(--space-16)',
                paddingRight: 'var(--space-16)',
              }}
            >
              use a different account
            </button>
          </motion.div>
        ) : (
          /* STATES 1, 2, 4, 5: IDLE, REDIRECTING, ERROR, LIMIT-REACHED */
          <motion.div
            key="door-standard"
            initial={{ opacity: 1 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{
              duration: prefersReducedMotion ? DUR.dur2 : DUR.dur4,
              ease: EASE.easeOut,
            }}
            className="flex flex-col items-start text-left w-full"
          >
            {/* Optional Reason Pill (limit-reached or expired) */}
            {showReasonPill && (
              <motion.div
                initial={
                  prefersReducedMotion ? { opacity: 0 } : { opacity: 0, y: 8 }
                }
                animate={{ opacity: dimOtherOpacity, y: 0 }}
                transition={getStaggerTransition(0)}
                className="t-12 inline-flex items-center"
                style={{
                  height: 'var(--h-24)',
                  paddingLeft: 10,
                  paddingRight: 10,
                  borderRadius: 'var(--r-pill)',
                  backgroundColor: 'var(--ink-2)',
                  border: '1px solid var(--line)',
                  color: 'var(--cream-60)',
                  gap: 'var(--space-6)',
                  marginBottom: 'var(--space-12)',
                }}
              >
                {isExpired ? (
                  <LogIn
                    size={14}
                    strokeWidth={1.5}
                    style={{ color: 'var(--cream-38)', flexShrink: 0 }}
                  />
                ) : (
                  <Clock
                    size={14}
                    strokeWidth={1.5}
                    style={{ color: 'var(--cream-38)', flexShrink: 0 }}
                  />
                )}
                <span>
                  {isExpired
                    ? 'you were signed out. sign in again to continue.'
                    : "you've made today's free video"}
                </span>
              </motion.div>
            )}

            {/* 1. Eyebrow: orange dot + "sign in" */}
            <motion.div
              initial={
                prefersReducedMotion ? { opacity: 0 } : { opacity: 0, y: 8 }
              }
              animate={{ opacity: dimOtherOpacity, y: 0 }}
              transition={getStaggerTransition(0)}
              className="t-11 inline-flex items-center"
              style={{ color: 'var(--cream-38)', gap: 'var(--space-8)' }}
            >
              <span
                aria-hidden="true"
                style={{
                  width: 6,
                  height: 6,
                  borderRadius: 'var(--r-pill)',
                  backgroundColor: 'var(--orange)',
                  boxShadow: '0 0 8px rgb(255 90 36 / 0.6)',
                  flexShrink: 0,
                }}
              />
              <span>sign in</span>
            </motion.div>

            {/* 2. 12px gap, headline in two lines, t-28 sans 500 cream-100 */}
            <motion.h1
              ref={headlineRef}
              tabIndex={-1}
              initial={
                prefersReducedMotion ? { opacity: 0 } : { opacity: 0, y: 8 }
              }
              animate={{ opacity: dimOtherOpacity, y: 0 }}
              transition={getStaggerTransition(1)}
              className="t-28"
              style={{
                marginTop: 'var(--space-16)',
                fontSize: 'clamp(30px, 3vw, 36px)',
                lineHeight: 1.12,
                letterSpacing: '-0.025em',
                color: 'var(--cream-100)',
              }}
            >
              <span className="block">your edits,</span>
              <span className="block">
                right where you{' '}
                <motion.span
                  initial={
                    prefersReducedMotion ? { opacity: 0 } : { opacity: 0, y: 8 }
                  }
                  animate={{ opacity: 1, y: 0 }}
                  transition={{
                    duration: prefersReducedMotion ? DUR.dur2 : DUR.dur4,
                    ease: EASE.easeOut,
                    delay: prefersReducedMotion ? 0 : 0.12 + 0.05 + 0.06,
                  }}
                  className="font-serif-italic inline-block"
                  style={{
                    fontSize: '1.07em',
                    lineHeight: 1,
                    position: 'relative',
                    top: '-0.03em',
                    color: 'var(--orange)',
                  }}
                >
                  left
                </motion.span>{' '}
                them.
              </span>
            </motion.h1>

            {/* 3. 12px gap, t-15 400 cream-60, max-width 360 */}
            <motion.p
              initial={
                prefersReducedMotion ? { opacity: 0 } : { opacity: 0, y: 8 }
              }
              animate={{ opacity: dimOtherOpacity, y: 0 }}
              transition={getStaggerTransition(2)}
              className="t-15-regular"
              style={{
                marginTop: 'var(--space-12)',
                maxWidth: 360,
                color: 'var(--cream-60)',
              }}
            >
              {isLimitReached
                ? "it's free. we just need to stop bots draining the gpus."
                : 'sign in to keep every project, pick up any edit, and make more than one video a day.'}
            </motion.p>

            {/* 4. 32px gap, primary button "continue with google" */}
            <motion.div
              initial={
                prefersReducedMotion ? { opacity: 0 } : { opacity: 0, y: 8 }
              }
              animate={{ opacity: 1, y: 0 }}
              transition={getStaggerTransition(3)}
              className="w-full"
              style={{ marginTop: 'var(--space-32)' }}
            >
              <button
                type="button"
                onClick={onGoogleClick}
                aria-label={
                  isRedirecting
                    ? `opening ${AUTH_PROVIDER_LABEL}…`
                    : `continue with ${AUTH_PROVIDER_LABEL}`
                }
                className="kimo-btn kimo-btn-primary t-15 w-full"
                style={{
                  height: 'var(--h-48)',
                  paddingLeft: 'var(--space-16)',
                  paddingRight: 'var(--space-16)',
                }}
              >
                {AUTH_PROVIDER === 'google' ? (
                  <GoogleMark isRedirecting={isRedirecting} />
                ) : (
                  <GitHubMark isRedirecting={isRedirecting} />
                )}
                <AnimatePresence mode="wait" initial={false}>
                  <motion.span
                    key={isRedirecting ? 'opening' : 'continue'}
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    transition={{
                      duration: DUR.dur2,
                      ease: EASE.easeOut,
                    }}
                  >
                    {isRedirecting
                      ? `opening ${AUTH_PROVIDER_LABEL}…`
                      : `continue with ${AUTH_PROVIDER_LABEL}`}
                  </motion.span>
                </AnimatePresence>
              </button>
            </motion.div>

            {/* 5. 12px gap, secondary button: "continue without an account" (or "not now") */}
            <motion.div
              initial={
                prefersReducedMotion ? { opacity: 0 } : { opacity: 0, y: 8 }
              }
              animate={{ opacity: dimOtherOpacity, y: 0 }}
              transition={getStaggerTransition(4)}
              className="w-full"
              style={{ marginTop: 'var(--space-12)' }}
            >
              <button
                type="button"
                disabled={isRedirecting}
                onClick={onSkipClick}
                className="kimo-btn kimo-btn-secondary t-15 w-full"
                style={{
                  height: 'var(--h-48)',
                  paddingLeft: 'var(--space-16)',
                  paddingRight: 'var(--space-16)',
                }}
              >
                {isLimitReached ? 'not now' : 'continue without an account'}
              </button>
            </motion.div>

            {/* Inline error alert (12px under secondary button, slides open with height auto via layout/dur-3) */}
            <AnimatePresence initial={false}>
              {errorInfo && (
                <motion.div
                  key={`error-${activeError?.kind ?? 'default'}`}
                  layout
                  initial={{ opacity: 0, height: 0 }}
                  animate={{ opacity: 1, height: 'auto' }}
                  exit={{ opacity: 0, height: 0 }}
                  transition={{
                    duration: prefersReducedMotion ? DUR.dur2 : DUR.dur3,
                    ease: EASE.easeOut,
                  }}
                  className="w-full overflow-hidden"
                >
                  <div
                    role="alert"
                    className="flex items-center justify-between w-full"
                    style={{
                      paddingTop: 'var(--space-12)',
                      gap: 'var(--space-8)',
                    }}
                  >
                    <div
                      className="flex items-center min-w-0"
                      style={{ gap: 'var(--space-8)' }}
                    >
                      <AlertCircle
                        size={16}
                        strokeWidth={1.5}
                        style={{ color: 'var(--danger)', flexShrink: 0 }}
                      />
                      <span
                        className="t-13 truncate"
                        style={{ color: 'var(--cream-100)' }}
                      >
                        {errorInfo.message}
                      </span>
                    </div>

                    {errorInfo.canRetry && (
                      <button
                        type="button"
                        onClick={onGoogleClick}
                        className="kimo-btn kimo-btn-ghost t-12 shrink-0"
                        style={{
                          height: 'var(--h-24)',
                          paddingLeft: 'var(--space-8)',
                          paddingRight: 'var(--space-8)',
                          borderRadius: 'var(--r-6)',
                        }}
                      >
                        try again
                      </button>
                    )}
                  </div>
                </motion.div>
              )}
            </AnimatePresence>

            {/* 6. 24px gap, gradient hairline, 24px gap */}
            <motion.div
              initial={
                prefersReducedMotion ? { opacity: 0 } : { opacity: 0, y: 8 }
              }
              animate={{ opacity: dimOtherOpacity, y: 0 }}
              transition={getStaggerTransition(5)}
              aria-hidden="true"
              className="w-full"
              style={{
                marginTop: 'var(--space-24)',
                marginBottom: 'var(--space-24)',
                height: 1,
                background:
                  'linear-gradient(90deg, var(--line), var(--line-strong), var(--line))',
              }}
            />

            {/* 7. Three "what you get" rows inside a subtle raised card */}
            <motion.div
              initial={
                prefersReducedMotion ? { opacity: 0 } : { opacity: 0, y: 8 }
              }
              animate={{ opacity: dimOtherOpacity, y: 0 }}
              transition={getStaggerTransition(6)}
              className="flex flex-col w-full"
              style={{
                backgroundColor: 'var(--ink-1)',
                border: '1px solid var(--line)',
                borderRadius: 'var(--r-12)',
                padding: 'var(--space-12) var(--space-16)',
                boxShadow: '0 8px 24px -12px rgb(0 0 0 / 0.5)',
              }}
            >
              {BENEFITS.map(({ icon: Icon, label }, index) => (
                <div
                  key={label}
                  className="flex items-center"
                  style={{
                    height: 'var(--h-32)',
                    gap: 'var(--space-12)',
                    borderTop: index === 0 ? 'none' : '1px solid var(--line)',
                  }}
                >
                  <span
                    aria-hidden="true"
                    className="inline-flex items-center justify-center"
                    style={{
                      width: 24,
                      height: 24,
                      borderRadius: 'var(--r-6)',
                      backgroundColor: 'var(--orange-12)',
                      flexShrink: 0,
                    }}
                  >
                    <Icon
                      size={13}
                      strokeWidth={1.75}
                      style={{ color: 'var(--orange)', flexShrink: 0 }}
                    />
                  </span>
                  <span className="t-13" style={{ color: 'var(--cream-60)' }}>
                    {label}
                  </span>
                </div>
              ))}
            </motion.div>

            {/* 8. 32px gap, legal line t-12 cream-38, max-width 360 */}
            <motion.p
              initial={
                prefersReducedMotion ? { opacity: 0 } : { opacity: 0, y: 8 }
              }
              animate={{ opacity: dimOtherOpacity, y: 0 }}
              transition={getStaggerTransition(7)}
              onAnimationComplete={() => {
                if (!hasCalledReadyRef.current) {
                  hasCalledReadyRef.current = true;
                  onEntryComplete();
                }
              }}
              className="t-12"
              style={{
                marginTop: 'var(--space-32)',
                maxWidth: 360,
                color: 'var(--cream-38)',
              }}
            >
              by continuing you agree to the{' '}
              <a href="/terms" className="kimo-legal-link">
                terms
              </a>{' '}
              and the{' '}
              <a href="/privacy" className="kimo-legal-link">
                privacy policy
              </a>
              . kimo processes your files with ai models, so don&apos;t upload
              anything private.
            </motion.p>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
