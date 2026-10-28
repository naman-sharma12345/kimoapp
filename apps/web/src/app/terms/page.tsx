import { LegalRoute } from '../legal-route';
import '@/features/legal/legal.css';

export const metadata = { title: 'terms · kimo' };

export default function TermsPage() {
  return <LegalRoute doc="terms" />;
}
