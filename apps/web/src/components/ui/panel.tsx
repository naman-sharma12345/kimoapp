import { forwardRef, useId, type HTMLAttributes, type ReactNode } from 'react';
import { uiClassName } from '../../lib/variants';

export const Panel = forwardRef<
  HTMLElement,
  Omit<HTMLAttributes<HTMLElement>, 'title'> & {
    title: ReactNode;
    actions?: ReactNode;
    flush?: boolean;
  }
>(function Panel(
  { title, actions, flush = false, className, children, ...props },
  ref,
) {
  const id = useId();
  return (
    <section
      ref={ref}
      className={uiClassName('ui-panel', className)}
      aria-labelledby={id}
      {...props}
    >
      <header className="ui-panel-header">
        <h3 id={id}>{title}</h3>
        {actions ? <div className="ui-panel-actions">{actions}</div> : null}
      </header>
      <div className="ui-panel-body" data-flush={flush || undefined}>
        {children}
      </div>
    </section>
  );
});
