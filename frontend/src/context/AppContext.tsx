'use client';

/**
 * App state for the signed-in manager or staff member. Server data comes from the Smart Reply
 * API through TanStack Query; live events arrive over Socket.IO and update the same caches.
 * The values keep the shapes the screens were designed with (see lib/adapters.ts).
 */
import React, { createContext, ReactNode, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { useQuery, useQueryClient, InfiniteData } from '@tanstack/react-query';
import type {
  ActiveCalls,
  AiAddon,
  AiBotLog as ApiAiLog,
  AiBotSettingsSummary,
  BreakEntry,
  Call as ApiCall,
  CallSettings as ApiCallSettings,
  ChannelPresence,
  Contact as ApiContact,
  Conversation as ApiConversation,
  ConversationCounts,
  IvrMenu,
  MediaItem as ApiMedia,
  Message as ApiMessage,
  OwnerHistoryEntry,
  Page,
  Product as ApiProduct,
  QuickReply as ApiQuickReply,
  StaffMember,
  Template as ApiTemplate
} from '@smart-reply/shared';
import {
  AIBotLog,
  AIBotSettings,
  Attachment,
  CallConfig,
  CallLogItem,
  Contact,
  Conversation,
  IVROption,
  MediaItem,
  Product,
  QuickReply,
  Role,
  Staff,
  StatusType,
  Template
} from '@/types';
import { api, errorMessage } from '@/lib/api';
import {
  destinationLabels,
  fromCallConfig,
  IvrView,
  toAiLog,
  toCallConfig,
  toCallLog,
  toChannel,
  toContact,
  toConversation,
  toIvr,
  toMedia,
  toMessage,
  toProduct,
  toQuickReply,
  toStaff,
  toTemplate
} from '@/lib/adapters';
import { qk } from '@/lib/query';
import { connectSocket, AppSocket } from '@/lib/socket';
import { uploadFile } from '@/lib/upload';
import { answerOffer, applyAnswer, CallPeer, createOffer } from '@/lib/webrtc';
import { useSession } from '@/features/session';
import {
  sounds,
  playSentSound,
  playReceivedSound,
  startCallRingtone,
  stopCallRingtone,
  playCallAnswerSound,
  playCallEndSound
} from '@/utils/soundEffects';

export type WallpaperType = 'doodle' | 'plain' | 'dots' | 'emerald' | 'warm' | 'midnight' | 'rose' | 'lavender' | 'amoled';

interface Toast {
  id: string;
  message: string;
}

export interface ActiveCallState {
  c: string;
  t0: number;
  parts: string[];
  rec: boolean;
  ever: boolean;
  mute: boolean;
  spk: boolean;
  hold: boolean;
  adding: string | null;
  warm: string | null;
  pick: 'add' | 'xfer' | null;
  xm: 'warm' | 'blind';
  ivr?: IVROption | null;
  inc?: boolean;
  callId?: string;
  connected?: boolean;
}

export interface ManagerView {
  id: string;
  n: string;
  i: string;
  call: Staff['call'];
  chat: Staff['chat'];
  used: number;
  log: [string, string, number, string][];
  queue: boolean;
}

const EMPTY_CONFIG: CallConfig = {
  brkmax: 60,
  ring: 'all',
  ringsec: 20,
  rec: { auto: false, ann: true, pause: true, keep: '90' },
  link: false,
  fwd: { noans: 'queue', busy: 'wait', brk: 'queue', away: 'queue', dnd: 'msg', after: 'msg' }
};
const EMPTY_IVR: IvrView = { on: false, mode: 'tts', wait: 8, none: 'queue', after: false, greet: '', opts: [] };
const EMPTY_AI: AIBotSettings = {
  chatBotEnabled: false,
  voiceBotEnabled: false,
  chatBotMode: 'after_hours',
  personaName: '',
  languageMode: 'trilingual',
  systemPrompt: '',
  confidenceThreshold: 75,
  autoHandoffOnNegotiation: true,
  autoHandoffOnComplaint: true,
  autoHandoffOnStaffRequest: true,
  welcomeMessage: '',
  fallbackMessage: '',
  voiceModel: '',
  voiceGreeting: '',
  autoTranscribeCalls: false,
  autoSummarizeCalls: false,
  missedCallAutoFollowup: false,
  missedCallMessageTemplate: '',
  voiceLanguage: 'trilingual',
  voiceSpeed: 1
};

type CallAction = 'hold' | 'resume' | 'transfer' | 'participants' | 'recording';

interface AppContextType {
  role: Role;
  setRole: (r: Role) => void;
  screen: string;
  setScreen: (s: string) => void;
  theme: 'light' | 'dark';
  toggleTheme: () => void;
  frameTheme: 'light' | 'dark';
  toggleFrameTheme: () => void;
  sectionTheme: 'light' | 'dark';
  toggleSectionTheme: () => void;
  setSectionTheme: (t: 'light' | 'dark') => void;
  chatWallpaper: WallpaperType;
  setChatWallpaper: (wp: WallpaperType) => void;
  railOpen: boolean;
  setRailOpen: (open: boolean) => void;
  toggleRail: () => void;
  business: string;
  setBusiness: (b: string) => void;
  companyPhone: string;
  numberQuality: string;

  staff: Staff[];
  team: Staff[];
  manager: ManagerView;
  contacts: Record<string, Contact>;
  conversations: Conversation[];
  calls: CallLogItem[];
  templates: Template[];
  products: Product[];
  quickReplies: QuickReply[];
  callConfig: CallConfig;
  setCallConfig: React.Dispatch<React.SetStateAction<CallConfig>>;
  saveCallConfig: (next: CallConfig) => Promise<void>;
  ivr: IvrView;
  setIvr: React.Dispatch<React.SetStateAction<IvrView>>;
  saveIvr: (next: IvrView) => Promise<void>;
  forwardingDestinations: Record<string, string>;
  counts: ConversationCounts | null;
  loading: boolean;

  toasts: Toast[];
  addToast: (msg: string) => void;
  reportError: (err: unknown) => void;

  sheetContent: ReactNode | null;
  openSheet: (content: ReactNode) => void;
  closeSheet: () => void;

  activeCall: ActiveCallState | null;
  startCall: (cid: string, ivr?: IVROption | null, inc?: boolean) => void;
  endCall: (type?: string, note?: string) => void;
  updateActiveCall: (updater: (prev: ActiveCallState | null) => ActiveCallState | null) => void;
  callAction: (action: CallAction, body?: object) => Promise<boolean>;
  addCallNote: (note: string) => Promise<void>;

  statusModalOpen: boolean;
  setStatusModalOpen: (open: boolean) => void;
  breakModalOpen: boolean;
  setBreakModalOpen: (open: boolean) => void;

  currentUser: { name: string; title: string; initials: string; id: string };
  myStatus: Staff | ManagerView;
  setUserStatus: (chn: 'both' | 'call' | 'chat', st: StatusType, reason?: string, mins?: number) => void;
  setStaffStatus: (userId: string, chn: 'both' | 'call' | 'chat', st: StatusType) => Promise<void>;
  setOwner: (cid: string, sid: string | null, why?: string) => boolean;
  setContactLabels: (cid: string, labelIds: string[]) => Promise<void>;
  setBlocked: (cid: string, blocked: boolean) => Promise<void>;
  openConversation: (convId: string | null) => void;
  activeConversationId: string | null;
  loadOlderMessages: () => void;
  hasOlderMessages: boolean;
  openConversationForContact: (contactId: string) => Promise<string | null>;
  sendMessage: (convId: string, text: string, isNote: boolean, attachments?: Attachment[]) => void;
  sendTemplateMessage: (convId: string, template: Template, variables?: string[]) => void;
  sendProductMessage: (convId: string, productId: string) => void;
  sendQuickReplyMessage: (convId: string, quickReplyId: string) => void;
  markRead: (convId: string) => void;
  resolveConversation: (convId: string, resolved: boolean) => Promise<void>;
  setConversationState: (convId: string, patch: { favorite?: boolean; archived?: boolean }) => Promise<void>;
  setBotActive: (convId: string, active: boolean) => Promise<void>;
  requestCallPermission: (cid: string) => Promise<void>;
  receiveIncomingMessage: (convId: string, text: string, attachments?: Attachment[]) => void;
  simulateCustomerReply: (convId?: string) => void;
  soundMuted: boolean;
  toggleSoundMuted: () => boolean;
  addQuickReply: (qr: QuickReply) => void;
  updateQuickReply: (index: number, qr: QuickReply) => void;
  deleteQuickReply: (index: number) => void;
  addTemplate: (tpl: Template) => void;

  mediaList: MediaItem[];
  addMediaItem: (item: MediaItem) => void;
  deleteMediaItem: (id: string) => void;
  toggleFavoriteMedia: (id: string) => void;
  sendMediaToChat: (convId: string, media: MediaItem) => void;

  aiBotSettings: AIBotSettings;
  aiAddon: AiAddon | null;
  aiSummary: AiBotSettingsSummary | null;
  updateAIBotSettings: (updater: Partial<AIBotSettings>) => void;
  requestAiActivation: (message?: string) => Promise<void>;
  aiLogs: AIBotLog[];
  addAILog: (log: AIBotLog) => void;

  ringingCall: CallLogItem | null;
  answerIncomingCall: () => void;
  declineIncomingCall: (withMessage?: string) => void;
  forwardIncomingCall: (dest: string) => void;
  simulateIncomingCall: () => void;

  signOut: () => Promise<void>;
  refresh: (keys?: readonly (readonly unknown[])[]) => void;
}

const AppContext = createContext<AppContextType | undefined>(undefined);

type MessagesData = InfiniteData<Page<ApiMessage>, string | null>;
interface RingingState {
  call: ApiCall;
  sdpOffer: string | null;
  ivrOption: string | null;
}

function upsertConversation(list: ApiConversation[], conv: ApiConversation): ApiConversation[] {
  const next = [conv, ...list.filter(c => c.id !== conv.id)];
  next.sort((a, b) => (b.lastMessageAt ?? '').localeCompare(a.lastMessageAt ?? ''));
  return next;
}

export function AppProvider({ children }: { children: ReactNode }) {
  const { me, logout } = useSession();
  const qc = useQueryClient();
  const user = me!.user;
  const role: Role = user.role === 'manager' ? 'manager' : 'staff';
  const isManager = role === 'manager';

  /* ───────── UI state (as designed) ───────── */
  const [screen, setScreenState] = useState<string>(isManager ? 'dash' : 'mydash');
  const [frameTheme, setFrameTheme] = useState<'light' | 'dark'>('dark');
  const [sectionTheme, setSectionTheme] = useState<'light' | 'dark'>('dark');
  const [chatWallpaper, setChatWallpaperState] = useState<WallpaperType>('doodle');
  const [railOpen, setRailOpen] = useState(false);
  const [toasts, setToasts] = useState<Toast[]>([]);
  const [sheetContent, setSheetContent] = useState<ReactNode | null>(null);
  const [activeCall, setActiveCall] = useState<ActiveCallState | null>(null);
  const [statusModalOpen, setStatusModalOpen] = useState(false);
  const [breakModalOpen, setBreakModalOpen] = useState(false);
  const [soundMuted, setSoundMuted] = useState(sounds.getMuted());
  const [activeConversationId, setActiveConversationId] = useState<string | null>(null);
  const [ringing, setRinging] = useState<RingingState | null>(null);
  const peerRef = useRef<CallPeer | null>(null);
  const socketRef = useRef<AppSocket | null>(null);
  const activeIdRef = useRef<string | null>(null);
  activeIdRef.current = activeConversationId;

  useEffect(() => {
    try {
      const savedFrame = (localStorage.getItem('sr.a.frameTheme') || localStorage.getItem('sr.a.theme')) as 'light' | 'dark' | null;
      const initialFrame = savedFrame === 'light' || savedFrame === 'dark' ? savedFrame : 'dark';
      setFrameTheme(initialFrame);
      document.documentElement.setAttribute('data-theme', initialFrame);
      const savedSection = localStorage.getItem('sr.a.sectionTheme') as 'light' | 'dark' | null;
      if (savedSection === 'light' || savedSection === 'dark') setSectionTheme(savedSection);
      const savedWallpaper = localStorage.getItem('sr.a.chatWallpaper') as WallpaperType | null;
      if (savedWallpaper && ['doodle', 'plain', 'dots', 'emerald', 'warm', 'midnight', 'rose', 'lavender', 'amoled'].includes(savedWallpaper)) {
        setChatWallpaperState(savedWallpaper);
      }
      const s = new URLSearchParams(window.location.search).get('screen');
      if (s) setScreenState(s);
    } catch {
      /* storage unavailable */
    }
  }, []);

  const addToast = useCallback((message: string) => {
    const id = Math.random().toString(36).substring(2, 9);
    setToasts(prev => [...prev, { id, message }]);
    setTimeout(() => setToasts(prev => prev.filter(t => t.id !== id)), 3500);
  }, []);
  const reportError = useCallback((err: unknown) => addToast(errorMessage(err)), [addToast]);

  /* ───────── Server data ───────── */
  const staffQ = useQuery({ queryKey: qk.staff, queryFn: () => api.get<StaffMember[]>('/staff') });
  const convQ = useQuery({
    queryKey: qk.conversations('all'),
    queryFn: async () => (await api.get<Page<ApiConversation>>('/conversations', { filter: 'all', limit: 200 })).items
  });
  const archivedQ = useQuery({
    queryKey: qk.conversations('archived'),
    queryFn: async () => (await api.get<Page<ApiConversation>>('/conversations', { filter: 'archived', limit: 100 })).items
  });
  const countsQ = useQuery({ queryKey: qk.counts, queryFn: () => api.get<ConversationCounts>('/conversations/counts'), refetchInterval: 60_000 });
  const contactsQ = useQuery({ queryKey: qk.contacts, queryFn: async () => (await api.get<Page<ApiContact>>('/contacts', { limit: 200 })).items });
  const callsQ = useQuery({ queryKey: qk.calls, queryFn: async () => (await api.get<Page<ApiCall>>('/calls', { limit: 100 })).items });
  const templatesQ = useQuery({ queryKey: qk.templates, queryFn: () => api.get<ApiTemplate[]>('/templates') });
  const quickQ = useQuery({ queryKey: qk.quickReplies, queryFn: () => api.get<ApiQuickReply[]>('/quick-replies') });
  const productsQ = useQuery({ queryKey: qk.products, queryFn: () => api.get<ApiProduct[]>('/catalog/products') });
  const mediaQ = useQuery({ queryKey: qk.media, queryFn: () => api.get<ApiMedia[]>('/media') });
  const callSettingsQ = useQuery({ queryKey: qk.callSettings, queryFn: () => api.get<ApiCallSettings>('/call-settings'), enabled: isManager });
  const myBreaksQ = useQuery({
    queryKey: qk.myBreaks,
    queryFn: () => api.get<{ usedMinutes: number; limitMinutes: number; entries: BreakEntry[] }>('/me/breaks')
  });
  const ivrQ = useQuery({ queryKey: qk.ivr, queryFn: () => api.get<IvrMenu>('/ivr'), enabled: isManager });
  const aiStatusQ = useQuery({ queryKey: qk.aiStatus, queryFn: () => api.get<AiAddon>('/ai/status'), enabled: isManager });
  const aiSettingsQ = useQuery({ queryKey: qk.aiSettings, queryFn: () => api.get<AiBotSettingsSummary>('/ai/settings'), enabled: isManager });
  const aiLogsQ = useQuery({ queryKey: qk.aiLogs, queryFn: () => api.get<ApiAiLog[]>('/ai/logs'), enabled: isManager });
  const activeCallsQ = useQuery({
    queryKey: qk.activeCalls,
    queryFn: async () => (await api.get<ActiveCalls>('/calls/active')).ringing,
    staleTime: 0
  });

  const messagesQ = useQuery({
    queryKey: activeConversationId ? qk.messages(activeConversationId) : ['messages', 'none'],
    enabled: Boolean(activeConversationId),
    queryFn: async (): Promise<MessagesData> => {
      const page = await api.get<Page<ApiMessage>>(`/conversations/${activeConversationId}/messages`, { limit: 50 });
      return { pages: [page], pageParams: [null] };
    }
  });

  const allConvs = useMemo(() => {
    const list = [...(convQ.data ?? [])];
    for (const a of archivedQ.data ?? []) if (!list.some(c => c.id === a.id)) list.push(a);
    return list;
  }, [convQ.data, archivedQ.data]);

  const activeContactId = useMemo(() => allConvs.find(c => c.id === activeConversationId)?.contactId ?? null, [allConvs, activeConversationId]);
  const historyQ = useQuery({
    queryKey: activeContactId ? qk.contactHistory(activeContactId) : ['contact-history', 'none'],
    enabled: Boolean(activeContactId),
    queryFn: () => api.get<OwnerHistoryEntry[]>(`/contacts/${activeContactId}/owner-history`)
  });

  // A call that was already ringing when the page loaded.
  useEffect(() => {
    const first = activeCallsQ.data?.find(c => c.call.outcome === 'ringing');
    if (first) setRinging(prev => prev ?? first);
  }, [activeCallsQ.data]);

  /* ───────── View data ───────── */
  const members = useMemo(() => (staffQ.data ?? []).filter(m => m.status !== 'disabled'), [staffQ.data]);
  const team = useMemo(() => members.map(toStaff), [members]);
  const staff = useMemo(() => team.filter(s => s.role === 'staff'), [team]);
  const meMember = members.find(m => m.id === user.id);
  const myBreaks = myBreaksQ.data;

  const manager: ManagerView = useMemo(() => {
    const m = isManager ? meMember : members.find(x => x.role === 'manager');
    const view = m ? toStaff(m) : null;
    return {
      id: m?.id ?? 'manager',
      n: m?.name ?? (isManager ? user.name : 'Manager'),
      i: m?.initials ?? (isManager ? user.initials : 'M'),
      call: view?.call ?? toChannel(undefined),
      chat: view?.chat ?? toChannel(undefined),
      used: isManager ? (myBreaks?.usedMinutes ?? 0) : (view?.used ?? 0),
      log: view?.log ?? [],
      queue: true
    };
  }, [isManager, meMember, members, myBreaks?.usedMinutes, user.name, user.initials]);

  const contacts = useMemo(() => {
    const out: Record<string, Contact> = {};
    for (const c of contactsQ.data ?? []) out[c.id] = toContact(c);
    for (const v of allConvs) out[v.contactId] = toContact(v.contact, v.contactId === activeContactId ? (historyQ.data ?? []) : []);
    return out;
  }, [contactsQ.data, allConvs, activeContactId, historyQ.data]);

  const activeMessages = useMemo(() => {
    const all = (messagesQ.data?.pages ?? []).flatMap(p => p.items);
    return [...all].reverse().map(toMessage);
  }, [messagesQ.data]);

  const conversations = useMemo(
    () => allConvs.map(c => toConversation(c, c.id === activeConversationId ? activeMessages : [])),
    [allConvs, activeConversationId, activeMessages]
  );

  const calls = useMemo(() => {
    const list = (callsQ.data ?? []).map(toCallLog);
    if (ringing && !list.some(c => c.id === ringing.call.id)) list.unshift(toCallLog(ringing.call));
    return list;
  }, [callsQ.data, ringing]);
  const templates = useMemo(() => (templatesQ.data ?? []).map(toTemplate), [templatesQ.data]);
  const products = useMemo(() => (productsQ.data ?? []).map(toProduct), [productsQ.data]);
  const quickReplies = useMemo(() => (quickQ.data ?? []).map(toQuickReply), [quickQ.data]);
  const mediaList = useMemo(() => (mediaQ.data ?? []).map(toMedia), [mediaQ.data]);
  const aiLogs = useMemo(() => (aiLogsQ.data ?? []).map(toAiLog), [aiLogsQ.data]);

  const [callConfig, setCallConfig] = useState<CallConfig>(EMPTY_CONFIG);
  useEffect(() => {
    if (callSettingsQ.data) setCallConfig(toCallConfig(callSettingsQ.data));
    else if (myBreaks) setCallConfig(prev => ({ ...prev, brkmax: myBreaks.limitMinutes }));
  }, [callSettingsQ.data, myBreaks]);
  const [ivr, setIvr] = useState<IvrView>(EMPTY_IVR);
  useEffect(() => {
    if (ivrQ.data) setIvr(toIvr(ivrQ.data));
  }, [ivrQ.data]);

  const aiBotSettings: AIBotSettings = useMemo(() => {
    const s = aiSettingsQ.data;
    if (!s) return EMPTY_AI;
    return {
      ...EMPTY_AI,
      chatBotEnabled: s.chatBotEnabled,
      voiceBotEnabled: s.voiceBotEnabled,
      chatBotMode: s.chatBotMode,
      personaName: s.personaName,
      languageMode: s.languageMode,
      confidenceThreshold: s.confidenceThreshold,
      autoHandoffOnNegotiation: s.autoHandoffOnNegotiation,
      autoHandoffOnComplaint: s.autoHandoffOnComplaint,
      autoHandoffOnStaffRequest: s.autoHandoffOnStaffRequest,
      welcomeMessage: s.welcomeMessage,
      fallbackMessage: s.fallbackMessage,
      voiceModel: s.voiceModel,
      voiceGreeting: s.voiceGreeting,
      autoTranscribeCalls: s.autoTranscribeCalls,
      autoSummarizeCalls: s.autoSummarizeCalls,
      missedCallAutoFollowup: s.missedCallAutoFollowup,
      missedCallMessageTemplate: s.missedCallMessageTemplate,
      voiceLanguage: s.voiceLanguage,
      voiceSpeed: s.voiceSpeed
    };
  }, [aiSettingsQ.data]);

  const forwardingDestinations = useMemo(() => destinationLabels(team), [team]);

  const myStaff = team.find(s => s.id === user.id);
  const myStatus: Staff | ManagerView = isManager
    ? manager
    : myStaff
      ? { ...myStaff, used: myBreaks?.usedMinutes ?? myStaff.used }
      : { ...manager, id: user.id, n: user.name, i: user.initials };

  const company = me!.company;
  const companyPhone = company?.displayPhone ?? 'WhatsApp not connected';
  const numberQuality = me!.features.whatsappConnected ? 'Connected' : 'Not connected';
  const business = company ? `${company.name} — ${team.length} ${team.length === 1 ? 'person' : 'people'}` : '';

  /* ───────── Cache helpers ───────── */
  const putConversation = useCallback(
    (conv: ApiConversation) => {
      const visible = isManager || me!.permissions.seeAllChats || !conv.contact.ownerUserId || conv.contact.ownerUserId === user.id;
      for (const filter of ['all', 'archived'] as const) {
        qc.setQueryData<ApiConversation[]>(qk.conversations(filter), prev => {
          if (!prev) return prev;
          const belongs = visible && Boolean(conv.lastMessageAt) && conv.archived === (filter === 'archived');
          return belongs ? upsertConversation(prev, conv) : prev.filter(c => c.id !== conv.id);
        });
      }
    },
    [qc, isManager, me, user.id]
  );

  const putMessage = useCallback(
    (msg: ApiMessage, replaceId?: string) => {
      qc.setQueryData<MessagesData>(qk.messages(msg.conversationId), prev => {
        if (!prev) return prev;
        const exists = prev.pages.some(p => p.items.some(m => m.id === msg.id || m.id === replaceId));
        const pages = prev.pages.map((p, i) => {
          if (exists) return { ...p, items: p.items.filter(m => m.id !== replaceId || replaceId === msg.id).map(m => (m.id === msg.id || m.id === replaceId ? msg : m)) };
          return i === 0 ? { ...p, items: [msg, ...p.items] } : p;
        });
        return { ...prev, pages };
      });
    },
    [qc]
  );

  const patchMessages = useCallback(
    (conversationId: string, fn: (m: ApiMessage) => ApiMessage) => {
      qc.setQueryData<MessagesData>(qk.messages(conversationId), prev =>
        prev ? { ...prev, pages: prev.pages.map(p => ({ ...p, items: p.items.map(fn) })) } : prev
      );
    },
    [qc]
  );

  const refresh = useCallback(
    (keys?: readonly (readonly unknown[])[]) => {
      if (!keys) void qc.invalidateQueries();
      else for (const k of keys) void qc.invalidateQueries({ queryKey: k });
    },
    [qc]
  );

  /* ───────── Live events ───────── */
  const handlers = useRef({ putConversation, putMessage, patchMessages, addToast, reportError, logout });
  handlers.current = { putConversation, putMessage, patchMessages, addToast, reportError, logout };

  useEffect(() => {
    const socket = connectSocket();
    socketRef.current = socket;
    const h = () => handlers.current;
    socket.on('message.created', ({ message, conversation }) => {
      h().putConversation(conversation);
      h().putMessage(message);
      if (message.direction === 'in') {
        playReceivedSound();
        if (conversation.id !== activeIdRef.current || document.hidden) {
          h().addToast(`💬 ${conversation.contact.name}: ${message.body.slice(0, 60) || 'New message'}`);
        }
      }
      void qc.invalidateQueries({ queryKey: qk.counts });
    });
    socket.on('message.status', ({ conversationId, messageId, status, error }) => {
      h().patchMessages(conversationId, m => (m.id === messageId ? { ...m, status, error } : m));
      if (status === 'failed' && error) h().addToast(`Message not delivered: ${error}`);
    });
    socket.on('conversation.updated', ({ conversation }) => {
      h().putConversation(conversation);
      void qc.invalidateQueries({ queryKey: qk.counts });
    });
    socket.on('conversation.assigned', ({ conversation, byName }) => {
      h().putConversation(conversation);
      h().addToast(`New chat assigned to you: ${conversation.contact.name} (${byName}).`);
      playReceivedSound();
    });
    socket.on('contact.updated', ({ contact }) => {
      qc.setQueryData<ApiContact[]>(qk.contacts, prev => (prev ? prev.map(c => (c.id === contact.id ? contact : c)) : prev));
      for (const filter of ['all', 'archived'] as const) {
        qc.setQueryData<ApiConversation[]>(qk.conversations(filter), prev => (prev ? prev.map(c => (c.contactId === contact.id ? { ...c, contact } : c)) : prev));
      }
      void qc.invalidateQueries({ queryKey: qk.contactHistory(contact.id) });
    });
    socket.on('presence.updated', ({ userId, channel, presence }) => {
      qc.setQueryData<StaffMember[]>(qk.staff, prev => (prev ? prev.map(m => (m.id === userId ? { ...m, presence: { ...m.presence, [channel]: presence } } : m)) : prev));
    });
    socket.on('call.ringing', payload => {
      setRinging(payload);
      startCallRingtone();
      qc.setQueryData<ApiCall[]>(qk.calls, prev => (prev ? [payload.call, ...prev.filter(c => c.id !== payload.call.id)] : prev));
    });
    socket.on('call.updated', ({ call }) => {
      qc.setQueryData<ApiCall[]>(qk.calls, prev => (prev ? [call, ...prev.filter(c => c.id !== call.id)] : prev));
      setRinging(prev => {
        if (prev && prev.call.id === call.id && call.outcome !== 'ringing') {
          stopCallRingtone();
          return null;
        }
        return prev;
      });
      setActiveCall(prev => {
        if (!prev || prev.callId !== call.id) return prev;
        if (call.outcome === 'ongoing') return { ...prev, connected: true, t0: prev.connected ? prev.t0 : Date.now() };
        if (call.outcome !== 'ringing') {
          peerRef.current?.close();
          peerRef.current = null;
          playCallEndSound();
          return null;
        }
        return prev;
      });
    });
    socket.on('call.signal', ({ sdpAnswer }) => {
      if (peerRef.current) void applyAnswer(peerRef.current, sdpAnswer).catch(err => h().reportError(err));
    });
    socket.on('template.status', () => void qc.invalidateQueries({ queryKey: qk.templates }));
    socket.on('broadcast.progress', () => void qc.invalidateQueries({ queryKey: ['broadcasts'] }));
    socket.on('notice', ({ text }) => h().addToast(text));
    socket.on('session.revoked', () => void h().logout());
    socket.io.on('reconnect', () => void qc.invalidateQueries());
    return () => {
      socket.removeAllListeners();
      socket.disconnect();
      socketRef.current = null;
    };
  }, [qc]);

  /* ───────── Navigation and UI ───────── */
  const setScreen = (s: string) => {
    setScreenState(s);
    setRailOpen(false);
    setSheetContent(null);
    window.scrollTo(0, 0);
  };
  const toggleFrameTheme = () => {
    const next = frameTheme === 'dark' ? 'light' : 'dark';
    setFrameTheme(next);
    document.documentElement.setAttribute('data-theme', next);
    try {
      localStorage.setItem('sr.a.frameTheme', next);
      localStorage.setItem('sr.a.theme', next);
    } catch {
      /* ignore */
    }
  };
  const toggleSectionTheme = () => {
    const next = sectionTheme === 'dark' ? 'light' : 'dark';
    setSectionTheme(next);
    try {
      localStorage.setItem('sr.a.sectionTheme', next);
    } catch {
      /* ignore */
    }
  };
  const setChatWallpaper = (wp: WallpaperType) => {
    setChatWallpaperState(wp);
    try {
      localStorage.setItem('sr.a.chatWallpaper', wp);
    } catch {
      /* ignore */
    }
  };
  const toggleSoundMuted = () => {
    const next = sounds.toggleMuted();
    setSoundMuted(next);
    addToast(next ? 'Notification sounds muted.' : 'Notification sounds enabled.');
    return next;
  };
  const closeSheet = () => setSheetContent(null);

  /* ───────── People ───────── */
  const setUserStatus = (chn: 'both' | 'call' | 'chat', st: StatusType, reason = '', mins = 0) => {
    const p: ChannelPresence = { status: st, reason, since: new Date().toISOString(), plannedMinutes: mins };
    qc.setQueryData<StaffMember[]>(qk.staff, prev =>
      prev ? prev.map(m => (m.id === user.id ? { ...m, presence: { call: chn === 'chat' ? m.presence.call : p, chat: chn === 'call' ? m.presence.chat : p } } : m)) : prev
    );
    api
      .put('/me/presence', { channel: chn, status: st, reason, plannedMinutes: mins })
      .then(() => {
        void qc.invalidateQueries({ queryKey: qk.myBreaks });
        void qc.invalidateQueries({ queryKey: qk.staff });
      })
      .catch(reportError);
    const channelLabel = chn === 'both' ? 'Calls and chats' : chn === 'call' ? 'Calls' : 'Chats';
    const stLabel = { available: 'Available', oncall: 'On a call', brk: 'On break', away: 'Away', dnd: 'Do not disturb' }[st];
    addToast(`${channelLabel}: ${stLabel}.`);
  };

  const setStaffStatus = async (userId: string, chn: 'both' | 'call' | 'chat', st: StatusType) => {
    try {
      await api.put(`/staff/${userId}/presence`, { channel: chn, status: st, reason: '', plannedMinutes: 0 });
      await qc.invalidateQueries({ queryKey: qk.staff });
    } catch (err) {
      reportError(err);
    }
  };

  const setOwner = (cid: string, sid: string | null, why = ''): boolean => {
    const c = contacts[cid];
    if (!c || (c.to || null) === (sid || null)) return false;
    api
      .put<ApiContact>(`/contacts/${cid}/owner`, { ownerUserId: sid, reason: why })
      .then(contact => {
        qc.setQueryData<ApiContact[]>(qk.contacts, prev => (prev ? prev.map(x => (x.id === contact.id ? contact : x)) : prev));
        void qc.invalidateQueries({ queryKey: qk.conversationsAll });
        void qc.invalidateQueries({ queryKey: qk.contactHistory(cid) });
        if (activeIdRef.current) void qc.invalidateQueries({ queryKey: qk.messages(activeIdRef.current) });
      })
      .catch(reportError);
    return true;
  };

  const setContactLabels = async (cid: string, labelIds: string[]) => {
    try {
      await api.put(`/contacts/${cid}/labels`, { labelIds });
      await qc.invalidateQueries({ queryKey: qk.conversationsAll });
      await qc.invalidateQueries({ queryKey: qk.contacts });
      await qc.invalidateQueries({ queryKey: qk.labels });
    } catch (err) {
      reportError(err);
    }
  };

  const setBlocked = async (cid: string, blocked: boolean) => {
    try {
      if (blocked) await api.post(`/contacts/${cid}/block`);
      else await api.del(`/contacts/${cid}/block`);
      await qc.invalidateQueries({ queryKey: qk.conversationsAll });
      await qc.invalidateQueries({ queryKey: qk.contacts });
      addToast(blocked ? 'Blocked. They cannot reach this team until unblocked.' : 'Unblocked.');
    } catch (err) {
      reportError(err);
    }
  };

  /* ───────── Chats ───────── */
  const markRead = (convId: string) => {
    const conv = convQ.data?.find(c => c.id === convId);
    if (conv && conv.unreadCount === 0) return;
    qc.setQueryData<ApiConversation[]>(qk.conversations('all'), prev => (prev ? prev.map(c => (c.id === convId ? { ...c, unreadCount: 0 } : c)) : prev));
    api
      .post(`/conversations/${convId}/read`)
      .then(() => void qc.invalidateQueries({ queryKey: qk.counts }))
      .catch(() => undefined);
  };

  const openConversation = (convId: string | null) => {
    setActiveConversationId(convId);
    if (convId) markRead(convId);
  };

  const loadOlderMessages = () => {
    const id = activeConversationId;
    const data = messagesQ.data;
    const cursor = data?.pages[data.pages.length - 1]?.nextCursor;
    if (!id || !cursor) return;
    api
      .get<Page<ApiMessage>>(`/conversations/${id}/messages`, { cursor, limit: 50 })
      .then(page => qc.setQueryData<MessagesData>(qk.messages(id), prev => (prev ? { pages: [...prev.pages, page], pageParams: [...prev.pageParams, cursor] } : prev)))
      .catch(reportError);
  };
  const lastPage = messagesQ.data?.pages[messagesQ.data.pages.length - 1];
  const hasOlderMessages = Boolean(lastPage?.nextCursor);

  const openConversationForContact = async (contactId: string): Promise<string | null> => {
    try {
      const conv = await api.get<ApiConversation>(`/conversations/by-contact/${contactId}`);
      if (conv.lastMessageAt) putConversation(conv);
      return conv.id;
    } catch (err) {
      reportError(err);
      return null;
    }
  };

  const tempMessage = (convId: string, text: string, isNote: boolean, attachments: Attachment[]): ApiMessage => ({
    id: `tmp-${Math.random().toString(36).slice(2)}`,
    conversationId: convId,
    direction: isNote ? 'note' : 'out',
    type: isNote ? 'note' : 'text',
    body: text,
    sender: { kind: 'user', userId: user.id, name: user.name },
    templateName: null,
    buttons: [],
    attachments: attachments.map((a, i) => ({
      id: a.fileId ?? `tmp-file-${i}`,
      kind: a.type === 'image' ? 'image' : a.type === 'voice' ? 'audio' : 'document',
      name: a.name,
      mime: a.mime ?? a.file?.type ?? '',
      sizeBytes: a.size,
      url: a.url ?? '',
      durationSeconds: null,
      voice: a.type === 'voice'
    })),
    status: 'queued',
    error: null,
    replyToId: null,
    createdAt: new Date().toISOString()
  });

  const sendMessage = (convId: string, text: string, isNote: boolean, attachments: Attachment[] = []) => {
    const temp = tempMessage(convId, text, isNote, attachments);
    putMessage(temp);
    void (async () => {
      try {
        const fileIds: string[] = [];
        for (const a of attachments) {
          if (a.fileId) fileIds.push(a.fileId);
          else if (a.file) fileIds.push(await uploadFile(a.file, a.name, 'message'));
        }
        const voice = attachments.some(a => a.type === 'voice');
        if (isNote) {
          const msg = await api.post<ApiMessage>(`/conversations/${convId}/notes`, { text: text || '(attachment)', fileIds });
          putMessage(msg, temp.id);
          addToast("Note saved. The customer can't see it.");
        } else {
          const msgs = await api.post<ApiMessage[]>(`/conversations/${convId}/messages`, { text, fileIds, voice });
          msgs.forEach((m, i) => putMessage(m, i === 0 ? temp.id : undefined));
          playSentSound();
        }
      } catch (err) {
        patchMessages(convId, m => (m.id === temp.id ? { ...m, status: 'failed', error: errorMessage(err) } : m));
        reportError(err);
      }
    })();
  };

  const sendTemplateMessage = (convId: string, template: Template, variables: string[] = []) => {
    if (!template.id) return;
    api
      .post<ApiMessage>(`/conversations/${convId}/templates`, { templateId: template.id, variables })
      .then(msg => {
        putMessage(msg);
        playSentSound();
        addToast(`Template “${template.n}” sent.`);
      })
      .catch(reportError);
  };

  const sendProductMessage = (convId: string, productId: string) => {
    api
      .post<ApiMessage[]>(`/conversations/${convId}/products`, { productId })
      .then(msgs => {
        msgs.forEach(m => putMessage(m));
        playSentSound();
        addToast('Product sent on WhatsApp.');
      })
      .catch(reportError);
  };

  const sendQuickReplyMessage = (convId: string, quickReplyId: string) => {
    api
      .post<ApiMessage[]>(`/conversations/${convId}/quick-replies/${quickReplyId}`)
      .then(msgs => {
        msgs.forEach(m => putMessage(m));
        playSentSound();
      })
      .catch(reportError);
  };

  const resolveConversation = async (convId: string, resolved: boolean) => {
    try {
      const conv = await api.post<ApiConversation>(`/conversations/${convId}/${resolved ? 'resolve' : 'reopen'}`);
      putConversation(conv);
      addToast(resolved ? 'Chat marked resolved.' : 'Chat reopened.');
    } catch (err) {
      reportError(err);
    }
  };

  const setConversationState = async (convId: string, patch: { favorite?: boolean; archived?: boolean }) => {
    try {
      const conv = await api.put<ApiConversation>(`/conversations/${convId}/state`, patch);
      putConversation(conv);
      void qc.invalidateQueries({ queryKey: qk.counts });
    } catch (err) {
      reportError(err);
    }
  };

  const setBotActive = async (convId: string, active: boolean) => {
    try {
      const conv = await api.post<ApiConversation>(`/conversations/${convId}/bot`, { active });
      putConversation(conv);
      addToast(active ? 'Chat handed back to the AI bot.' : 'You took over from the AI bot.');
    } catch (err) {
      reportError(err);
    }
  };

  const requestCallPermission = async (cid: string) => {
    try {
      await api.post(`/contacts/${cid}/call-permission-request`);
      addToast('Call permission request sent on WhatsApp.');
      void qc.invalidateQueries({ queryKey: qk.conversationsAll });
    } catch (err) {
      reportError(err);
    }
  };

  /* ───────── Content ───────── */
  const fileIdsFor = async (atts: Attachment[], purpose: 'quick_reply' | 'message'): Promise<string[]> => {
    const ids: string[] = [];
    for (const a of atts) {
      if (a.fileId) ids.push(a.fileId);
      else if (a.file) ids.push(await uploadFile(a.file, a.name, purpose));
    }
    return ids;
  };

  const addQuickReply = (qr: QuickReply) => {
    void (async () => {
      try {
        const fileIds = await fileIdsFor(qr.att, 'quick_reply');
        await api.post('/quick-replies', { command: qr.cmd, title: qr.t, text: qr.x, scope: qr.scope ?? 'everyone', fileIds });
        await qc.invalidateQueries({ queryKey: qk.quickReplies });
        addToast(`${qr.cmd} saved with ${qr.att.length} attachment(s).`);
      } catch (err) {
        reportError(err);
      }
    })();
  };

  const updateQuickReply = (index: number, qr: QuickReply) => {
    const id = qr.id ?? quickReplies[index]?.id;
    if (!id) return;
    void (async () => {
      try {
        const fileIds = await fileIdsFor(qr.att, 'quick_reply');
        await api.patch(`/quick-replies/${id}`, { command: qr.cmd, title: qr.t, text: qr.x, scope: qr.scope ?? 'everyone', fileIds });
        await qc.invalidateQueries({ queryKey: qk.quickReplies });
        addToast(`${qr.cmd} updated.`);
      } catch (err) {
        reportError(err);
      }
    })();
  };

  const deleteQuickReply = (index: number) => {
    const qr = quickReplies[index];
    if (!qr?.id) return;
    api
      .del(`/quick-replies/${qr.id}`)
      .then(() => {
        void qc.invalidateQueries({ queryKey: qk.quickReplies });
        addToast(`${qr.cmd} deleted.`);
      })
      .catch(reportError);
  };

  const addTemplate = (tpl: Template) => {
    const language = tpl.lang.startsWith('Sinhala') ? 'si' : tpl.lang.startsWith('Tamil') ? 'ta' : tpl.lang.startsWith('English') ? 'en' : tpl.lang;
    api
      .post('/templates', {
        name: tpl.n,
        category: tpl.cat.toLowerCase(),
        language,
        body: tpl.body,
        buttons: (tpl.btn ?? []).map(text => ({ type: 'QUICK_REPLY', text }))
      })
      .then(() => {
        void qc.invalidateQueries({ queryKey: qk.templates });
        addToast(`Template “${tpl.n}” submitted to Meta for review.`);
      })
      .catch(reportError);
  };

  const addMediaItem = (item: MediaItem) => {
    if (!item.fileId) return;
    api
      .post('/media', {
        fileId: item.fileId,
        title: item.title,
        caption: item.caption,
        categoryId: item.categoryId ?? null,
        tags: item.tags,
        width: item.width ?? null,
        height: item.height ?? null
      })
      .then(() => {
        void qc.invalidateQueries({ queryKey: qk.media });
        addToast(`Added "${item.title}" to Media Gallery.`);
      })
      .catch(reportError);
  };

  const deleteMediaItem = (id: string) => {
    api
      .del(`/media/${id}`)
      .then(() => {
        void qc.invalidateQueries({ queryKey: qk.media });
        addToast('Item removed from Media Gallery.');
      })
      .catch(reportError);
  };

  const toggleFavoriteMedia = (id: string) => {
    const item = mediaList.find(m => m.id === id);
    qc.setQueryData<ApiMedia[]>(qk.media, prev => (prev ? prev.map(m => (m.id === id ? { ...m, favorite: !m.favorite } : m)) : prev));
    api.put(`/media/${id}/favorite`, { favorite: !item?.isFavorite }).catch(reportError);
  };

  const sendMediaToChat = (convId: string, media: MediaItem) => {
    if (!media.fileId) return;
    sendMessage(convId, media.caption || media.title, false, [
      { type: media.type === 'image' ? 'image' : 'file', name: media.title, size: media.size, url: media.url, fileId: media.fileId, real: true }
    ]);
    api
      .post(`/media/${media.id}/share`)
      .then(() => void qc.invalidateQueries({ queryKey: qk.media }))
      .catch(() => undefined);
  };

  /* ───────── AI (read only for managers) ───────── */
  const updateAIBotSettings = () => {
    addToast('The AI bot is set up and trained by LUMI AI. Contact LUMI AI to change it.');
  };
  const requestAiActivation = async (message = '') => {
    try {
      await api.post('/ai/activation-request', { message });
      await qc.invalidateQueries({ queryKey: qk.aiStatus });
      addToast('Request sent to LUMI AI. They will contact you to activate the AI bot.');
    } catch (err) {
      reportError(err);
    }
  };

  /* ───────── Settings ───────── */
  const saveCallConfig = async (next: CallConfig) => {
    if (!callSettingsQ.data) return;
    try {
      const saved = await api.put<ApiCallSettings>('/call-settings', fromCallConfig(next, callSettingsQ.data));
      qc.setQueryData(qk.callSettings, saved);
      addToast('Call settings saved.');
    } catch (err) {
      reportError(err);
    }
  };

  const saveIvr = async (next: IvrView) => {
    try {
      const saved = await api.put<IvrMenu>('/ivr', {
        enabled: next.on,
        greetingMode: next.mode,
        greetingText: next.greet,
        greetingFileId: next.greetingFileId ?? null,
        waitSeconds: next.wait,
        noInputDestination: next.none,
        afterHoursEnabled: next.after,
        options: next.opts.map(o => ({ digit: o.k, label: o.t, destination: o.to }))
      });
      qc.setQueryData(qk.ivr, saved);
      addToast('IVR menu saved.');
    } catch (err) {
      reportError(err);
    }
  };

  /* ───────── Calls: the browser is the audio peer (Stage A) ───────── */
  const freshCall = (cid: string, extra: Partial<ActiveCallState>): ActiveCallState => ({
    c: cid,
    t0: Date.now(),
    parts: [],
    rec: false,
    ever: false,
    mute: false,
    spk: false,
    hold: false,
    adding: null,
    warm: null,
    pick: null,
    xm: 'warm',
    ...extra
  });

  const startCall = (cid: string, ivrParam?: IVROption | null, inc = false) => {
    if (inc) return;
    void (async () => {
      try {
        const { peer, sdpOffer } = await createOffer();
        peerRef.current = peer;
        setActiveCall(freshCall(cid, { ivr: ivrParam ?? null, inc: false, connected: false }));
        const call = await api.post<ApiCall>('/calls', { contactId: cid, sdpOffer });
        setActiveCall(prev => (prev ? { ...prev, callId: call.id } : prev));
        addToast(`Calling ${contacts[cid]?.n ?? 'customer'} on WhatsApp…`);
      } catch (err) {
        peerRef.current?.close();
        peerRef.current = null;
        setActiveCall(null);
        reportError(err);
      }
    })();
  };

  const endCall = (type?: string, note?: string) => {
    const current = activeCall;
    if (!current) return;
    peerRef.current?.close();
    peerRef.current = null;
    setActiveCall(null);
    playCallEndSound();
    if (current.callId) {
      const id = current.callId;
      void (async () => {
        try {
          if (note) await api.post(`/calls/${id}/notes`, { note });
          await api.post(`/calls/${id}/hangup`);
          void qc.invalidateQueries({ queryKey: qk.calls });
        } catch (err) {
          reportError(err);
        }
      })();
    }
    const durSec = Math.floor((Date.now() - current.t0) / 1000);
    addToast(type === 'transferred' ? note || 'Call transferred.' : `Call ended · ${Math.floor(durSec / 60)}:${String(durSec % 60).padStart(2, '0')}.`);
  };

  const updateActiveCall = (updater: (prev: ActiveCallState | null) => ActiveCallState | null) => {
    setActiveCall(prev => {
      const next = updater(prev);
      if (prev && next && prev.mute !== next.mute) peerRef.current?.setMuted(next.mute);
      return next;
    });
  };

  /** Hold, transfer, conference and recording need the call media server (Stage B). */
  const callAction = async (action: CallAction, body: object = {}) => {
    if (!activeCall?.callId) return false;
    try {
      await api.post(`/calls/${activeCall.callId}/${action}`, body);
      return true;
    } catch (err) {
      reportError(err);
      return false;
    }
  };

  const addCallNote = async (note: string) => {
    if (!activeCall?.callId) return;
    try {
      await api.post(`/calls/${activeCall.callId}/notes`, { note });
      addToast('Note added to the call and the chat.');
    } catch (err) {
      reportError(err);
    }
  };

  const ringingCall = ringing ? toCallLog(ringing.call) : null;

  const answerIncomingCall = () => {
    const r = ringing;
    if (!r) return;
    stopCallRingtone();
    void (async () => {
      try {
        if (!r.sdpOffer) throw new Error('This call has no audio offer. Answer it on the phone.');
        const { peer, sdpAnswer } = await answerOffer(r.sdpOffer);
        peerRef.current = peer;
        await api.post(`/calls/${r.call.id}/answer`, { sdpAnswer });
        playCallAnswerSound();
        setRinging(null);
        const opt = r.ivrOption ? (ivr.opts.find(o => o.k === r.ivrOption) ?? null) : null;
        setActiveCall(freshCall(r.call.contactId, { ivr: opt, inc: true, callId: r.call.id, connected: true }));
      } catch (err) {
        peerRef.current?.close();
        peerRef.current = null;
        setRinging(null);
        reportError(err);
      }
    })();
  };

  const declineIncomingCall = (withMessage?: string) => {
    const r = ringing;
    if (!r) return;
    stopCallRingtone();
    playCallEndSound();
    setRinging(null);
    api
      .post(`/calls/${r.call.id}/decline`, withMessage ? { messageText: withMessage } : {})
      .then(() => {
        void qc.invalidateQueries({ queryKey: qk.calls });
        addToast(withMessage ? 'Declined. Your message was sent on WhatsApp.' : 'Call declined.');
      })
      .catch(reportError);
  };

  const forwardIncomingCall = (dest: string) => {
    const r = ringing;
    if (!r) return;
    stopCallRingtone();
    setRinging(null);
    closeSheet();
    api
      .post(`/calls/${r.call.id}/forward`, { destination: dest })
      .then(() => addToast(`Call forwarded to ${forwardingDestinations[dest] ?? dest}.`))
      .catch(reportError);
  };

  const value: AppContextType = {
    role,
    setRole: () => undefined,
    screen,
    setScreen,
    theme: frameTheme,
    toggleTheme: toggleFrameTheme,
    frameTheme,
    toggleFrameTheme,
    sectionTheme,
    toggleSectionTheme,
    setSectionTheme,
    chatWallpaper,
    setChatWallpaper,
    railOpen,
    setRailOpen,
    toggleRail: () => setRailOpen(prev => !prev),
    business,
    setBusiness: () => undefined,
    companyPhone,
    numberQuality,
    staff,
    team,
    manager,
    contacts,
    conversations,
    calls,
    templates,
    products,
    quickReplies,
    callConfig,
    setCallConfig,
    saveCallConfig,
    ivr,
    setIvr,
    saveIvr,
    forwardingDestinations,
    counts: countsQ.data ?? null,
    loading: convQ.isLoading || staffQ.isLoading,
    toasts,
    addToast,
    reportError,
    sheetContent,
    openSheet: content => setSheetContent(content),
    closeSheet,
    activeCall,
    startCall,
    endCall,
    updateActiveCall,
    callAction,
    addCallNote,
    statusModalOpen,
    setStatusModalOpen,
    breakModalOpen,
    setBreakModalOpen,
    currentUser: {
      id: user.id,
      name: user.name,
      title: `${user.title || (isManager ? 'Owner' : 'Staff')} · ${isManager ? 'Manager' : 'Staff'}`,
      initials: user.initials
    },
    myStatus,
    setUserStatus,
    setStaffStatus,
    setOwner,
    setContactLabels,
    setBlocked,
    openConversation,
    activeConversationId,
    loadOlderMessages,
    hasOlderMessages,
    openConversationForContact,
    sendMessage,
    sendTemplateMessage,
    sendProductMessage,
    sendQuickReplyMessage,
    markRead,
    resolveConversation,
    setConversationState,
    setBotActive,
    requestCallPermission,
    receiveIncomingMessage: () => undefined,
    simulateCustomerReply: () => undefined,
    soundMuted,
    toggleSoundMuted,
    addQuickReply,
    updateQuickReply,
    deleteQuickReply,
    addTemplate,
    mediaList,
    addMediaItem,
    deleteMediaItem,
    toggleFavoriteMedia,
    sendMediaToChat,
    aiBotSettings,
    aiAddon: aiStatusQ.data ?? null,
    aiSummary: aiSettingsQ.data ?? null,
    updateAIBotSettings,
    requestAiActivation,
    aiLogs,
    addAILog: () => undefined,
    ringingCall,
    answerIncomingCall,
    declineIncomingCall,
    forwardIncomingCall,
    simulateIncomingCall: () => undefined,
    signOut: logout,
    refresh
  };

  return <AppContext.Provider value={value}>{children}</AppContext.Provider>;
}

export function useApp() {
  const context = useContext(AppContext);
  if (!context) throw new Error('useApp must be used within an AppProvider');
  return context;
}
