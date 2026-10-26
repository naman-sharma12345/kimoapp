'use client';
import * as Radix from '@radix-ui/react-tooltip';
import {
  forwardRef,
  type ComponentPropsWithoutRef,
  type ReactElement,
  type ReactNode,
} from 'react';
import { uiClassName } from '../../lib/variants';
import { Kbd } from './kbd';
import { uiTiming } from '../../lib/motion';
import { portalContainer } from '../../lib/portal';

export const TooltipContent = forwardRef<
  HTMLDivElement,
  ComponentPropsWithoutRef<typeof Radix.Content>
>(function TooltipContent({ className, sideOffset = 6, ...props }, ref) {
  return (
    <Radix.Content
      ref={ref}
      sideOffset={sideOffset}
      className={uiClassName('ui-tooltip', className)}
      {...props}
    />
  );
});
export function Tooltip({
  children,
  content,
  shortcut,
  side = 'top',
}: {
  children: ReactElement;
  content: ReactNode;
  shortcut?: string;
  side?: 'top' | 'right' | 'bottom' | 'left';
}) {
  return (
    <Radix.Provider delayDuration={uiTiming.tooltip} skipDelayDuration={0}>
      <Radix.Root>
        <Radix.Trigger asChild>{children}</Radix.Trigger>
        <Radix.Portal container={portalContainer()}>
          <TooltipContent side={side}>
            {content}
            {shortcut ? <Kbd>{shortcut}</Kbd> : null}
          </TooltipContent>
        </Radix.Portal>
      </Radix.Root>
    </Radix.Provider>
  );
}
