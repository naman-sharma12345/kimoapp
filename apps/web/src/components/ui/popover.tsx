'use client';
import * as Radix from '@radix-ui/react-popover';
import {
  forwardRef,
  type ComponentPropsWithoutRef,
  type ReactElement,
  type ReactNode,
} from 'react';
import { uiClassName } from '../../lib/variants';
import { portalContainer } from '../../lib/portal';

export function Popover({
  trigger,
  children,
  label,
  ...props
}: ComponentPropsWithoutRef<typeof Radix.Root> & {
  trigger: ReactElement;
  children: ReactNode;
  label: string;
}) {
  return (
    <Radix.Root {...props}>
      <Radix.Trigger asChild>{trigger}</Radix.Trigger>
      <Radix.Portal container={portalContainer()}>
        <PopoverContent aria-label={label}>{children}</PopoverContent>
      </Radix.Portal>
    </Radix.Root>
  );
}
export const PopoverContent = forwardRef<
  HTMLDivElement,
  ComponentPropsWithoutRef<typeof Radix.Content>
>(function PopoverContent({ className, sideOffset = 6, ...props }, ref) {
  return (
    <Radix.Content
      ref={ref}
      sideOffset={sideOffset}
      className={uiClassName('ui-menu ui-popover', className)}
      {...props}
    />
  );
});
export const PopoverClose = Radix.Close;
