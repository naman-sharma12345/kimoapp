import { Suspense } from 'react';
import { SignInRoute } from './sign-in-route';

export default function SignInRoutePage() {
  return (
    <Suspense fallback={null}>
      <SignInRoute />
    </Suspense>
  );
}
