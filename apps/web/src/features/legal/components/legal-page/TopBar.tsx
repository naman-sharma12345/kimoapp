import React from 'react';
import { ArrowLeft } from 'lucide-react';
import Link from 'next/link';
import { KimoMark } from './KimoMark';

export interface TopBarProps {
  onBack: () => void;
}

export const TopBar: React.FC<TopBarProps> = ({ onBack }) => {
  return (
    <header className="w-full h-[var(--h-64)] flex items-center justify-between px-[var(--space-20)] sm:px-[var(--space-32)] lg:px-[var(--space-48)]">
      <Link
        href="/"
        aria-label="kimo home"
        className="inline-flex items-center rounded-[var(--r-8)] py-[var(--space-4)] px-[var(--space-6)] -ml-[var(--space-6)] text-[var(--cream-100)] transition-colors duration-[var(--dur-1)]"
      >
        <KimoMark size={20} showWordmark />
      </Link>

      <button
        type="button"
        onClick={onBack}
        aria-label="back"
        className="kimo-btn kimo-btn-ghost h-[var(--h-32)] px-[var(--space-12)] t-13"
      >
        <ArrowLeft size={14} strokeWidth={1.5} aria-hidden="true" />
        <span>back</span>
      </button>
    </header>
  );
};
