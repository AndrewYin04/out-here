// What Muse is doing, as the server reports it: the plan pipeline's stages as each one finishes
// (streamed by POST /api/muse/plan?stream=1), and the viewer's own recent Muse operations from
// the run log (GET /api/muse/runs). Ids, counts, model names and timings only: never another
// person's text, place or location, and never prompts or raw model output.
import type { ID, MuseIntent } from './types';

export type PlanStageEvent =
  /** Loaded what Muse may use for this viewer: friends and the plans they can see. */
  | { stage: 'context'; ms: number; friends: number; quests: number }
  /** Read the ask (a model call, or the cache of one, or code when the model failed). */
  | { stage: 'parse'; ms: number; model: string; cached: boolean; understood: boolean; intent: MuseIntent }
  /** Code: which plans fit the window, walk and budget, and which friends are free in it. */
  | { stage: 'candidates'; ms: number; fit: number; checked: number;
      friendsFree: { friendId: ID; firstName: string; freeUntil: string }[];
      dropped: { questId: ID; reason: string }[] }
  /** Ranked and explained the plans that fit (a model call, the cache, or code on fallback). */
  | { stage: 'rank'; ms: number; model: string; cached: boolean; fallback: boolean; picks: number }
  /** Code: re-checked every pick against the data (times, walks, seats, names). */
  | { stage: 'validate'; ms: number; kept: number; removed: number };

export type PlanStage = PlanStageEvent['stage'];
export const PLAN_STAGES: readonly PlanStage[] = ['context', 'parse', 'candidates', 'rank', 'validate'];

/** One Muse operation from the run log, for the viewer's own "what Muse did" list. */
export type MuseOp = { route: string; model: string; latencyMs: number; ok: boolean; cached: boolean; mock: boolean; at: string };
