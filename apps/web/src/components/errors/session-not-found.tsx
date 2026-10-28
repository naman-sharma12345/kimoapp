import { StartNewVideo } from '@/components/errors/start-new-video';

export function SessionNotFound() {
  return (
    <main id="main" className="fullscreen-error" data-ready="true">
      <div className="fullscreen-error-content">
        <h1>this session doesn’t exist</h1>
        <p>it may have been deleted, or it belongs to another account.</p>
        <div className="fullscreen-error-actions">
          <StartNewVideo />
        </div>
      </div>
    </main>
  );
}
