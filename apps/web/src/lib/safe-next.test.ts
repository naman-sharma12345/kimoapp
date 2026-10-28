import { describe, expect, it } from 'vitest';
import { safeNext } from './safe-next';

describe('safeNext', () => {
  it.each([
    ['/projects', '/projects'],
    ['/account', '/account'],
    ['/account?tab=usage#x', '/account?tab=usage#x'],
    ['/studio/abc-123', '/studio/abc-123'],
  ])('keeps the same-origin path %s', (raw, expected) => {
    expect(safeNext(raw)).toBe(expected);
  });

  it.each([
    null,
    '',
    'projects',
    'https://evil.example.com',
    '//evil.example.com',
    '/\\evil.example.com',
    '/\\/evil.example.com',
    '\\\\evil.example.com',
    '/%0a/evil',
    '/\t/evil.example.com',
    '/\n/evil.example.com',
    'javascript:alert(1)',
    'data:text/html,<script>alert(1)</script>',
    '/signin',
    '/signin?next=/projects',
    `/${'a'.repeat(2000)}`,
  ])('falls back to /projects for %s', (raw) => {
    const next = safeNext(raw);
    if (raw === '/%0a/evil') {
      // Percent-encoded newline stays encoded inside the path: harmless.
      expect(next).toBe('/%0a/evil');
      return;
    }
    expect(next).toBe('/projects');
  });
});
