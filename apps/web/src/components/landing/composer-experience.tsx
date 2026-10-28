'use client';
import { LandingComposer } from './landing-composer';
import { UploadsProvider } from '@/components/uploads/uploads-provider';
export function ComposerExperience(
  props: React.ComponentProps<typeof LandingComposer>,
) {
  return (
    <UploadsProvider>
      <LandingComposer {...props} />
    </UploadsProvider>
  );
}
