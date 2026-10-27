'use client';
import { AttachmentChip } from '@/components/ui/attachment-chip';
import { fileMeta } from '@/lib/landing-files';
import { uploadManager } from '@/lib/uploads/manager';
import type { UploadItem } from '@/lib/uploads/types';

function bytes(size: number) {
  if (size >= 1024 ** 3) return `${(size / 1024 ** 3).toFixed(1)} GB`;
  if (size >= 1024 ** 2) return `${(size / 1024 ** 2).toFixed(1)} MB`;
  return `${Math.round(size / 1024)} KB`;
}
export function UploadChip({
  item,
  removable = true,
}: {
  item: UploadItem;
  removable?: boolean;
}) {
  const meta =
    item.status === 'queued'
      ? 'waiting…'
      : item.status === 'probing'
        ? 'reading…'
        : item.status === 'uploading'
          ? `${Math.round(item.progress * 100)}% · ${bytes(item.bytesSent)} of ${bytes(item.file.size)}`
          : item.meta.previewAfterUpload
            ? 'preview after upload'
            : fileMeta(item.file, item.meta.durationSec);
  return (
    <AttachmentChip
      kind={item.kind}
      name={item.file.name}
      meta={meta}
      thumbnail={item.meta.thumbBlobUrl}
      waveform={item.meta.waveform}
      status={item.status}
      progress={
        item.status === 'uploading' || item.status === 'done'
          ? item.progress
          : undefined
      }
      onRetry={() => void uploadManager.retry(item.localId)}
      onRemove={
        removable ? () => uploadManager.cancel(item.localId) : undefined
      }
    />
  );
}
