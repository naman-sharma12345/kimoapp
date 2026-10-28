import { useEffect, useRef, useState } from 'react';
import { AnimatePresence, motion, useReducedMotion } from 'motion/react';
import { LogOut } from 'lucide-react';
import { dur, ease } from '../../lib/motion';
import { getUserInitials } from '../../lib/account-utils';
import type { AccountUser } from '../../types/account-page';
import { KimoMark } from './KimoMark';

export interface TopBarProps {
  user: AccountUser | null;
  onSignOut: () => void | Promise<void>;
}

export function TopBar({ user, onSignOut }: TopBarProps) {
  const [menuOpen, setMenuOpen] = useState(false);
  const triggerRef = useRef<HTMLButtonElement | null>(null);
  const menuRef = useRef<HTMLDivElement | null>(null);
  const reduceMotion = useReducedMotion();

  const initials = user ? getUserInitials(user.name, user.email) : 'km';

  useEffect(() => {
    if (!menuOpen) return;

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        setMenuOpen(false);
        triggerRef.current?.focus();
      }
    };

    const handlePointerDown = (event: MouseEvent) => {
      const target = event.target as Node;
      if (
        menuRef.current &&
        !menuRef.current.contains(target) &&
        triggerRef.current &&
        !triggerRef.current.contains(target)
      ) {
        setMenuOpen(false);
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('mousedown', handlePointerDown);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('mousedown', handlePointerDown);
    };
  }, [menuOpen]);

  return (
    <header
      className="w-full flex items-center justify-between px-[var(--space-24)] border-b border-[var(--line)] bg-[var(--ink-0)]"
      style={{ height: 'var(--h-56)' }}
    >
      {/* Left: mark 16 + wordmark t-15 linking "/", breadcrumb t-13 cream-60 "account" */}
      <div className="flex items-center gap-[var(--space-12)] min-w-0">
        <a
          href="/"
          onClick={(e) => e.preventDefault()}
          className="inline-flex items-center gap-[var(--space-8)] text-[var(--cream-100)] no-underline rounded-[var(--r-6)] py-[var(--space-2)] px-[var(--space-4)] -ml-[var(--space-4)]"
        >
          <KimoMark size={16} />
          <span className="t-15 kimo-wordmark">kimo</span>
        </a>
        <span
          aria-hidden="true"
          className="t-13 text-[var(--cream-38)] select-none"
        >
          /
        </span>
        <nav aria-label="breadcrumb">
          <span className="t-13 text-[var(--cream-60)]">account</span>
        </nav>
      </div>

      {/* Right: ghost sm "projects" (links /projects) and the 28px avatar menu */}
      <div className="flex items-center gap-[var(--space-12)]">
        <a
          href="/projects"
          onClick={(e) => e.preventDefault()}
          className="kimo-btn kimo-btn-sm kimo-btn-ghost"
        >
          projects
        </a>

        <div className="relative flex items-center">
          <button
            ref={triggerRef}
            type="button"
            aria-label="account menu"
            aria-haspopup="menu"
            aria-expanded={menuOpen}
            onClick={() => setMenuOpen((prev) => !prev)}
            className="inline-flex items-center justify-center rounded-[var(--r-pill)] bg-[var(--ink-2)] border border-[var(--line)] hover:border-[var(--line-strong)] hover:bg-[var(--ink-3)] text-[var(--cream-100)] t-12 cursor-pointer overflow-hidden transition-colors duration-[var(--dur-1)]"
            style={{ width: 'var(--h-28)', height: 'var(--h-28)' }}
          >
            {user?.avatarUrl ? (
              <img
                src={user.avatarUrl}
                alt={user.name}
                referrerPolicy="no-referrer"
                className="w-full h-full object-cover"
              />
            ) : (
              <span>{initials}</span>
            )}
          </button>

          <AnimatePresence>
            {menuOpen && user && (
              <motion.div
                ref={menuRef}
                role="menu"
                aria-label="account menu"
                initial={
                  reduceMotion
                    ? { opacity: 0 }
                    : { opacity: 0, y: 4, scale: 0.98 }
                }
                animate={
                  reduceMotion ? { opacity: 1 } : { opacity: 1, y: 0, scale: 1 }
                }
                exit={
                  reduceMotion
                    ? { opacity: 0 }
                    : { opacity: 0, y: 4, scale: 0.98 }
                }
                transition={{
                  duration: reduceMotion ? dur.dur2 : dur.dur3,
                  ease: ease.out,
                }}
                className="absolute right-0 top-[calc(100%+var(--space-8))] z-40 min-w-[200px] rounded-[var(--r-12)] bg-[var(--ink-1)] p-[var(--space-8)]"
                style={{ boxShadow: 'var(--shadow-pop)' }}
              >
                <div className="px-[var(--space-8)] py-[var(--space-6)] border-b border-[var(--line)] mb-[var(--space-4)]">
                  <div className="t-13 text-[var(--cream-100)] truncate">
                    {user.name}
                  </div>
                  <div className="t-12 text-[var(--cream-60)] truncate">
                    {user.email}
                  </div>
                </div>
                <button
                  type="button"
                  role="menuitem"
                  onClick={() => {
                    setMenuOpen(false);
                    void onSignOut();
                  }}
                  className="kimo-btn kimo-btn-sm kimo-btn-ghost w-full justify-start"
                >
                  <LogOut size={14} strokeWidth={1.5} aria-hidden="true" />
                  <span>sign out</span>
                </button>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </div>
    </header>
  );
}
