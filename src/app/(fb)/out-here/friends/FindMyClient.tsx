'use client';
import dynamic from 'next/dynamic';

const FindMyMap = dynamic(() => import('@/features/map/friends').then((m) => m.FindMyMap), { ssr: false });

export function FindMyClient() {
  return <FindMyMap />;
}
