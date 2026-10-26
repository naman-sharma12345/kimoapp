'use client';
import { forwardRef, useState, type ButtonHTMLAttributes } from 'react';
import { motion } from 'motion/react';
import { toggleKnob } from '../../lib/motion';
import { useReducedMotion } from '../../lib/use-reduced-motion';
import { uiClassName } from '../../lib/variants';

type Props = Omit<ButtonHTMLAttributes<HTMLButtonElement>, 'onChange'> & {
  checked?: boolean;
  defaultChecked?: boolean;
  onCheckedChange?: (checked: boolean) => void;
  'aria-label': string;
};
export const Toggle = forwardRef<HTMLButtonElement, Props>(function Toggle(
  {
    checked,
    defaultChecked = false,
    onCheckedChange,
    onClick,
    className,
    type = 'button',
    ...props
  },
  ref,
) {
  const [local, setLocal] = useState(defaultChecked);
  const active = checked ?? local;
  const reduced = useReducedMotion();
  return (
    <button
      ref={ref}
      type={type}
      role="switch"
      aria-checked={active}
      data-state={active ? 'checked' : 'unchecked'}
      className={uiClassName('ui-toggle', className)}
      onClick={(event) => {
        onClick?.(event);
        if (!event.defaultPrevented) {
          setLocal(!active);
          onCheckedChange?.(!active);
        }
      }}
      {...props}
    >
      <motion.span
        className="ui-toggle-knob"
        {...toggleKnob(active, reduced)}
      />
    </button>
  );
});
