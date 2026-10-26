'use client';
import { useState, useSyncExternalStore } from 'react';
import { motion } from 'motion/react';
import { RotateCcw } from 'lucide-react';
import { durations, easings, motionDemo } from '@/lib/motion';

function subscribeMotion(onChange: () => void) {
  const media = window.matchMedia('(prefers-reduced-motion: reduce)');
  media.addEventListener('change', onChange);
  return () => media.removeEventListener('change', onChange);
}
const motionPreference = () =>
  window.matchMedia('(prefers-reduced-motion: reduce)').matches;
const serverMotionPreference = () => false;

export function MotionDemos() {
  const [iteration, replay] = useState(0);
  const reduced = useSyncExternalStore(
    subscribeMotion,
    motionPreference,
    serverMotionPreference,
  );
  return (
    <>
      <div className="mb-6 flex items-center gap-4">
        <button
          type="button"
          className="replay"
          onClick={() => replay((value) => value + 1)}
        >
          <RotateCcw size={14} strokeWidth={1.5} aria-hidden="true" />
          replay motion
        </button>
        <p className="text-t12 text-cream-60" aria-live="polite">
          {reduced
            ? 'reduced motion · opacity only'
            : '24px square · 64px travel'}
        </p>
      </div>
      <div className="motion-grid">
        {(Object.keys(easings) as (keyof typeof easings)[]).flatMap((easing) =>
          (Object.keys(durations) as (keyof typeof durations)[]).map(
            (duration) => (
              <div className="specimen" key={`${easing}-${duration}`}>
                <div className="motion-lane">
                  <motion.div
                    data-motion-square
                    className="motion-square"
                    key={iteration}
                    {...(iteration
                      ? motionDemo(duration, easing, Boolean(reduced))
                      : {})}
                  />
                </div>
                <p className="font-mono text-t12">
                  {duration} · {durations[duration] * 1000}ms
                  <br />
                  <span className="text-cream-60">{easing}</span>
                </p>
              </div>
            ),
          ),
        )}
      </div>
      <p className="mt-6 font-mono text-t12 text-cream-60">
        snappy: 520 / 40 / 0.8 · soft: 260 / 32
      </p>
    </>
  );
}
