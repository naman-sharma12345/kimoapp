import Link from 'next/link';
import Image from 'next/image';
export function OutputBrand({ wordmark = false }: { wordmark?: boolean }) {
  return (
    <Link href="/" className="output-brand" aria-label="kimo home">
      <Image
        src="/brand/kimo-mark.svg"
        alt=""
        width={20}
        height={20}
        unoptimized
      />
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
