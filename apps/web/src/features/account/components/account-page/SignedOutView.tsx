import { useState } from 'react';
import { Loader2 } from 'lucide-react';
import { AUTH_PROVIDER_LABEL } from '@/lib/auth-provider';

export interface SignedOutViewProps {
  onContinueWithGoogle?: () => Promise<void>;
}

export function SignedOutView({ onContinueWithGoogle }: SignedOutViewProps) {
  const [signingIn, setSigningIn] = useState(false);

  const handleSignIn = async () => {
    if (signingIn || !onContinueWithGoogle) return;
    setSigningIn(true);
    try {
      await onContinueWithGoogle();
    } finally {
      setSigningIn(false);
    }
  };

  return (
    <div className="flex flex-col items-center justify-center text-center py-[var(--space-96)] gap-[var(--space-20)]">
      <h1
        tabIndex={-1}
        className="t-20 text-[var(--cream-100)] m-0 outline-none"
      >
        sign in to see your account
      </h1>
      <button
        type="button"
        disabled={signingIn}
        onClick={() => void handleSignIn()}
        className="kimo-btn kimo-btn-lg kimo-btn-primary"
      >
        {signingIn ? (
          <>
            <Loader2
              size={16}
              strokeWidth={1.5}
              className="animate-spin"
              aria-hidden="true"
            />
            <span>continue with {AUTH_PROVIDER_LABEL}</span>
          </>
        ) : (
          <span>continue with {AUTH_PROVIDER_LABEL}</span>
        )}
      </button>
    </div>
  );
}
