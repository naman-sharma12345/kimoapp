import type { ReactNode } from 'react';
import '@/features/account/account.css';

export const metadata = { title: 'account · kimo' };

export default function AccountLayout({ children }: { children: ReactNode }) {
  return children;
}
