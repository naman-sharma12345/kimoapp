'use client';
import { useEffect, useState } from 'react';
import { SystemBanner } from '@/features/system/components/system-state-page/SystemBanner';
import '@/features/system/system.css';

/** Shows the offline banner app-wide while the browser reports no network. */
export function OfflineBanner() {
  const [offline, setOffline] = useState(false);
  useEffect(() => {
    const update = () => setOffline(!navigator.onLine);
    update();
    window.addEventListener('offline', update);
    window.addEventListener('online', update);
    return () => {
      window.removeEventListener('offline', update);
      window.removeEventListener('online', update);
    };
  }, []);
  if (!offline) return null;
  return (
    <div
      className="kimo-system"
      style={{
        position: 'fixed',
        top: 0,
        left: 0,
        right: 0,
        zIndex: 50,
        minHeight: 0,
        background: 'transparent',
      }}
    >
      <SystemBanner isOffline={offline} />
    </div>
  );
}
