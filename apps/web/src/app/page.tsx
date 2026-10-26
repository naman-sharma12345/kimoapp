import type { Metadata } from 'next';
import { LandingPage } from '@/components/landing/landing-page';

export const metadata: Metadata = {
  title: 'kimo · tell it the video',
  description:
    'drop in your clips, photos and music. kimo cuts, captions, grades and scores it while you watch, and you can step in at any second.',
};
export default function Home() {
  return <LandingPage />;
}
