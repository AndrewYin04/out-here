// Barrel for the muse area. Server-side only: importing values from here pulls in the
// `openai` client and node:crypto. Client components should `import type` from here only.
export {
  MIN_ATTEMPT_MS, MuseError, MuseTimeoutError, MUSE_TIMEOUT_MS, extractJSON, reportFallback, hashInput, isMockMode, modelFor, museJSON, onRun, setMuseTransport,
} from './client';
export type {
  MuseEffort, MuseJSONOptions, MuseMessage, MuseModelRole, MuseResult, MuseRunRecord, MuseTransport, MuseUsage,
} from './client';
export {
  UnknownUserError, firstName, getPlanContextProvider, setPlanContextProvider, sharedInterests,
} from './context';
export type { PlanContext, PlanContextProvider, PlanContextRequest, PlanFriend } from './context';
export { buildSeedWorld, contextFromWorld, seedPlanContextProvider } from './seed-context';
export type { SeedWorld } from './seed-context';
export { mockParse, parseIntent, toMuseIntent } from './intent';
export type { ParsedIntent, RawIntent } from './intent';
export {
  activityMatches, buildCandidates, friendsFreeInWindow, interestsMatchingQuest, isFoodCompatible, questVisibleTo, walkCap,
} from './candidates';
export type {
  CandidateInput, CandidateResult, DropReason, DroppedQuest, FriendFree, FriendOverlap, PlanCandidate,
} from './candidates';
export { MAX_SUGGESTIONS, rankAndExplain } from './rank';
export type { RankResult } from './rank';
export { checkSummary, claimFacts, claimIssue, leakedNames, validate } from './validate';
export type { ClaimContext, ClaimFacts, SummaryCheck, ValidationIssue } from './validate';
export { PARSE_BUDGET_MS, PLAN_BUDGET_MS, RANK_BUDGET_MS, plan } from './plan';
export type { PlanInput, PlanMeta, PlanOutput, PlanSource, PlanTimings } from './plan';
export { resolveWindow, wallClock, fromWallClock, nextClock } from './time';
export type { TimeExpression } from './time';
export { HANG_BUDGET_MS, hangCopyIssue, mockHangCopy, writeHangCopy } from './hang';
export type { HangCopy, HangCopyInput } from './hang';
