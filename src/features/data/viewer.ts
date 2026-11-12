// Server: resolve the active persona for a request. Header `x-persona: <handle>` wins, then
// the `?as=<handle>` query (EventSource cannot send headers). Unknown or missing -> 400.
import type { Profile } from '@/shared';
import { badRequest } from './errors';
import { getStore } from './store';

export const PERSONA_HEADER = 'x-persona';

export function personaHandleOf(req: Request): string | null {
  const header = req.headers.get(PERSONA_HEADER)?.trim().toLowerCase();
  if (header) return header;
  const q = new URL(req.url).searchParams.get('as')?.trim().toLowerCase();
  return q || null;
}

export async function getViewer(req: Request): Promise<Profile> {
  const handle = personaHandleOf(req);
  if (!handle) throw badRequest(`missing ${PERSONA_HEADER} header`);
  if (!/^[a-z0-9_-]{2,32}$/.test(handle)) throw badRequest('unknown persona');
  const profile = await getStore().profileByHandle(handle);
  if (!profile) throw badRequest('unknown persona');
  return profile;
}
