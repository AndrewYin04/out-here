import { Globe, ListChecks, Lock, Users } from 'lucide-react';
import type { Audience } from '@/shared';

/** Audience glyph for the post meta line and the audience button. */
export function AudienceIcon({ audience, size = 12 }: { audience: Audience; size?: number }) {
  if (audience === 'public') return <Globe size={size} aria-label="Public" />;
  if (audience === 'friends') return <Users size={size} aria-label="Friends" />;
  if (audience === 'only_me') return <Lock size={size} aria-label="Only me" />;
  return <ListChecks size={size} aria-label="Custom" />;
}
