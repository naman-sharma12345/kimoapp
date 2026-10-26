import { forwardRef, type HTMLAttributes } from 'react';
import { uiClassName } from '../../lib/variants';

export const Avatar = forwardRef<
  HTMLSpanElement,
  HTMLAttributes<HTMLSpanElement> & {
    identity: 'agent' | 'user';
    name?: string;
    acting?: boolean;
  }
>(function Avatar(
  { identity, name, acting = false, className, ...props },
  ref,
) {
  const userName = name?.trim();
  const label = identity === 'agent' ? 'kimo' : userName || 'you';
  return (
    <span
      ref={ref}
      className={uiClassName('ui-avatar', className)}
      data-identity={identity}
      data-acting={(identity === 'agent' && acting) || undefined}
      role="img"
      aria-label={label}
      {...props}
    >
      {identity === 'agent' ? (
        <span className="ui-avatar-mark" aria-hidden="true" />
      ) : (
        <span aria-hidden="true">
          {userName ? Array.from(userName)[0]?.toUpperCase() : 'you'}
        </span>
      )}
      {identity === 'agent' && acting ? (
        <svg
          className="ui-avatar-ring"
          viewBox="0 0 24 24"
          fill="none"
          aria-hidden="true"
        >
          <path
            d="M12 1a11 11 0 0 1 10.83 12.91"
            stroke="currentColor"
            strokeWidth="1.5"
            strokeLinecap="round"
          />
        </svg>
      ) : null}
    </span>
  );
});
