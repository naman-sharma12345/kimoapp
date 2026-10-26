/** Keep non-modal floating content in the app's main landmark. */
export function portalContainer(): HTMLElement | undefined {
  return typeof document === 'undefined'
    ? undefined
    : (document.getElementById('main') ?? undefined);
}
