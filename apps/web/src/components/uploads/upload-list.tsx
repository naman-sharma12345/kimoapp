'use client';
import { AnimatePresence, motion } from 'motion/react';
import { attachmentMotion } from '@/lib/motion';
import { useReducedMotion } from '@/lib/use-reduced-motion';
import { uploadManager } from '@/lib/uploads/manager';
import type { UploadItem } from '@/lib/uploads/types';
import { UploadChip } from './upload-chip';

export function UploadList({ items }: { items: UploadItem[] }) {
  const reduced = useReducedMotion();
  return (
    <AnimatePresence
      initial={false}
      onExitComplete={() => uploadManager.pruneCanceled()}
    >
      {items.map((item, index) => (
        <motion.div
          className="landing-attachment-enter"
          key={item.localId}
          {...attachmentMotion(reduced, index)}
        >
          <UploadChip item={item} />
        </motion.div>
      ))}
    </AnimatePresence>
  );
}
