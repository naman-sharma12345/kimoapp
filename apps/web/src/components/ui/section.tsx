'use client';
import { forwardRef, useId, useState, type HTMLAttributes } from 'react';
import { ChevronRight } from 'lucide-react';
import { uiClassName } from '../../lib/variants';

export const Section = forwardRef<
  HTMLDivElement,
  HTMLAttributes<HTMLDivElement> & {
    label: string;
    collapsible?: boolean;
    defaultOpen?: boolean;
  }
>(function Section(
  {
    label,
    collapsible = false,
    defaultOpen = true,
    className,
    children,
    ...props
  },
  ref,
) {
  const [open, setOpen] = useState(defaultOpen);
  const id = useId();
  return (
    <div ref={ref} className={uiClassName('ui-section', className)} {...props}>
      {collapsible ? (
        <button
          className="ui-section-label"
          type="button"
          onClick={() => setOpen(!open)}
          aria-expanded={open}
          aria-controls={id}
        >
          <ChevronRight
            size={14}
            strokeWidth={1.5}
            data-open={open}
            aria-hidden="true"
          />
          {label}
        </button>
      ) : (
        <p className="ui-section-label">{label}</p>
      )}
      <div id={id} hidden={collapsible && !open} className="ui-section-content">
        {children}
      </div>
    </div>
  );
});
