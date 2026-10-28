import React, { useEffect, useRef, useState } from 'react';
import { AnimatePresence, motion, useReducedMotion } from 'motion/react';
import { Plus } from 'lucide-react';
import { KimoMark } from './KimoMark';
import { TRANSITION } from '../../lib/motion';
import type { UserProfile } from '../../types/projects';

export type TopBarProps = {
  user: UserProfile | null;
  hasActiveOrangeOnPage: boolean;
  onNewVideo: () => void;
  onNavigateAccount?: () => void;
  onNavigatePrivacy?: () => void;
  onSignOut: () => void;
  isCompactMobile: boolean;
};

export function TopBar({
  user,
  hasActiveOrangeOnPage,
  onNewVideo,
  onSignOut,
  isCompactMobile,
}: TopBarProps) {
  const [menuOpen, setMenuOpen] = useState(false);
  const avatarButtonRef = useRef<HTMLButtonElement | null>(null);
  const menuRef = useRef<HTMLDivElement | null>(null);
  const firstMenuItemRef = useRef<HTMLAnchorElement | null>(null);
  const reducedMotion = useReducedMotion();

  useEffect(() => {
    if (!menuOpen) return;
    firstMenuItemRef.current?.focus();

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        setMenuOpen(false);
        avatarButtonRef.current?.focus();
      }
    };

    const handlePointerDown = (e: MouseEvent) => {
      const target = e.target as Node;
      if (
        menuRef.current &&
        !menuRef.current.contains(target) &&
        avatarButtonRef.current &&
        !avatarButtonRef.current.contains(target)
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

  // When a project is editing, "new video" switches from primary to secondary so the page keeps one orange focus
  const newVideoBtnVariant = hasActiveOrangeOnPage
    ? 'btn-secondary'
    : 'btn-primary';

  return (
    <header
      style={{
        height: '56px',
        width: '100%',
        borderBottom: '1px solid var(--line)',
        padding: '0 24px',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        backgroundColor: 'rgb(8 8 9 / 0.72)',
        backdropFilter: 'blur(12px)',
        WebkitBackdropFilter: 'blur(12px)',
        position: 'sticky',
        top: 0,
        zIndex: 30,
      }}
    >
      {/* Left: kimo mark 16px + 8px + wordmark t-15 linking "/", 24px gap, breadcrumb t-13 cream-60 "projects" */}
      <div
        className="flex items-center"
        style={{ gap: isCompactMobile ? '16px' : '24px' }}
      >
        <a
          href="/"
          onClick={(e) => {
            e.preventDefault();
            onNewVideo();
          }}
          className="kimo-focus inline-flex items-center"
          style={{
            borderRadius: '6px',
            textDecoration: 'none',
          }}
          aria-label="kimo"
        >
          <KimoMark size={20} showWordmark={!isCompactMobile} />
        </a>
        <span
          className="t-13"
          style={{
            color: 'var(--cream-60)',
          }}
        >
          projects
        </span>
      </div>

      {/* Right: primary/secondary md button "new video" with Plus 16 (links "/studio/new"), 12px gap, 28px round avatar */}
      <div className="flex items-center" style={{ gap: '12px' }}>
        {isCompactMobile ? (
          <a
            href="/studio/new"
            onClick={(e) => {
              e.preventDefault();
              onNewVideo();
            }}
            aria-label="new video"
            className={`btn-base ${newVideoBtnVariant} t-13`}
            style={{
              width: '32px',
              height: '32px',
              padding: 0,
              borderRadius: '8px',
            }}
          >
            <Plus size={16} strokeWidth={1.5} />
          </a>
        ) : (
          <a
            href="/studio/new"
            onClick={(e) => {
              e.preventDefault();
              onNewVideo();
            }}
            className={`btn-base ${newVideoBtnVariant} h-32 t-13`}
          >
            <Plus size={16} strokeWidth={1.5} />
            <span>new video</span>
          </a>
        )}

        {user && (
          <div style={{ position: 'relative' }}>
            <button
              ref={avatarButtonRef}
              type="button"
              onClick={() => setMenuOpen((prev) => !prev)}
              aria-label="account"
              aria-haspopup="menu"
              aria-expanded={menuOpen}
              className="kimo-focus t-11"
              style={{
                width: '28px',
                height: '28px',
                borderRadius: '999px',
                backgroundColor: 'var(--ink-2)',
                border: '1px solid var(--line-strong)',
                color: 'var(--cream-100)',
                display: 'inline-flex',
                alignItems: 'center',
                justifyContent: 'center',
                cursor: 'pointer',
                textTransform: 'lowercase',
                transition: `background-color var(--dur-1) var(--ease-out), border-color var(--dur-1) var(--ease-out)`,
              }}
            >
              {user.avatarInitials}
            </button>

            <AnimatePresence>
              {menuOpen && (
                <motion.div
                  ref={menuRef}
                  role="menu"
                  aria-label="account"
                  initial={
                    reducedMotion
                      ? { opacity: 0 }
                      : { opacity: 0, y: 4, scale: 0.98 }
                  }
                  animate={
                    reducedMotion
                      ? { opacity: 1 }
                      : { opacity: 1, y: 0, scale: 1 }
                  }
                  exit={
                    reducedMotion
                      ? { opacity: 0 }
                      : { opacity: 0, y: 4, scale: 0.98 }
                  }
                  transition={
                    reducedMotion ? TRANSITION.reducedFade : TRANSITION.popIn
                  }
                  style={{
                    position: 'absolute',
                    right: 0,
                    top: '36px',
                    width: '220px',
                    backgroundColor: 'var(--ink-1)',
                    border: '1px solid var(--line)',
                    borderRadius: '12px',
                    boxShadow: 'var(--shadow-pop)',
                    padding: '6px',
                    zIndex: 40,
                  }}
                >
                  {/* Name and email header block */}
                  <div
                    style={{
                      padding: '8px 10px',
                      borderBottom: '1px solid var(--line)',
                      marginBottom: '4px',
                    }}
                  >
                    <div
                      className="t-13"
                      style={{
                        color: 'var(--cream-100)',
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                        whiteSpace: 'nowrap',
                      }}
                    >
                      {user.name}
                    </div>
                    <div
                      className="t-12"
                      style={{
                        color: 'var(--cream-60)',
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                        whiteSpace: 'nowrap',
                      }}
                    >
                      {user.email}
                    </div>
                  </div>

                  <a
                    ref={firstMenuItemRef}
                    href="/account"
                    role="menuitem"
                    onClick={(e) => {
                      e.preventDefault();
                      setMenuOpen(false);
                    }}
                    className="kimo-focus t-13"
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      height: '32px',
                      padding: '0 10px',
                      borderRadius: '8px',
                      color: 'var(--cream-100)',
                      textDecoration: 'none',
                      transition: `background-color var(--dur-1) var(--ease-out)`,
                    }}
                    onMouseEnter={(e) => {
                      e.currentTarget.style.backgroundColor = 'var(--ink-2)';
                    }}
                    onMouseLeave={(e) => {
                      e.currentTarget.style.backgroundColor = 'transparent';
                    }}
                  >
                    account
                  </a>

                  <a
                    href="/privacy"
                    role="menuitem"
                    onClick={(e) => {
                      e.preventDefault();
                      setMenuOpen(false);
                    }}
                    className="kimo-focus t-13"
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      height: '32px',
                      padding: '0 10px',
                      borderRadius: '8px',
                      color: 'var(--cream-100)',
                      textDecoration: 'none',
                      transition: `background-color var(--dur-1) var(--ease-out)`,
                    }}
                    onMouseEnter={(e) => {
                      e.currentTarget.style.backgroundColor = 'var(--ink-2)';
                    }}
                    onMouseLeave={(e) => {
                      e.currentTarget.style.backgroundColor = 'transparent';
                    }}
                  >
                    privacy
                  </a>

                  <div
                    role="separator"
                    style={{
                      height: '1px',
                      backgroundColor: 'var(--line)',
                      margin: '4px 0',
                    }}
                  />

                  <button
                    type="button"
                    role="menuitem"
                    onClick={() => {
                      setMenuOpen(false);
                      onSignOut();
                    }}
                    className="kimo-focus t-13"
                    style={{
                      width: '100%',
                      display: 'flex',
                      alignItems: 'center',
                      height: '32px',
                      padding: '0 10px',
                      borderRadius: '8px',
                      backgroundColor: 'transparent',
                      border: 'none',
                      color: 'var(--cream-60)',
                      cursor: 'pointer',
                      textAlign: 'left',
                      transition: `background-color var(--dur-1) var(--ease-out), color var(--dur-1) var(--ease-out)`,
                    }}
                    onMouseEnter={(e) => {
                      e.currentTarget.style.backgroundColor = 'var(--ink-2)';
                      e.currentTarget.style.color = 'var(--cream-100)';
                    }}
                    onMouseLeave={(e) => {
                      e.currentTarget.style.backgroundColor = 'transparent';
                      e.currentTarget.style.color = 'var(--cream-60)';
                    }}
                  >
                    sign out
                  </button>
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        )}
      </div>
    </header>
  );
}
