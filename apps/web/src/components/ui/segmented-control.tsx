'use client';
import * as Radix from '@radix-ui/react-toggle-group';
import {
  forwardRef,
  useId,
  useState,
  type ComponentPropsWithoutRef,
} from 'react';
import { motion } from 'motion/react';
import { sharedIndicator } from '../../lib/motion';
import { useReducedMotion } from '../../lib/use-reduced-motion';
import { uiClassName } from '../../lib/variants';

type Props = Omit<
  ComponentPropsWithoutRef<typeof Radix.Root>,
  'type' | 'children' | 'value' | 'defaultValue' | 'onValueChange'
> & {
  options: readonly { value: string; label: string; disabled?: boolean }[];
  value?: string;
  defaultValue?: string;
  onValueChange?: (value: string) => void;
  'aria-label': string;
};
export const SegmentedControl = forwardRef<HTMLDivElement, Props>(
  function SegmentedControl(
    { options, value, defaultValue, onValueChange, className, ...props },
    ref,
  ) {
    const id = useId();
    const reduced = useReducedMotion();
    const [local, setLocal] = useState(defaultValue ?? options[0]?.value ?? '');
    const selected = value ?? local;
    return (
      <Radix.Root
        ref={ref}
        type="single"
        className={uiClassName('ui-segmented', className)}
        value={selected}
        onValueChange={(next) => {
          if (next) {
            setLocal(next);
            onValueChange?.(next);
          }
        }}
        {...props}
      >
        {options.map((option) => (
          <Radix.Item
            key={option.value}
            value={option.value}
            disabled={option.disabled}
            className="ui-segmented-item"
          >
            {selected === option.value ? (
              <motion.span
                className="ui-segmented-indicator"
                layoutId={reduced ? undefined : `${id}-selected`}
                {...sharedIndicator(reduced)}
              />
            ) : null}
            <span>{option.label}</span>
          </Radix.Item>
        ))}
      </Radix.Root>
    );
  },
);
