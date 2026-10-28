import bundleAnalyzer from '@next/bundle-analyzer';
import type { NextConfig } from 'next';
import path from 'node:path';

const config: NextConfig = {
  distDir: process.env.KIMO_PREVIEW_DIST_DIR || '.next',
  transpilePackages: ['@kimo/client', '@kimo/compositor'],
  poweredByHeader: false,
  devIndicators: false,
  outputFileTracingRoot: path.resolve(__dirname, '../..'),
};
export default bundleAnalyzer({
  enabled: process.env.ANALYZE === 'true',
  openAnalyzer: false,
})(config);
