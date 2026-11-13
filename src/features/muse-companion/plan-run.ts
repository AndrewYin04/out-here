'use client';
// The "I'm free" run Muse is working on right now: the pipeline stages the server has reported so
// far, then the result. The plan sheet writes it; the map's Jolly (MuseMapLayer, via
// useMuseCommentary) and anything else that shows Muse at work reads it.
import { useSyncExternalStore } from 'react';
import type { PlanStageEvent } from '@/shared';
import type { PlanResponse, PlanResult } from '@/features/outhere/plan-api';

export type PlanRun = { id: number; stages: PlanStageEvent[]; result: { plan: PlanResponse; source: PlanResult['museSource'] } | null; failed: boolean };

let run: PlanRun | null = null;
const subs = new Set<() => void>();
const emit = () => { for (const s of subs) s(); };

export function startPlanRun(id: number): void { run = { id, stages: [], result: null, failed: false }; emit(); }
export function addPlanStage(id: number, e: PlanStageEvent): void { if (run?.id !== id) return; run = { ...run, stages: [...run.stages, e] }; emit(); }
export function finishPlanRun(id: number, result: PlanRun['result'], failed = false): void { if (run?.id !== id) return; run = { ...run, result, failed }; emit(); }
export function clearPlanRun(): void { if (!run) return; run = null; emit(); }
export function usePlanRun(): PlanRun | null {
  return useSyncExternalStore((f) => { subs.add(f); return () => { subs.delete(f); }; }, () => run, () => null);
}
