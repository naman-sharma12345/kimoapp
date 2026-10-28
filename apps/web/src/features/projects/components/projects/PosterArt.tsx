import React, { useEffect, useRef } from 'react';
import { motion, useReducedMotion } from 'motion/react';
import { getPosterSeedSpec } from '../../lib/projectsLogic';
import { DUR, EASE } from '../../lib/motion';
import type { ProjectAspect } from '../../types/projects';

export type PosterArtProps = {
  projectId: string;
  title: string;
  aspect: ProjectAspect;
  posterUrl?: string;
  previewUrl?: string;
  isPreviewActive: boolean;
  scrubProgress: number | null; // 0..1 when scrubbing
  compact?: boolean; // true for 96x60 list thumb
};

export function PosterArt({
  projectId,
  title,
  aspect,
  posterUrl,
  previewUrl,
  isPreviewActive,
  scrubProgress,
  compact = false,
}: PosterArtProps) {
  const reducedMotion = useReducedMotion();
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const spec = getPosterSeedSpec(projectId);

  useEffect(() => {
    const vid = videoRef.current;
    if (!vid || !previewUrl) return;
    if (isPreviewActive) {
      if (scrubProgress === null) {
        vid.currentTime = 0;
        vid.play().catch(() => {});
      }
    } else {
      vid.pause();
      vid.currentTime = 0;
    }
  }, [isPreviewActive, previewUrl, scrubProgress]);

  useEffect(() => {
    const vid = videoRef.current;
    if (!vid || !previewUrl || scrubProgress === null) return;
    const duration =
      Number.isFinite(vid.duration) && vid.duration > 0 ? vid.duration : 6;
    vid.currentTime = Math.max(0, Math.min(duration, scrubProgress * duration));
  }, [scrubProgress, previewUrl]);

  // Aspect inner dimensions inside 16:10 frame (letterboxed on #0B0B0C for 9:16 and 1:1)
  const getInnerBoxStyle = (): React.CSSProperties => {
    if (aspect === '9:16') {
      return {
        width: '36%',
        height: '100%',
        borderLeft: '1px solid var(--line)',
        borderRight: '1px solid var(--line)',
      };
    }
    if (aspect === '1:1') {
      return {
        width: '62.5%',
        height: '100%',
        borderLeft: '1px solid var(--line)',
        borderRight: '1px solid var(--line)',
      };
    }
    return {
      width: '100%',
      height: '100%',
    };
  };

  // Calculate drift & push-in scale for generated art
  const activeScale =
    !reducedMotion && isPreviewActive
      ? scrubProgress !== null
        ? 1 + scrubProgress * 0.04
        : 1.04
      : 1;

  const activeDriftX =
    !reducedMotion && isPreviewActive
      ? scrubProgress !== null
        ? (scrubProgress - 0.5) * 16
        : 8
      : 0;

  const activeDriftY =
    !reducedMotion && isPreviewActive
      ? scrubProgress !== null
        ? (0.5 - scrubProgress) * 6
        : -4
      : 0;

  const transitionSpec =
    scrubProgress !== null
      ? { duration: DUR.dur1, ease: EASE.out }
      : isPreviewActive && !reducedMotion
        ? { duration: 6, ease: EASE.inOut }
        : { duration: DUR.dur3, ease: EASE.out };

  return (
    <div
      style={{
        position: 'relative',
        width: '100%',
        height: '100%',
        backgroundColor: 'var(--ink-letterbox)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        overflow: 'hidden',
      }}
    >
      <div
        style={{
          position: 'relative',
          overflow: 'hidden',
          backgroundColor: spec.bgTintVar,
          ...getInnerBoxStyle(),
        }}
      >
        {posterUrl && (
          <img
            src={posterUrl}
            alt={title}
            referrerPolicy="no-referrer"
            style={{
              position: 'absolute',
              inset: 0,
              width: '100%',
              height: '100%',
              objectFit: 'cover',
              opacity: isPreviewActive && previewUrl ? 0 : 1,
              transition: `opacity var(--dur-4) var(--ease-out)`,
            }}
          />
        )}

        {previewUrl && (
          <video
            ref={videoRef}
            src={previewUrl}
            muted
            loop
            playsInline
            style={{
              position: 'absolute',
              inset: 0,
              width: '100%',
              height: '100%',
              objectFit: 'cover',
              opacity: isPreviewActive ? 1 : 0,
              transition: `opacity var(--dur-4) var(--ease-out)`,
            }}
          />
        )}

        {!posterUrl && (
          <motion.div
            animate={{ scale: activeScale }}
            transition={transitionSpec}
            style={{
              position: 'absolute',
              inset: 0,
              width: '100%',
              height: '100%',
            }}
          >
            {/* Upper field: gradient sky deepening toward the horizon */}
            <div
              style={{
                position: 'absolute',
                top: 0,
                left: 0,
                right: 0,
                height: `${spec.horizonYPercent}%`,
                background: `linear-gradient(180deg, #0b0b0e 0%, ${spec.bgTintVar} 100%)`,
              }}
            />
            {/* Lower field below horizon: darker gradient ground */}
            <div
              style={{
                position: 'absolute',
                top: `${spec.horizonYPercent}%`,
                left: 0,
                right: 0,
                bottom: 0,
                background: `linear-gradient(180deg, ${spec.secondaryTintVar} 0%, #0a0a0c 100%)`,
                borderTop: '1px solid var(--line-strong)',
              }}
            />

            {/* Warm glow blooming near the horizon behind the motif */}
            <div
              style={{
                position: 'absolute',
                left: `${50 + spec.shapeOffsetX}%`,
                top: `${spec.horizonYPercent + spec.shapeOffsetY * 0.5}%`,
                width: '90%',
                height: '70%',
                transform: 'translate(-50%, -50%)',
                background:
                  'radial-gradient(closest-side, rgb(255 140 60 / 0.16), transparent 100%)',
                pointerEvents: 'none',
              }}
            />

            {/* Drifting geometric composition */}
            <motion.svg
              viewBox="0 0 200 125"
              preserveAspectRatio="xMidYMid slice"
              animate={{ x: activeDriftX, y: activeDriftY }}
              transition={transitionSpec}
              style={{
                position: 'absolute',
                inset: 0,
                width: '100%',
                height: '100%',
              }}
            >
              {spec.motif === 'circle_horizon' && (
                <g
                  transform={`translate(${100 + spec.shapeOffsetX}, ${
                    spec.horizonYPercent * 0.95 + spec.shapeOffsetY
                  })`}
                >
                  <circle
                    cx="0"
                    cy="0"
                    r={18 * spec.secondaryScale}
                    fill={spec.accentTintVar}
                    stroke="rgba(245, 241, 231, 0.22)"
                    strokeWidth="0.75"
                  />
                  <line
                    x1="-38"
                    y1="14"
                    x2="38"
                    y2="14"
                    stroke="rgba(245, 241, 231, 0.16)"
                    strokeWidth="0.75"
                  />
                </g>
              )}

              {spec.motif === 'road_perspective' && (
                <g>
                  <circle
                    cx={100 + spec.shapeOffsetX}
                    cy={spec.horizonYPercent * 1.25 - 16}
                    r={12 * spec.secondaryScale}
                    fill={spec.accentTintVar}
                    stroke="rgba(245, 241, 231, 0.2)"
                    strokeWidth="0.75"
                  />
                  <line
                    x1={100 + spec.shapeOffsetX}
                    y1={spec.horizonYPercent * 1.25}
                    x2={30 + spec.shapeOffsetX}
                    y2="125"
                    stroke="rgba(245, 241, 231, 0.22)"
                    strokeWidth="0.85"
                  />
                  <line
                    x1={100 + spec.shapeOffsetX}
                    y1={spec.horizonYPercent * 1.25}
                    x2={170 + spec.shapeOffsetX}
                    y2="125"
                    stroke="rgba(245, 241, 231, 0.22)"
                    strokeWidth="0.85"
                  />
                </g>
              )}

              {spec.motif === 'vertical_bars' && (
                <g
                  transform={`translate(${76 + spec.shapeOffsetX}, ${28 + spec.shapeOffsetY})`}
                >
                  <rect
                    x="0"
                    y="10"
                    width="8"
                    height="42"
                    rx="2"
                    fill={spec.accentTintVar}
                    stroke="rgba(245, 241, 231, 0.18)"
                    strokeWidth="0.6"
                  />
                  <rect
                    x="14"
                    y="0"
                    width="8"
                    height="56"
                    rx="2"
                    fill={spec.bgTintVar}
                    stroke="rgba(245, 241, 231, 0.24)"
                    strokeWidth="0.6"
                  />
                  <rect
                    x="28"
                    y="16"
                    width="8"
                    height="36"
                    rx="2"
                    fill={spec.accentTintVar}
                    stroke="rgba(245, 241, 231, 0.18)"
                    strokeWidth="0.6"
                  />
                  <rect
                    x="42"
                    y="24"
                    width="8"
                    height="28"
                    rx="2"
                    fill={spec.secondaryTintVar}
                    stroke="rgba(245, 241, 231, 0.18)"
                    strokeWidth="0.6"
                  />
                </g>
              )}

              {spec.motif === 'architectural_grid' && (
                <g
                  transform={`translate(${66 + spec.shapeOffsetX}, ${24 + spec.shapeOffsetY})`}
                >
                  <rect
                    x="0"
                    y="0"
                    width="68"
                    height="48"
                    fill={spec.accentTintVar}
                    stroke="rgba(245, 241, 231, 0.2)"
                    strokeWidth="0.75"
                  />
                  <line
                    x1="22"
                    y1="0"
                    x2="22"
                    y2="48"
                    stroke="rgba(245, 241, 231, 0.14)"
                    strokeWidth="0.6"
                  />
                  <line
                    x1="45"
                    y1="0"
                    x2="45"
                    y2="48"
                    stroke="rgba(245, 241, 231, 0.14)"
                    strokeWidth="0.6"
                  />
                  <line
                    x1="0"
                    y1="24"
                    x2="68"
                    y2="24"
                    stroke="rgba(245, 241, 231, 0.14)"
                    strokeWidth="0.6"
                  />
                </g>
              )}
            </motion.svg>

            {/* Cinematic vignette over the generated art */}
            <div
              style={{
                position: 'absolute',
                inset: 0,
                background:
                  'radial-gradient(ellipse at center, transparent 50%, rgb(0 0 0 / 0.45) 100%)',
                pointerEvents: 'none',
              }}
            />

            {/* A24-style small title card in Instrument Serif italic */}
            {!compact && (
              <div
                style={{
                  position: 'absolute',
                  left: '12px',
                  right: '12px',
                  bottom: '28px',
                  textAlign: 'center',
                  pointerEvents: 'none',
                }}
              >
                <span
                  className="font-serif-italic"
                  style={{
                    fontSize: aspect === '9:16' ? '12px' : '15px',
                    lineHeight: '18px',
                    color: 'var(--cream-60)',
                    letterSpacing: '0.01em',
                    display: 'block',
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    whiteSpace: 'nowrap',
                  }}
                >
                  {title}
                </span>
              </div>
            )}
          </motion.div>
        )}
      </div>
    </div>
  );
}
