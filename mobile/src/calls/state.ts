import type { Call } from '@smart-reply/shared';

export type CallPhase = 'idle' | 'incoming' | 'dialing' | 'connecting' | 'active' | 'ended';

export interface CallPeer {
  contactId: string;
  name: string;
  initials: string;
  phone: string;
  avatarColor: string;
}

export interface CallState {
  phase: CallPhase;
  call: Call | null;
  peer: CallPeer | null;
  direction: 'in' | 'out' | null;
  sdpOffer: string | null;
  connectedAt: number | null;
  muted: boolean;
  speaker: boolean;
  /** Why the call ended or failed, shown briefly before the screen closes. */
  message: string | null;
}

export type CallAction =
  | { type: 'ringing'; call: Call; sdpOffer: string | null }
  | { type: 'dial'; peer: CallPeer }
  | { type: 'placed'; call: Call }
  | { type: 'answering' }
  | { type: 'connected'; at: number }
  | { type: 'updated'; call: Call }
  | { type: 'mute'; muted: boolean }
  | { type: 'speaker'; on: boolean }
  | { type: 'end'; message: string | null }
  | { type: 'reset' };

export const idleCall: CallState = {
  phase: 'idle',
  call: null,
  peer: null,
  direction: null,
  sdpOffer: null,
  connectedAt: null,
  muted: false,
  speaker: false,
  message: null
};

export function peerOf(call: Call): CallPeer {
  return {
    contactId: call.contactId,
    name: call.contact.name,
    initials: call.contact.initials,
    phone: call.contact.phone,
    avatarColor: call.contact.avatarColor
  };
}

const LIVE_PHASES: CallPhase[] = ['incoming', 'dialing', 'connecting', 'active'];
export const isLive = (s: CallState) => LIVE_PHASES.includes(s.phase);

/** Whether a `call.updated` event means the call is over for this device. */
export function endsCall(state: CallState, call: Call): boolean {
  if (call.outcome === 'ringing' || call.outcome === 'ongoing') return false;
  if (call.endedAt) return true;
  // "answered" while we are answering or talking is our own answer, not the end.
  if (call.outcome === 'answered') return state.phase === 'incoming';
  return true;
}

export function endMessage(call: Call, myUserId: string | null): string {
  switch (call.outcome) {
    case 'answered':
      if (call.handledBy && call.handledBy.userId !== myUserId) return `Answered by ${call.handledBy.name}`;
      return call.endedAt ? 'Call ended' : 'Answered';
    case 'missed':
      return 'Missed call';
    case 'rejected':
      return call.direction === 'out' ? 'Call declined' : 'Declined';
    case 'forwarded':
      return 'Forwarded';
    case 'transferred':
      return 'Transferred';
    case 'failed':
      return 'Call failed';
    default:
      return 'Call ended';
  }
}

export function callReducer(state: CallState, action: CallAction, myUserId: string | null = null): CallState {
  switch (action.type) {
    case 'ringing':
      // Never interrupt a call in progress with a second one.
      if (isLive(state) && state.call?.id !== action.call.id) return state;
      return { ...idleCall, phase: 'incoming', call: action.call, peer: peerOf(action.call), direction: 'in', sdpOffer: action.sdpOffer };
    case 'dial':
      if (isLive(state)) return state;
      return { ...idleCall, phase: 'dialing', peer: action.peer, direction: 'out' };
    case 'placed':
      if (state.phase !== 'dialing') return state;
      return { ...state, call: action.call };
    case 'answering':
      if (state.phase !== 'incoming') return state;
      return { ...state, phase: 'connecting' };
    case 'connected':
      if (state.phase !== 'connecting' && state.phase !== 'dialing') return state;
      return { ...state, phase: 'active', connectedAt: action.at };
    case 'updated': {
      if (!state.call || state.call.id !== action.call.id || !isLive(state)) return state;
      if (endsCall(state, action.call)) {
        return { ...state, phase: 'ended', call: action.call, message: endMessage(action.call, myUserId) };
      }
      return { ...state, call: action.call };
    }
    case 'mute':
      return { ...state, muted: action.muted };
    case 'speaker':
      return { ...state, speaker: action.on };
    case 'end':
      if (state.phase === 'idle') return state;
      return { ...state, phase: 'ended', message: action.message ?? state.message ?? 'Call ended' };
    case 'reset':
      return idleCall;
    default:
      return state;
  }
}
