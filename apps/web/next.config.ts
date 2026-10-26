import type { NextConfig } from 'next';
import path from 'node:path';

const config: NextConfig = {
  transpilePackages: ['@kimo/client', '@kimo/compositor'],
  poweredByHeader: false,
  devIndicators: false,
  outputFileTracingRoot: path.resolve(__dirname, '../..'),
};
export default config;
