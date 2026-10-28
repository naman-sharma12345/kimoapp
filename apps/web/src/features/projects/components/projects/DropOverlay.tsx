import React from 'react';
import { AnimatePresence, motion, useReducedMotion } from 'motion/react';
import { Upload } from 'lucide-react';
import { TRANSITION } from '../../lib/motion';

export type DropOverlayProps = {
  visible: boolean;
};

export function DropOverlay({ visible }: DropOverlayProps) {
  const reducedMotion = useReducedMotion();

  return (
    <AnimatePresence>
      {visible && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={reducedMotion ? TRANSITION.reducedFade : TRANSITION.popIn}
          style={{
            position: 'fixed',
            inset: 0,
            zIndex: 70,
            backgroundColor: 'var(--scrim-82)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: '24px',
            pointerEvents: 'none',
          }}
        >
          <div
            style={{
              width: '100%',
              maxWidth: '560px',
              height: '300px',
              borderRadius: '20px',
              border: '2px dashed var(--line-drop)',
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '12px',
            }}
          >
            <Upload
              size={20}
              strokeWidth={1.5}
              style={{ color: 'var(--cream-60)' }}
            />
            <span className="t-17" style={{ color: 'var(--cream-100)' }}>
              drop to start a new video
            </span>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
