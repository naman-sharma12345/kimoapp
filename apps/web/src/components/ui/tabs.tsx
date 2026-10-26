'use client';
import * as Radix from '@radix-ui/react-tabs';
import {
  createContext,
  forwardRef,
  useContext,
  useId,
  useState,
  type ComponentPropsWithoutRef,
} from 'react';
import { motion } from 'motion/react';
import { sharedIndicator } from '../../lib/motion';
import { useReducedMotion } from '../../lib/use-reduced-motion';
import { uiClassName } from '../../lib/variants';

const Context = createContext({ value: '', id: '' });
export const Tabs = forwardRef<
  HTMLDivElement,
  ComponentPropsWithoutRef<typeof Radix.Root>
>(function Tabs(
  { className, value, defaultValue, onValueChange, children, ...props },
  ref,
) {
  const id = useId();
  const [local, setLocal] = useState(defaultValue ?? '');
  const selected = value ?? local;
  return (
    <Context.Provider value={{ value: selected, id }}>
      <Radix.Root
        ref={ref}
        value={selected}
        onValueChange={(next) => {
          setLocal(next);
          onValueChange?.(next);
        }}
        className={uiClassName('ui-tabs', className)}
        {...props}
      >
        {children}
      </Radix.Root>
    </Context.Provider>
  );
});
export const TabsList = forwardRef<
  HTMLDivElement,
  ComponentPropsWithoutRef<typeof Radix.List>
>(function TabsList({ className, ...props }, ref) {
  return (
    <Radix.List
      ref={ref}
      className={uiClassName('ui-tabs-list', className)}
      {...props}
    />
  );
});
export const TabsTrigger = forwardRef<
  HTMLButtonElement,
  ComponentPropsWithoutRef<typeof Radix.Trigger>
>(function TabsTrigger({ className, value, children, ...props }, ref) {
  const context = useContext(Context);
  const reduced = useReducedMotion();
  return (
    <Radix.Trigger
      ref={ref}
      value={value}
      className={uiClassName('ui-tabs-trigger', className)}
      {...props}
    >
      {children}
      {context.value === value ? (
        <motion.span
          className="ui-tabs-underline"
          layoutId={reduced ? undefined : `${context.id}-underline`}
          {...sharedIndicator(reduced)}
        />
      ) : null}
    </Radix.Trigger>
  );
});
export const TabsContent = forwardRef<
  HTMLDivElement,
  ComponentPropsWithoutRef<typeof Radix.Content>
>(function TabsContent({ className, ...props }, ref) {
  return (
    <Radix.Content
      ref={ref}
      className={uiClassName('ui-tabs-content', className)}
      {...props}
    />
  );
});
