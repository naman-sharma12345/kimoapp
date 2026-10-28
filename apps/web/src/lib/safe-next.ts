/**
 * Post sign-in destinations: only same-origin, path-only values such as
 * "/projects" or "/account?tab=x". Anything that a browser could resolve
 * to another origin ("//evil", "/\\evil", "https://…", "javascript:"),
 * anything with control characters or whitespace, and the sign-in page
 * itself (a loop) fall back to /projects.
 */
export const DEFAULT_NEXT = '/projects';
const PLACEHOLDER_ORIGIN = 'https://app.invalid';

export function safeNext(raw: string | null | undefined): string {
  if (!raw || raw.length > 1024) return DEFAULT_NEXT;
  if (!raw.startsWith('/') || raw.startsWith('//')) return DEFAULT_NEXT;
  if (/[\\\p{Cc}\s]/u.test(raw)) return DEFAULT_NEXT;
  let url: URL;
  try {
    url = new URL(raw, PLACEHOLDER_ORIGIN);
  } catch {
    return DEFAULT_NEXT;
  }
  if (url.origin !== PLACEHOLDER_ORIGIN) return DEFAULT_NEXT;
  if (url.pathname === '/signin' || url.pathname.startsWith('/signin/'))
    return DEFAULT_NEXT;
  return `${url.pathname}${url.search}${url.hash}`;
}
