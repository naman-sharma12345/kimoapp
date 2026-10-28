import { describe, expect, it } from 'vitest';
import { contentSecurityPolicy, securityHeaders } from './security-headers';
import robots from '../app/robots';

describe('app security headers', () => {
  it('locks framing, sniffing and script sources', () => {
    const csp = contentSecurityPolicy({ apiUrl: 'https://api.getkimo.tech' });
    expect(csp).toContain("frame-ancestors 'none'");
    expect(csp).toContain("object-src 'none'");
    expect(csp).toContain("base-uri 'self'");
    expect(csp).toContain(
      "connect-src 'self' blob: https://api.getkimo.tech wss://api.getkimo.tech",
    );
    expect(csp).not.toContain("'unsafe-eval'");
    const names = securityHeaders({}).map((h) => h.key);
    expect(names).toEqual(
      expect.arrayContaining([
        'Content-Security-Policy',
        'X-Content-Type-Options',
        'X-Frame-Options',
        'Referrer-Policy',
      ]),
    );
  });

  it('keeps private routes out of search engines', () => {
    const rules = robots().rules;
    const list = Array.isArray(rules) ? rules : [rules];
    expect(list[0]?.disallow).toEqual(
      expect.arrayContaining(['/account', '/projects', '/signin']),
    );
  });
});
