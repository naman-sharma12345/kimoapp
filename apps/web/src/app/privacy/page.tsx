import Link from 'next/link';
export const metadata = { title: 'privacy · kimo' };
export default function PrivacyPage() {
  return (
    <main id="main" className="privacy-page">
      <Link href="/">← kimo</Link>
      <h1>privacy</h1>
      <p>
        by sending, you agree that your files are processed by ai models. don’t
        upload anything private.
      </p>
      <h2>your files and videos</h2>
      <p>
        the production service will store uploaded files in cloudflare r2 and
        automatically delete them after 24 hours. final videos will be deleted
        after 30 days. this retention policy must be implemented by the backend
        before launch.
      </p>
      <h2>ai processing</h2>
      <p>
        the production service will send inputs to meta model api models for
        planning, transcription and masks. meta may use inputs to improve its
        models. avoid uploading confidential information or material you do not
        have permission to share.
      </p>
      <h2>the current demo</h2>
      <p>
        the mock runs locally. it uses sample media and does not contact meta or
        google. uploaded demo files stay on the machine running the mock until
        that operator deletes them. production retention does not apply to the
        mock.
      </p>
      <h2>accounts and measurement</h2>
      <p>
        production sign-in will use google through our backend with an httponly
        session cookie. optional analytics collect event counts and timings,
        never prompt text or file names. analytics are disabled unless
        configured, and respect do not track.
      </p>
      <h2>contact</h2>
      <p>
        questions or deletion requests:{' '}
        <a href="mailto:hello@getkimo.tech">hello@getkimo.tech</a>.
      </p>
    </main>
  );
}
