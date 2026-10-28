import { AnimatePresence, motion, useReducedMotion } from 'motion/react';
import { DUR, EASE } from '../../lib/motion';
import { CAPTION_WORDS, TITLE_WORDS } from '../../lib/stage-logic';
import type { StageFrameState } from '../../types/sign-in';

export interface StageViewerProps {
  frame: StageFrameState;
}

/**
 * Part A of the Stage:
 * A 16:9 rectangle (640 x 360), bg #0B0B0C, r12, inner hairline inset 0 0 0 1px rgb(245 241 231 / 0.06).
 * Plays an abstract "film" made of simple shapes in 3 scenes ("dawn", "road", "title"),
 * with karaoke captions, color grade tag, and 30fps tabular timecode.
 */
export function StageViewer({ frame }: StageViewerProps) {
  const prefersReducedMotion = useReducedMotion();

  // Ease-out curve for Scene 1 sun rise and mountain pan
  const easedDawn =
    1 - Math.pow(1 - Math.max(0, Math.min(1, frame.sceneProgress)), 3);
  // Sun rises from below the 62% horizon (74%) to 40% height
  const sunTopPercent = 74 - easedDawn * 34;
  // Mountains slide 12px left over Scene 1
  const mountainPanPx = -easedDawn * 12;

  // Road dash offset streaming toward the viewer in Scene 2
  const dashOffset = -(frame.sceneProgress * 96);

  return (
    <div
      className="relative w-full overflow-hidden select-none"
      style={{
        aspectRatio: '16 / 9',
        backgroundColor: 'var(--viewer-bg)',
        borderRadius: 'var(--r-12)',
        boxShadow:
          'inset 0 0 0 1px var(--viewer-hairline), 0 24px 64px -24px rgb(0 0 0 / 0.8)',
      }}
    >
      {/* EMPTY SCENE (0.0s to 0.8s) */}
      {frame.scene === 'empty' && (
        <div className="absolute inset-0 flex items-center justify-center">
          <span className="t-12" style={{ color: 'var(--cream-38)' }}>
            drop in clips to start
          </span>
        </div>
      )}

      {/* SCENE 1: DAWN (0.0s to 2.4s) */}
      {frame.scene === 'dawn' && (
        <div className="absolute inset-0 overflow-hidden">
          {/* Layered dawn sky: deep ink at top warming to amber at the horizon */}
          <div
            className="absolute inset-0"
            style={{
              background: `linear-gradient(180deg,
                #07070a 0%,
                #0d0b10 34%,
                #1d1410 56%,
                #3a2216 70%,
                #6b3a1c 82%,
                #a85c24 92%,
                #d97e36 100%)`,
              opacity: 0.35 + easedDawn * 0.65,
            }}
          />

          {/* Fading star field (first 40% of the scene) */}
          <svg
            viewBox="0 0 640 360"
            className="absolute inset-0 w-full h-full"
            preserveAspectRatio="none"
            style={{ opacity: Math.max(0, 1 - easedDawn * 1.8) }}
          >
            {[
              [84, 46, 1.4],
              [180, 78, 1],
              [268, 32, 1.2],
              [352, 64, 0.9],
              [442, 40, 1.3],
              [530, 84, 1],
              [600, 50, 1.1],
            ].map(([cx, cy, r], i) => (
              <circle
                key={i}
                cx={cx}
                cy={cy}
                r={r}
                fill="var(--cream-100)"
                opacity={0.5}
              />
            ))}
          </svg>

          {/* Sun: warm glowing orb with a soft halo, rising from behind the horizon */}
          <div
            style={{
              position: 'absolute',
              left: '50%',
              top: `${sunTopPercent}%`,
              width: 140,
              height: 140,
              marginLeft: -70,
              marginTop: -70,
              borderRadius: 'var(--r-pill)',
              background:
                'radial-gradient(circle, rgb(255 158 84 / 0.55) 0%, rgb(255 122 48 / 0.22) 45%, transparent 70%)',
            }}
          />
          <div
            style={{
              position: 'absolute',
              left: '50%',
              top: `${sunTopPercent}%`,
              width: 56,
              height: 56,
              marginLeft: -28,
              marginTop: -28,
              borderRadius: 'var(--r-pill)',
              background:
                'radial-gradient(circle at 42% 38%, #ffd9a8 0%, #ff9e54 55%, #ff7a30 100%)',
              boxShadow: '0 0 24px rgb(255 122 48 / 0.45)',
            }}
          />

          {/* Two filled mountain ridge silhouettes sliding 12px left */}
          <svg
            viewBox="0 0 640 360"
            className="absolute inset-0 w-full h-full"
            preserveAspectRatio="none"
            style={{
              transform: `translateX(${mountainPanPx}px)`,
            }}
          >
            {/* Far ridge, lighter warm haze */}
            <polygon
              points="-20,223 95,168 190,210 310,148 435,208 555,162 670,223 670,360 -20,360"
              fill="#3d2f28"
              opacity={0.85}
            />
            {/* Near ridge, darker ink */}
            <polygon
              points="40,223 160,184 265,215 395,166 510,204 665,178 665,360 40,360"
              fill="#151013"
              opacity={0.95}
            />
          </svg>

          {/* Warm light band along the horizon line at 62% */}
          <div
            style={{
              position: 'absolute',
              left: 0,
              right: 0,
              top: '61%',
              height: 2,
              background:
                'linear-gradient(90deg, transparent, rgb(255 158 84 / 0.6) 35%, rgb(255 190 120 / 0.85) 50%, rgb(255 158 84 / 0.6) 65%, transparent)',
              opacity: easedDawn,
            }}
          />

          {/* Occlusion mask below horizon so sun/mountains rise from behind it */}
          <div
            style={{
              position: 'absolute',
              left: 0,
              right: 0,
              top: 'calc(62% + 1px)',
              bottom: 0,
              backgroundColor: 'var(--viewer-bg)',
            }}
          />
        </div>
      )}

      {/* SCENE 2: ROAD (2.4s to 4.8s, hard cut) */}
      {frame.scene === 'road' && (
        <div
          className="absolute inset-0 overflow-hidden"
          style={{
            backgroundColor: frame.isWarmGraded
              ? 'var(--ink-1)'
              : 'var(--viewer-bg)',
            transition: `background-color var(--dur-4) var(--ease-out)`,
          }}
        >
          {/* Sky: dusk gradient deepening warm when graded */}
          <div
            className="absolute inset-x-0 top-0"
            style={{
              height: '52.2%',
              background: frame.isWarmGraded
                ? 'linear-gradient(180deg, #0a0809 0%, #221510 55%, #5a3018 88%, #a05c26 100%)'
                : 'linear-gradient(180deg, #08080a 0%, #101013 60%, #1b1b20 100%)',
              transition: 'all var(--dur-4) var(--ease-out)',
            }}
          />

          {/* Glow bleeding up from the vanishing point */}
          <div
            className="absolute"
            style={{
              left: '50%',
              top: '52%',
              width: '70%',
              height: '30%',
              transform: 'translate(-50%, -50%)',
              background:
                'radial-gradient(closest-side, rgb(255 140 60 / 0.28), transparent 100%)',
              opacity: frame.isWarmGraded ? 1 : 0.35,
              transition: 'opacity var(--dur-4) var(--ease-out)',
            }}
          />

          {/* Ground plane below the horizon */}
          <div
            className="absolute inset-x-0 bottom-0"
            style={{
              height: '47.8%',
              background: frame.isWarmGraded
                ? 'linear-gradient(180deg, #241612 0%, #120d0c 100%)'
                : 'linear-gradient(180deg, #111114 0%, #0a0a0c 100%)',
              transition: 'all var(--dur-4) var(--ease-out)',
            }}
          />

          <svg
            viewBox="0 0 640 360"
            className="absolute inset-0 w-full h-full"
            preserveAspectRatio="none"
          >
            {/* Road surface: filled asphalt converging to the vanishing point */}
            <polygon
              points="110,360 320,188 530,360"
              style={{
                fill: frame.isWarmGraded ? '#3a251b' : '#18181b',
                transition: `fill var(--dur-4) var(--ease-out)`,
              }}
            />

            {/* Horizon line at vanishing point */}
            <line
              x1="0"
              y1="188"
              x2="640"
              y2="188"
              strokeWidth="1"
              style={{
                stroke: frame.isWarmGraded
                  ? 'rgb(255 170 100 / 0.5)'
                  : 'var(--cream-16)',
                transition: `stroke var(--dur-4) var(--ease-out)`,
              }}
            />

            {/* Road edge lines converging to the center vanishing point (320, 188) */}
            <line
              x1="110"
              y1="360"
              x2="320"
              y2="188"
              strokeWidth="2"
              style={{
                stroke: frame.isWarmGraded
                  ? 'rgb(255 200 150 / 0.55)'
                  : 'rgb(245 241 231 / 0.35)',
                transition: `stroke var(--dur-4) var(--ease-out)`,
              }}
            />
            <line
              x1="530"
              y1="360"
              x2="320"
              y2="188"
              strokeWidth="2"
              style={{
                stroke: frame.isWarmGraded
                  ? 'rgb(255 200 150 / 0.55)'
                  : 'rgb(245 241 231 / 0.35)',
                transition: `stroke var(--dur-4) var(--ease-out)`,
              }}
            />

            {/* Dashed center line streaming toward the viewer */}
            <line
              x1="320"
              y1="188"
              x2="320"
              y2="360"
              strokeWidth="3"
              strokeDasharray="18 14"
              strokeDashoffset={dashOffset}
              style={{
                stroke: frame.isWarmGraded ? '#e8a35c' : '#3c3a40',
                transition: `stroke var(--dur-4) var(--ease-out)`,
              }}
            />
          </svg>

          {/* Warm film bloom + vignette when graded */}
          <div
            className="absolute inset-0 pointer-events-none"
            style={{
              background:
                'radial-gradient(ellipse at center, transparent 45%, rgb(20 8 4 / 0.5) 100%)',
              opacity: frame.isWarmGraded ? 1 : 0.4,
              transition: 'opacity var(--dur-4) var(--ease-out)',
            }}
          />
        </div>
      )}

      {/* Top-left Grade Tag during Scene 2 color grade */}
      <AnimatePresence>
        {frame.showGradeTag && (
          <motion.div
            key="grade-tag"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{
              duration: prefersReducedMotion ? DUR.dur2 : DUR.dur3,
              ease: EASE.easeOut,
            }}
            className="t-11 absolute flex items-center"
            style={{
              top: 'var(--space-12)',
              left: 'var(--space-12)',
              backgroundColor: 'var(--ink-2)',
              color: 'var(--cream-60)',
              borderRadius: 'var(--r-4)',
              padding: '2px 6px',
              gap: 'var(--space-6)',
              textTransform: 'lowercase',
            }}
          >
            {/* 6px orange dot before the text (only orange in the stage at that moment) */}
            <span
              style={{
                width: 6,
                height: 6,
                borderRadius: 'var(--r-pill)',
                backgroundColor: 'var(--orange)',
                flexShrink: 0,
              }}
            />
            <span>grade · warm film</span>
          </motion.div>
        )}
      </AnimatePresence>

      {/* SCENE 3: TITLE (4.8s to 7.2s, cut to black #0B0B0C) */}
      {frame.scene === 'title' && (
        <div className="absolute inset-0 flex flex-col items-center justify-center px-4 text-center">
          <div
            className="font-serif-italic flex flex-wrap items-center justify-center"
            style={{
              fontSize: 'clamp(28px, 4.2vw, 44px)',
              lineHeight: 1.05,
              color: 'var(--cream-100)',
              gap: '0.26em',
            }}
          >
            {TITLE_WORDS.map((word, index) => (
              <motion.span
                key={word}
                initial={
                  prefersReducedMotion
                    ? { opacity: 1, y: 0 }
                    : { opacity: 0, y: 8 }
                }
                animate={{ opacity: 1, y: 0 }}
                transition={{
                  duration: prefersReducedMotion ? DUR.dur2 : DUR.dur4,
                  ease: EASE.easeOut,
                  delay: prefersReducedMotion ? 0 : index * 0.09,
                }}
              >
                {word}
              </motion.span>
            ))}
          </div>

          <motion.span
            initial={prefersReducedMotion ? { opacity: 1 } : { opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{
              duration: prefersReducedMotion ? DUR.dur2 : DUR.dur4,
              ease: EASE.easeOut,
              delay: prefersReducedMotion ? 0 : 0.36,
            }}
            className="t-11"
            style={{
              marginTop: 'var(--space-8)',
              color: 'var(--cream-38)',
              textTransform: 'lowercase',
            }}
          >
            a film by you
          </motion.span>
        </div>
      )}

      {/* Karaoke Caption Bar (centered 20px above viewer bottom edge during scenes 1 & 2) */}
      {frame.showCaptions && (
        <div
          className="t-13 absolute left-1/2 -translate-x-1/2 flex items-center whitespace-nowrap"
          style={{
            bottom: 'var(--space-20)',
            backgroundColor: 'var(--caption-scrim)',
            borderRadius: 'var(--r-6)',
            border: '1px solid var(--line)',
            backdropFilter: 'blur(6px)',
            WebkitBackdropFilter: 'blur(6px)',
            padding: '4px 10px',
            gap: 'var(--space-4)',
          }}
        >
          {CAPTION_WORDS.map((word, idx) => {
            const isHighlighted = idx < frame.activeWordCount;
            return (
              <span
                key={`${word}-${idx}`}
                style={{
                  color: isHighlighted ? 'var(--cream-100)' : 'var(--cream-38)',
                  transition: `color var(--dur-2) var(--ease-out)`,
                }}
              >
                {word}
              </span>
            );
          })}
        </div>
      )}

      {/* Timecode in viewer bottom-right corner, 12px from edges */}
      <div
        className="font-mono-kimo t-12 absolute"
        style={{
          right: 'var(--space-12)',
          bottom: 'var(--space-12)',
          color: 'var(--cream-60)',
        }}
      >
        {frame.timecode}
      </div>
    </div>
  );
}
