'use client';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { KimoClient } from '@kimo/client';
import AccountPage from '@/features/account/pages/AccountPage';
import {
  createMockResetIso,
  fakeDeleteAccount,
  fakeExportData,
  mockInitialPreferences,
  mockStorage,
  mockUsageLoaded,
  mockUser,
} from '@/features/account/mock/account-page';
import type {
  AccountPageState,
  AccountPreferences,
  PreferenceKey,
} from '@/features/account/types/account-page';

const PREFS_KEY = 'kimo.preferences';

function readPreferences(): AccountPreferences {
  try {
    const raw = window.localStorage.getItem(PREFS_KEY);
    if (raw) return { ...mockInitialPreferences, ...JSON.parse(raw) };
  } catch {
    // Private mode or corrupt value: fall back to defaults.
  }
  return mockInitialPreferences;
}

/**
 * /account. Profile, usage and storage come from the mock backend until the
 * /v1/me endpoint exists; preferences persist locally in the browser.
 */
export function AccountRoute() {
  const router = useRouter();
  const client = useMemo(() => new KimoClient(), []);
  const [state, setState] = useState<AccountPageState>('loading');
  const [preferences, setPreferences] = useState(mockInitialPreferences);
  const usage = useMemo(
    () => ({ ...mockUsageLoaded, resetsAt: createMockResetIso() }),
    [],
  );

  useEffect(() => {
    setPreferences(readPreferences());
    client
      .auth()
      .then((session) => {
        if (!session.signedIn) setState('signed-out');
        else setState(session.remaining <= 0 ? 'limit-reached' : 'loaded');
      })
      .catch(() => setState('signed-out'));
  }, [client]);

  const onUpdatePreference = useCallback(
    async <K extends PreferenceKey>(key: K, value: AccountPreferences[K]) => {
      setPreferences((prev) => {
        const next = { ...prev, [key]: value };
        try {
          window.localStorage.setItem(PREFS_KEY, JSON.stringify(next));
        } catch {
          // Storage unavailable: keep the in-memory value.
        }
        return next;
      });
    },
    [],
  );

  return (
    <AccountPage
      user={state === 'signed-out' ? null : mockUser}
      usage={usage}
      storage={mockStorage}
      preferences={preferences}
      onUpdatePreference={onUpdatePreference}
      onSignOut={() => router.push('/')}
      onExportData={fakeExportData}
      onDeleteAccount={fakeDeleteAccount}
      onDeleted={() => router.replace('/')}
      onContinueWithGoogle={async () => {
        router.push('/signin?next=%2Faccount');
      }}
      state={state}
    />
  );
}
