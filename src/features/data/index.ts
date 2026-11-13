// Client-safe barrel for the data area: identity, apiFetch, realtime and data hooks.
// Server code (route handlers, Muse) imports '@/features/data/server' instead.
export { apiFetch, apiPost, uploadImage, ApiFetchError, currentPersona, initPersonaFromUrl, setPersona, PERSONA_STORAGE_KEY, PERSONA_EVENT } from './client';
export { PERSONAS, DEFAULT_PERSONA, isPersonaHandle, personaByHandle, type Persona } from './personas';
export {
  useViewer, useChannel, useOnline, useApi, useQuests, useQuest, useFriendAvailability, useInvites,
  useCrews, useNotifications, useFeed, realtimeConfig, type ApiState, type ChannelHandler, type RealtimeConfig,
} from './hooks';
export type { QuestDetail, AvailabilityItem, InviteView, PostWithShared } from './core';
export type { Walker } from './walkers';
export { hereLocation, setWhere, useWhere, type Where, type WhereMode, type WhereStatus } from './where';
