import { cn } from './cn';

export function variants<
  const T extends Record<string, Record<string, string>>,
>(base: string, choices: T) {
  return (selection: { [K in keyof T]?: keyof T[K] }) =>
    cn(
      base,
      ...Object.entries(selection).map(
        ([key, value]) => choices[key]?.[String(value)],
      ),
    );
}

/** Public className is layout-only: component styling belongs to its named variants. */
export function uiClassName(base: string, className?: string): string {
  for (const token of className?.split(/\s+/).filter(Boolean) ?? []) {
    if (
      !/^(?:(?:sm|md|lg|xl):)?(?:-?m[trblxy]?-|w-|min-w-|max-w-|h-|min-h-|max-h-|col-|row-|order-|self-|justify-self-|place-self-|flex-|grow|shrink|basis-)/.test(
        token,
      )
    )
      throw new Error(`UI className is layout-only: ${token}`);
  }
  return cn(base, className);
}
