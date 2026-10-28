'use client';
import { useRouter } from 'next/navigation';
import LegalPage from '@/features/legal/pages/LegalPage';
import { LEGAL_CONTENT_MAP } from '@/features/legal/content';
import type { LegalDocType } from '@/features/legal/types/legal-page';

/** /privacy and /terms share one reading view; the switch changes routes. */
export function LegalRoute({ doc }: { doc: LegalDocType }) {
  const router = useRouter();
  return (
    <LegalPage
      doc={doc}
      content={LEGAL_CONTENT_MAP}
      onNavigate={(next) => router.push(`/${next}`)}
      onCopySectionLink={async (_id, url) => {
        try {
          await navigator.clipboard?.writeText(url);
        } catch {
          // Clipboard blocked: the toast still shows the anchor was set.
        }
      }}
    />
  );
}
