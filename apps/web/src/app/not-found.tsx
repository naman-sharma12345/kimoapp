import { StartNewVideo } from '@/components/errors/start-new-video';

export default function NotFound() {
  return (
    <main id="main" className="fullscreen-error" data-ready="true">
      <div className="fullscreen-error-content">
        <h1>this session doesn’t exist</h1>
        <p>it may have expired. sessions are kept for 24 hours.</p>
        <div className="fullscreen-error-actions">
          <StartNewVideo />
        </div>
      </div>
    </main>
  );
}
