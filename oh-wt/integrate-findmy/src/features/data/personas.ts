// The 8 demo personas for the switcher, in switcher order. Client-safe (no seed JSON import).
import { PERSONA_HANDLES, profileId, type PersonaHandle } from '@/shared';

export type Persona = { handle: PersonaHandle; id: string; name: string; avatarUrl: string };

const NAMES: Record<PersonaHandle, string> = {
  alex: 'Alex Rivera', maya: 'Maya Chen', jordan: 'Jordan Brooks', priya: 'Priya Natarajan',
  sam: 'Sam Okafor', leo: 'Leo Marchetti', nina: 'Nina Park', kai: 'Kai Nakamura',
};

export const PERSONAS: readonly Persona[] = PERSONA_HANDLES.map((handle) => ({
  handle, id: profileId(handle), name: NAMES[handle], avatarUrl: `/seed/people/${handle}.webp`,
}));

export const DEFAULT_PERSONA: PersonaHandle = 'alex';

export function isPersonaHandle(h: string | null | undefined): h is PersonaHandle {
  return !!h && (PERSONA_HANDLES as readonly string[]).includes(h);
}

export function personaByHandle(h: string): Persona | undefined {
  return PERSONAS.find((p) => p.handle === h);
}
