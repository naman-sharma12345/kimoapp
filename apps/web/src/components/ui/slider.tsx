'use client';
import * as Radix from '@radix-ui/react-slider';
import { forwardRef, useState, type ComponentPropsWithoutRef } from 'react';
import { uiClassName } from '../../lib/variants';

type Props = Omit<
  ComponentPropsWithoutRef<typeof Radix.Root>,
  'value' | 'defaultValue' | 'onValueChange' | 'children'
> & {
  value?: number;
  defaultValue?: number;
  onValueChange?: (value: number) => void;
  'aria-label': string;
  formatValue?: (value: number) => string;
};
export const Slider = forwardRef<HTMLSpanElement, Props>(function Slider(
  {
    value,
    defaultValue = 0,
    onValueChange,
    className,
    formatValue = String,
    'aria-label': label,
    onPointerDown,
    onPointerUp,
    onPointerCancel,
    onLostPointerCapture,
    onBlur,
    ...props
  },
  ref,
) {
  const [local, setLocal] = useState(defaultValue);
  const [dragging, setDragging] = useState(false);
  const current = value ?? local;
  return (
    <Radix.Root
      ref={ref}
      className={uiClassName('ui-slider', className)}
      value={[current]}
      onValueChange={(next) => {
        const item = next[0];
        if (item !== undefined) {
          setLocal(item);
          onValueChange?.(item);
        }
      }}
      onPointerDown={(event) => {
        setDragging(true);
        onPointerDown?.(event);
      }}
      onPointerUp={(event) => {
        setDragging(false);
        onPointerUp?.(event);
      }}
      onPointerCancel={(event) => {
        setDragging(false);
        onPointerCancel?.(event);
      }}
      onLostPointerCapture={(event) => {
        setDragging(false);
        onLostPointerCapture?.(event);
      }}
      onBlur={(event) => {
        setDragging(false);
        onBlur?.(event);
      }}
      {...props}
    >
      <Radix.Track className="ui-slider-track">
        <Radix.Range className="ui-slider-range" />
      </Radix.Track>
      <Radix.Thumb
        className="ui-slider-thumb"
        aria-label={label}
        aria-valuetext={formatValue(current)}
      >
        {dragging ? (
          <span className="ui-slider-bubble" aria-hidden="true">
            {formatValue(current)}
          </span>
        ) : null}
      </Radix.Thumb>
    </Radix.Root>
  );
});
