'use client';

// Client loaders for Memories, built only on existing APIs:
//   GET /api/crews, GET /api/muse/regroup (member cards + crew thread), GET /api/memories?crewId,
//   GET /api/quests/:id (venue, time, price cap, members; exact location for members only).
import type { Crew, Memory } from '@/shared';
import { apiFetch, currentPersona } from '@/features/data';
import { buildJourney, journeyQuestIds, type Journey, type QuestDetailLite } from './journey';
import type { CrewMeta } from './useRegroup';

export type CrewRow = Crew & { meta: CrewMeta | null; memories: Memory[]; viewerId: string };

export class CrewNotFoundError extends Error {
  constructor() { super('This memory is not available.'); }
}

// Skip any cached snapshot so a photo just captured shows up (same header as main's page).
const FRESH: RequestInit = { headers: { 'x-outhere-fresh': '1' } };

/** Uploaded crew photos are served by /api/memories/:id/photo, which needs the persona in the URL. */
export function photoSrc(m: Memory, handle: string): string {
  return m.photoUrl === `/api/memories/${m.id}/photo` ? `${m.photoUrl}?as=${encodeURIComponent(handle)}` : m.photoUrl;
}

async function crewsAndMeta() {
  const [{ crews }, { crews: metas, viewerId }] = await Promise.all([
    apiFetch<{ crews: Crew[] }>('/api/crews', FRESH),
    apiFetch<{ viewerId: string; crews: CrewMeta[] }>('/api/muse/regroup', FRESH),
  ]);
  return { crews, metas, viewerId };
}

const crewMemories = (crewId: string) =>
  apiFetch<{ memories: Memory[] }>(`/api/memories?crewId=${encodeURIComponent(crewId)}`, FRESH)
    .then((r) => r.memories.map((m) => ({ ...m, photoUrl: photoSrc(m, currentPersona()) })))
    .catch(() => [] as Memory[]);

/** The viewer's crews with their album photos (the Memories library). */
export async function loadCrewRows(): Promise<CrewRow[]> {
  const { crews, metas, viewerId } = await crewsAndMeta();
  return Promise.all(crews.map(async (c) => ({
    ...c, meta: metas.find((m) => m.crewId === c.id) ?? null, memories: await crewMemories(c.id), viewerId,
  })));
}

export type JourneyData = { journey: Journey; meta: CrewMeta | null; viewerId: string };

/** One crew's journey: its photos grouped into stops with the hangouts' real details. */
export async function loadJourney(crewId: string): Promise<JourneyData> {
  const { crews, metas, viewerId } = await crewsAndMeta();
  const crew = crews.find((c) => c.id === crewId);
  if (!crew) throw new CrewNotFoundError();
  const memories = await crewMemories(crew.id);
  const ids = journeyQuestIds(crew, memories);
  const details = await Promise.all(ids.map((id) =>
    apiFetch<QuestDetailLite>(`/api/quests/${encodeURIComponent(id)}`).catch(() => null)));
  const quests = Object.fromEntries(ids.map((id, i) => [id, details[i]]));
  const meta = metas.find((m) => m.crewId === crew.id) ?? null;
  return { journey: buildJourney({ crew, members: meta?.members ?? [], memories, quests }), meta, viewerId };
}
