import type { Metadata } from 'next';
import { GeistSans } from 'geist/font/sans';
import { GeistMono } from 'geist/font/mono';
import localFont from 'next/font/local';
import './globals.css';
import { UploadsProvider } from '@/components/uploads/uploads-provider';

const instrument = localFont({
  src: '../assets/fonts/InstrumentSerif-Italic.ttf',
  weight: '400',
  style: 'italic',
  variable: '--font-instrument-serif',
  display: 'swap',
});
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
    <html
      lang="en"
      className={`${GeistSans.variable} ${GeistMono.variable} ${instrument.variable}`}
    >
      <body>
        <a className="skip-link" href="#main">
          skip to content
        </a>
        <UploadsProvider>{children}</UploadsProvider>
      </body>
    </html>
  );
}
