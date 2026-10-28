import type { Metadata } from 'next';
import Link from 'next/link';
import {
  OutputAtmosphere,
  OutputBrand,
} from '@/components/render/output-shell';

export const metadata: Metadata = {
  title: 'kimo doesn’t keep videos',
  robots: { index: false, follow: false },
};

/** Old share links land here: kimo no longer stores or hosts videos. */
export default function VideoPage() {
  return (
    <main id="main" className="output-page render-page" data-ready="true">
      <OutputAtmosphere />
      <header className="output-nav">
        <OutputBrand />
      </header>
      <section className="render-content" aria-label="video">
        <div className="render-failure" role="status">
          <h1>kimo doesn’t keep videos</h1>
          <p>
            videos are made and downloaded in your browser, so there’s nothing
            stored here to watch. open your project to export it again.
          </p>
          <div className="agent-button-row">
            <Link
              className="ui-button ui-button-primary ui-size-md"
              href="/projects"
            >
              <span className="ui-button-label">your projects</span>
            </Link>
          </div>
        </div>
      </section>
    </main>
  );
}
