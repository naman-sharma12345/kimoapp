import React from 'react';
import { useReducedMotion } from 'motion/react';
import type { ProjectStatus } from '../../types/projects';

export type StatusChipProps = {
  status: ProjectStatus;
  renderProgress?: number;
  variant?: 'pill' | 'inline';
  suppressOrange?: boolean;
};

export function StatusChip({
  status,
  renderProgress = 0.62,
  variant = 'pill',
  suppressOrange = false,
}: StatusChipProps) {
  const reducedMotion = useReducedMotion();

  if (status === 'done') {
    return null;
  }

  let label = '';
  let dotColor = 'var(--cream-38)';
  let textColor = 'var(--cream-100)';
  let isPulsing = false;

  switch (status) {
    case 'editing':
      label = 'editing now';
      dotColor = suppressOrange ? 'var(--cream-100)' : 'var(--orange)';
      textColor = 'var(--cream-100)';
      isPulsing = !suppressOrange;
      break;
    case 'awaiting_review':
      label = 'ready to review';
      dotColor = 'var(--cream-100)';
      textColor = 'var(--cream-100)';
      break;
    case 'rendering': {
      const pct = Math.round(Math.min(1, Math.max(0, renderProgress)) * 100);
      label = `rendering ${pct}%`;
      dotColor = 'var(--cream-60)';
      textColor = 'var(--cream-100)';
      break;
    }
    case 'failed':
      label = 'failed';
      dotColor = 'var(--danger)';
      textColor = 'var(--cream-100)';
      break;
    case 'draft':
      label = 'draft';
      dotColor = 'var(--cream-38)';
      textColor = 'var(--cream-60)';
      break;
  }

  const isInline = variant === 'inline';

  return (
    <span
      className="t-11 tabular-nums"
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: '6px',
        height: isInline ? 'auto' : '22px',
        padding: isInline ? '0' : '0 8px',
        borderRadius: isInline ? '0' : '999px',
        backgroundColor: isInline ? 'transparent' : 'var(--scrim-72)',
        border: isInline ? 'none' : '1px solid var(--line)',
        color: textColor,
        whiteSpace: 'nowrap',
      }}
    >
      <span
        style={{
          position: 'relative',
          display: 'inline-flex',
          width: '6px',
          height: '6px',
          flexShrink: 0,
        }}
      >
        {isPulsing && !reducedMotion && (
          <span
            className="pulse-ring"
            style={{
              position: 'absolute',
              inset: 0,
              borderRadius: '999px',
              backgroundColor: dotColor,
            }}
          />
        )}
        <span
          style={{
            position: 'relative',
            width: '6px',
            height: '6px',
            borderRadius: '999px',
            backgroundColor: dotColor,
          }}
        />
      </span>
      <span>{label}</span>
    </span>
  );
}
