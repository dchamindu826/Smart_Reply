'use client';

import React, { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import {
  Role, Staff, Contact, Conversation, CallLogItem, Template, Product,
  QuickReply, CallConfig, IVROption, StatusType, Attachment, Message,
  MediaItem, AIBotSettings, AIBotLog
} from '@/types';
import {
  INITIAL_STAFF, INITIAL_MANAGER, INITIAL_CONTACTS, INITIAL_CONVERSATIONS,
  INITIAL_CALLS, INITIAL_TEMPLATES, INITIAL_PRODUCTS, INITIAL_QUICK_REPLIES,
  INITIAL_CALL_CONFIG, INITIAL_IVR, FORWARDING_DESTINATIONS,
  INITIAL_MEDIA, INITIAL_AI_BOT_SETTINGS, INITIAL_AI_LOGS
} from '@/data/mockData';
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

interface ActiveCallState {
  c: string; // contact id
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
}

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

  staff: Staff[];
  manager: typeof INITIAL_MANAGER;
  contacts: Record<string, Contact>;
  conversations: Conversation[];
  calls: CallLogItem[];
  templates: Template[];
  products: Product[];
  quickReplies: QuickReply[];
  callConfig: CallConfig;
  setCallConfig: React.Dispatch<React.SetStateAction<CallConfig>>;
  ivr: typeof INITIAL_IVR;
  setIvr: React.Dispatch<React.SetStateAction<typeof INITIAL_IVR>>;

  toasts: Toast[];
  addToast: (msg: string) => void;

  sheetContent: ReactNode | null;
  openSheet: (content: ReactNode) => void;
  closeSheet: () => void;

  activeCall: ActiveCallState | null;
  startCall: (cid: string, ivr?: IVROption | null, inc?: boolean) => void;
  endCall: (type?: string, note?: string) => void;
  updateActiveCall: (updater: (prev: ActiveCallState | null) => ActiveCallState | null) => void;

  statusModalOpen: boolean;
  setStatusModalOpen: (open: boolean) => void;
  breakModalOpen: boolean;
  setBreakModalOpen: (open: boolean) => void;

  currentUser: { name: string; title: string; initials: string };
  myStatus: Staff | typeof INITIAL_MANAGER;
  setUserStatus: (chn: 'both' | 'call' | 'chat', st: StatusType, reason?: string, mins?: number) => void;
  setOwner: (cid: string, sid: string | null, why?: string) => boolean;
  sendMessage: (convId: string, text: string, isNote: boolean, attachments?: Attachment[]) => void;
  sendTemplateMessage: (convId: string, template: Template) => void;
  receiveIncomingMessage: (convId: string, text: string, attachments?: Attachment[]) => void;
  simulateCustomerReply: (convId?: string) => void;
  soundMuted: boolean;
  toggleSoundMuted: () => boolean;
  addQuickReply: (qr: QuickReply) => void;
  updateQuickReply: (index: number, qr: QuickReply) => void;
  deleteQuickReply: (index: number) => void;
  addTemplate: (tpl: Template) => void;

  // Media Gallery
  mediaList: MediaItem[];
  addMediaItem: (item: MediaItem) => void;
  deleteMediaItem: (id: string) => void;
  toggleFavoriteMedia: (id: string) => void;
  sendMediaToChat: (convId: string, media: MediaItem) => void;

  // AI Bot (Calls & Chats)
  aiBotSettings: AIBotSettings;
  updateAIBotSettings: (updater: Partial<AIBotSettings>) => void;
  aiLogs: AIBotLog[];
  addAILog: (log: AIBotLog) => void;

  // Ring banner
  ringingCall: CallLogItem | null;
  answerIncomingCall: () => void;
  declineIncomingCall: (withMessage?: string) => void;
  forwardIncomingCall: (dest: string) => void;
  simulateIncomingCall: () => void;
}


const AppContext = createContext<AppContextType | undefined>(undefined);

export function AppProvider({ children }: { children: ReactNode }) {
  const [role, setRoleState] = useState<Role>('manager');
  const [screen, setScreenState] = useState<string>('dash');
  const [frameTheme, setFrameTheme] = useState<'light' | 'dark'>('dark');
  const [sectionTheme, setSectionTheme] = useState<'light' | 'dark'>('dark');
  const [chatWallpaper, setChatWallpaperState] = useState<WallpaperType>('doodle');
  const [railOpen, setRailOpen] = useState(false);
  const [business, setBusiness] = useState('Madushan Aluminium — 3 staff');

  const [staff, setStaff] = useState<Staff[]>(INITIAL_STAFF);
  const [manager, setManager] = useState(INITIAL_MANAGER);
  const [contacts, setContacts] = useState<Record<string, Contact>>(INITIAL_CONTACTS);
  const [conversations, setConversations] = useState<Conversation[]>(INITIAL_CONVERSATIONS);
  const [calls, setCalls] = useState<CallLogItem[]>(INITIAL_CALLS);
  const [templates, setTemplates] = useState<Template[]>(INITIAL_TEMPLATES);
  const [products] = useState<Product[]>(INITIAL_PRODUCTS);
  const [quickReplies, setQuickReplies] = useState<QuickReply[]>(INITIAL_QUICK_REPLIES);
  const [callConfig, setCallConfig] = useState<CallConfig>(INITIAL_CALL_CONFIG);
  const [ivr, setIvr] = useState(INITIAL_IVR);

  const [mediaList, setMediaList] = useState<MediaItem[]>(INITIAL_MEDIA);
  const [aiBotSettings, setAiBotSettings] = useState<AIBotSettings>(INITIAL_AI_BOT_SETTINGS);
  const [aiLogs, setAiLogs] = useState<AIBotLog[]>(INITIAL_AI_LOGS);

  const [toasts, setToasts] = useState<Toast[]>([]);

  const [sheetContent, setSheetContent] = useState<ReactNode | null>(null);
  const [activeCall, setActiveCall] = useState<ActiveCallState | null>(null);
  const [statusModalOpen, setStatusModalOpen] = useState(false);
  const [breakModalOpen, setBreakModalOpen] = useState(false);

  // Sync frame theme and section theme attributes
  useEffect(() => {
    try {
      const savedFrame = (localStorage.getItem('sr.a.frameTheme') || localStorage.getItem('sr.a.theme')) as 'light' | 'dark' | null;
      const initialFrame = savedFrame === 'light' || savedFrame === 'dark' ? savedFrame : 'dark';
      setFrameTheme(initialFrame);
      document.documentElement.setAttribute('data-theme', initialFrame);

      const savedSection = localStorage.getItem('sr.a.sectionTheme') as 'light' | 'dark' | null;
      if (savedSection === 'light' || savedSection === 'dark') {
        setSectionTheme(savedSection);
      }

      const savedWallpaper = localStorage.getItem('sr.a.chatWallpaper') as WallpaperType | null;
      if (savedWallpaper && ['doodle', 'plain', 'dots', 'emerald', 'warm', 'midnight', 'rose', 'lavender', 'amoled'].includes(savedWallpaper)) {
        setChatWallpaperState(savedWallpaper);
      }

      if (typeof window !== 'undefined') {
        const urlParams = new URLSearchParams(window.location.search);
        const s = urlParams.get('screen');
        if (s) setScreenState(s);
      }
    } catch {}
  }, []);

  const toggleFrameTheme = () => {
    const next = frameTheme === 'dark' ? 'light' : 'dark';
    setFrameTheme(next);
    document.documentElement.setAttribute('data-theme', next);
    try {
      localStorage.setItem('sr.a.frameTheme', next);
      localStorage.setItem('sr.a.theme', next);
    } catch {}
  };

  const toggleSectionTheme = () => {
    const next = sectionTheme === 'dark' ? 'light' : 'dark';
    setSectionTheme(next);
    try {
      localStorage.setItem('sr.a.sectionTheme', next);
    } catch {}
  };

  const setChatWallpaper = (wp: WallpaperType) => {
    setChatWallpaperState(wp);
    try {
      localStorage.setItem('sr.a.chatWallpaper', wp);
    } catch {}
  };

  const addToast = (message: string) => {
    const id = Math.random().toString(36).substring(2, 9);
    setToasts(prev => [...prev, { id, message }]);
    setTimeout(() => {
      setToasts(prev => prev.filter(t => t.id !== id));
    }, 3000);
  };

  const setRole = (r: Role) => {
    setRoleState(r);
    setScreenState(r === 'manager' ? 'dash' : 'mydash');
    addToast(r === 'manager' ? 'Manager view: the whole business.' : 'Staff view: signed in as Nimal. Only chats assigned to him.');
  };

  const setScreen = (s: string) => {
    setScreenState(s);
    setRailOpen(false);
    setSheetContent(null);
    window.scrollTo(0, 0);
  };

  const toggleRail = () => {
    setRailOpen(prev => !prev);
  };

  const openSheet = (content: ReactNode) => {
    setSheetContent(content);
  };

  const closeSheet = () => {
    setSheetContent(null);
  };

  const currentUser = role === 'manager'
    ? { name: 'Madushan P.', title: 'Owner · Manager', initials: 'MP' }
    : { name: 'Nimal Bandara', title: 'Staff · Sales', initials: 'NB' };

  const myStatus = role === 'manager' ? manager : staff[0];

  const setUserStatus = (chn: 'both' | 'call' | 'chat', st: StatusType, reason: string = '', mins: number = 0) => {
    const t = Date.now();
    const isM = role === 'manager';

    if (isM) {
      setManager(prev => {
        const nextCall = (chn === 'both' || chn === 'call') ? { st, r: reason, since: t, mins } : prev.call;
        const nextChat = (chn === 'both' || chn === 'chat') ? { st, r: reason, since: t, mins } : prev.chat;
        return { ...prev, call: nextCall, chat: nextChat };
      });
    } else {
      setStaff(prev => {
        const updated = [...prev];
        const s = { ...updated[0] };
        if (chn === 'both' || chn === 'call') s.call = { st, r: reason, since: t, mins };
        if (chn === 'both' || chn === 'chat') s.chat = { st, r: reason, since: t, mins };
        s.st = { oncall: 'call', available: '', brk: 'away', away: 'away', dnd: 'call' }[s.call.st] || '';
        s.stt = s.call.st === 'brk' ? `${s.call.r} break` : ({ available: 'Available', oncall: 'On a call', brk: 'On break', away: 'Away', dnd: 'Do not disturb' }[s.call.st] || 'Available');
        updated[0] = s;
        return updated;
      });
    }

    const channelLabel = chn === 'both' ? 'Calls and chats' : chn === 'call' ? 'Calls' : 'Chats';
    const stLabel = ({ available: 'Available', oncall: 'On a call', brk: 'On break', away: 'Away', dnd: 'Do not disturb' })[st];
    addToast(`${channelLabel}: ${stLabel}.`);
  };

  const setOwner = (cid: string, sid: string | null, why: string = ''): boolean => {
    const c = contacts[cid];
    if (!c) return false;
    const old = c.to;
    if ((old || null) === (sid || null)) return false;

    const meName = role === 'manager' ? 'Madushan' : 'Nimal';
    const nowTime = new Date().toTimeString().slice(0, 5);
    const sName = sid ? (sid === 's1' ? 'Nimal' : sid === 's2' ? 'Sachini' : sid === 's3' ? 'Ruwan' : 'Madushan') : '';
    const oldName = old ? (old === 's1' ? 'Nimal' : old === 's2' ? 'Sachini' : old === 's3' ? 'Ruwan' : 'Madushan') : '';

    const newHistItem: [string, string, string] = [
      `Today ${nowTime}`,
      sid ? (old ? `Moved from ${oldName} to ${sName}` : `Assigned to ${sName}`) : `Unassigned${old ? ` (was ${oldName})` : ''}`,
      `${meName}${why ? ` · ${why}` : ''}`
    ];

    setContacts(prev => ({
      ...prev,
      [cid]: {
        ...prev[cid],
        to: sid,
        hist: [newHistItem, ...prev[cid].hist]
      }
    }));

    // Add note to conversation if it exists
    setConversations(prev => prev.map(conv => {
      if (conv.c === cid) {
        const noteText = (sid ? `Customer assigned to ${sName}` : `Customer unassigned. Back to the team queue`) +
          `. Chats and calls from ${c.ph} now go to ${sid ? sName : 'the Sales queue'}.`;
        const newMsg: Message = {
          dir: 'note',
          type: 'note',
          text: noteText,
          time: nowTime,
          sender: meName
        };
        return { ...conv, msgs: [...conv.msgs, newMsg] };
      }
      return conv;
    }));

    return true;
  };

  const sendMessage = (convId: string, text: string, isNote: boolean, attachments: Attachment[] = []) => {
    const nowTime = new Date().toTimeString().slice(0, 5);
    const meName = role === 'manager' ? 'Madushan' : 'Nimal';

    setConversations(prev => prev.map(conv => {
      if (conv.id === convId) {
        const newMsg: Message = isNote
          ? {
              dir: 'note',
              type: 'note',
              text: text,
              time: nowTime,
              sender: meName,
              attachments: attachments.length ? attachments : undefined
            }
          : {
              dir: 'out',
              type: 'text',
              text: text,
              time: nowTime,
              sender: meName,
              read: 0,
              attachments: attachments.length ? attachments : undefined
            };

        const previewText = !isNote
          ? (text || (attachments[0] ? (attachments[0].type === 'image' ? '🖼 Photo' : attachments[0].type === 'voice' ? '🎙 Voice message' : `📎 ${attachments[0].name}`) : ''))
          : conv.pv;

        return {
          ...conv,
          pv: isNote ? conv.pv : previewText,
          t: isNote ? conv.t : nowTime,
          msgs: [...conv.msgs, newMsg]
        };
      }
      return conv;
    }));

    if (!isNote) {
      playSentSound();
    }

    addToast(isNote
      ? "Note saved. The customer can't see it."
      : (attachments.length
          ? `Sent on WhatsApp: ${attachments.length} attachment${attachments.length > 1 ? 's' : ''}${text ? ' + text' : ''}.`
          : 'Sent on WhatsApp.')
    );
  };

  const sendTemplateMessage = (convId: string, template: Template) => {
    const nowTime = new Date().toTimeString().slice(0, 5);

    setConversations(prev => prev.map(conv => {
      if (conv.id === convId) {
        const newMsg: Message = {
          dir: 'out',
          type: 'tpl',
          text: template.body,
          time: nowTime,
          sender: template.n,
          read: 0,
          buttons: template.btn
        };
        return {
          ...conv,
          pv: `Template · ${template.n}`,
          t: nowTime,
          msgs: [...conv.msgs, newMsg]
        };
      }
      return conv;
    }));

    playSentSound();
    addToast(`Template “${template.n}” sent.`);
  };

  const receiveIncomingMessage = (convId: string, text: string, attachments: Attachment[] = []) => {
    const nowTime = new Date().toTimeString().slice(0, 5);

    setConversations(prev => prev.map(conv => {
      if (conv.id === convId) {
        const newMsg: Message = {
          dir: 'in',
          type: 'text',
          text: text,
          time: nowTime,
          attachments: attachments.length ? attachments : undefined
        };

        const previewText = text || (attachments[0] ? (attachments[0].type === 'image' ? '🖼 Photo' : attachments[0].type === 'voice' ? '🎙 Voice message' : `📎 ${attachments[0].name}`) : '');

        return {
          ...conv,
          pv: previewText,
          t: nowTime,
          un: (conv.un || 0) + 1,
          msgs: [...conv.msgs, newMsg]
        };
      }
      return conv;
    }));

    playReceivedSound();
    const contactId = convId.replace('v', 'c');
    const contact = contacts[contactId];
    addToast(`💬 New WhatsApp message from ${contact?.n || 'Customer'}: "${text.slice(0, 45)}${text.length > 45 ? '...' : ''}"`);
  };

  const simulateCustomerReply = (convId?: string) => {
    const targetId = convId || 'v1';
    const sampleReplies = [
      'ස්තුතියි විස්තර වලට! මිනුම් ගන්න සෙනසුරාදා උදේ එන්න පුලුවන්ද?',
      'Pantry cupboard sample colours tika baluwa, matte black finish eka godak lassanai.',
      'Sliding wardrobe design ekata tinted glass doors danna puluwanda?',
      'Can you please send the quotation for 12x10 kitchen pantry?',
      'Showroom ekata awith balanna puluwanda? Maharagama branch eka open da?',
      'Advance payment eka bank deposit kaloth slip eka mehatama evannam.'
    ];
    const randomReply = sampleReplies[Math.floor(Math.random() * sampleReplies.length)];
    receiveIncomingMessage(targetId, randomReply);
  };

  const addQuickReply = (qr: QuickReply) => {
    setQuickReplies(prev => [qr, ...prev]);
    addToast(`${qr.cmd} saved with ${qr.att.length} attachment(s).`);
  };

  const updateQuickReply = (index: number, qr: QuickReply) => {
    setQuickReplies(prev => {
      const copy = [...prev];
      copy[index] = qr;
      return copy;
    });
    addToast(`${qr.cmd} updated.`);
  };

  const deleteQuickReply = (index: number) => {
    const deleted = quickReplies[index];
    setQuickReplies(prev => prev.filter((_, i) => i !== index));
    addToast(`${deleted.cmd} deleted.`);
  };

  const addTemplate = (tpl: Template) => {
    setTemplates(prev => [tpl, ...prev]);
    addToast(`Template “${tpl.n}” submitted for review.`);
  };

  const addMediaItem = (item: MediaItem) => {
    setMediaList(prev => [item, ...prev]);
    addToast(`Added "${item.title}" to Media Gallery.`);
  };

  const deleteMediaItem = (id: string) => {
    setMediaList(prev => prev.filter(m => m.id !== id));
    addToast('Item removed from Media Gallery.');
  };

  const toggleFavoriteMedia = (id: string) => {
    setMediaList(prev => prev.map(m => m.id === id ? { ...m, isFavorite: !m.isFavorite } : m));
  };

  const updateAIBotSettings = (updater: Partial<AIBotSettings>) => {
    setAiBotSettings(prev => ({ ...prev, ...updater }));
    addToast('AI Bot configuration updated.');
  };

  const addAILog = (log: AIBotLog) => {
    setAiLogs(prev => [log, ...prev]);
  };

  const sendMediaToChat = (convId: string, media: MediaItem) => {
    const targetConv = conversations.find(c => c.id === convId) || conversations[0];
    if (!targetConv) return;
    const nowTime = new Date().toTimeString().slice(0, 5);
    const meName = role === 'manager' ? 'Madushan' : 'Nimal';
    const newMsg: Message = {
      dir: 'out',
      type: 'text',
      text: media.caption || media.title,
      time: nowTime,
      sender: meName,
      read: 1,
      attachments: [
        {
          type: media.type === 'image' ? 'image' : 'file',
          name: media.title,
          size: media.size,
          url: media.url,
          real: true
        }
      ]
    };

    setConversations(prev => prev.map(c => {
      if (c.id === targetConv.id) {
        return {
          ...c,
          msgs: [...c.msgs, newMsg],
          pv: `[${media.type === 'image' ? 'Photo' : 'Video'}] ${media.title}`,
          t: nowTime
        };
      }
      return c;
    }));

    setMediaList(prev => prev.map(m => m.id === media.id ? { ...m, shares: (m.shares || 0) + 1 } : m));
    addToast(`Sent "${media.title}" to WhatsApp chat.`);
  };

  // Active call management
  const startCall = (cid: string, ivrParam?: IVROption | null, inc: boolean = false) => {
    setActiveCall({
      c: cid,
      t0: Date.now(),
      parts: [],
      rec: callConfig.rec.auto,
      ever: callConfig.rec.auto,
      mute: false,
      spk: false,
      hold: false,
      adding: null,
      warm: null,
      pick: null,
      xm: 'warm',
      ivr: ivrParam || null,
      inc
    });
  };

  const endCall = (type?: string, note?: string) => {
    if (!activeCall) return;
    const durSec = Math.floor((Date.now() - activeCall.t0) / 1000);
    const dur = `${Math.floor(durSec / 60)}:${String(durSec % 60).padStart(2, '0')}`;
    const c = contacts[activeCall.c];
    const meName = role === 'manager' ? 'Madushan' : 'Nimal';
    const nowTime = new Date().toTimeString().slice(0, 5);

    const callType = (type || (activeCall.ivr || activeCall.inc ? 'incoming' : 'outgoing')) as CallLogItem['d'];
    const callNote = note || (activeCall.parts.length ? `Conference with ${activeCall.parts.join(', ')}` : '');
    const isRecorded = activeCall.ever && durSec > 0;

    const newCallItem: CallLogItem = {
      c: activeCall.c,
      d: callType,
      t: `Today ${nowTime}`,
      dur,
      by: meName,
      rec: isRecorded ? 1 : 0,
      note: callNote
    };

    setCalls(prev => [newCallItem, ...prev]);

    // Add call event to contact conversation
    setConversations(prev => prev.map(conv => {
      if (conv.c === activeCall.c) {
        const sysMsg: Message = {
          dir: 'sys',
          type: 'sys',
          text: `Voice call · ${dur} · ${meName}${callNote ? ` · ${callNote}` : ''}${isRecorded ? ' · recording saved' : ''}`,
          time: nowTime
        };
        return { ...conv, msgs: [...conv.msgs, sysMsg] };
      }
      return conv;
    }));

    setActiveCall(null);
    addToast(type === 'transferred' ? (callNote || 'Call transferred.') : `Call ended · ${dur}.${isRecorded ? ` Recording and summary saved to ${c?.n.split(' ')[0]}’s chat.` : ''}`);
  };

  const updateActiveCall = (updater: (prev: ActiveCallState | null) => ActiveCallState | null) => {
    setActiveCall(updater);
  };

  // Ringing banner on Inbox
  const ringingCall = calls.find(c => c.d === 'ringing') || null;

  const [soundMuted, setSoundMuted] = useState(sounds.getMuted());
  const toggleSoundMuted = () => {
    const next = sounds.toggleMuted();
    setSoundMuted(next);
    addToast(next ? 'Notification sounds muted.' : 'Notification sounds enabled.');
    return next;
  };

  const answerIncomingCall = () => {
    stopCallRingtone();
    playCallAnswerSound();
    setCalls(prev => prev.filter(c => c.d !== 'ringing'));
    startCall('c7', ivr.on ? ivr.opts.find(o => o.to === 'queue') || ivr.opts[0] : null, true);
  };

  const declineIncomingCall = (withMessage?: string) => {
    stopCallRingtone();
    playCallEndSound();
    setCalls(prev => prev.map(c => {
      if (c.d === 'ringing') {
        return {
          ...c,
          d: 'rejected' as const,
          t: `Today ${new Date().toTimeString().slice(0, 5)}`,
          by: role === 'manager' ? 'Madushan' : 'Nimal',
          note: withMessage ? 'Declined with a message' : 'Declined'
        };
      }
      return c;
    }));

    if (withMessage) {
      sendMessage('v7', withMessage, false);
      addToast('Declined. Message sent to Priya on WhatsApp.');
    } else {
      addToast('Call declined. Priya gets the missed-call message.');
    }
  };

  const forwardIncomingCall = (dest: string) => {
    stopCallRingtone();
    playCallEndSound();
    setCalls(prev => prev.map(c => {
      if (c.d === 'ringing') {
        return {
          ...c,
          d: 'forwarded' as const,
          t: `Today ${new Date().toTimeString().slice(0, 5)}`,
          by: role === 'manager' ? 'Madushan' : 'Nimal',
          note: dest === 'vm' ? 'Asked for a voice note' : `Forwarded to ${FORWARDING_DESTINATIONS[dest] || dest}`
        };
      }
      return c;
    }));
    closeSheet();
    addToast(dest === 'vm' ? 'Call ended. Priya was asked to send a voice note.' : `Call forwarded to ${FORWARDING_DESTINATIONS[dest] || dest}.`);
  };

  const simulateIncomingCall = () => {
    setCalls(prev => {
      const rest = prev.filter(c => c.d !== 'ringing');
      return [{ c: 'c7', d: 'ringing' as const, t: 'now' }, ...rest];
    });
    startCallRingtone();
    addToast('Incoming WhatsApp call ringing from Priya Nadarajah...');
  };

  return (
    <AppContext.Provider
      value={{
        role,
        setRole,
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
        toggleRail,
        business,
        setBusiness,
        staff,
        manager,
        contacts,
        conversations,
        calls,
        templates,
        products,
        quickReplies,
        callConfig,
        setCallConfig,
        ivr,
        setIvr,
        toasts,
        addToast,
        sheetContent,
        openSheet,
        closeSheet,
        activeCall,
        startCall,
        endCall,
        updateActiveCall,
        statusModalOpen,
        setStatusModalOpen,
        breakModalOpen,
        setBreakModalOpen,
        currentUser,
        myStatus,
        setUserStatus,
        setOwner,
        sendMessage,
        sendTemplateMessage,
        receiveIncomingMessage,
        simulateCustomerReply,
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
        updateAIBotSettings,
        aiLogs,
        addAILog,
        ringingCall,
        answerIncomingCall,
        declineIncomingCall,
        forwardIncomingCall,
        simulateIncomingCall
      }}
    >
      {children}
    </AppContext.Provider>
  );
}

export function useApp() {
  const context = useContext(AppContext);
  if (!context) {
    throw new Error('useApp must be used within an AppProvider');
  }
  return context;
}
