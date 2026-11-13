import { mkdtemp, rm, rmdir } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { afterEach, expect, it } from 'vitest';
import { createMemoryStore } from '@/features/data/server';
import { profileId } from '@/shared';
import { beginEncounter } from './orchestrator';
import { FileEncounterRepository, MemoryEncounterRepository } from './repository';
import { randomUUID } from 'node:crypto';
const directories: string[] = [];
afterEach(async () => { for (const d of directories.splice(0)) { await rm(join(d, 'ledger.json'), { force:true }); await rmdir(d); } });
it('saves a local ledger across repository instances and preserves owner isolation', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'muse-ledger-')); directories.push(directory);
  const repo = new FileEncounterRepository(directory), owner = profileId('alex');
  const started = await beginEncounter(repo, createMemoryStore(), owner, { requestKey:randomUUID(), recipientId:profileId('maya'), text:'Is Maya free?' });
  const saved = await repo.save({ ...started.session, status:'cancelled' });
  const restored = new FileEncounterRepository(directory);
  expect(await restored.get(saved.id, owner)).toEqual(saved);
  expect(await restored.get(saved.id, profileId('maya'))).toBeNull();
});
it('expires an interrupted same-key retry rather than returning pending forever', async () => {
  const repo = new MemoryEncounterRepository(), owner = profileId('alex');
  const input = { requestKey:randomUUID(), recipientId:profileId('maya'), text:'Is Maya free?' };
  const { session } = await beginEncounter(repo, createMemoryStore(), owner, input);
  await repo.save({ ...session, expiresAt: new Date(Date.now()-1).toISOString() });
  const replay = await beginEncounter(repo, createMemoryStore(), owner, input);
  expect(replay).toMatchObject({ created:false, session: { id:session.id, status:'timeout' } });
});
