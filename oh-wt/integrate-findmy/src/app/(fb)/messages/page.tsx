import type { Metadata } from 'next';
import { Suspense } from 'react';
import { MessengerPage } from '@/features/fb/messenger';

export const metadata: Metadata = { title: 'Messenger' };

// MessengerPage reads ?thread= and ?to= with useSearchParams, so it renders under Suspense.
export default function MessagesPage() {
  return (
    <Suspense fallback={null}>
      <MessengerPage />
    </Suspense>
  );
}
