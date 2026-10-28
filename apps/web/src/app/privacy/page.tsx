import { LegalRoute } from '../legal-route';
import '@/features/legal/legal.css';

export const metadata = { title: 'privacy · kimo' };

export default function PrivacyPage() {
  return <LegalRoute doc="privacy" />;
}
