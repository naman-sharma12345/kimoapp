import { WarmupHandoff } from '@/components/landing/warmup-handoff';

export default async function WarmupPage({
  params,
}: {
  params: Promise<{ sessionId: string }>;
}) {
  const { sessionId } = await params;
  return <WarmupHandoff sessionId={sessionId} />;
}
