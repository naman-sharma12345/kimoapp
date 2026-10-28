import { OfflineBanner } from '@/components/offline-banner';
import { RouteFocus } from '@/components/route-focus';
import type { Metadata } from 'next';

import './globals.css';

export const metadata: Metadata = {
  metadataBase: new URL('https://app.getkimo.tech'),
  title: 'kimo · tell it the video',
  description:
    'describe your video. kimo cuts, captions, grades and scores it while you watch.',
  icons: { icon: '/brand/kimo-mark.svg' },
};
export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <head>
        <link
          rel="preload"
          href="/fonts/Geist-UI.woff2"
          as="font"
          type="font/woff2"
          crossOrigin="anonymous"
          fetchPriority="high"
        />
        <link
          rel="preload"
          href="/fonts/InstrumentSerif-Italic.woff2"
          as="font"
          type="font/woff2"
          crossOrigin="anonymous"
          fetchPriority="high"
        />
      </head>
      <body>
        <a className="skip-link" href="#main">
          skip to content
        </a>
        <RouteFocus />
        <OfflineBanner />
        {children}
      </body>
    </html>
  );
}
