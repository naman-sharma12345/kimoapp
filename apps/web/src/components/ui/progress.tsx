import { forwardRef, type HTMLAttributes } from 'react';
import { uiClassName } from '../../lib/variants';

export const Progress = forwardRef<
  HTMLDivElement,
  HTMLAttributes<HTMLDivElement> & {
    value?: number;
    thin?: boolean;
    running?: boolean;
    label: string;
  }
>(function Progress(
  { value, thin = false, running = false, label, className, ...props },
  ref,
) {
  const pct = value === undefined ? undefined : Math.min(1, Math.max(0, value));
  return (
    <div
      ref={ref}
      role="progressbar"
      aria-label={label}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={pct === undefined ? undefined : Math.round(pct * 100)}
      className={uiClassName('ui-progress', className)}
      data-thin={thin || undefined}
      data-running={running || undefined}
      data-indeterminate={pct === undefined || undefined}
      {...props}
    >
      <span
        style={pct === undefined ? undefined : { width: `${pct * 100}%` }}
      />
    </div>
  );
});
