import { z } from 'zod';
const text = (max: number) => z.string().trim().min(1).max(max).refine(s => !/<[^>]*>/.test(s), 'Plain text only');
export const PhotoRequestZ = z.object({ memoryId:z.uuid(), consent:z.literal(true) }).strict();
export const PhotoObservationZ = z.object({
  observation:text(200), caption:text(160).nullable(), reaction:text(100).nullable(),
  clarity:z.enum(['clear','uncertain']),
}).strict();
export const PhotoResultZ = PhotoObservationZ.extend({
  memoryId:z.uuid(), mode:z.enum(['live','mock']), source:z.literal('vision'),
}).strict();
export type PhotoResult = z.infer<typeof PhotoResultZ>;
