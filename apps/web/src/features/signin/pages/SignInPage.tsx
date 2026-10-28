/**
 * NEW COPY:
 * - StateSwitcher (debug-only ?states=1 panel): "states", "error variant", "reason", "none"
 * All SignInPage user-facing strings are verbatim from the prompt.
 */

import { useCallback, useEffect, useState } from 'react';
import { ArrowLeft } from 'lucide-react';
import { motion, useReducedMotion } from 'motion/react';
import { FilmGrain } from '../components/sign-in/FilmGrain';
import { KimoMark } from '../components/sign-in/KimoMark';
import { SelfEditingStage } from '../components/sign-in/SelfEditingStage';
import { SignInDoor } from '../components/sign-in/SignInDoor';
import { DUR, EASE } from '../lib/motion';
import type {
  SignInError,
  SignInErrorKind,
  SignInPageProps,
  SignInState,
} from '../types/sign-in';

export default function SignInPage({
  onContinueWithGoogle,
  onSkip,
  onSuccess,
  reason = null,
  initialState = 'idle',
  user = null,
  error = null,
  onUseDifferentAccount,
}: SignInPageProps) {
  const prefersReducedMotion = Boolean(useReducedMotion());

  const [currentState, setCurrentState] = useState<SignInState>(() => {
    if (reason === 'limit' && initialState === 'idle') {
      return 'limit-reached';
    }
    return initialState;
  });

  const [currentError, setCurrentError] = useState<SignInError | null>(
    error ?? null,
  );
  const [isReady, setIsReady] = useState<boolean>(false);
  const [isExitingOnSuccess, setIsExitingOnSuccess] = useState<boolean>(false);

  // Synchronize when controlled initialState / reason / error props change (e.g., via ?states=1 switcher)
  useEffect(() => {
    setIsExitingOnSuccess(false);
    if (reason === 'limit' && initialState === 'idle') {
      setCurrentState('limit-reached');
    } else {
      setCurrentState(initialState);
    }
  }, [initialState, reason]);

  useEffect(() => {
    setCurrentError(error ?? null);
  }, [error]);

  const handleEntryComplete = useCallback(() => {
    setIsReady(true);
  }, []);

  const handleGoogleClick = useCallback(async () => {
    if (currentState === 'redirecting' || currentState === 'returning') return;
    setCurrentError(null);
    setCurrentState('redirecting');

    try {
      await onContinueWithGoogle();
      setCurrentState('returning');
    } catch (err) {
      const maybeKind = (err as { kind?: SignInErrorKind } | null)?.kind;
      const resolvedKind: SignInErrorKind =
        maybeKind === 'network' ||
        maybeKind === 'not_allowed' ||
        maybeKind === 'popup_closed'
          ? maybeKind
          : (error?.kind ?? 'popup_closed');
      setCurrentError({ kind: resolvedKind });
      setCurrentState('error');
    }
  }, [currentState, error?.kind, onContinueWithGoogle]);

  // When in "returning" state via normal sign-in flow, complete verification and fade out stage + door
  useEffect(() => {
    // Only auto-advance from returning when not explicitly locked by initialState="returning"
    if (currentState !== 'returning' || initialState === 'returning') return;

    const verifyTimer = window.setTimeout(() => {
      setIsExitingOnSuccess(true);
      const fadeOutMs = (prefersReducedMotion ? DUR.dur2 : DUR.dur4) * 1000;
      window.setTimeout(() => {
        const resolvedUser = user ?? {
          name: 'you',
          email: '',
        };
        onSuccess(resolvedUser);
        setIsExitingOnSuccess(false);
        setCurrentState('already-signed-in');
      }, fadeOutMs);
    }, 1400);

    return () => window.clearTimeout(verifyTimer);
  }, [currentState, initialState, onSuccess, prefersReducedMotion, user]);

  const handleUseDifferentAccount = useCallback(() => {
    if (onUseDifferentAccount) {
      onUseDifferentAccount();
    }
    setCurrentState('idle');
  }, [onUseDifferentAccount]);

  return (
    <div
      data-ready={isReady ? 'true' : 'false'}
      className="kimo-signin relative w-full min-h-[100dvh] flex flex-col lg:flex-row overflow-x-hidden"
      style={{
        backgroundColor: 'var(--ink-0)',
        color: 'var(--cream-100)',
      }}
    >
      {/* Film grain overlay fixed over the whole page */}
      <FilmGrain />

      {/* Top Navigation Links (First in DOM for exact Tab Order: logo link -> back link -> door buttons) */}
      <motion.a
        href="/"
        onClick={(e) => {
          e.preventDefault();
          onSkip();
        }}
        initial={{ opacity: 0 }}
        animate={{ opacity: isExitingOnSuccess ? 0 : 1 }}
        transition={{
          duration: prefersReducedMotion ? DUR.dur2 : DUR.dur3,
          ease: EASE.easeOut,
        }}
        className="fixed lg:absolute z-30 inline-flex items-center rounded-[var(--r-6)]"
        style={{
          top: 'var(--space-24)',
          left: 'var(--space-24)',
          gap: 'var(--space-8)',
          textDecoration: 'none',
        }}
      >
        {/* Use the kimo mark at most once per page: omit here when returning state renders the 24px animated mark */}
        {currentState !== 'returning' && <KimoMark size={24} />}
        <span
          className="t-17-medium"
          style={{
            color: 'var(--cream-100)',
            letterSpacing: '-0.02em',
          }}
        >
          kimo
        </span>
      </motion.a>

      <motion.a
        href="/"
        onClick={(e) => {
          e.preventDefault();
          onSkip();
        }}
        initial={{ opacity: 0 }}
        animate={{ opacity: isExitingOnSuccess ? 0 : 1 }}
        transition={{
          duration: prefersReducedMotion ? DUR.dur2 : DUR.dur3,
          ease: EASE.easeOut,
        }}
        className="kimo-btn kimo-btn-ghost t-13 fixed lg:absolute z-30"
        style={{
          top: 'var(--space-24)',
          right: 'var(--space-24)',
          height: 'var(--h-32)',
          paddingLeft: 'var(--space-12)',
          paddingRight: 'var(--space-12)',
          gap: 'var(--space-6)',
        }}
      >
        <ArrowLeft size={14} strokeWidth={1.5} aria-hidden="true" />
        <span>back to kimo</span>
      </motion.a>

      {/* LEFT COLUMN: THE STAGE (58% on >=1024px, 16:9 max-42vh strip on <1024px, 120px timeline-only on <640px) */}
      <motion.section
        aria-label="film preview stage"
        animate={{ opacity: isExitingOnSuccess ? 0 : 1 }}
        transition={{
          duration: prefersReducedMotion ? DUR.dur2 : DUR.dur4,
          ease: EASE.easeIn,
        }}
        className="
          relative w-full lg:w-[58%]
          mt-[64px] lg:mt-0
          px-[20px] sm:px-[32px] lg:px-0
          h-[120px] sm:h-auto sm:max-h-[42vh] lg:max-h-none lg:min-h-[100dvh]
          flex items-center justify-center
          overflow-hidden
          shrink-0
        "
      >
        <div className="w-full sm:max-w-[480px] lg:max-w-none flex items-center justify-center">
          <SelfEditingStage />
        </div>
      </motion.section>

      {/* VERTICAL 1PX HAIRLINE SEPARATOR (desktop >=1024px, from 64px below top to 64px above bottom) */}
      <div
        aria-hidden="true"
        className="hidden lg:block pointer-events-none shrink-0"
        style={{
          width: 1,
          marginTop: 'var(--space-64)',
          marginBottom: 'var(--space-64)',
          backgroundColor: 'var(--line)',
        }}
      />

      {/* RIGHT COLUMN: THE DOOR (42% on >=1024px, fills remainder below stage on <1024px) */}
      <motion.main
        animate={{ opacity: isExitingOnSuccess ? 0 : 1 }}
        transition={{
          duration: prefersReducedMotion ? DUR.dur2 : DUR.dur4,
          ease: EASE.easeIn,
        }}
        className="
          relative w-full lg:w-[42%]
          flex-1 lg:min-h-[100dvh]
          flex items-center justify-center
          py-[32px] lg:py-[64px]
        "
      >
        {/* Faint warm ambient glow behind the door */}
        <div
          aria-hidden="true"
          className="absolute inset-0 pointer-events-none"
          style={{
            background:
              'radial-gradient(closest-side, rgb(255 90 36 / 0.05), transparent 100%)',
            backgroundPosition: 'center',
            backgroundRepeat: 'no-repeat',
            backgroundSize: '120% 90%',
          }}
        />
        <SignInDoor
          state={currentState}
          reason={reason}
          user={user}
          error={currentError}
          onGoogleClick={handleGoogleClick}
          onSkipClick={onSkip}
          onUseDifferentAccountClick={handleUseDifferentAccount}
          onEntryComplete={handleEntryComplete}
        />
      </motion.main>
    </div>
  );
}
