import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { HttpError, supabaseEnv } from '@/features/data/server';
import type { EncounterSession } from '../protocol';

export interface EncounterRepository {
  get(id: string, ownerId: string): Promise<EncounterSession | null>;
  create(session: EncounterSession): Promise<{ session: EncounterSession; created: boolean }>;
  save(session: EncounterSession): Promise<EncounterSession>;
}
const copy = <T>(v: T): T => structuredClone(v);
export class MemoryEncounterRepository implements EncounterRepository {
  protected rows = new Map<string, EncounterSession>();
  async get(id: string, ownerId: string) { const s = this.rows.get(id); return s?.initiatorId === ownerId ? copy(s) : null; }
  async create(s: EncounterSession) {
    for (const r of this.rows.values()) {
      if (r.initiatorId !== s.initiatorId) continue;
      if (r.status === 'pending' && r.expiresAt <= s.createdAt) {
        const expired: EncounterSession = { ...r, status: 'timeout', failure: 'stale_session', version: r.version + 1, updatedAt: s.createdAt };
        this.rows.set(r.id, expired);
        if (r.requestKey === s.requestKey) return { session: copy(expired), created: false };
      } else {
        if (r.requestKey === s.requestKey) return { session: copy(r), created: false };
        if (r.status === 'pending') throw new HttpError(409, 'An encounter is already in progress.');
      }
    }
    this.rows.set(s.id, copy(s)); return { session: copy(s), created: true };
  }
  async save(s: EncounterSession) {
    const prior = this.rows.get(s.id);
    if (!prior || prior.version !== s.version || prior.status !== 'pending') throw new HttpError(409, 'Encounter is no longer active.');
    const next = { ...copy(s), version: s.version + 1, updatedAt: new Date().toISOString() };
    this.rows.set(s.id, next); return copy(next);
  }
}

/** Single-process local demo persistence. Supabase is required for hosted/multi-instance use.
 * Only the validated safe ledger is written; no raw requests, prompts, or private context. */
export class FileEncounterRepository extends MemoryEncounterRepository {
  private ready: Promise<void>;
  private queue: Promise<unknown> = Promise.resolve();
  constructor(private directory: string) {
    super();
    this.ready = readFile(join(directory, 'ledger.json'), 'utf8').then(text => {
      const rows = JSON.parse(text) as EncounterSession[];
      if (!Array.isArray(rows)) throw new Error('Invalid encounter ledger');
      this.rows = new Map(rows.map(s => [s.id, s]));
    }).catch(err => { if (err.code !== 'ENOENT') throw err; });
  }
  private transaction<T>(fn: () => Promise<T>): Promise<T> {
    const next = this.queue.then(async () => {
      await this.ready;
      const before = copy(this.rows);
      try {
        const value = await fn();
        await mkdir(this.directory, { recursive: true, mode: 0o700 });
        const path = join(this.directory, 'ledger.json');
        await writeFile(`${path}.tmp`, JSON.stringify([...this.rows.values()]), { mode: 0o600 });
        await rename(`${path}.tmp`, path);
        return value;
      } catch (err) { this.rows = before; throw err; }
    });
    this.queue = next.catch(() => {}); return next;
  }
  async get(id: string, ownerId: string) { await this.ready; await this.queue; return super.get(id, ownerId); }
  create(s: EncounterSession) { return this.transaction(() => super.create(s)); }
  save(s: EncounterSession) { return this.transaction(() => super.save(s)); }
}

class SupabaseEncounterRepository implements EncounterRepository {
  constructor(private client: SupabaseClient) {}
  async get(id: string, ownerId: string) {
    const { data, error } = await this.client.from('muse_encounters').select('session').eq('id', id).eq('initiator_id', ownerId).maybeSingle();
    if (error) throw new HttpError(503, 'Encounter storage unavailable. Apply migration 0007.');
    return (data?.session ?? null) as EncounterSession | null;
  }
  async create(s: EncounterSession) {
    const { error: expireError } = await this.client.rpc('expire_muse_encounters', { owner_id: s.initiatorId });
    if (expireError) throw new HttpError(503, 'Encounter storage unavailable. Apply migration 0007.');
    const { error } = await this.client.from('muse_encounters').insert(this.row(s));
    if (!error) return { session: s, created: true };
    if (error.code === '23505') {
      const { data, error: readError } = await this.client.from('muse_encounters').select('session')
        .eq('initiator_id', s.initiatorId).eq('request_key', s.requestKey).maybeSingle();
      if (!readError && data) return { session: data.session as EncounterSession, created: false };
      throw new HttpError(409, 'An encounter is already in progress.');
    }
    throw new HttpError(503, 'Encounter storage unavailable. Apply migration 0007.');
  }
  private row(s: EncounterSession) {
    return { id: s.id, initiator_id: s.initiatorId, request_key: s.requestKey, status: s.status,
      version: s.version, expires_at: s.expiresAt, session: s };
  }
  async save(s: EncounterSession) {
    const next = { ...s, version: s.version + 1, updatedAt: new Date().toISOString() };
    const { data, error } = await this.client.from('muse_encounters').update(this.row(next))
      .eq('id', s.id).eq('initiator_id', s.initiatorId).eq('version', s.version).eq('status', 'pending').select('id');
    if (error) throw new HttpError(503, 'Encounter could not be saved.');
    if (!data?.length) throw new HttpError(409, 'Encounter is no longer active.');
    return next;
  }
}
const g = globalThis as unknown as { __museEncounterRepo?: { key: string; repo: EncounterRepository } };
export function encounterRepository(): EncounterRepository {
  const env = supabaseEnv(), key = env ? `${env.target}|${env.url}` : 'local-file-v1';
  if (g.__museEncounterRepo?.key === key) return g.__museEncounterRepo.repo;
  if (!env && process.env.VERCEL) throw new HttpError(503, 'Configure Supabase encounter storage before hosting.');
  const repo = env ? new SupabaseEncounterRepository(createClient(env.url, env.serviceKey, { auth: { persistSession: false } }))
    : new FileEncounterRepository(join(process.cwd(), '.cache', 'muse-encounters'));
  g.__museEncounterRepo = { key, repo }; return repo;
}
