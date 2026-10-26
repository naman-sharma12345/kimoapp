import { forwardRef, type HTMLAttributes, type ReactNode } from 'react';
import { uiClassName } from '../../lib/variants';

export const Row = forwardRef<
  HTMLDivElement,
  Omit<HTMLAttributes<HTMLDivElement>, 'children'> & {
    label: ReactNode;
    value: ReactNode;
    dense?: boolean;
  }
>(function Row({ label, value, dense = false, className, ...props }, ref) {
  return (
    <div
      ref={ref}
      className={uiClassName('ui-row', className)}
      data-dense={dense || undefined}
      {...props}
    >
      <span className="ui-row-label">{label}</span>
      <span className="ui-row-value">{value}</span>
    </div>
  );
});
