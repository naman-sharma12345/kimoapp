'use client';
import { forwardRef, useId, type InputHTMLAttributes } from 'react';
import { cn } from '../../lib/cn';
import { uiClassName } from '../../lib/variants';

export type InputProps = InputHTMLAttributes<HTMLInputElement> & {
  error?: string;
};
export const Input = forwardRef<HTMLInputElement, InputProps>(function Input(
  { error, id, className, 'aria-describedby': describedBy, ...props },
  ref,
) {
  const generated = useId();
  const errorId = `${id ?? generated}-error`;
  return (
    <span className={uiClassName('ui-field', className)}>
      <input
        ref={ref}
        id={id}
        className="ui-input"
        aria-invalid={error ? true : undefined}
        aria-describedby={cn(describedBy, error && errorId) || undefined}
        {...props}
      />
      {error ? (
        <span id={errorId} className="ui-field-error" aria-live="polite">
          {error}
        </span>
      ) : null}
    </span>
  );
});
