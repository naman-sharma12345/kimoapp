import { Film, HardDrive, Upload } from 'lucide-react';
import {
  computeStorageBarRatio,
  formatStorageGigabytes,
} from '../../lib/account-utils';
import type { AccountStorage } from '../../types/account-page';

export interface StorageSectionProps {
  storage: AccountStorage;
}

export function StorageSection({ storage }: StorageSectionProps) {
  const formattedBytes = formatStorageGigabytes(storage.bytesUsed);
  const barRatio = computeStorageBarRatio(storage.bytesUsed);

  return (
    <div className="flex flex-col">
      <div className="divide-y divide-[var(--line)]">
        {/* Row 1: Upload "uploaded files": uploads are not stored yet */}
        <div
          className="flex items-center justify-between gap-[var(--space-12)]"
          style={{ height: 'var(--h-40)' }}
        >
          <div className="flex items-center gap-[var(--space-12)] min-w-0">
            <Upload
              size={16}
              strokeWidth={1.5}
              aria-hidden="true"
              className="text-[var(--cream-38)] shrink-0"
            />
            <span className="t-13 text-[var(--cream-100)] truncate">
              uploaded files
            </span>
          </div>
          <span className="t-13 text-[var(--cream-60)] text-right shrink-0">
            not stored yet
          </span>
        </div>

        {/* Row 2: Film "finished videos" "kept for 30 days" */}
        <div
          className="flex items-center justify-between gap-[var(--space-12)]"
          style={{ height: 'var(--h-40)' }}
        >
          <div className="flex items-center gap-[var(--space-12)] min-w-0">
            <Film
              size={16}
              strokeWidth={1.5}
              aria-hidden="true"
              className="text-[var(--cream-38)] shrink-0"
            />
            <span className="t-13 text-[var(--cream-100)] truncate">
              finished videos
            </span>
          </div>
          <span className="t-13 text-[var(--cream-60)] text-right shrink-0">
            not stored yet
          </span>
        </div>

        {/* Row 3: HardDrive "using now" "1.2 GB" with a tiny 64px bar */}
        <div
          className="flex items-center justify-between gap-[var(--space-12)]"
          style={{ height: 'var(--h-40)' }}
        >
          <div className="flex items-center gap-[var(--space-12)] min-w-0">
            <HardDrive
              size={16}
              strokeWidth={1.5}
              aria-hidden="true"
              className="text-[var(--cream-38)] shrink-0"
            />
            <span className="t-13 text-[var(--cream-100)] truncate">
              using now
            </span>
          </div>
          <div className="flex items-center gap-[var(--space-12)] shrink-0">
            <div
              aria-hidden="true"
              className="rounded-[var(--r-pill)] bg-[var(--ink-3)] overflow-hidden"
              style={{
                width: 'var(--w-storage-bar)',
                height: 'var(--h-meter)',
              }}
            >
              <div
                className="h-full rounded-[var(--r-pill)] bg-[var(--cream-100)]"
                style={{ width: `${Math.round(barRatio * 100)}%` }}
              />
            </div>
            <span className="t-13 font-mono-kimo text-[var(--cream-60)] text-right">
              {formattedBytes}
            </span>
          </div>
        </div>
      </div>

      <p className="t-12 text-[var(--cream-38)] mt-[var(--space-12)] mb-0">
        kimo doesn&apos;t store uploads or videos yet. your account, projects
        and preferences live in cloudflare d1. read the{' '}
        <a href="/privacy" className="kimo-inline-link">
          privacy page
        </a>
        .
      </p>
    </div>
  );
}
