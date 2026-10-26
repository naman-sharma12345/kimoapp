'use client';
import { forwardRef, type ButtonHTMLAttributes } from 'react';
import type { LucideIcon } from 'lucide-react';
import { uiClassName, variants } from '../../lib/variants';
import { Spinner } from './spinner';
import { Tooltip } from './tooltip';

const styles = variants('ui-button', {
  variant: {
    primary: 'ui-button-primary',
    secondary: 'ui-button-secondary',
    ghost: 'ui-button-ghost',
    danger: 'ui-button-danger',
  },
  size: {
    xs: 'ui-size-xs',
    sm: 'ui-size-sm',
    md: 'ui-size-md',
    lg: 'ui-size-lg',
  },
});
type Common = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: 'primary' | 'secondary' | 'ghost' | 'danger';
  size?: 'xs' | 'sm' | 'md' | 'lg';
  loading?: boolean;
  icon?: LucideIcon;
};
export type ButtonProps = Common &
  (
    | {
        iconOnly: true;
        icon: LucideIcon;
        'aria-label': string;
        tooltip: string;
      }
    | { iconOnly?: false; tooltip?: string }
  );
export const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  function Button(
    {
      variant = 'secondary',
      size = 'md',
      icon: Icon,
      iconOnly = false,
      tooltip,
      loading = false,
      disabled,
      className,
      children,
      type = 'button',
      ...props
    },
    ref,
  ) {
    const button = (
      <button
        ref={ref}
        type={type}
        className={uiClassName(styles({ variant, size }), className)}
        disabled={disabled || loading}
        aria-busy={loading || undefined}
        data-icon-only={iconOnly || undefined}
        data-loading={loading || undefined}
        {...props}
      >
        <span className="ui-button-label">
          {Icon ? <Icon strokeWidth={1.5} aria-hidden="true" /> : null}
          {iconOnly ? null : children}
        </span>
        {loading ? (
          <span className="ui-button-spinner">
            <Spinner />
          </span>
        ) : null}
      </button>
    );
    return tooltip ? <Tooltip content={tooltip}>{button}</Tooltip> : button;
  },
);
