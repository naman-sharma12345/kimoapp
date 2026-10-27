'use client';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { uploadManager } from '@/lib/uploads/manager';
import { useSessionStore } from '@/stores/session';

export function StartNewVideo() {
  const router = useRouter();
  return (
    <Button
      variant="primary"
      onClick={() => {
        uploadManager.reset();
        useSessionStore.getState().reset();
        router.push('/');
      }}
    >
      start a new video
    </Button>
  );
}
