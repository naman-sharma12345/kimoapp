import { useEffect, useState } from 'react';
import { AnimatePresence, motion, useReducedMotion } from 'motion/react';
import { dur, ease, loop, spring } from '../../lib/motion';
import type { SystemBannerProps } from '../../types/system-state-page';

/**
 * SystemBanner component:
 * 40px top banner version of the offline state for use inside other pages:
 * h40, bg --ink-1, border-bottom --line, centered t-13 cream-100
 * "you're offline. changes will sync when you reconnect." with the 6px dot;
 * slides down from -40px with spring.soft, slides up on reconnect.
 */
export function SystemBanner({
  isOffline = true,
  onReconnected,
}: SystemBannerProps) {
  const shouldReduceMotion = Boolean(useReducedMotion());
  const [visible, setVisible] = useState<boolean>(isOffline);
  const [reconnected, setReconnected] = useState<boolean>(false);

  useEffect(() => {
    setVisible(isOffline);
    if (isOffline) {
      setReconnected(false);
    }
  }, [isOffline]);

  useEffect(() => {
    const handleOnline = () => {
      setReconnected(true);
      window.setTimeout(() => {
        setVisible(false);
        onReconnected?.();
      }, loop.offlineReconnectedDelayMs);
    };

    const handleOffline = () => {
      setReconnected(false);
      setVisible(true);
    };

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);
    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, [onReconnected]);

  return (
    <AnimatePresence>
      {visible && (
        <motion.div
          role="status"
          aria-live="polite"
          data-testid="system-banner"
          initial={shouldReduceMotion ? { opacity: 0 } : { y: -40 }}
          animate={shouldReduceMotion ? { opacity: 1 } : { y: 0 }}
          exit={
            shouldReduceMotion
              ? {
                  opacity: 0,
                  transition: { duration: dur.dur2, ease: ease.in },
                }
              : { y: -40, transition: spring.soft }
          }
          transition={
            shouldReduceMotion
              ? { duration: dur.dur2, ease: ease.out }
              : spring.soft
          }
          style={{
            height: 'var(--h-40)',
            width: '100%',
            backgroundColor: 'var(--ink-1)',
            borderBottom: '1px solid var(--line)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: '0 var(--sp-16)',
            position: 'relative',
            zIndex: 30,
          }}
        >
          <div
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: 'var(--sp-8)',
            }}
          >
            <span
              aria-hidden="true"
              style={{
                width: '6px',
                height: '6px',
                borderRadius: 'var(--r-999)',
                backgroundColor: reconnected
                  ? 'var(--success)'
                  : 'var(--cream-38)',
                flexShrink: 0,
                transition: 'background-color var(--dur-2) var(--ease-out)',
              }}
            />
            <span
              className="t-13"
              style={{
                color: 'var(--cream-100)',
              }}
            >
              {reconnected
                ? 'back online'
                : "you're offline. changes will sync when you reconnect."}
            </span>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
