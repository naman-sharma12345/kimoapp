'use client';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { KimoClient, type AuthProvider } from '@kimo/client';
import SignInPage from '@/features/signin/pages/SignInPage';
import {
  SIGN_IN_ERROR_KINDS,
  type SignInError,
  type SignInErrorKind,
  type SignInReason,
  type SignInState,
} from '@/features/signin/types/sign-in';
import {
  DEFAULT_AUTH_PROVIDERS,
  isAuthProvider,
  orderProviders,
} from '@/lib/auth-provider';
import { DEFAULT_NEXT, safeNext } from '@/lib/safe-next';

/** How long to wait for the session check before showing the form anyway. */
const SESSION_CHECK_TIMEOUT_MS = 2500;

export function SignInRoute() {
  const router = useRouter();
  const params = useSearchParams();
  const next = safeNext(params.get('next'));
  const returning = params.get('state') === 'returning';
  const reasonParam = params.get('reason');
  const reason: SignInReason =
    reasonParam === 'limit' || reasonParam === 'expired' ? reasonParam : null;
  const errorParam = params.get('error');
  const providerParam = params.get('provider');
  const urlError: SignInError | null = SIGN_IN_ERROR_KINDS.includes(
    errorParam as SignInErrorKind,
  )
    ? {
        kind: errorParam as SignInErrorKind,
        ...(isAuthProvider(providerParam) ? { provider: providerParam } : {}),
      }
    : null;

  const client = useMemo(() => new KimoClient(), []);
  const [state, setState] = useState<SignInState>(
    urlError ? 'error' : returning ? 'returning' : 'idle',
  );
  const [error, setError] = useState<SignInError | null>(urlError);
  const [providers, setProviders] = useState<readonly AuthProvider[]>(
    DEFAULT_AUTH_PROVIDERS,
  );
  // Hold the form back until we know the visitor is signed out, so a
  // signed-in visitor goes straight on without a flash of the form.
  const [checked, setChecked] = useState(Boolean(urlError) || returning);

  useEffect(() => {
    let cancelled = false;
    client
      .providers()
      .then((answer) => {
        if (!cancelled) setProviders(orderProviders(answer.providers));
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [client]);

  // Coming back from the provider (or already signed in): confirm the session, then leave.
  useEffect(() => {
    let cancelled = false;
    const timer = window.setTimeout(() => {
      if (!cancelled) setChecked(true);
    }, SESSION_CHECK_TIMEOUT_MS);
    client
      .auth()
      .then((session) => {
        if (cancelled) return;
        if (session.signedIn) {
          router.replace(next);
          return;
        }
        if (returning) {
          setError({ kind: 'popup_closed' });
          setState('error');
        }
        setChecked(true);
      })
      .catch(() => {
        if (cancelled) return;
        if (returning) {
          setError({ kind: 'network' });
          setState('error');
        }
        setChecked(true);
      });
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [client, next, returning, router]);

  const onContinue = useCallback(
    (provider: AuthProvider) => {
      const back = new URL('/signin', window.location.origin);
      back.searchParams.set('state', 'returning');
      if (next !== DEFAULT_NEXT) back.searchParams.set('next', next);
      window.location.assign(client.signInUrl(provider, back.toString()));
      // The page navigates away; keep the redirecting state until it does.
      return new Promise<void>(() => undefined);
    },
    [client, next],
  );

  if (!checked)
    return (
      <div
        aria-busy="true"
        className="kimo-signin min-h-[100dvh] w-full"
        style={{ backgroundColor: 'var(--ink-0)' }}
      />
    );

  return (
    <SignInPage
      providers={providers}
      initialState={state}
      reason={reason}
      error={error}
      onContinue={onContinue}
      onSkip={() => router.push('/')}
      onSuccess={() => router.replace(next)}
    />
  );
}
