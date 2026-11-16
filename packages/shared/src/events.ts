/** Socket.IO events pushed from the API to signed-in clients. The client never polls. */
import type {
  Call,
  CallRingingEvent,
  ChannelPresence,
  Contact,
  Conversation,
  Message,
  MessageStatus,
  Template
} from './types';
import type { PresenceChannel } from './constants';

export interface ServerToClientEvents {
  'message.created': (p: { message: Message; conversation: Conversation }) => void;
  'message.status': (p: { conversationId: string; messageId: string; status: MessageStatus; error: string | null }) => void;
  'conversation.updated': (p: { conversation: Conversation }) => void;
  'conversation.assigned': (p: { conversation: Conversation; byName: string }) => void;
  'contact.updated': (p: { contact: Contact }) => void;
  'presence.updated': (p: { userId: string; channel: PresenceChannel; presence: ChannelPresence }) => void;
  'call.ringing': (p: CallRingingEvent) => void;
  'call.updated': (p: { call: Call }) => void;
  'call.signal': (p: { callId: string; sdpAnswer: string }) => void;
  'template.status': (p: { template: Template }) => void;
  'broadcast.progress': (p: { broadcastId: string; sent: number; delivered: number; read: number; failed: number; status: string }) => void;
  notice: (p: { text: string; level: 'info' | 'warn' | 'error' }) => void;
  'session.revoked': (p: { reason: string }) => void;
}

export interface ClientToServerEvents {
  'conversation.typing': (p: { conversationId: string }) => void;
}

export const SOCKET_PATH = '/socket.io';
