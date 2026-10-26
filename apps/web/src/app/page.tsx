import { redirect } from 'next/navigation';

// The actual landing screen belongs to Phase 2.
export default function Home() {
  redirect('/dev/tokens');
}
