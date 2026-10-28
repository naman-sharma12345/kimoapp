import bundleAnalyzer from '@next/bundle-analyzer';
import type { NextConfig } from 'next';
import path from 'node:path';
import { securityHeaders } from './src/lib/security-headers';

const config: NextConfig = {
  distDir: process.env.KIMO_PREVIEW_DIST_DIR || '.next',
  transpilePackages: ['@kimo/client', '@kimo/compositor'],
  poweredByHeader: false,
  devIndicators: false,
  outputFileTracingRoot: path.resolve(__dirname, '../..'),
  async headers() {
    return [
      {
        source: '/:path*',
        headers: securityHeaders({
          apiUrl: process.env.NEXT_PUBLIC_KIMO_API,
          posthogHost: process.env.NEXT_PUBLIC_POSTHOG_HOST,
          sentryDsn: process.env.NEXT_PUBLIC_SENTRY_DSN,
          dev: process.env.NODE_ENV !== 'production',
        }),
      },
    ];
  },
};
export default bundleAnalyzer({
  enabled: process.env.ANALYZE === 'true',
  openAnalyzer: false,
})(config);
