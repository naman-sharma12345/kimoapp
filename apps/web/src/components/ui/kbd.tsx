import { forwardRef, type ComponentPropsWithoutRef } from 'react';
import { uiClassName } from '../../lib/variants';

export const Kbd = forwardRef<HTMLElement, ComponentPropsWithoutRef<'kbd'>>(
  function Kbd({ className, ...props }, ref) {
    return (
      <kbd ref={ref} className={uiClassName('ui-kbd', className)} {...props} />
    );
  },
);
