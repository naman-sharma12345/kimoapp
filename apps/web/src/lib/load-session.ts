import { notFound, redirect } from 'next/navigation';
import { KimoApiError, KimoClient } from '@kimo/client';
import { sessionDestination } from './session-routing';

export async function loadSession(
  sessionId: string,
  route: 'warmup' | 'studio',
) {
  let snapshot;
  try {
    snapshot = await new KimoClient().session(sessionId);
  } catch (error) {
    if (error instanceof KimoApiError && error.status === 404) notFound();
    return null;
  }
  const destination = sessionDestination(snapshot, sessionId);
  if (
    destination &&
    destination !== `/${route}/${encodeURIComponent(sessionId)}`
  )
    redirect(destination);
  return snapshot;
}
