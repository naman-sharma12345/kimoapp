const SKELETON_SECTIONS = [
  { id: 'profile', lines: 2 },
  { id: 'usage', lines: 2 },
  { id: 'preferences', lines: 5 },
  { id: 'export', lines: 1 },
  { id: 'danger', lines: 2 },
];

export function AccountSkeleton() {
  return (
    <div aria-busy="true" aria-label="loading account">
      {/* Header skeleton */}
      <div>
        <div
          className="rounded-[var(--r-4)] bg-[var(--ink-2)]"
          style={{ width: '128px', height: '28px' }}
        />
        <div
          className="rounded-[var(--r-4)] bg-[var(--ink-2)] mt-[var(--space-8)]"
          style={{ width: '160px', height: '16px' }}
        />
      </div>

      {/* Sections skeleton */}
      <div className="mt-[var(--space-40)]">
        {SKELETON_SECTIONS.map((sec, idx) => (
          <div
            key={sec.id}
            className={`flex flex-col min-[769px]:flex-row min-[769px]:items-start gap-[var(--space-16)] min-[769px]:gap-[var(--space-32)] py-[var(--space-32)] ${
              idx === 0 ? 'border-t border-[var(--line)]' : ''
            } border-b border-[var(--line)]`}
          >
            <div className="w-full min-[769px]:w-[var(--w-section-label)] shrink-0">
              <div
                className="rounded-[var(--r-4)] bg-[var(--ink-2)]"
                style={{ width: '96px', height: '16px' }}
              />
              <div
                className="rounded-[var(--r-4)] bg-[var(--ink-2)] mt-[var(--space-8)]"
                style={{ width: '140px', height: '12px' }}
              />
            </div>

            <div className="flex-1 flex flex-col gap-[var(--space-12)]">
              {Array.from({ length: sec.lines }).map((_, lineIdx) => (
                <div
                  key={lineIdx}
                  className="rounded-[var(--r-4)] bg-[var(--ink-2)] w-full"
                  style={{ height: '24px' }}
                />
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
