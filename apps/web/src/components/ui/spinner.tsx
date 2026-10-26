import { forwardRef, type SVGProps } from 'react';
import { uiClassName } from '../../lib/variants';

export const Spinner = forwardRef<
  SVGSVGElement,
  Omit<SVGProps<SVGSVGElement>, 'size'> & { size?: 14 | 20; label?: string }
>(function Spinner({ size = 14, label = 'loading', className, ...props }, ref) {
  return (
    <svg
      ref={ref}
      className={uiClassName('ui-spinner', className)}
      data-size={size}
      viewBox="0 0 20 20"
      fill="none"
      role="status"
      aria-label={label}
      {...props}
    >
      <circle
        cx="10"
        cy="10"
        r="8"
        stroke="currentColor"
        strokeWidth="1.5"
        opacity="0.16"
      />
      <path
        d="M10 2a8 8 0 0 1 8 8"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
      />
    </svg>
  );
});
