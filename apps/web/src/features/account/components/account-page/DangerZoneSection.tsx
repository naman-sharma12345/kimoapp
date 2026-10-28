import type { RefObject } from 'react';

export interface DangerZoneSectionProps {
  onOpenDeleteDialog: () => void;
  triggerRef: RefObject<HTMLButtonElement | null>;
}

export function DangerZoneSection({
  onOpenDeleteDialog,
  triggerRef,
}: DangerZoneSectionProps) {
  return (
    <div
      className="rounded-[var(--r-12)] p-[var(--space-20)] flex flex-col sm:flex-row sm:items-center justify-between gap-[var(--space-16)]"
      style={{
        border: '1px solid var(--danger-zone-border)',
      }}
    >
      <div className="min-w-0">
        <div className="t-13 text-[var(--cream-100)]">delete account</div>
        <p className="t-12 text-[var(--cream-60)] mt-[var(--space-4)] mb-0">
          removes your projects, videos and preferences. this can&apos;t be
          undone.
        </p>
      </div>

      <button
        ref={triggerRef}
        type="button"
        onClick={onOpenDeleteDialog}
        className="kimo-btn kimo-btn-sm kimo-btn-danger self-start sm:self-center"
      >
        delete account
      </button>
    </div>
  );
}
