import { useReducedMotion } from 'motion/react';

/**
 * VARIANT "error" (500, error boundary) illustration:
 * The same 160 x 90 viewer rectangle (#0B0B0C, r8, hairline inset) showing a "dropped frame":
 * a frozen abstract frame (horizon line + circle) with 3 horizontal glitch slices
 * offset by 4 to 12px that snap back into place every 2.4s (each slice translateX with steps(2), 120ms),
 * never colorful, only the existing tints.
 */
export function ErrorIllustration() {
  const shouldReduceMotion = Boolean(useReducedMotion());

  const renderAbstractFrame = () => (
    <svg
      width="160"
      height="90"
      viewBox="0 0 160 90"
      fill="none"
      aria-hidden="true"
      style={{ display: 'block', width: '160px', height: '90px' }}
    >
      {/* Subtle upper sky & lower ground blocks using existing track tints */}
      <rect x="0" y="0" width="160" height="54" fill="var(--viewer-bg)" />
      <rect x="0" y="54" width="160" height="36" fill="var(--track-text)" />
      {/* Abstract circle (sun/subject) in existing video track tint */}
      <circle
        cx="80"
        cy="42"
        r="16"
        fill="var(--track-video)"
        stroke="var(--line-strong)"
        strokeWidth="1"
      />
      {/* Horizon line */}
      <line
        x1="0"
        y1="54"
        x2="160"
        y2="54"
        stroke="var(--cream-16)"
        strokeWidth="1"
      />
    </svg>
  );

  return (
    <div
      data-testid="error-illustration"
      aria-label="dropped frame viewer"
      style={{
        width: '160px',
        height: '90px',
        borderRadius: 'var(--r-8)',
        backgroundColor: 'var(--viewer-bg)',
        boxShadow: 'inset 0 0 0 1px var(--line)',
        position: 'relative',
        overflow: 'hidden',
      }}
    >
      {/* Base frame */}
      <div style={{ position: 'absolute', inset: 0 }}>
        {renderAbstractFrame()}
      </div>

      {/* Horizontal glitch slice 1 (top band of circle) */}
      <div
        className={shouldReduceMotion ? undefined : 'glitch-slice-1'}
        style={{
          position: 'absolute',
          inset: 0,
          clipPath: 'inset(24px 0 50px 0)',
          ...(shouldReduceMotion ? { transform: 'translateX(0px)' } : {}),
        }}
      >
        {renderAbstractFrame()}
      </div>

      {/* Horizontal glitch slice 2 (mid circle & horizon band) */}
      <div
        className={shouldReduceMotion ? undefined : 'glitch-slice-2'}
        style={{
          position: 'absolute',
          inset: 0,
          clipPath: 'inset(40px 0 34px 0)',
          ...(shouldReduceMotion ? { transform: 'translateX(0px)' } : {}),
        }}
      >
        {renderAbstractFrame()}
      </div>

      {/* Horizontal glitch slice 3 (horizon & lower frame band) */}
      <div
        className={shouldReduceMotion ? undefined : 'glitch-slice-3'}
        style={{
          position: 'absolute',
          inset: 0,
          clipPath: 'inset(52px 0 22px 0)',
          ...(shouldReduceMotion ? { transform: 'translateX(0px)' } : {}),
        }}
      >
        {renderAbstractFrame()}
      </div>

      {/* Hairline inset border on top of slices */}
      <div
        style={{
          position: 'absolute',
          inset: 0,
          borderRadius: 'var(--r-8)',
          boxShadow: 'inset 0 0 0 1px var(--line)',
          pointerEvents: 'none',
        }}
      />
    </div>
  );
}
