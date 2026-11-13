// The Muse companion: one state machine, one conversation, one chat, shared by the 3D world,
// the Out Here map, Memories and later features (Side Quests, Photo Judge, agent hand-offs).
export { MuseChat } from './MuseChat';
export { MuseOrb } from './MuseOrb';
export { openChat, closeChat, sendMessage, selectPlan, museDispatch, useMuseSnapshot, useChatMessages } from './controller';
export { petPose, type MuseEvent, type MuseSnapshot, type MuseState, type ExternalState } from './state';

export { sendAgentMessage, finishAgentEncounter, useAgentEncounter } from './controller';
export type { AgentEncounter, AgentTransport, AgentRecipient, AgentEvent } from './encounter';
export {beginPhotoAnalysis,endPhotoAnalysis} from './controller';
export {attachMuseWorld,minimizeChat,setMuseViewport,useMuseViewport,setPhotoAnalysisTarget,photoTargetForRender} from './controller';
export type {MuseViewport} from './controller';
