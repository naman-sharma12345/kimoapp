import type { SessionSnapshot } from '@kimo/client';
export function sessionDestination(
  snapshot: SessionSnapshot,
  sessionId: string,
) {
  const id = encodeURIComponent(sessionId);
  if (snapshot.status === 'warming') return `/warmup/${id}`;
  if (snapshot.status === 'rendering')
    return snapshot.renderId
      ? `/render/${encodeURIComponent(snapshot.renderId)}`
      : null;
  if (snapshot.status === 'done')
    return snapshot.videoId
      ? `/v/${encodeURIComponent(snapshot.videoId)}`
      : null;
  if (snapshot.status === 'editing' || snapshot.status === 'awaiting_review')
    return `/studio/${id}`;
  return null;
}
