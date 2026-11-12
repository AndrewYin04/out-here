import type { Metadata } from 'next';
import { FindMyClient } from './FindMyClient';

export const metadata: Metadata = { title: 'Friends map' };

export default function FriendsMapPage() {
  return <FindMyClient />;
}
