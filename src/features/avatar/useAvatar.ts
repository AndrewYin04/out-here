'use client';

// Looks per person, live. A viewer's own edits are saved in this browser (per person id), so a
// second window showing another persona sees the new look immediately (storage events). Demo
// data: it does not sync across devices.
import { useEffect, useState, useSyncExternalStore } from 'react';
import { renderLook, type Framing } from './compose';
import { mockLook, parseLook, type AvatarLook } from './looks';

const KEY = (personId: string) => `outhere.avatar.${personId}`;
const CHANGED = 'outhere-avatar-changed';

function readSaved(personId: string): AvatarLook | null {
  try {
    const raw = window.localStorage.getItem(KEY(personId));
    return raw ? parseLook(JSON.parse(raw)) : null;
  } catch {
    return null;
  }
}

export function saveLook(personId: string, look: AvatarLook): void {
  try { window.localStorage.setItem(KEY(personId), JSON.stringify(look)); } catch { /* private mode: keep in memory only */ }
  memory.set(personId, look);
  window.dispatchEvent(new CustomEvent(CHANGED, { detail: personId }));
}

export function resetLook(personId: string): void {
  try { window.localStorage.removeItem(KEY(personId)); } catch { /* ignore */ }
  memory.delete(personId);
  window.dispatchEvent(new CustomEvent(CHANGED, { detail: personId }));
}

const memory = new Map<string, AvatarLook>();

function subscribe(onChange: () => void) {
  window.addEventListener('storage', onChange);
  window.addEventListener(CHANGED, onChange);
  return () => { window.removeEventListener('storage', onChange); window.removeEventListener(CHANGED, onChange); };
}

/** A person's current look (their saved edit, else their mock look). */
export function useLook(personId: string): AvatarLook {
  const saved = useSyncExternalStore(
    subscribe,
    () => {
      // Return a stable string so React can compare snapshots.
      try { return window.localStorage.getItem(KEY(personId)) ?? (memory.has(personId) ? JSON.stringify(memory.get(personId)) : ''); } catch { return ''; }
    },
    () => '',
  );
  if (saved) {
    try { return parseLook(JSON.parse(saved)) ?? mockLook(personId); } catch { /* fall through */ }
  }
  return mockLook(personId);
}

/** The rendered picture of a look, or null while it renders (show the photo meanwhile). */
export function useLookImage(look: AvatarLook, framing: Framing): string | null {
  const [url, setUrl] = useState<string | null>(null);
  const key = JSON.stringify(look) + framing;
  useEffect(() => {
    let alive = true;
    renderLook(look, framing).then((u) => { if (alive) setUrl(u); }).catch(() => { if (alive) setUrl(null); });
    return () => { alive = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- key covers look + framing
  }, [key]);
  return url;
}

/** Picture of a person's avatar, or null while it renders. */
export function useAvatarImage(personId: string, framing: Framing = 'portrait'): string | null {
  return useLookImage(useLook(personId), framing);
}

export { readSaved };
