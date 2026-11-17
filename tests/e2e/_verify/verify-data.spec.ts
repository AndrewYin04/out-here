import { expect, test, type Page } from '@playwright/test';
import { profileId, seedId } from '../../../src/shared/seed/ids';

test.describe.configure({ mode: 'serial' });
test.beforeEach(async ({}, info) => { test.skip(info.project.name !== 'phone', 'phone only'); });

const volleyball = seedId('quest', 'volleyball');
const dumplings = seedId('quest', 'dumplings');

async function api(page: Page, path: string, method = 'GET', body?: unknown) {
  return page.evaluate(async ({ path, method, body }) => {
    const persona = sessionStorage.getItem('outhere.persona') ?? 'alex';
    const r = await fetch(path, { method, headers: { 'x-persona': persona, 'content-type': 'application/json' }, body: body ? JSON.stringify(body) : undefined });
    return { status: r.status, body: await r.json().catch(() => null), timing: r.headers.get('server-timing') };
  }, { path, method, body });
}

type Msg = { channel: string; payload: Record<string, unknown> };
async function openSse(page: Page, channels: string) {
  await page.evaluate((channels) => {
    const w = window as unknown as { msgs: unknown[] };
    w.msgs = [];
    const persona = sessionStorage.getItem('outhere.persona') ?? 'alex';
    const es = new EventSource('/api/realtime?channels=' + channels + '&as=' + persona);
    es.onmessage = (e) => w.msgs.push(JSON.parse(e.data));
    return new Promise((res) => { es.onopen = () => res(null); });
  }, channels);
}
const msgs = (page: Page) => page.evaluate(() => (window as unknown as { msgs: Msg[] }).msgs);
