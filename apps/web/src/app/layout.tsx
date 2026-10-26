import type { Metadata } from 'next';
import { GeistSans } from 'geist/font/sans';
import { GeistMono } from 'geist/font/mono';
import localFont from 'next/font/local';
import './globals.css';

const instrument = localFont({
  src: '../assets/fonts/InstrumentSerif-Italic.ttf',
  weight: '400',
  style: 'italic',
  variable: '--font-instrument-serif',
  display: 'swap',
});
export const metadata: Metadata = {
  title: 'kimo · foundation',
  description: 'The design foundation for kimo web.',
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
        {children}
      </body>
    </html>
  );
}
