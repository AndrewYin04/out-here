import type { APIRequestContext, Page } from '@playwright/test';
import { profileId } from '../../src/shared/seed/ids';

// Invites a test sends stay pending in the shared store, and each pending invite shows as a toast
// card with Accept and Decline at the top of every page the invitee opens. Left behind, those
// cards cover buttons in later specs (Confirm on Friend requests, for example). Tests that send
// invites from the UI record them with trackInvites and decline them when they finish.

type Created = { id: string; toId: string };

const PERSONAS = ['alex', 'maya', 'jordan', 'priya', 'sam', 'leo', 'nina', 'kai'];
const HANDLE_BY_ID = new Map(PERSONAS.map((h) => [profileId(h), h]));

/** Records every invite this page creates (POST /api/invites and POST /api/locations/hang). */
export function trackInvites(page: Page): Created[] {
  const created: Created[] = [];
  page.on('response', async (res) => {
    const req = res.request();
    if (req.method() !== 'POST' || !res.ok() || !/\/api\/(invites|locations\/hang)$/.test(new URL(res.url()).pathname)) return;
    try {
      const body = (await res.json()) as { invite?: { id: string; toId: string } };
      if (body.invite) created.push({ id: body.invite.id, toId: body.invite.toId });
    } catch { /* page closed before the body was read */ }
  });
  return created;
}

/** Declines the recorded invites that are still pending, as their invitees (personas only). */
export async function declineTracked(request: APIRequestContext, created: Created[]) {
  for (const inv of created.splice(0)) {
    const handle = HANDLE_BY_ID.get(inv.toId);
    if (!handle) continue;
    await request.post(`/api/invites/${inv.id}/respond`, { headers: { 'x-persona': handle }, data: { status: 'declined' } });
  }
}
