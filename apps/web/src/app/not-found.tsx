import Link from 'next/link';

export default function NotFound() {
  return (
    <main id="main" className="token-page" data-ready="true">
      <h1 className="text-t28">page not found</h1>
      <p className="mt-4 text-cream-60">
        this part of kimo is still taking shape.
      </p>
      <Link className="replay mt-6" href="/dev/tokens">
        back to the foundation
      </Link>
    </main>
  );
}
