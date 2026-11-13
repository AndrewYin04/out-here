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
export {
  QUEST_CATEGORIES, RAW_DRAFT_JSON_SCHEMA, RawDraftZ, draftMessages, mockDraft, nearbyPlaces, validateDraft,
} from './create-quest';
export type { CreateQuestContext, DraftPlace, RawDraft } from './create-quest';
export {
  HANG_MAX_WALK_MIN, RAW_HANG_JSON_SCHEMA, RawHangZ, hangMessages, hangPlaces, laClock, mockHang, openThrough, validateHang,
} from './draft-hang';
export type { HangContext, HangDraft, HangPlace, HangPlaceInput, RawHang } from './draft-hang';
export {
  ARRIVE_BEFORE_END_MIN, RAW_WANT_JSON_SCHEMA, RawWantZ, checkFindLine, cleanTitle, codeLine, explainFind, findFacts, matchListings,
  mockWant, museFinds, parseWant, titleMatches, validateWant,
} from './finds';
export type { FindCandidate, ParsedWant, RawWant } from './finds';
export {
  MAX_PICKS, MAX_TOPICS, MIN_FRESH_SECONDS, MIN_TOPIC_SECONDS, NEW_WINDOW_MIN, checkReason, codeReason, marketplacePicks, mockPicks, mockTaste,
  stems as watchStems, validateTaste,
} from './watch-picks';
export type { PicksInput } from './watch-picks';
