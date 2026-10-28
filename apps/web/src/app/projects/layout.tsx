import type { ReactNode } from 'react';
import '@/features/projects/projects.css';

export const metadata = {
  title: 'projects · kimo',
  robots: { index: false, follow: false },
};

export default function ProjectsLayout({ children }: { children: ReactNode }) {
  return children;
}
