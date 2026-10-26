import { forwardRef, type HTMLAttributes } from 'react';
import { uiClassName } from '../../lib/variants';

export const Skeleton = forwardRef<
  HTMLDivElement,
  HTMLAttributes<HTMLDivElement> & { radius?: 4 | 6 | 8 | 12 | 20 | 'pill' }
>(function Skeleton({ radius = 8, className, ...props }, ref) {
  return (
    <div
      ref={ref}
      aria-hidden="true"
      className={uiClassName('ui-skeleton', className)}
      data-radius={radius}
      {...props}
    />
  );
});
