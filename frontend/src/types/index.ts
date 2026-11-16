export type Role = 'manager' | 'staff';

// These view types keep the field names the screens were designed with. `lib/adapters.ts`
// maps the API objects from @smart-reply/shared onto them.

export type StatusType = 'available' | 'oncall' | 'brk' | 'away' | 'dnd';

export interface ChannelStatus {
  st: StatusType;
  r: string;
  since: number;
  mins: number;
}

export interface BreakLogItem {
  reason: string;
  time: string;
  mins: number;
  scope: string;
}

export interface Staff {
  id: string;
  n: string;
  i: string;
  st: string;
  stt: string;
  open: number;
  rep: string;
  calls: number;
  done: number;
  res: number;
  miss: number;
  call: ChannelStatus;
  chat: ChannelStatus;
  used: number;
  log: [string, string, number, string][];
  noteS?: string;
  role?: 'manager' | 'staff';
  email?: string;
  phone?: string | null;
  title?: string;
  status?: 'invited' | 'active' | 'disabled';
  permissions?: Record<string, boolean>;
}

export interface Contact {
  id: string;
  n: string;
  i: string;
  a: string;
  ph: string;
  since: string;
  city: string;
  to: string | null;
  perm: boolean;
  labels: [string, string][];
  hist: [string, string, string][];
  labelIds?: string[];
  blocked?: boolean;
  permStatus?: 'none' | 'requested' | 'temporary' | 'permanent';
  permExpiresAt?: string | null;
  optIn?: boolean;
  notes?: string;
}

export interface Attachment {
  type: 'image' | 'voice' | 'file';
  name: string;
  size: number;
  url?: string;
  real?: boolean;
  dur?: string;
  /** Stored file id, when the file is on the server. */
  fileId?: string;
  mime?: string;
  /** A browser File waiting to be uploaded. */
  file?: File;
}

export type MessageType = 'text' | 'tpl' | 'note' | 'sys';
export type MessageDirection = 'in' | 'out' | 'note' | 'sys';

export interface Message {
  dir: MessageDirection;
  type: MessageType;
  text: string;
  time: string;
  sender?: string;
  read?: number;
  buttons?: string[];
  attachments?: Attachment[];
  id?: string;
  status?: 'queued' | 'sent' | 'delivered' | 'read' | 'failed';
  error?: string | null;
  at?: string;
}

export interface Conversation {
  id: string;
  c: string; // contact id
  pv: string;
  t: string;
  un: number;
  win: number | null;
  exp?: number;
  msgs: Message[];
  status?: 'open' | 'resolved';
  botActive?: boolean;
  favorite?: boolean;
  archived?: boolean;
  lastAt?: string | null;
}

export interface CallLogItem {
  c: string; // contact id
  d: 'ringing' | 'missed' | 'rejected' | 'incoming' | 'outgoing' | 'forwarded' | 'transferred';
  t: string;
  dur?: string;
  by?: string;
  note?: string;
  rec?: number;
  ai?: number;
  id?: string;
  recUrl?: string | null;
  summary?: string | null;
  startedAt?: string;
}

export interface Template {
  n: string;
  cat: string;
  lang: string;
  st: 'ok' | 'w' | 'b';
  stt: string;
  q: string;
  used: number;
  body: string;
  why?: string;
  btn?: string[];
  id?: string;
  vars?: number;
}

export interface Product {
  n: string;
  col: string;
  p: string;
  old?: string;
  note: string;
  k: 'pantry' | 'vanity' | 'wardrobe' | 'overhead';
  sku: string;
  st: 'ok' | 'w';
  id?: string;
  img?: string | null;
  collectionId?: string | null;
  priceMinor?: number;
}

export interface QuickReply {
  cmd: string;
  t: string;
  x: string;
  att: Attachment[];
  used: number;
  by: string;
  id?: string;
  scope?: 'everyone' | 'only_me';
  ownerId?: string | null;
}

export interface IVROption {
  k: string;
  t: string;
  to: string;
}

export interface CallConfig {
  brkmax: number;
  ring: 'all' | 'rr' | 'idle';
  ringsec: number;
  rec: {
    auto: boolean;
    ann: boolean;
    pause: boolean;
    keep: string;
  };
  link: boolean;
  fwd: {
    noans: string;
    busy: string;
    brk: string;
    away: string;
    dnd: string;
    after: string;
  };
}

export type MediaCategory = string;

export interface MediaItem {
  id: string;
  title: string;
  type: 'image' | 'video';
  url: string;
  thumbnail?: string;
  caption: string;
  size: number; // in bytes
  duration?: string; // e.g. "0:45"
  category: MediaCategory;
  tags: string[];
  addedAt: string;
  addedBy: string;
  isFavorite?: boolean;
  downloads?: number;
  shares?: number;
  width?: number;
  height?: number;
  fileId?: string;
  categoryId?: string | null;
}

export interface AIBotSettings {
  // Master Switches
  chatBotEnabled: boolean;
  voiceBotEnabled: boolean;

  // WhatsApp / Message Bot
  chatBotMode: 'always' | 'after_hours' | 'staff_busy';
  personaName: string;
  languageMode: 'trilingual' | 'sinhala' | 'english';
  systemPrompt: string;
  confidenceThreshold: number; // 0 - 100
  autoHandoffOnNegotiation: boolean;
  autoHandoffOnComplaint: boolean;
  autoHandoffOnStaffRequest: boolean;
  welcomeMessage: string;
  fallbackMessage: string;

  // Voice / Call Bot
  voiceModel: string;
  voiceGreeting: string;
  autoTranscribeCalls: boolean;
  autoSummarizeCalls: boolean;
  missedCallAutoFollowup: boolean;
  missedCallMessageTemplate: string;
  voiceLanguage: 'trilingual' | 'sinhala' | 'english';
  voiceSpeed: number; // 0.8 to 1.2
}

export interface AIBotLog {
  id: string;
  channel: 'chat' | 'call';
  contactName: string;
  contactPhone: string;
  timestamp: string;
  intent: string;
  confidence: number;
  userInput: string;
  botOutput: string;
  status: 'handled' | 'handed_off' | 'resolved';
  agent?: string;
  tokensUsed?: number;
  latencyMs?: number;
  callDuration?: string;
}

export interface SimulatorMessage {
  id: string;
  sender: 'user' | 'bot' | 'system';
  text: string;
  time: string;
  intent?: string;
  confidence?: number;
  latencyMs?: number;
  suggestedActions?: string[];
}

