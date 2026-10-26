'use client';
import * as Radix from '@radix-ui/react-dialog';
import {
  forwardRef,
  type ComponentPropsWithoutRef,
  type ReactElement,
  type ReactNode,
} from 'react';
import { uiClassName } from '../../lib/variants';

export function Dialog({
  trigger,
  children,
  ...props
}: ComponentPropsWithoutRef<typeof Radix.Root> & {
  trigger: ReactElement;
  children: ReactNode;
}) {
  return (
    <Radix.Root {...props}>
      <Radix.Trigger asChild>{trigger}</Radix.Trigger>
      {children}
    </Radix.Root>
  );
}
export const DialogContent = forwardRef<
  HTMLDivElement,
  Omit<ComponentPropsWithoutRef<typeof Radix.Content>, 'title'> & {
    title: ReactNode;
    description: ReactNode;
    size?: 'sm' | 'md';
    actions?: ReactNode;
  }
>(function DialogContent(
  { title, description, actions, size = 'sm', className, children, ...props },
  ref,
) {
  return (
    <Radix.Portal>
      <Radix.Overlay className="ui-dialog-overlay" />
      <Radix.Content
        ref={ref}
        className={uiClassName('ui-dialog', className)}
        data-size={size}
        {...props}
      >
        <Radix.Title className="ui-dialog-title">{title}</Radix.Title>
        <Radix.Description className="ui-dialog-description">
          {description}
        </Radix.Description>
        {children ? <div className="ui-dialog-body">{children}</div> : null}
        {actions ? <div className="ui-dialog-actions">{actions}</div> : null}
      </Radix.Content>
    </Radix.Portal>
  );
});
export const DialogClose = Radix.Close;
