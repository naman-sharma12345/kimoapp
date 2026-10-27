'use client';
import { CircleAlert } from 'lucide-react';
import { Button } from '@/components/ui/button';
import type { ReactNode } from 'react';

const copy = {
  upload: {
    title: 'some files didn’t upload',
    body: 'check your connection and try again. nothing you made is lost.',
    primary: 'retry uploads',
    secondary: 'back',
  },
  session: {
    title: 'kimo couldn’t start this edit',
    body: 'the editor hit a problem before it began. your files are saved for 24 hours.',
    primary: 'try again',
    secondary: 'start over',
  },
} as const;
export function FullScreenError({
  variant,
  onPrimary,
  onSecondary,
  children,
}: {
  variant: keyof typeof copy;
  onPrimary: () => void;
  onSecondary: () => void;
  children?: ReactNode;
}) {
  const text = copy[variant];
  return (
    <main id="main" className="fullscreen-error" data-ready="true">
      <div className="fullscreen-error-content">
        <CircleAlert
          className="fullscreen-error-icon"
          size={20}
          strokeWidth={1.5}
          aria-hidden="true"
        />
        <h1>{text.title}</h1>
        <p>{text.body}</p>
        {children}
        <div className="fullscreen-error-actions">
          <Button variant="primary" onClick={onPrimary}>
            {text.primary}
          </Button>
          <Button onClick={onSecondary}>{text.secondary}</Button>
        </div>
      </div>
    </main>
  );
}
