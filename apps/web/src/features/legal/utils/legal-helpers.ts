import type {
  InlineTextSegment,
  LegalContent,
  LegalContentMap,
  LegalDocType,
} from '../types/legal-page';

/**
 * Calculates normalized reading scroll progress in [0, 1].
 */
export function calculateReadingProgress(
  scrollTop: number,
  scrollHeight: number,
  clientHeight: number,
): number {
  const maxScroll = scrollHeight - clientHeight;
  if (maxScroll <= 0) {
    return 0;
  }
  const ratio = scrollTop / maxScroll;
  if (ratio < 0) return 0;
  if (ratio > 1) return 1;
  return ratio;
}

/**
 * Resolves the active LegalContent object whether `content` prop is a single
 * LegalContent or a map of { privacy, terms }.
 */
export function resolveLegalContent(
  doc: LegalDocType,
  content: LegalContent | LegalContentMap,
): LegalContent {
  if ('sections' in content && Array.isArray(content.sections)) {
    return content;
  }
  return (content as LegalContentMap)[doc];
}

/**
 * Resolves the initial document from a pathname string.
 */
export function resolveDocFromPath(pathname: string): LegalDocType {
  const normalized = pathname.trim().toLowerCase();
  if (normalized === '/terms' || normalized.startsWith('/terms/')) {
    return 'terms';
  }
  return 'privacy';
}

/**
 * Checks if `?states=1` is present in a URL search string.
 */
export function hasStatesParam(search: string): boolean {
  const params = new URLSearchParams(search);
  return params.get('states') === '1';
}

/**
 * Builds the canonical section anchor URL for copying.
 */
export function buildSectionAnchorUrl(
  origin: string,
  doc: LegalDocType,
  sectionId: string,
  search: string = '',
): string {
  const cleanOrigin = origin.replace(/\/$/, '');
  return `${cleanOrigin}/${doc}${search}#${sectionId}`;
}

/**
 * Parses a plain lowercase paragraph string and turns known inline targets
 * (`hello@getkimo.tech`, `/account`, `github.com/naman-sharma12345/kimo`)
 * into structured link segments.
 */
const LINK_TOKENS: Array<{
  token: string;
  href: string;
  external: boolean;
}> = [
  {
    token: 'hello@getkimo.tech',
    href: 'mailto:hello@getkimo.tech',
    external: false,
  },
  {
    token: '/account',
    href: '/account',
    external: false,
  },
  {
    token: 'github.com/naman-sharma12345/kimo',
    href: 'https://github.com/naman-sharma12345/kimo',
    external: true,
  },
];

export function parseInlineLinks(paragraph: string): InlineTextSegment[] {
  if (!paragraph) {
    return [];
  }

  let segments: InlineTextSegment[] = [{ type: 'text', text: paragraph }];

  for (const linkDef of LINK_TOKENS) {
    const nextSegments: InlineTextSegment[] = [];
    for (const seg of segments) {
      if (seg.type !== 'text') {
        nextSegments.push(seg);
        continue;
      }
      const parts = seg.text.split(linkDef.token);
      if (parts.length === 1) {
        nextSegments.push(seg);
        continue;
      }
      parts.forEach((part, idx) => {
        if (part.length > 0) {
          nextSegments.push({ type: 'text', text: part });
        }
        if (idx < parts.length - 1) {
          nextSegments.push({
            type: 'link',
            text: linkDef.token,
            href: linkDef.href,
            external: linkDef.external,
          });
        }
      });
    }
    segments = nextSegments;
  }

  return segments;
}
