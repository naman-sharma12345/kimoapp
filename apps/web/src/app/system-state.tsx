'use client';
import { useRouter } from 'next/navigation';
import SystemStatePage from '@/features/system/pages/SystemStatePage';
import type { SystemStatePageProps } from '@/features/system/types/system-state-page';
import '@/features/system/system.css';

/** Client wrapper so server boundaries can render the system-state screens. */
export function SystemState(props: Omit<SystemStatePageProps, 'onNavigate'>) {
  const router = useRouter();
  return (
    <SystemStatePage {...props} onNavigate={(href) => router.push(href)} />
  );
}
