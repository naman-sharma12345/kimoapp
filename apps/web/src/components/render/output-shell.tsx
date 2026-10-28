import Link from 'next/link';
import { KimoLogo } from '@/features/brand/kimo-logo';
export function OutputBrand({ wordmark = false }: { wordmark?: boolean }) {
  return (
    <Link href="/" className="output-brand" aria-label="kimo home">
      <KimoLogo size={20} />
      {wordmark ? <span>kimo</span> : null}
    </Link>
  );
}
export function OutputAtmosphere() {
  return (
    <>
      <div className="landing-grain" aria-hidden />
      <div className="output-horizon" aria-hidden />
    </>
  );
}
export function OutputFooter() {
  return (
    <footer className="output-footer">
      <span>kimo · open source video editing</span>
      <div>
        <a
          href="https://github.com/naman-sharma12345/kimo"
          target="_blank"
          rel="noreferrer"
        >
          github<span className="sr-only"> (opens in a new tab)</span>
        </a>
        <a href="https://getkimo.tech">getkimo.tech</a>
      </div>
    </footer>
  );
}
