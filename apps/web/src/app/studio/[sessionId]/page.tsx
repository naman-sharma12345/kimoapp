import type { Metadata } from 'next';
import { ClientRoute } from '@/components/pages-route';

export const metadata: Metadata = { robots: { index: false, follow: false } };

export default function Page() {
  return <ClientRoute kind="studio" />;
}
