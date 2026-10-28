import React from 'react';
import { motion, useReducedMotion } from 'motion/react';
import { EASE } from '../../lib/motion';

export type EmptyStateProps = {
  onMakeFirstVideo: () => void;
};

export function EmptyState({ onMakeFirstVideo }: EmptyStateProps) {
  const reducedMotion = useReducedMotion();

  const frames = [
    { rotate: -4, left: '16px', top: '12px', delay: 0 },
    { rotate: 0, left: '68px', top: '6px', delay: 2 },
    { rotate: 4, left: '120px', top: '12px', delay: 4 },
  ] as const;

  return (
    <div
      style={{
        position: 'relative',
        minHeight: 'calc(100vh - 200px)',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        textAlign: 'center',
        padding: '48px 24px',
        overflow: 'hidden',
      }}
    >
      {/* Horizon glow behind empty state, centered 160px below the button */}
      <div
        className="horizon-glow"
        style={{
          position: 'absolute',
          left: '50%',
          top: 'calc(50% + 220px)',
          transform: 'translate(-50%, -50%)',
        }}
      />

      {/* Composition, 240 x 120, of three empty poster frames fanned slightly (-4deg, 0, 4deg) drifting 2px up and down out of phase over 6s */}
      <div
        aria-hidden="true"
        style={{
          position: 'relative',
          width: '240px',
          height: '120px',
          zIndex: 1,
        }}
      >
        {frames.map((frame, i) => (
          <motion.div
            key={i}
            animate={
              reducedMotion
                ? { y: 0, rotate: frame.rotate }
                : {
                    y: [-2, 2, -2],
                    rotate: frame.rotate,
                  }
            }
            transition={
              reducedMotion
                ? { duration: 0 }
                : {
                    duration: 6,
                    ease: EASE.inOut,
                    repeat: Infinity,
                    delay: frame.delay,
                  }
            }
            style={{
              position: 'absolute',
              left: frame.left,
              top: frame.top,
              width: '104px',
              height: '68px',
              borderRadius: '8px',
              border: '1px dashed var(--line-strong)',
              backgroundColor: 'var(--ink-1)',
            }}
          />
        ))}
      </div>

      {/* 32px gap, t-28 cream-100 "nothing here yet" */}
      <h2
        className="t-28"
        style={{
          marginTop: '32px',
          marginBottom: 0,
          color: 'var(--cream-100)',
          position: 'relative',
          zIndex: 1,
        }}
      >
        nothing here yet
      </h2>

      {/* 8px gap, t-15 cream-60 "every video you make with kimo shows up here." */}
      <p
        className="t-15"
        style={{
          marginTop: '8px',
          marginBottom: 0,
          color: 'var(--cream-60)',
          position: 'relative',
          zIndex: 1,
        }}
      >
        every video you make with kimo shows up here.
      </p>

      {/* 24px gap, primary lg button "make your first video" (links "/") */}
      <div style={{ marginTop: '24px', position: 'relative', zIndex: 1 }}>
        <a
          href="/"
          onClick={(e) => {
            e.preventDefault();
            onMakeFirstVideo();
          }}
          className="btn-base btn-primary h-40 t-15"
        >
          make your first video
        </a>
      </div>

      {/* 12px gap, t-12 cream-38 "or drop clips anywhere on this page to start" */}
      <p
        className="t-12"
        style={{
          marginTop: '12px',
          marginBottom: 0,
          color: 'var(--cream-38)',
          position: 'relative',
          zIndex: 1,
        }}
      >
        or drop clips anywhere on this page to start
      </p>
    </div>
  );
}
