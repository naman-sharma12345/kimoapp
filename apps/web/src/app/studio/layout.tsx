import { UploadsProvider } from '@/components/uploads/uploads-provider';
export default function Layout({ children }: { children: React.ReactNode }) {
  return <UploadsProvider>{children}</UploadsProvider>;
}
