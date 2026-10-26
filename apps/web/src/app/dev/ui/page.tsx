import Link from 'next/link';
import { Ready } from '../tokens/ready';
import { UiGallery } from './ui-gallery';

export const metadata = { title: 'kimo · components' };
export default function UiPage() {
  return (
    <main id="main" className="ui-gallery-page" data-ready="false">
      <Ready />
      <header className="ui-gallery-header">
        <div>
          <h1 className="text-t28">the components</h1>
          <p className="mt-3 text-cream-60">
            the controls behind every cut. inspect the states, then try them.
          </p>
        </div>
        <Link className="replay" href="/dev/tokens">
          view tokens
        </Link>
      </header>
      <UiGallery />
    </main>
  );
}
