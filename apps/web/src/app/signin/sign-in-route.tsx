'use client';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { KimoClient } from '@kimo/client';
import SignInPage from '@/features/signin/pages/SignInPage';
import type {
  SignInError,
  SignInErrorKind,
  SignInReason,
  SignInState,
} from '@/features/signin/types/sign-in';
import { AUTH_PROVIDER } from '@/lib/auth-provider';

const ERROR_KINDS: readonly SignInErrorKind[] = [
  'popup_closed',
  'network',
  'not_allowed',
];

/** Only same-origin relative paths are allowed as a post sign-in destination. */
function safeNext(raw: string | null): string {
  if (!raw || !raw.startsWith('/') || raw.startsWith('//')) return '/projects';
  return raw;
}

export function SignInRoute() {
  const router = useRouter();
  const params = useSearchParams();
  const next = safeNext(params.get('next'));
  const returning = params.get('state') === 'returning';
  const reasonParam = params.get('reason');
  const reason: SignInReason =
    reasonParam === 'limit' || reasonParam === 'expired' ? reasonParam : null;
  const errorParam = params.get('error');
  const urlError: SignInError | null = ERROR_KINDS.includes(
    errorParam as SignInErrorKind,
  )
    ? { kind: errorParam as SignInErrorKind }
    : null;

  const client = useMemo(() => new KimoClient(), []);
  const [state, setState] = useState<SignInState>(
    urlError ? 'error' : returning ? 'returning' : 'idle',
  );
  const [error, setError] = useState<SignInError | null>(urlError);

  // Coming back from the provider (or already signed in): confirm the session, then leave.
  useEffect(() => {
    let cancelled = false;
    client
      .auth()
      .then((session) => {
        if (cancelled) return;
        if (session.signedIn) {
          router.replace(next);
        } else if (returning) {
          setError({ kind: 'popup_closed' });
          setState('error');
        }
      })
      .catch(() => {
        if (cancelled || !returning) return;
        setError({ kind: 'network' });
        setState('error');
      });
    return () => {
      cancelled = true;
    };
  }, [client, next, returning, router]);

  const onContinueWithGoogle = useCallback(() => {
    const back = new URL('/signin', window.location.origin);
    back.searchParams.set('state', 'returning');
    if (next !== '/projects') back.searchParams.set('next', next);
    window.location.assign(client.signInUrl(AUTH_PROVIDER, back.toString()));
    // The page navigates away; keep the redirecting state until it does.
    return new Promise<void>(() => undefined);
  }, [client, next]);

  return (
    <SignInPage
      initialState={state}
      reason={reason}
      error={error}
      onContinueWithGoogle={onContinueWithGoogle}
      onSkip={() => router.push('/')}
      onSuccess={() => router.replace(next)}
    />
  );
}
