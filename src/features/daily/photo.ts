import { currentPersona } from '@/features/data';

/**
 * Private Side Quest photos load through /api/daily/photo, which needs to know who is looking.
 * An <img> cannot send the persona header, so the handle rides in ?as= (the same way Memories
 * photos work). Static demo photos pass through untouched.
 */
export function dailyPhotoSrc(url: string): string {
  return url.startsWith('/api/daily/photo') ? `${url}&as=${encodeURIComponent(currentPersona())}` : url;
}
