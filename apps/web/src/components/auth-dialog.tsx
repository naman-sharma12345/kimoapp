'use client';
import { useEffect, useRef, useState } from 'react';
import { KimoClient } from '@kimo/client';
import { Dialog, DialogClose, DialogContent } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';

export function AuthDialog({
  open,
  onOpenChange,
  trigger,
}: {
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  trigger?: React.ReactElement;
}) {
  const [mock, setMock] = useState(false);
  useEffect(() => {
    if (open !== false)
      void new KimoClient()
        .auth()
        .then((result) => setMock(result.mock))
        .catch(() => undefined);
  }, [open]);
  const opener = useRef<HTMLElement | null>(null);
  const [busy, setBusy] = useState(false);
  return (
    <Dialog
      open={open}
      onOpenChange={onOpenChange}
      trigger={trigger ?? <span hidden />}
    >
      <DialogContent
        onOpenAutoFocus={() => {
          opener.current =
            document.activeElement instanceof HTMLElement
              ? document.activeElement
              : null;
        }}
        onCloseAutoFocus={(e) => {
          if (!trigger) {
            e.preventDefault();
            const fallback = document.querySelector<HTMLElement>(
              '.landing-nav-actions > button, textarea[aria-label="describe your video"]',
            );
            (opener.current?.isConnected ? opener.current : fallback)?.focus({
              preventScroll: true,
            });
          }
        }}
        title="sign in to keep making videos"
        description="it’s free. we just need to stop bots draining the gpus."
        actions={
          <>
            <DialogClose asChild>
              <Button disabled={busy}>not now</Button>
            </DialogClose>
            <Button
              variant="primary"
              loading={busy}
              onClick={() => {
                setBusy(true);
                window.location.assign(
                  new KimoClient().googleSignInUrl(window.location.href),
                );
              }}
            >
              continue with google
            </Button>
          </>
        }
      >
        {mock ? (
          <p>demo sign-in · the mock does not connect to google.</p>
        ) : null}
      </DialogContent>
    </Dialog>
  );
}
