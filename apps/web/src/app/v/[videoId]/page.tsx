import { cache } from 'react';
import { notFound } from 'next/navigation';
import type { Metadata } from 'next';
import { KimoApiError, KimoClient } from '@kimo/client';
import { DeliveryPage } from '@/components/render/delivery-page';
const loadVideo = cache(async (id: string) => {
  try {
    return await new KimoClient().video(id);
  } catch (error) {
    if (error instanceof KimoApiError && error.status === 404) notFound();
    throw error;
  }
});
export async function generateMetadata({
  params,
}: {
  params: Promise<{ videoId: string }>;
}): Promise<Metadata> {
  const { videoId } = await params;
  const video = await loadVideo(videoId);
  return {
    title: video.title,
    description: 'made with kimo, the ai video editor',
    robots: { index: false, follow: false },
    openGraph: {
      type: 'video.other',
      title: video.title,
      description: 'made with kimo, the ai video editor',
      images: [{ url: video.posterUrl }],
      videos: [
        {
          url: video.url,
          type: 'video/mp4',
          width: video.width,
          height: video.height,
        },
      ],
    },
  };
}
export default async function VideoPage({
  params,
}: {
  params: Promise<{ videoId: string }>;
}) {
  const { videoId } = await params;
  return <DeliveryPage videoId={videoId} video={await loadVideo(videoId)} />;
}
