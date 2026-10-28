'use client';
import { useState } from 'react';
import { useRouter } from '@/lib/app-router';
import { KimoClient, type SessionSnapshot } from '@kimo/client';
import { Spinner } from '@/components/ui/spinner';
import { AttachmentChip } from '@/components/ui/attachment-chip';
import { FullScreenError } from '@/components/errors/full-screen-error';
import { UploadList } from './upload-list';
import { uploadManager, useUploads } from '@/lib/uploads/manager';
import { useSessionStore } from '@/stores/session';

export function SessionHandoff({
  sessionId,
  snapshot,
  mode,
}: {
  sessionId: string;
  snapshot: SessionSnapshot | null;
  mode: 'warmup' | 'studio';
}) {
  const router = useRouter();
  const saved = useSessionStore((state) => state.saved);
  const items = useUploads((state) => state.items);
  const restoring = useUploads((state) => state.restoring);
  const [retryFailed, setRetryFailed] = useState(false);
  const record = saved?.sessionId === sessionId ? saved : null;
  const uploads = items.filter(
    (item) => record?.assetLocalMap[item.localId] && item.status !== 'canceled',
  );
  const failed = uploads.some((item) => item.status === 'error');
  const uploading = restoring || uploads.some((item) => item.status !== 'done');
  const startOver = () => {
    uploadManager.reset();
    useSessionStore.getState().reset();
    router.push('/');
  };
  const retrySession = async () => {
    if (!record) {
      router.push('/');
      return;
    }
    setRetryFailed(false);
    try {
      const response = await new KimoClient().createSession({
        prompt: record.prompt.trim()
          ? record.prompt
          : 'make a great video from these',
        assetIds: Object.values(record.assetLocalMap),
        aspect: record.aspect,
        durationHint: record.durationHint,
      });
      useSessionStore
        .getState()
        .startSession({ ...record, sessionId: response.sessionId });
      router.replace(`/warmup/${response.sessionId}`);
    } catch {
      setRetryFailed(true);
    }
  };
  if (!snapshot || snapshot.status === 'failed' || retryFailed)
    return (
      <FullScreenError
        variant="session"
        onPrimary={() => void retrySession()}
        onSecondary={startOver}
      />
    );
  if (failed)
    return (
      <FullScreenError
        variant="upload"
        onPrimary={() => {
          for (const item of uploads)
            if (item.status === 'error') void uploadManager.retry(item.localId);
        }}
        onSecondary={() => router.push('/')}
      >
        <div className="upload-handoff-files">
          <UploadList items={uploads} />
        </div>
      </FullScreenError>
    );
  return (
    <main
      id="main"
      className="upload-handoff"
      data-warmup-ready="true"
      data-ready="true"
    >
      <div className="landing-handoff-seed">
        {uploading ? (
          <Spinner size={20} label="preparing your video" />
        ) : (
          <span>ready</span>
        )}
      </div>
      <h1>
        {mode === 'warmup'
          ? 'getting your video ready'
          : 'your session is ready'}
      </h1>
      <p className="upload-handoff-copy">
        {uploading
          ? 'your clips are uploading.'
          : 'your session is ready. the editor will be available soon.'}
      </p>
      <div className="upload-first-message">
        {record?.prompt ? <p>{record.prompt}</p> : null}
        <div className="upload-handoff-files">
          <UploadList items={uploads} />
          {snapshot.assets
            .filter(
              (asset) =>
                asset.source === 'user' &&
                (!record ||
                  Object.values(record.assetLocalMap).includes(asset.id)) &&
                !items.some((item) => item.assetId === asset.id),
            )
            .map((asset) => (
              <AttachmentChip
                key={asset.id}
                name={asset.name}
                kind={
                  asset.kind === 'video' ||
                  asset.kind === 'image' ||
                  asset.kind === 'audio'
                    ? asset.kind
                    : 'doc'
                }
                meta="preview after upload"
              />
            ))}
        </div>
      </div>
    </main>
  );
}
