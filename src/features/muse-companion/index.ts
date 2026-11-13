// The Muse companion: one state machine, one conversation, one chat, shared by the 3D world,
// the Out Here map, Memories and later features (Side Quests, Photo Judge, agent hand-offs).
export { MuseChat } from './MuseChat';
export { MuseOrb } from './MuseOrb';
export { openChat, closeChat, sendMessage, selectPlan, museDispatch, useMuseSnapshot, useChatMessages } from './controller';
export { petPose, type MuseEvent, type MuseSnapshot, type MuseState, type ExternalState } from './state';

export { sendAgentMessage, finishAgentEncounter, useAgentEncounter } from './controller';
export type { AgentEncounter, AgentTransport, AgentRecipient, AgentEvent } from './encounter';
export {beginPhotoAnalysis,endPhotoAnalysis} from './controller';
export {attachMuseWorld,useMuseInWorld,setMuseDockFrom,takeMuseDockFrom,minimizeChat,setMuseViewport,useMuseViewport,setPhotoAnalysisTarget,photoTargetForRender} from './controller';
export type {MuseViewport} from './controller';

export {beginMuseActivity,finishMuseActivity,releaseMuseActivity,useMuseActivity} from './controller';
export {MuseActivityStatus} from './MuseActivityStatus';
export type {MuseActivity, MuseActivityOutcome} from './controller';

export type { ChatMessage } from './controller';
export { useMuseCommentary, type MuseCommentary } from './commentary';
export { showMuseNudge, dismissMuseNudge, useMuseNudge, type MuseNudge } from './controller';
export type { Thought, ThoughtFocus } from './thought-line';
export { startPlanRun, addPlanStage, finishPlanRun, clearPlanRun, usePlanRun, type PlanRun } from './plan-run';
