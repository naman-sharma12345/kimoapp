'use client';
import * as Radix from '@radix-ui/react-context-menu';
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

export function ContextMenu({
  trigger,
  children,
  ...props
}: ComponentPropsWithoutRef<typeof Radix.Root> & {
  trigger: ReactElement;
  children: ReactNode;
}) {
  return (
    <Radix.Root modal={false} {...props}>
      <Radix.Trigger
        asChild
        onKeyDown={(event) => {
          if (
            event.key === 'ContextMenu' ||
            (event.key === 'F10' && event.shiftKey)
          ) {
            event.preventDefault();
            const rect = event.currentTarget.getBoundingClientRect();
            event.currentTarget.dispatchEvent(
              new MouseEvent('contextmenu', {
                bubbles: true,
                clientX: rect.left,
                clientY: rect.bottom,
              }),
            );
          }
        }}
      >
        {trigger}
      </Radix.Trigger>
      <Radix.Portal container={portalContainer()}>
        <ContextMenuContent>{children}</ContextMenuContent>
      </Radix.Portal>
    </Radix.Root>
  );
}
export const ContextMenuContent = forwardRef<
  HTMLDivElement,
  ComponentPropsWithoutRef<typeof Radix.Content>
>(function ContextMenuContent({ className, ...props }, ref) {
  return (
    <Radix.Content
      ref={ref}
      className={uiClassName('ui-menu ui-context-menu', className)}
      {...props}
    />
  );
});
export const ContextMenuItem = forwardRef<
  HTMLDivElement,
  ComponentPropsWithoutRef<typeof Radix.Item> & {
    icon?: LucideIcon;
    shortcut?: string;
  }
>(function ContextMenuItem(
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
export const ContextMenuSeparator = forwardRef<
  HTMLDivElement,
  ComponentPropsWithoutRef<typeof Radix.Separator>
>(function ContextMenuSeparator({ className, ...props }, ref) {
  return (
    <Radix.Separator
      ref={ref}
      className={uiClassName('ui-menu-separator', className)}
      {...props}
    />
  );
});
