'use client';
import * as Radix from '@radix-ui/react-scroll-area';
import { forwardRef, type ComponentPropsWithoutRef } from 'react';
import { uiClassName } from '../../lib/variants';

export const ScrollArea = forwardRef<
  HTMLDivElement,
  ComponentPropsWithoutRef<typeof Radix.Root>
>(function ScrollArea({ className, children, ...props }, ref) {
  return (
    <Radix.Root
      ref={ref}
      type="hover"
      className={uiClassName('ui-scroll-area', className)}
      {...props}
    >
      <Radix.Viewport
        className="ui-scroll-viewport"
        tabIndex={0}
        role="region"
        aria-label={
          typeof props['aria-label'] === 'string'
            ? props['aria-label']
            : 'scrollable content'
        }
      >
        {children}
      </Radix.Viewport>
      <Radix.Scrollbar className="ui-scrollbar" orientation="vertical">
        <Radix.Thumb className="ui-scroll-thumb" />
      </Radix.Scrollbar>
      <Radix.Scrollbar className="ui-scrollbar" orientation="horizontal">
        <Radix.Thumb className="ui-scroll-thumb" />
      </Radix.Scrollbar>
      <Radix.Corner />
    </Radix.Root>
  );
});
