'use client';
import { useState } from 'react';
import { AttachmentChip } from '@/components/ui/attachment-chip';
import { Button } from '@/components/ui/button';
import { FullScreenError } from '@/components/errors/full-screen-error';
import { Ready } from '../tokens/ready';

export default function UploadStates() {
  const [retried, setRetried] = useState(false);
  const [error, setError] = useState(false);
  const [completion, setCompletion] = useState(0);
  if (error)
    return (
      <FullScreenError
        variant="session"
        onPrimary={() => setError(false)}
        onSecondary={() => setError(false)}
      />
    );
  return (
    <main id="main" className="upload-state-gallery" data-ready="false">
      <Ready />
      <h1>upload states</h1>
      <div className="upload-state-grid">
        <section>
          <h2>queued</h2>
          <AttachmentChip
            name="queued.mp4"
            kind="video"
            meta="waiting…"
            status="queued"
          />
        </section>
        <section>
          <h2>probing</h2>
          <AttachmentChip
            name="reading.mp4"
            kind="video"
            meta="reading…"
            status="probing"
          />
        </section>
        <section>
          <h2>uploading</h2>
          <AttachmentChip
            name="uploading.mp4"
            kind="video"
            meta="42% · 10 MB of 24 MB"
            progress={0.42}
            status="uploading"
          />
        </section>
        <section>
          <h2>done</h2>
          <AttachmentChip
            key={completion}
            name="ready.mp4"
            kind="video"
            meta="0:12 · 24 MB"
            status="done"
            progress={1}
            thumbnail="/dev/still.png"
          />
        </section>
        <section>
          <h2>error</h2>
          <AttachmentChip
            name="retry.mp4"
            kind="video"
            meta=""
            status={retried ? 'done' : 'error'}
            onRetry={() => setRetried(true)}
          />
        </section>
        <section>
          <h2>unsupported codec</h2>
          <AttachmentChip
            name="unsupported.mov"
            kind="video"
            meta="preview after upload"
            status="done"
          />
        </section>
      </div>
      <div className="upload-state-actions">
        <Button onClick={() => setCompletion((value) => value + 1)}>
          replay completion
        </Button>
        <Button onClick={() => setError(true)}>review session error</Button>
      </div>
    </main>
  );
}
