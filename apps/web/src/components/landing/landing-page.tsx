import Image from 'next/image';
import Link from 'next/link';
import { ArrowUpRight } from 'lucide-react';

import { ComposerIsland, SignInGate } from './composer-gate';
import { Ready } from '@/app/dev/tokens/ready';

const how = [
  {
    title: 'say it',
    body: 'describe the video and drop in anything you have. no timeline skills needed.',
  },
  {
    title: 'watch it',
    body: 'every cut, caption and colour change shows up live. nothing hidden, nothing to wait for.',
  },
  {
    title: 'steer it',
    body: 'jump in mid-edit, rewrite any word, ask for changes. render in 1080p when it’s right.',
  },
] as const;
export function LandingPage() {
  return (
    <>
      <main id="main" className="landing-page" data-ready="false">
        <Ready />
        <div className="landing-grain" aria-hidden="true" />
        <div className="landing-first-fold">
          <header className="landing-nav">
            <nav className="landing-nav-inner" aria-label="main navigation">
              <Link href="/" className="landing-brand" aria-label="kimo home">
                <span className="landing-brand-mark" aria-hidden="true" />
                <span>kimo</span>
              </Link>
              <div className="landing-nav-actions">
                <a href="#how-it-works">how it works</a>
                <a
                  href="https://github.com/naman-sharma12345/kimo"
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  github{' '}
                  <ArrowUpRight
                    size={14}
                    strokeWidth={1.5}
                    aria-hidden="true"
                  />
                  <span className="landing-sr-only"> (opens in a new tab)</span>
                </a>
                <SignInGate />
              </div>
            </nav>
          </header>
          <div className="landing-hero">
            <div className="landing-hero-inner">
              <div className="landing-eyebrow">
                <span className="ui-pill" data-variant="live">
                  <span className="ui-live-dot" aria-hidden="true" />
                  ai video editor · open source
                </span>
              </div>
              <h1 className="landing-headline">
                <span className="landing-line landing-line-one">
                  tell it the video.
                </span>
                <span className="landing-line landing-line-two">
                  watch it get <span className="landing-made">made.</span>
                </span>
              </h1>
              <p className="landing-subtext">
                drop in your clips, photos and music. kimo cuts, captions,
                grades and scores it while you watch, and you can step in at any
                second.
              </p>
              <ComposerIsland />
            </div>
          </div>
        </div>
        <section
          id="how-it-works"
          className="landing-how"
          aria-labelledby="how-heading"
        >
          <h2 id="how-heading">how it works</h2>
          <div className="landing-how-grid">
            {how.map((item) => (
              <article key={item.title}>
                <div className="landing-still">
                  <Image
                    src="/dev/still.png"
                    alt=""
                    width={1600}
                    height={1000}
                    unoptimized
                  />
                </div>
                <h3>{item.title}</h3>
                <p>{item.body}</p>
              </article>
            ))}
          </div>
        </section>
        <footer className="landing-footer">
          <div className="landing-footer-inner">
            <span>kimo · open source video editing</span>
            <div>
              <a
                href="https://github.com/naman-sharma12345/kimo"
                target="_blank"
                rel="noopener noreferrer"
              >
                github
                <span className="landing-sr-only"> (opens in a new tab)</span>
              </a>
              <a href="https://getkimo.tech">getkimo.tech</a>
              <a href="/privacy">privacy</a>
              <a href="/terms">terms</a>
              <a href="/privacy#cookies">cookies</a>
            </div>
          </div>
        </footer>
      </main>
    </>
  );
}
