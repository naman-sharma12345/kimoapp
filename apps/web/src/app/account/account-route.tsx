'use client';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
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
  AccountStorage,
  AccountUsage,
  AccountUser,
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

function download(name: string, body: unknown) {
  const blob = new Blob([JSON.stringify(body, null, 2)], {
    type: 'application/json',
  });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = name;
  document.body.append(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/**
 * /account. Against the real API, profile, usage, preferences, export,
 * account deletion and sign-out go through /v1/me. Against the mock backend
 * (local dev) the demo profile is shown and preferences stay in the browser.
 */
export function AccountRoute() {
  const router = useRouter();
  const client = useMemo(() => new KimoClient(), []);
  const [state, setState] = useState<AccountPageState>('loading');
  const [mock, setMock] = useState(true);
  const [user, setUser] = useState<AccountUser | null>(null);
  const [preferences, setPreferences] = useState(mockInitialPreferences);
  const [usage, setUsage] = useState<AccountUsage>(() => ({
    ...mockUsageLoaded,
    resetsAt: createMockResetIso(),
  }));
  const [storage, setStorage] = useState<AccountStorage>(mockStorage);
  const preferencesRef = useRef(preferences);
  preferencesRef.current = preferences;

  useEffect(() => {
    client
      .auth()
      .then(async (session) => {
        setMock(session.mock);
        if (!session.signedIn) {
          setState('signed-out');
          return;
        }
        if (session.mock) {
          setUser(mockUser);
          setPreferences(readPreferences());
          setState(session.remaining <= 0 ? 'limit-reached' : 'loaded');
          return;
        }
        const me = await client.me();
        setUser({
          name: me.user.name,
          email: me.user.email,
          ...(me.user.avatarUrl ? { avatarUrl: me.user.avatarUrl } : {}),
          provider: me.user.provider,
        });
        setUsage(me.usage);
        setStorage(me.storage);
        setPreferences(me.preferences);
        setState(
          me.usage.videosToday >= me.usage.videosLimit
            ? 'limit-reached'
            : 'loaded',
        );
      })
      .catch(() => setState('signed-out'));
  }, [client]);

  const onUpdatePreference = useCallback(
    async <K extends PreferenceKey>(key: K, value: AccountPreferences[K]) => {
      const previous = preferencesRef.current;
      const next = { ...previous, [key]: value };
      setPreferences(next);
      if (mock) {
        try {
          window.localStorage.setItem(PREFS_KEY, JSON.stringify(next));
        } catch {
          // Storage unavailable: keep the in-memory value.
        }
        return;
      }
      try {
        const saved = await client.updatePreferences({ [key]: value });
        setPreferences(saved.preferences);
      } catch (error) {
        setPreferences(previous);
        throw error;
      }
    },
    [client, mock],
  );

  const onSignOut = useCallback(async () => {
    if (!mock) await client.signOut().catch(() => undefined);
    router.push('/');
  }, [client, mock, router]);

  const onExportData = useCallback(async () => {
    if (mock) return fakeExportData();
    download('kimo-export.json', await client.exportAccount());
  }, [client, mock]);

  const onDeleteAccount = useCallback(async () => {
    if (mock) return fakeDeleteAccount();
    await client.deleteAccount();
  }, [client, mock]);

  return (
    <AccountPage
      user={state === 'signed-out' ? null : user}
      usage={usage}
      storage={storage}
      preferences={preferences}
      onUpdatePreference={onUpdatePreference}
      onSignOut={onSignOut}
      onExportData={onExportData}
      onDeleteAccount={onDeleteAccount}
      onDeleted={() => router.replace('/')}
      onContinueWithGoogle={async () => {
        router.push('/signin?next=%2Faccount');
      }}
      state={state}
    />
  );
}
