import { notFound } from 'next/navigation';
import { KimoApiError, KimoClient } from '@kimo/client';

export default async function VideoHandoff({
  params,
}: {
  params: Promise<{ videoId: string }>;
}) {
  const { videoId } = await params;
  let video;
  try {
    video = await new KimoClient().video(videoId);
  } catch (error) {
    if (error instanceof KimoApiError && error.status === 404) notFound();
    throw error;
  }
  return (
    <main id="main" className="upload-handoff" data-ready="true">
      <h1>your video is ready</h1>
      <p className="upload-handoff-copy">{video.title}</p>
      <a className="ui-button ui-button-primary ui-size-md" href={video.url}>
        open video
      </a>
    </main>
  );
}
