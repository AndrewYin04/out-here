// Per-tab demo identity (plan section 4.1): ?as=<handle> is stored in sessionStorage, so two
// tabs in one browser can be two different personas. A cookie would make them the same person.

export const PERSONA_STORAGE_KEY = 'outhere.persona';
export const PERSONA_QUERY_PARAM = 'as';

function readStorage(): string | null {
  try {
    return window.sessionStorage.getItem(PERSONA_STORAGE_KEY);
  } catch {
    return null;
  }
}

function writeStorage(handle: string): void {
  try {
    window.sessionStorage.setItem(PERSONA_STORAGE_KEY, handle);
  } catch {
    // storage blocked (private mode): ?as= in the URL still works for this page load
  }
}

/**
 * The active persona for this tab. A valid ?as= wins and is saved; otherwise the saved
 * handle; otherwise `fallback`. Browser only.
 */
export function resolvePersonaHandle(valid: readonly string[], fallback: string): string {
  const fromUrl = new URLSearchParams(window.location.search).get(PERSONA_QUERY_PARAM);
  if (fromUrl && valid.includes(fromUrl)) {
    writeStorage(fromUrl);
    return fromUrl;
  }
  const saved = readStorage();
  if (saved && valid.includes(saved)) return saved;
  return fallback;
}

/** Default persona switch: save the handle and reload the current page with ?as=<handle>. */
export function defaultSwitchPersona(handle: string): void {
  writeStorage(handle);
  const url = new URL(window.location.href);
  url.searchParams.set(PERSONA_QUERY_PARAM, handle);
  window.location.assign(url.toString());
}
