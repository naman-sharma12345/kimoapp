/**
 * NEW COPY (aria-labels only; all visible UI text is strictly from prompt):
 * - "breadcrumb" (aria-label on nav)
 * - "account menu" (aria-label on 28px avatar button & menu)
 * - "videos used today" (aria-label on segmented meter)
 * - "render minutes used today" (aria-label on continuous meter)
 * - "saving preference" / "saved" (aria-labels on status icons)
 * - "loading account" (aria-label on skeleton container)
 */

import { useEffect, useRef, useState } from 'react';
import { motion, useReducedMotion } from 'motion/react';
import { dur, ease } from '../lib/motion';
import type { AccountPageProps, AccountUsage } from '../types/account-page';
import { FilmGrain } from '../components/account-page/FilmGrain';
import { TopBar } from '../components/account-page/TopBar';
import { SectionRow } from '../components/account-page/SectionRow';
import { ProfileSection } from '../components/account-page/ProfileSection';
import { UsageSection } from '../components/account-page/UsageSection';
import { PreferencesSection } from '../components/account-page/PreferencesSection';
import { ExportSection } from '../components/account-page/ExportSection';
import { DangerZoneSection } from '../components/account-page/DangerZoneSection';
import { DeleteAccountDialog } from '../components/account-page/DeleteAccountDialog';
import { AccountSkeleton } from '../components/account-page/AccountSkeleton';
import { SignedOutView } from '../components/account-page/SignedOutView';
import { ToastBanner } from '../components/account-page/ToastBanner';
import { providerLabel } from '@/lib/auth-provider';

export default function AccountPage({
  user,
  usage,
  preferences,
  onUpdatePreference,
  onSignOut,
  onExportData,
  onDeleteAccount,
  onDeleted,
  onContinueWithGoogle,
  state,
}: AccountPageProps) {
  const systemReduceMotion = useReducedMotion();
  const effectiveReduceMotion =
    Boolean(systemReduceMotion) || preferences.reduceMotion;

  const [isReady, setIsReady] = useState<boolean>(false);
  const [usageSectionEntered, setUsageSectionEntered] =
    useState<boolean>(false);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState<boolean>(
    state === 'deleting',
  );
  const [toastMessage, setToastMessage] = useState<string | null>(null);
  const [simulateErrorCounter, setSimulateErrorCounter] = useState<number>(0);

  const headingRef = useRef<HTMLHeadingElement | null>(null);
  const deleteTriggerRef = useRef<HTMLButtonElement | null>(null);
  const toastTimerRef = useRef<number | null>(null);

  const showToast = (msg: string) => {
    if (toastTimerRef.current) {
      window.clearTimeout(toastTimerRef.current);
    }
    setToastMessage(msg);
    toastTimerRef.current = window.setTimeout(() => {
      setToastMessage(null);
    }, 3600);
  };

  useEffect(() => {
    return () => {
      if (toastTimerRef.current) {
        window.clearTimeout(toastTimerRef.current);
      }
    };
  }, []);

  // Move focus to the page heading on load / state switch
  useEffect(() => {
    if (state !== 'loading' && state !== 'deleting') {
      headingRef.current?.focus();
    }
  }, [state]);

  // Sync state switcher states
  useEffect(() => {
    if (state === 'deleting') {
      setDeleteDialogOpen(true);
    } else {
      setDeleteDialogOpen(false);
    }

    if (state === 'save-error') {
      setSimulateErrorCounter((prev) => prev + 1);
    }

    if (
      state === 'loading' ||
      state === 'signed-out' ||
      effectiveReduceMotion
    ) {
      setIsReady(true);
      setUsageSectionEntered(true);
    } else {
      // Fallback timer in case animation callbacks are skipped in background tabs
      const fallbackTimer = window.setTimeout(() => {
        setUsageSectionEntered(true);
        setIsReady(true);
      }, 950);
      return () => window.clearTimeout(fallbackTimer);
    }
  }, [state, effectiveReduceMotion]);

  const effectiveUsage: AccountUsage =
    state === 'limit-reached'
      ? {
          ...usage,
          videosToday: usage.videosLimit,
          renderMinutes: usage.renderMinutesLimit,
        }
      : usage;

  const handleCloseDeleteDialog = () => {
    setDeleteDialogOpen(false);
    window.setTimeout(() => {
      deleteTriggerRef.current?.focus();
    }, 20);
  };

  return (
    <div
      data-ready={isReady ? 'true' : 'false'}
      className="kimo-account min-h-screen w-full bg-[var(--ink-0)] text-[var(--cream-100)] relative"
    >
      <FilmGrain />

      <TopBar
        user={state === 'signed-out' ? null : user}
        onSignOut={onSignOut}
      />

      <main
        id="main"
        tabIndex={-1}
        className="w-full mx-auto px-[var(--space-24)] pt-[var(--space-48)] pb-[var(--space-96)]"
        style={{ maxWidth: 'var(--w-content)' }}
      >
        {state === 'loading' ? (
          <AccountSkeleton />
        ) : state === 'signed-out' || !user ? (
          <SignedOutView onContinueWithGoogle={onContinueWithGoogle} />
        ) : (
          <div>
            {/* Page title t-28 cream-100 "account", 8px gap, t-13 cream-60 the user's email */}
            <motion.div
              initial={
                effectiveReduceMotion ? { opacity: 0 } : { opacity: 0, y: 8 }
              }
              animate={
                effectiveReduceMotion ? { opacity: 1 } : { opacity: 1, y: 0 }
              }
              transition={{
                duration: effectiveReduceMotion ? dur.dur2 : dur.dur4,
                ease: ease.out,
              }}
            >
              <h1
                ref={headingRef}
                tabIndex={-1}
                className="t-28 text-[var(--cream-100)] m-0 outline-none"
              >
                account
              </h1>
              <p className="t-13 text-[var(--cream-60)] mt-[var(--space-8)] mb-0">
                {user.email}
              </p>
            </motion.div>

            {/* Below, 40px gap, stack of sections */}
            <div className="mt-[var(--space-40)]">
              {/* 1. profile */}
              <SectionRow
                index={0}
                isFirst
                title="profile"
                description={`from your ${providerLabel(user.provider ?? 'github')} account`}
              >
                <ProfileSection user={user} onSignOut={onSignOut} />
              </SectionRow>

              {/* 2. today's usage */}
              <SectionRow
                index={1}
                title="today's usage"
                description="resets at midnight, your time"
                onAnimationComplete={() => setUsageSectionEntered(true)}
              >
                <UsageSection
                  usage={effectiveUsage}
                  sectionEntered={usageSectionEntered || effectiveReduceMotion}
                />
              </SectionRow>

              {/* 4. preferences */}
              <SectionRow index={2} title="preferences">
                <PreferencesSection
                  preferences={preferences}
                  onUpdatePreference={onUpdatePreference}
                  simulateErrorTrigger={simulateErrorCounter}
                  onSaveError={(msg) => showToast(msg)}
                />
              </SectionRow>

              {/* 5. export your data */}
              <SectionRow
                index={3}
                title="export your data"
                description="everything kimo has about you"
              >
                <ExportSection
                  onExportData={onExportData}
                  onExportSuccess={(msg) => showToast(msg)}
                />
              </SectionRow>

              {/* 6. danger zone */}
              <SectionRow
                index={4}
                title="danger zone"
                onAnimationComplete={() => setIsReady(true)}
              >
                <DangerZoneSection
                  triggerRef={deleteTriggerRef}
                  onOpenDeleteDialog={() => setDeleteDialogOpen(true)}
                />
              </SectionRow>
            </div>
          </div>
        )}
      </main>

      <DeleteAccountDialog
        open={deleteDialogOpen}
        forceDeleting={state === 'deleting'}
        onClose={handleCloseDeleteDialog}
        onConfirmDelete={onDeleteAccount}
        onDeleted={() => {
          setDeleteDialogOpen(false);
          onDeleted();
        }}
      />

      <ToastBanner message={toastMessage} />
    </div>
  );
}
