'use client';
import * as Radix from '@radix-ui/react-dropdown-menu';
import {
  forwardRef,
  type ComponentPropsWithoutRef,
  type ReactElement,
  type ReactNode,
} from 'react';
import type { LucideIcon } from 'lucide-react';
import { uiClassName } from '../../lib/variants';
import { Kbd } from './kbd';
import { portalContainer } from '../../lib/portal';

export function Menu({
  trigger,
  children,
  ...props
}: ComponentPropsWithoutRef<typeof Radix.Root> & {
  trigger: ReactElement;
  children: ReactNode;
}) {
  return (
    <Radix.Root modal={false} {...props}>
      <Radix.Trigger asChild>{trigger}</Radix.Trigger>
      <Radix.Portal container={portalContainer()}>
        <MenuContent>{children}</MenuContent>
      </Radix.Portal>
    </Radix.Root>
  );
}
export const MenuContent = forwardRef<
  HTMLDivElement,
  ComponentPropsWithoutRef<typeof Radix.Content>
>(function MenuContent({ className, sideOffset = 6, ...props }, ref) {
  return (
    <Radix.Content
      ref={ref}
      sideOffset={sideOffset}
      className={uiClassName('ui-menu', className)}
      {...props}
    />
  );
});
export const MenuItem = forwardRef<
  HTMLDivElement,
  ComponentPropsWithoutRef<typeof Radix.Item> & {
    icon?: LucideIcon;
    shortcut?: string;
  }
>(function MenuItem(
  { className, icon: Icon, shortcut, children, ...props },
  ref,
) {
  return (
    <Radix.Item
      ref={ref}
      className={uiClassName('ui-menu-item', className)}
      {...props}
    >
      {Icon ? <Icon size={14} strokeWidth={1.5} aria-hidden="true" /> : null}
      <span>{children}</span>
      {shortcut ? <Kbd>{shortcut}</Kbd> : null}
    </Radix.Item>
  );
});
export const MenuSeparator = forwardRef<
  HTMLDivElement,
  ComponentPropsWithoutRef<typeof Radix.Separator>
>(function MenuSeparator({ className, ...props }, ref) {
  return (
    <Radix.Separator
      ref={ref}
      className={uiClassName('ui-menu-separator', className)}
      {...props}
    />
  );
});
