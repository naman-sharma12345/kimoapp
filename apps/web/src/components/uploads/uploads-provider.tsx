'use client';
import { useEffect, type ReactNode } from 'react';
import { ToastProvider, useToast } from '@/components/ui/toast';
import { uploadManager, useUploads } from '@/lib/uploads/manager';
import { useSessionStore } from '@/stores/session';

let restoration: Promise<void> | undefined;
function UploadLifecycle({ children }: { children: ReactNode }) {
  const { toast } = useToast();
  const cacheError = useUploads((state) => state.cacheError);
  useEffect(() => {
    uploadManager.setOnline(navigator.onLine);
    const saved = useSessionStore.getState().hydrate();
    uploadManager.flushRemovals();
    if (saved)
      restoration ??= uploadManager
        .restore(Object.keys(saved.assetLocalMap))
        .then(() => {
          const items = uploadManager.store
            .getState()
            .items.filter((item) => saved.assetLocalMap[item.localId]);
          useSessionStore.getState().setDraft({
            prompt: saved.prompt,
            aspect: saved.aspect,
            durationHint: saved.durationHint,
            localIds: items.map((item) => item.localId),
            files: items.map((item) => item.file),
          });
        });
    const offline = () => {
      if (!uploadManager.store.getState().online) return;
      uploadManager.setOnline(false);
      if (
        uploadManager.store
          .getState()
          .items.some((item) =>
            ['queued', 'probing', 'uploading'].includes(item.status),
          )
      )
        toast({
          tone: 'warning',
          message: 'you’re offline. uploads will continue when you’re back.',
        });
    };
    const online = () => uploadManager.setOnline(true);
    const beforeUnload = (event: BeforeUnloadEvent) => {
      if (
        uploadManager.store
          .getState()
          .items.some((item) =>
            ['queued', 'probing', 'uploading'].includes(item.status),
          )
      ) {
        event.preventDefault();
        event.returnValue = '';
      }
    };
    window.addEventListener('offline', offline);
    window.addEventListener('online', online);
    window.addEventListener('beforeunload', beforeUnload);
    return () => {
      window.removeEventListener('offline', offline);
      window.removeEventListener('online', online);
      window.removeEventListener('beforeunload', beforeUnload);
    };
  }, [toast]);
  useEffect(() => {
    if (cacheError)
      toast({
        tone: 'info',
        message:
          'your browser couldn’t save every file for refresh. keep this tab open until uploads finish.',
      });
  }, [cacheError, toast]);
  return children;
}
export function UploadsProvider({ children }: { children: ReactNode }) {
  return (
    <ToastProvider>
      <UploadLifecycle>{children}</UploadLifecycle>
    </ToastProvider>
  );
}
