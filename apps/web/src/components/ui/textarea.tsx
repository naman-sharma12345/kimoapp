'use client';
import {
  forwardRef,
  useId,
  useLayoutEffect,
  useRef,
  useImperativeHandle,
  type TextareaHTMLAttributes,
} from 'react';
import { cn } from '../../lib/cn';
import { uiClassName } from '../../lib/variants';

export type TextareaProps = TextareaHTMLAttributes<HTMLTextAreaElement> & {
  error?: string;
  maxRows?: number;
  variant?: 'default' | 'composer';
};
export const Textarea = forwardRef<HTMLTextAreaElement, TextareaProps>(
  function Textarea(
    {
      maxRows = 6,
      variant = 'default',
      error,
      id,
      className,
      value,
      defaultValue,
      onInput,
      'aria-describedby': describedBy,
      ...props
    },
    ref,
  ) {
    const local = useRef<HTMLTextAreaElement>(null);
    const generated = useId();
    const errorId = `${id ?? generated}-error`;
    useImperativeHandle(ref, () => {
      if (!local.current) throw new Error('Textarea is not mounted');
      return local.current;
    }, []);
    const resize = () => {
      const node = local.current;
      if (!node) return;
      const css = getComputedStyle(node);
      const line = parseFloat(css.lineHeight);
      const padding =
        parseFloat(css.paddingTop) +
        parseFloat(css.paddingBottom) +
        parseFloat(css.borderTopWidth) +
        parseFloat(css.borderBottomWidth);
      node.style.height = 'auto';
      const limit = line * Math.max(1, maxRows) + padding;
      node.style.height = `${Math.min(node.scrollHeight + parseFloat(css.borderTopWidth) + parseFloat(css.borderBottomWidth), limit)}px`;
      node.style.overflowY = node.scrollHeight > limit ? 'auto' : 'hidden';
    };
    useLayoutEffect(resize, [value, defaultValue, maxRows]);
    return (
      <span className={uiClassName('ui-field', className)}>
        <textarea
          ref={local}
          id={id}
          rows={1}
          value={value}
          defaultValue={defaultValue}
          className="ui-input ui-textarea"
          data-variant={variant}
          aria-invalid={error ? true : undefined}
          aria-describedby={cn(describedBy, error && errorId) || undefined}
          onInput={(event) => {
            resize();
            onInput?.(event);
          }}
          {...props}
        />
        {error ? (
          <span id={errorId} className="ui-field-error" aria-live="polite">
            {error}
          </span>
        ) : null}
      </span>
    );
  },
);
