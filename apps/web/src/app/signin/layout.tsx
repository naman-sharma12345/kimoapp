import type { ReactNode } from 'react';
import '@/features/signin/signin.css';

export const metadata = {
  title: 'sign in · kimo',
  robots: { index: false, follow: false },
};

export default function SignInLayout({ children }: { children: ReactNode }) {
  return children;
}
