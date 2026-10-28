export type LegalDocType = 'privacy' | 'terms';

export type LegalPageState = 'privacy' | 'terms' | 'mobile toc open';

export interface LegalSection {
  id: string;
  heading: string;
  paragraphs: string[];
}

export interface LegalContent {
  title: string;
  updated: string;
  shortVersion: string[];
  sections: LegalSection[];
}

export type LegalContentMap = Record<LegalDocType, LegalContent>;

export interface InlineTextSegment {
  type: 'text' | 'link';
  text: string;
  href?: string;
  external?: boolean;
}

export interface LegalPageProps {
  doc: LegalDocType;
  onNavigate: (doc: LegalDocType) => void | Promise<void>;
  content: LegalContent | LegalContentMap;
  onBack?: () => void | Promise<void>;
  onCopySectionLink?: (sectionId: string, fullUrl: string) => Promise<void>;
  showStatesMode?: boolean;
  mobileTocOpenOverride?: boolean;
  onMobileTocToggle?: (open: boolean) => void;
}
