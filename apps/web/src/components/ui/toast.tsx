'use client';
import {
  createContext,
  forwardRef,
  useCallback,
  useContext,
  useEffect,
  useId,
  useImperativeHandle,
  useRef,
  useState,
  type HTMLAttributes,
  type ReactNode,
} from 'react';
import { motion } from 'motion/react';
import { Check, Info, X, XCircle } from 'lucide-react';
import { uiClassName } from '../../lib/variants';
import { toastMotion, uiTiming } from '../../lib/motion';
import { useReducedMotion } from '../../lib/use-reduced-motion';
import { Button } from './button';

export interface ToastOptions {
  message: string;
  tone?: 'info' | 'success' | 'error';
  action?: { label: string; onClick: () => void };
}
type ToastProps = Omit<HTMLAttributes<HTMLDivElement>, 'children'> &
  ToastOptions & { onDismiss?: () => void };
export const Toast = forwardRef<HTMLDivElement, ToastProps>(function Toast(
  { message, tone = 'info', action, onDismiss, className, ...props },
  ref,
) {
  const [paused, setPaused] = useState(false);
  const node = useRef<HTMLDivElement>(null);
  useImperativeHandle(ref, () => {
    if (!node.current) throw new Error('Toast is not mounted');
    return node.current;
  }, []);
  const [hidden, setHidden] = useState(false);
  const remaining = useRef<number>(
    tone === 'error' ? uiTiming.errorToast : uiTiming.toast,
  );
  useEffect(() => {
    const element = node.current;
    if (!element) return;
    const pause = () => setPaused(true);
    const resume = () => {
      if (!element.contains(document.activeElement)) setPaused(false);
    };
    const blur = (event: FocusEvent) => {
      if (
        !(event.relatedTarget instanceof Node) ||
        !element.contains(event.relatedTarget)
      )
        setPaused(element.matches(':hover'));
    };
    element.addEventListener('mouseenter', pause);
    element.addEventListener('mouseleave', resume);
    element.addEventListener('focusin', pause);
    element.addEventListener('focusout', blur);
    return () => {
      element.removeEventListener('mouseenter', pause);
      element.removeEventListener('mouseleave', resume);
      element.removeEventListener('focusin', pause);
      element.removeEventListener('focusout', blur);
    };
  }, []);
  useEffect(() => {
    const update = () => setHidden(document.hidden);
    update();
    document.addEventListener('visibilitychange', update);
    return () => document.removeEventListener('visibilitychange', update);
  }, []);
  useEffect(() => {
    if (!onDismiss || paused || hidden) return;
    const start = Date.now();
    const timer = setTimeout(onDismiss, remaining.current);
    return () => {
      clearTimeout(timer);
      remaining.current = Math.max(0, remaining.current - (Date.now() - start));
    };
  }, [paused, hidden, onDismiss]);
  const Icon = tone === 'success' ? Check : tone === 'error' ? XCircle : Info;
  return (
    <div
      ref={node}
      className={uiClassName('ui-toast', className)}
      data-tone={tone}
      role="status"
      aria-live={tone === 'error' ? 'assertive' : 'polite'}
      {...props}
    >
      <Icon
        size={16}
        strokeWidth={1.5}
        className="ui-toast-icon"
        aria-hidden="true"
      />
      <span className="ui-toast-message">{message}</span>
      {action ? (
        <Button
          variant="ghost"
          size="xs"
          onClick={() => {
            action.onClick();
            onDismiss?.();
          }}
        >
          {action.label}
        </Button>
      ) : null}
      {onDismiss ? (
        <Button
          variant="ghost"
          size="xs"
          iconOnly
          icon={X}
          aria-label="dismiss notification"
          tooltip="dismiss notification"
          onClick={onDismiss}
        />
      ) : null}
    </div>
  );
});
interface ToastContextValue {
  toast: (options: ToastOptions) => string;
  dismiss: (id: string) => void;
}
const Context = createContext<ToastContextValue | null>(null);
export const ToastProvider = forwardRef<
  HTMLOListElement,
  { children: ReactNode }
>(function ToastProvider({ children }, ref) {
  const [items, setItems] = useState<(ToastOptions & { id: string })[]>([]);
  const prefix = useId();
  const serial = useRef(0);
  const reduced = useReducedMotion();
  const toast = useCallback(
    (options: ToastOptions) => {
      const id = `${prefix}-${serial.current++}`;
      setItems((current) => [...current, { ...options, id }].slice(-3));
      return id;
    },
    [prefix],
  );
  const dismiss = useCallback(
    (id: string) =>
      setItems((current) => current.filter((item) => item.id !== id)),
    [],
  );
  return (
    <Context.Provider value={{ toast, dismiss }}>
      {children}
      <ol ref={ref} className="ui-toast-viewport" aria-label="notifications">
        {items.map((item, index) => (
          <motion.li
            key={item.id}
            layout={!reduced}
            {...toastMotion(index < items.length - 1, reduced)}
          >
            <Toast {...item} onDismiss={() => dismiss(item.id)} />
          </motion.li>
        ))}
      </ol>
    </Context.Provider>
  );
});
export function useToast(): ToastContextValue {
  const context = useContext(Context);
  if (!context) throw new Error('useToast requires ToastProvider');
  return context;
}
