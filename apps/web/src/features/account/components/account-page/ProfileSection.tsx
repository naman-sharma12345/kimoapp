import { LogOut } from 'lucide-react';
import { getUserInitials } from '../../lib/account-utils';
import type { AccountUser } from '../../types/account-page';

export interface ProfileSectionProps {
  user: AccountUser;
  onSignOut: () => void | Promise<void>;
}

function GoogleGMark() {
  return (
    <svg
      width={14}
      height={14}
      viewBox="0 0 24 24"
      fill="currentColor"
      aria-hidden="true"
      className="shrink-0 text-[var(--cream-38)]"
    >
      <path d="M21.35 11.1H12v2.8h5.35c-.25 1.4-1.05 2.6-2.25 3.4v2.8h3.6c2.1-1.95 3.3-4.8 3.3-8.15 0-.6-.05-1.2-.15-1.85z" />
      <path d="M12 21c2.95 0 5.45-1 7.25-2.7l-3.6-2.8c-1 .65-2.25 1.05-3.65 1.05-2.8 0-5.2-1.9-6.05-4.45H2.25v2.85C4.05 18.55 7.75 21 12 21z" />
      <path d="M5.95 12.1c-.2-.65-.35-1.35-.35-2.1s.15-1.45.35-2.1V5.05H2.25C1.45 6.6 1 8.25 1 10s.45 3.4 1.25 4.95l3.7-2.85z" />
      <path d="M12 5.45c1.6 0 3.05.55 4.2 1.65l3.15-3.15C17.45 2.15 14.95 1 12 1 7.75 1 4.05 3.45 2.25 7.05l3.7 2.85c.85-2.55 3.25-4.45 6.05-4.45z" />
    </svg>
  );
}

export function ProfileSection({ user, onSignOut }: ProfileSectionProps) {
  const initials = getUserInitials(user.name, user.email);

  return (
    <div className="flex flex-wrap items-center justify-between gap-[var(--space-16)]">
      <div className="flex items-center gap-[var(--space-16)] min-w-0">
        <div
          className="rounded-[var(--r-pill)] bg-[var(--ink-2)] border border-[var(--line)] flex items-center justify-center shrink-0 overflow-hidden text-[var(--cream-100)] t-15"
          style={{ width: 'var(--h-48)', height: 'var(--h-48)' }}
          aria-hidden="true"
        >
          {user.avatarUrl ? (
            <img
              src={user.avatarUrl}
              alt={user.name}
              referrerPolicy="no-referrer"
              className="w-full h-full object-cover"
            />
          ) : (
            <span>{initials}</span>
          )}
        </div>

        <div className="min-w-0">
          <div className="t-15 text-[var(--cream-100)] truncate">
            {user.name}
          </div>
          <div className="t-13 text-[var(--cream-60)] truncate mt-[var(--space-2)]">
            {user.email}
          </div>
          <div className="flex items-center gap-[var(--space-6)] mt-[var(--space-6)]">
            <GoogleGMark />
            <span className="t-12 text-[var(--cream-38)]">
              signed in with google
            </span>
          </div>
        </div>
      </div>

      <button
        type="button"
        onClick={() => void onSignOut()}
        className="kimo-btn kimo-btn-sm kimo-btn-ghost ml-auto"
      >
        <LogOut size={14} strokeWidth={1.5} aria-hidden="true" />
        <span>sign out</span>
      </button>
    </div>
  );
}
