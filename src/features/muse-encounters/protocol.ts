import { z } from 'zod';
import type { PlanSuggestion } from '@/shared';

export const StartEncounterZ = z.object({
  requestKey: z.uuid(), recipientId: z.uuid(), text: z.string().trim().min(1).max(280),
}).strict();
export const RequestPayloadZ = z.object({
  activity: z.enum(['food', 'music', 'sports', 'study', 'thrift', 'art', 'outdoors', 'games', 'other']),
  budgetMax: z.number().min(0).max(10000).nullable(),
  time: z.enum(['now', 'tonight', 'tomorrow']),
  startClock: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/).nullable(),
  endClock: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/).nullable(),
}).strict();
export const ReplyPayloadZ = z.object({
  availability: z.enum(['shared_window', 'unknown']), slotId: z.string().max(64).nullable(),
  questId: z.string().max(64).nullable(), approvalRequired: z.literal(true),
}).strict();
export const MessageZ = z.object({
  id: z.uuid(), sessionId: z.uuid(), senderAgentId: z.string(), recipientAgentId: z.string(),
  intent: z.enum(['check_availability', 'request_approval']),
  payload: z.union([RequestPayloadZ, ReplyPayloadZ]), summary: z.string().max(1000), timestamp: z.iso.datetime(),
}).strict();
export type AgentMessage = z.infer<typeof MessageZ>;
export type CoordinationRequest = z.infer<typeof RequestPayloadZ>;
export type CoordinationReply = z.infer<typeof ReplyPayloadZ>;
export type EncounterResult = {
  text: string; outcome: 'success' | 'unavailable' | 'no_response'; mode: 'live' | 'mock';
  approvalRequired: true; suggestions: PlanSuggestion[];
};
/** Only these facts leave the server. Prompts and model prose never enter this stream. */
export const EventZ = z.object({
  id: z.string().max(100), type: z.enum(['accepted', 'sent', 'received']), recipientId: z.uuid(),
  mode: z.enum(['live', 'mock']),
}).strict();
export type EncounterEvent = z.infer<typeof EventZ>;
export type EncounterSession = {
  id: string; requestKey: string; inputHash: string; initiatorId: string; recipientId: string;
  status: 'pending' | 'completed' | 'error' | 'cancelled' | 'timeout'; mode: 'live' | 'mock';
  messages: AgentMessage[]; events: EncounterEvent[]; result: EncounterResult | null;
  failure: string | null; createdAt: string; updatedAt: string; expiresAt: string; version: number;
};
