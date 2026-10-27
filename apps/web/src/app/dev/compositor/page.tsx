import { notFound } from 'next/navigation';
import { CompositorBench } from './preview';

export default function CompositorPage() {
  if (process.env.NODE_ENV !== 'development') notFound();
  return <CompositorBench />;
}
