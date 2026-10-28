import type { MetadataRoute } from 'next';

/** Private, per-user routes are never crawled. */
export const PRIVATE_ROUTES = [
  '/account',
  '/projects',
  '/signin',
  '/studio/',
  '/render/',
  '/warmup/',
  '/dev/',
];

export default function robots(): MetadataRoute.Robots {
  return {
    rules: [{ userAgent: '*', allow: '/', disallow: PRIVATE_ROUTES }],
    host: 'https://app.getkimo.tech',
  };
}
