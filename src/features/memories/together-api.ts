'use client';
// Saving to a hangout's crew album: complete the plan (makes the crew, allowed up to
// EARLY_PHOTO_MS before the start), then upload. Shared by the together capsule's candid 📸 and
// the memory page.
import { apiFetch, apiPost } from '@/features/data';
import type { CompleteQuestResponse, Memory } from '@/shared';
import { emitMemorySaved } from './arrival';

/** The crew for this plan, making it if needed. */
export async function crewFor(questId: string): Promise<string> {
  return (await apiPost<CompleteQuestResponse>(`/api/quests/${questId}/complete`, {})).crew.id;
}

export async function saveToAlbum(questId: string, file: File | Blob, caption = ''): Promise<Memory> {
  const crewId = await crewFor(questId);
  const form = new FormData();
  form.set('photo', file, file instanceof File ? file.name : 'hangout.jpg');
  form.set('questId', questId);
  form.set('crewId', crewId);
  form.set('caption', caption);
  const { memory } = await apiFetch<{ memory: Memory }>('/api/memories', { method: 'POST', body: form });
  emitMemorySaved({ questId, crewId, memoryId: memory.id });
  return memory;
}
