'use client';
// Online ids for Messenger, plus whether presence has answered yet. Until it answers, the live
// set is empty, so a header would read "Active 1h ago" for someone who is online. The tab's own
// persona is always in the answered set (its heartbeat or Presence key), so seeing the viewer's
// id means presence has resolved. After 4 s we treat it as resolved anyway.
import { useEffect, useState } from 'react';
import { useOnline } from '@/features/data';

const GIVE_UP_MS = 4000;

export function usePresence(viewerId: string): { online: Set<string>; ready: boolean } {
  const online = useOnline();
  const [timedOut, setTimedOut] = useState(false);
  useEffect(() => {
    const t = setTimeout(() => setTimedOut(true), GIVE_UP_MS);
    return () => clearTimeout(t);
  }, []);
  return { online, ready: timedOut || online.has(viewerId) };
}
