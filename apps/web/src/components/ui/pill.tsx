import { forwardRef, type HTMLAttributes } from 'react';
import { uiClassName } from '../../lib/variants';

export const Pill = forwardRef<
  HTMLSpanElement,
  HTMLAttributes<HTMLSpanElement> & {
    variant?: 'default' | 'live';
    active?: boolean;
  }
>(function Pill(
  { variant = 'default', active = false, className, children, ...props },
  ref,
) {
  return (
    <span
      ref={ref}
      className={uiClassName('ui-pill', className)}
      data-variant={variant}
      data-active={active || undefined}
      {...props}
    >
      {variant === 'live' ? (
        <span className="ui-live-dot" aria-hidden="true" />
      ) : null}
      {children}
    </span>
  );
});
