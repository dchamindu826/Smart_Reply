/**
 * Response shapes of the Smart Reply API (`/api/v1`).
 * Field names are camelCase, times are ISO 8601 UTC strings, money is `{ amountMinor, currency }`.
 */
import type {
  CompanyRole,
  ConversationFilter,
  LabelColor,
  PresenceChannel,
  PresenceStatus,
  Role,
  StaffPermissions
} from './constants';

export type Iso = string;

export interface Money {
  amountMinor: number;
  currency: string;
}

export interface Page<T> {
  items: T[];
  nextCursor: string | null;
}

/* ───────────────────────── Session ───────────────────────── */

export interface CompanySummary {
  id: string;
  name: string;
  slug: string;
  status: 'active' | 'suspended' | 'closed';
  timezone: string;
  seatLimit: number;
  planName: string | null;
  displayPhone: string | null;
}

export interface MeUser {
  id: string;
  role: Role;
  name: string;
  initials: string;
  title: string;
  email: string;
  phone: string | null;
  language: string;
  signature: string;
  avatarColor: string;
  notify: NotifySettings;
}

export interface NotifySettings {
  newChat: boolean;
  newMessage: boolean;
  missedCall: boolean;
  sound: boolean;
  desktop: boolean;
}

export interface MeResponse {
  user: MeUser;
  company: CompanySummary | null;
  /** Effective permissions for the signed-in user. Managers get every switch on. */
  permissions: StaffPermissions;
  features: { aiAddon: boolean; calling: boolean; whatsappConnected: boolean };
  impersonation: { adminName: string; reason: string } | null;
}

export interface LoginResponse {
  me: MeResponse;
  /** Only returned to mobile clients (`client: 'mobile'`). The web app uses cookies. */
  tokens?: { accessToken: string; refreshToken: string; accessExpiresAt: Iso };
}

/* ───────────────────────── Team ───────────────────────── */

export interface ChannelPresence {
  status: PresenceStatus;
  reason: string;
  since: Iso;
  plannedMinutes: number;
}

export interface BreakEntry {
  id: string;
  reason: string;
  scope: 'call' | 'chat' | 'both';
  startedAt: Iso;
  endedAt: Iso | null;
  minutes: number;
}

export interface StaffMember {
  id: string;
  role: CompanyRole;
  name: string;
  initials: string;
  title: string;
  email: string;
  phone: string | null;
  status: 'invited' | 'active' | 'disabled';
  avatarColor: string;
  presence: Record<PresenceChannel, ChannelPresence>;
  note: string;
  permissions: StaffPermissions;
  stats: {
    openChats: number;
    avgFirstReplySeconds: number | null;
    callsToday: number;
    callsMissed: number;
    resolved: number;
    targetPercent: number;
  };
  breaks: { usedMinutes: number; entries: BreakEntry[] };
  lastLoginAt: Iso | null;
}

export interface Invite {
  id: string;
  name: string;
  email: string;
  phone: string | null;
  role: CompanyRole;
  title: string;
  expiresAt: Iso;
  createdAt: Iso;
  /** Present only in the response that creates the invite, so the manager can copy the link. */
  link?: string;
}

export interface SeatsResponse {
  used: number;
  pendingInvites: number;
  limit: number;
  planName: string | null;
}

export interface RolesResponse {
  staff: StaffPermissions;
}

export interface AssignmentRules {
  autoAssign: 'off' | 'round_robin' | 'least_open';
  stickyOwner: boolean;
  maxOpenChats: number;
  unassignedAlertMinutes: number;
  callRingOwnerFirst: boolean;
  missedCallTemplateId: string | null;
  skipOnBreak: boolean;
}

export interface KeywordRule {
  id: string;
  keywords: string[];
  labelId: string | null;
  assignUserId: string | null;
  quickReplyId: string | null;
  enabled: boolean;
  matchCount: number;
}

export interface StaffTarget {
  userId: string;
  resolvedTarget: number;
}

/* ───────────────────────── Customers ───────────────────────── */

export interface Label {
  id: string;
  name: string;
  color: LabelColor;
  meaning: string;
  autoRule: string;
  chatCount: number;
}

export interface CallPermission {
  status: 'none' | 'requested' | 'temporary' | 'permanent';
  expiresAt: Iso | null;
}

export interface Contact {
  id: string;
  /** Digits with country code, or null when Meta only gave a business-scoped user id. */
  waId: string | null;
  /** Formatted for display, for example `+94 77 123 4567`. Empty when `waId` is null. */
  phone: string;
  username: string | null;
  name: string;
  initials: string;
  avatarColor: string;
  city: string;
  ownerUserId: string | null;
  callPermission: CallPermission;
  marketingOptIn: boolean;
  blocked: boolean;
  labels: Pick<Label, 'id' | 'name' | 'color'>[];
  firstSeenAt: Iso;
  notes: string;
}

export interface OwnerHistoryEntry {
  id: string;
  at: Iso;
  fromUserId: string | null;
  fromName: string | null;
  toUserId: string | null;
  toName: string | null;
  actorName: string;
  actorKind: 'user' | 'auto_assign' | 'rule' | 'system';
  reason: string;
}

/* ───────────────────────── Conversations ───────────────────────── */

export type MessageDirection = 'in' | 'out' | 'note' | 'system';
export type MessageType =
  | 'text'
  | 'template'
  | 'image'
  | 'audio'
  | 'video'
  | 'document'
  | 'sticker'
  | 'interactive'
  | 'location'
  | 'contacts'
  | 'reaction'
  | 'note'
  | 'system'
  | 'unsupported';
export type MessageStatus = 'queued' | 'sent' | 'delivered' | 'read' | 'failed';

export interface FileRef {
  id: string;
  kind: 'image' | 'audio' | 'video' | 'document' | 'sticker';
  name: string;
  mime: string;
  sizeBytes: number;
  url: string;
  durationSeconds: number | null;
  voice: boolean;
}

export interface Message {
  id: string;
  conversationId: string;
  direction: MessageDirection;
  type: MessageType;
  body: string;
  sender: { kind: 'user' | 'bot' | 'system' | 'customer'; userId: string | null; name: string | null };
  templateName: string | null;
  buttons: string[];
  attachments: FileRef[];
  status: MessageStatus;
  error: string | null;
  replyToId: string | null;
  createdAt: Iso;
}

export interface Conversation {
  id: string;
  contactId: string;
  contact: Contact;
  status: 'open' | 'resolved';
  lastPreview: string;
  lastMessageAt: Iso | null;
  windowExpiresAt: Iso | null;
  unreadCount: number;
  botActive: boolean;
  favorite: boolean;
  archived: boolean;
}

export type ConversationCounts = Record<ConversationFilter, number> & { closingSoon: number };

/* ───────────────────────── Content ───────────────────────── */

export interface TemplateButton {
  type: 'QUICK_REPLY' | 'URL' | 'PHONE_NUMBER';
  text: string;
  url?: string;
  phoneNumber?: string;
}

export interface Template {
  id: string;
  name: string;
  category: 'utility' | 'marketing' | 'authentication';
  language: string;
  status: 'approved' | 'pending' | 'rejected' | 'paused' | 'disabled';
  quality: 'high' | 'medium' | 'low' | 'unknown';
  headerText: string | null;
  body: string;
  footer: string | null;
  buttons: TemplateButton[];
  rejectionReason: string | null;
  usedCount: number;
  variableCount: number;
  updatedAt: Iso;
}

export interface QuickReply {
  id: string;
  command: string;
  title: string;
  text: string;
  scope: 'everyone' | 'only_me';
  ownerUserId: string | null;
  ownerName: string;
  attachments: FileRef[];
  usedCount: number;
}

export interface ProductCollection {
  id: string;
  name: string;
  position: number;
  productCount: number;
}

export interface Product {
  id: string;
  collectionId: string | null;
  collectionName: string;
  name: string;
  sku: string;
  price: Money;
  oldPrice: Money | null;
  priceUnit: string;
  note: string;
  status: 'active' | 'hidden';
  imageUrl: string | null;
  imageFileId: string | null;
}

export interface MediaCategory {
  id: string;
  name: string;
}

export interface MediaItem {
  id: string;
  title: string;
  kind: 'image' | 'video';
  file: FileRef;
  thumbnailUrl: string | null;
  caption: string;
  categoryId: string | null;
  categoryName: string;
  tags: string[];
  addedBy: string;
  createdAt: Iso;
  favorite: boolean;
  shareCount: number;
  downloadCount: number;
  width: number | null;
  height: number | null;
}

export interface Broadcast {
  id: string;
  name: string;
  labelId: string | null;
  labelName: string;
  templateId: string;
  templateName: string;
  status: 'draft' | 'scheduled' | 'sending' | 'done' | 'failed' | 'cancelled';
  scheduledAt: Iso | null;
  audience: number;
  sent: number;
  delivered: number;
  read: number;
  replied: number;
  failed: number;
  createdAt: Iso;
}

export interface Flow {
  id: string;
  name: string;
  kind: 'greeting' | 'away' | 'keyword';
  enabled: boolean;
  keywords: string[];
  replyText: string;
  quickReplyId: string | null;
  onlyOutsideHours: boolean;
  matchCount: number;
}

/* ───────────────────────── Calls ───────────────────────── */

export type CallOutcome =
  | 'ringing'
  | 'answered'
  | 'missed'
  | 'rejected'
  | 'forwarded'
  | 'transferred'
  | 'failed'
  | 'ongoing';

export interface Call {
  id: string;
  contactId: string;
  contact: Pick<Contact, 'id' | 'name' | 'initials' | 'phone' | 'avatarColor'>;
  direction: 'in' | 'out';
  outcome: CallOutcome;
  handledBy: { userId: string; name: string } | null;
  startedAt: Iso;
  answeredAt: Iso | null;
  endedAt: Iso | null;
  durationSeconds: number | null;
  note: string;
  hasRecording: boolean;
  recordingUrl: string | null;
  hasSummary: boolean;
  summary: string | null;
  ivrOption: string | null;
  /** Users being rung right now (incoming calls while `outcome` is `ringing`). A device not in this list stops ringing. */
  ringingUserIds?: string[];
}

export interface ScheduledCall {
  id: string;
  contactId: string;
  contactName: string;
  userId: string;
  userName: string;
  scheduledAt: Iso;
  note: string;
  status: 'pending' | 'done' | 'cancelled';
}

export interface CallHours {
  enabled: boolean;
  timezone: string;
  weekly: { day: 'MONDAY' | 'TUESDAY' | 'WEDNESDAY' | 'THURSDAY' | 'FRIDAY' | 'SATURDAY' | 'SUNDAY'; open: string; close: string }[];
  holidays: { date: string; open?: string; close?: string }[];
}

export interface ForwardingRules {
  noAnswer: string;
  busy: string;
  onBreak: string;
  away: string;
  dnd: string;
  afterHours: string;
}

export interface CallSettings {
  breakMaxMinutes: number;
  ringStrategy: 'all' | 'rr' | 'idle';
  ringSeconds: number;
  recording: { auto: boolean; announce: boolean; pauseAllowed: boolean; keepDays: string };
  linkPreviews: boolean;
  forwarding: ForwardingRules;
  hours: CallHours;
  callingEnabled: boolean;
  callingUnavailableReason: string | null;
}

export interface IvrOption {
  digit: string;
  label: string;
  destination: string;
}

export interface IvrMenu {
  enabled: boolean;
  greetingMode: 'rec' | 'tts';
  greetingText: string;
  greetingAudio: FileRef | null;
  waitSeconds: number;
  noInputDestination: string;
  afterHoursEnabled: boolean;
  options: IvrOption[];
  /** True while the IVR cannot run on real calls: playing audio and reading key presses needs the call media server (Stage B). */
  stageBRequired?: boolean;
}

/** `POST /ivr/test`: what would happen for a key sequence, step by step. */
export interface IvrTestResult {
  path: string[];
}

/** Sent to the agent's device so it can answer with WebRTC (Stage A calling). */
export interface CallRingingEvent {
  call: Call;
  sdpOffer: string | null;
  ivrOption: string | null;
}

/** `GET /calls/active`: ringing and ongoing calls that concern me, after a page reload. */
export interface ActiveCalls {
  /** Ringing and ongoing calls I am rung for or handling (managers: every active call). */
  calls: Call[];
  /** Incoming calls ringing me right now, with the SDP offer to answer them. */
  ringing: CallRingingEvent[];
}

/* ───────────────────────── AI bot ───────────────────────── */

export interface AiBotSettings {
  chatBotEnabled: boolean;
  voiceBotEnabled: boolean;
  chatBotMode: 'always' | 'after_hours' | 'staff_busy';
  personaName: string;
  languageMode: 'trilingual' | 'sinhala' | 'english';
  systemPrompt: string;
  confidenceThreshold: number;
  autoHandoffOnNegotiation: boolean;
  autoHandoffOnComplaint: boolean;
  autoHandoffOnStaffRequest: boolean;
  welcomeMessage: string;
  fallbackMessage: string;
  voiceModel: string;
  voiceGreeting: string;
  autoTranscribeCalls: boolean;
  autoSummarizeCalls: boolean;
  missedCallAutoFollowup: boolean;
  missedCallMessageTemplate: string;
  voiceLanguage: 'trilingual' | 'sinhala' | 'english';
  voiceSpeed: number;
  model: string;
}

/** What a manager may see: no prompt text, no keys. */
export type AiBotSettingsSummary = Omit<AiBotSettings, 'systemPrompt'> & { knowledgeDocuments: number; trainingExamples: number };

export interface AiAddon {
  status: 'off' | 'active' | 'paused' | 'expired';
  planId: string | null;
  planName: string | null;
  activatedAt: Iso | null;
  activeUntil: Iso | null;
  monthlyReplyLimit: number;
  repliesThisMonth: number;
  tokensThisMonth: number;
  costThisMonth: Money;
  requestedAt: Iso | null;
  requestedByName: string | null;
}

export interface AiBotLog {
  id: string;
  channel: 'chat' | 'call';
  contactName: string;
  contactPhone: string;
  timestamp: Iso;
  intent: string;
  confidence: number;
  userInput: string;
  botOutput: string;
  status: 'handled' | 'handed_off' | 'resolved';
  agent: string | null;
  tokensUsed: number;
  latencyMs: number;
  callDuration: string | null;
}

export interface KnowledgeDocument {
  id: string;
  title: string;
  source: 'upload' | 'catalog' | 'text' | 'chat_examples';
  status: 'ready' | 'processing' | 'failed';
  characters: number;
  addedBy: string;
  createdAt: Iso;
}

export interface TrainingExample {
  id: string;
  question: string;
  idealAnswer: string;
  approvedBy: string;
  createdAt: Iso;
}

export interface AiSimulateResponse {
  reply: string;
  intent: string;
  confidence: number;
  handoff: boolean;
  latencyMs: number;
  tokensUsed: number;
  suggestedActions: string[];
}

/* ───────────────────────── Insight and setup ───────────────────────── */

export interface DashboardResponse {
  today: {
    chatsOpen: number;
    chatsUnassigned: number;
    chatsClosingSoon: number;
    newCustomers: number;
    messagesIn: number;
    messagesOut: number;
    callsAnswered: number;
    callsMissed: number;
    avgFirstReplySeconds: number | null;
    resolved: number;
  };
  hourly: { hour: number; messages: number; calls: number }[];
  team: { userId: string; name: string; initials: string; openChats: number; resolved: number; callsToday: number }[];
}

export interface MyDashboardResponse {
  openChats: number;
  unread: number;
  closingSoon: number;
  callsToday: number;
  callsMissed: number;
  resolvedToday: number;
  avgFirstReplySeconds: number | null;
  targetPercent: number;
  scheduledCalls: ScheduledCall[];
}

export interface ReportRow {
  userId: string;
  name: string;
  chatsHandled: number;
  resolved: number;
  avgFirstReplySeconds: number | null;
  callsAnswered: number;
  callsMissed: number;
  breakMinutes: number;
  targetPercent: number;
}

export interface ReportsResponse {
  range: { from: Iso; to: Iso };
  totals: {
    messagesIn: number;
    messagesOut: number;
    newCustomers: number;
    resolved: number;
    callsAnswered: number;
    callsMissed: number;
    avgFirstReplySeconds: number | null;
    templatesSent: number;
  };
  daily: { date: string; messagesIn: number; messagesOut: number; calls: number }[];
  byStaff: ReportRow[];
  byLabel: { labelId: string; name: string; color: LabelColor; count: number }[];
}

export interface UsageResponse {
  month: string;
  freeReplies: number;
  byCategory: { category: string; delivered: number; billable: number; cost: Money }[];
  total: Money;
  daily: { date: string; delivered: number; billable: number }[];
}

export interface Invoice {
  id: string;
  number: string;
  period: string;
  amount: Money;
  status: 'paid' | 'due' | 'void';
  issuedAt: Iso;
}

export interface BusinessProfile {
  displayName: string;
  about: string;
  description: string;
  address: string;
  website: string;
  email: string;
  vertical: string;
  greetingText: string;
  greetingOn: boolean;
  awayText: string;
  awayOn: boolean;
  syncedAt: Iso | null;
}

export interface WhatsappAccountView {
  connected: boolean;
  wabaId: string | null;
  phoneNumberId: string | null;
  displayPhone: string | null;
  verifiedName: string | null;
  nameStatus: string | null;
  qualityRating: 'GREEN' | 'YELLOW' | 'RED' | 'UNKNOWN' | null;
  messagingLimit: string | null;
  callingEnabled: boolean;
  webhookSubscribedAt: Iso | null;
  connectedAt: Iso | null;
  connectMethod: 'embedded_signup' | 'manual' | null;
  status: 'connected' | 'disconnected' | 'error' | 'pending';
  lastError: string | null;
}

export interface WhatsappAccountAdminView extends WhatsappAccountView {
  tokenMasked: string | null;
  tokenSetAt: Iso | null;
}

export interface WebhookEventRow {
  id: string;
  companyId: string | null;
  companyName: string | null;
  field: string;
  kind: string;
  receivedAt: Iso;
  processedAt: Iso | null;
  attempts: number;
  error: string | null;
}

export interface IntegrationStatus {
  callbackUrl: string;
  lastEventAt: Iso | null;
  failures24h: number;
  events24h: number;
  subscribed: boolean;
}

export interface AuditEntry {
  id: string;
  at: Iso;
  actorName: string;
  actorKind: 'user' | 'system' | 'meta' | 'admin';
  action: string;
  targetType: string;
  targetId: string | null;
  summary: string;
  source: 'web' | 'mobile' | 'system' | 'meta';
}

export interface PerformanceResponse {
  range: { from: Iso; to: Iso };
  chatsHandled: number;
  resolved: number;
  avgFirstReplySeconds: number | null;
  callsAnswered: number;
  callsMissed: number;
  breakMinutes: number;
  targetPercent: number;
  resolvedTarget: number;
  daily: { date: string; resolved: number; calls: number }[];
}

export interface ProgressResponse {
  range: { from: Iso; to: Iso };
  rows: ReportRow[];
  targets: StaffTarget[];
}

export interface UploadTicket {
  fileId: string;
  /** PUT the raw bytes here with the same Content-Type. */
  uploadUrl: string;
  uploadMethod: 'PUT';
  headers: Record<string, string>;
}

export interface ExportResponse {
  url: string;
  fileName: string;
}

/** `POST /integrations/test`: the synthetic event was stored and queued. */
export interface IntegrationTestResponse {
  ok: true;
  eventId: string;
}

/* ───────────────────────── System admin ───────────────────────── */

export interface Plan {
  id: string;
  name: string;
  seatLimit: number;
  price: Money;
  features: string[];
  companyCount: number;
}

export interface AdminCompany {
  id: string;
  name: string;
  slug: string;
  status: 'active' | 'suspended' | 'closed';
  planId: string | null;
  planName: string | null;
  seatLimit: number;
  seatsUsed: number;
  timezone: string;
  managerName: string | null;
  managerEmail: string | null;
  whatsapp: { connected: boolean; displayPhone: string | null; qualityRating: string | null };
  aiStatus: AiAddon['status'];
  createdAt: Iso;
  messages30d: number;
}

export interface AdminCompanyUser {
  id: string;
  name: string;
  email: string;
  role: CompanyRole;
  status: 'invited' | 'active' | 'disabled';
  lastLoginAt: Iso | null;
}

export interface PlatformMetaSettings {
  appId: string;
  appSecretMasked: string | null;
  graphVersion: string;
  verifyTokenMasked: string | null;
  embeddedSignupConfigId: string;
  systemTokenMasked: string | null;
  callbackUrl: string;
  subscribedFields: string[];
  updatedAt: Iso | null;
}

export interface PlatformAiSettings {
  provider: 'openai' | 'anthropic' | 'none';
  apiKeyMasked: string | null;
  defaultModel: string;
  baseUrl: string;
  defaultPrompt: string;
  globalOff: boolean;
}

export interface AiAddonPlan {
  id: string;
  name: string;
  price: Money;
  monthlyReplyLimit: number;
  voiceIncluded: boolean;
}

export interface AdminAiCompanyRow {
  companyId: string;
  companyName: string;
  addon: AiAddon;
}

export interface AdminHealth {
  queues: { name: string; waiting: number; active: number; failed: number; delayed: number }[];
  webhookFailures24h: number;
  lowQualityNumbers: { companyId: string; companyName: string; displayPhone: string; qualityRating: string }[];
  companies: number;
  activeUsers: number;
}

export interface AdminUsageRow {
  companyId: string;
  companyName: string;
  messagesIn: number;
  messagesOut: number;
  calls: number;
  storageBytes: number;
  metaCost: Money;
  aiReplies: number;
}

export interface ConnectLinkResponse {
  url: string;
  expiresAt: Iso;
}

export interface EmbeddedSignupConfig {
  appId: string;
  configId: string;
  graphVersion: string;
  companyName: string;
}

export interface PlatformWebhookSettings {
  callbackUrl: string;
  verifyTokenMasked: string | null;
  subscribedFields: string[];
}

export interface WhatsappConnectResponse {
  account: WhatsappAccountAdminView;
  /** The two-step verification PIN used to register the number, when one was set. Not stored. */
  registrationPin: string | null;
  note: string;
}

export interface AdminAuditEntry extends AuditEntry {
  companyId: string | null;
  companyName: string | null;
}

export interface AdminCompanyCreated {
  company: AdminCompany;
  managerInviteLink?: string;
}

/* ───────── Team additions ───────── */

/** What staff see of their colleagues (owner pickers, live status), and the manager's presence board. */
export interface StaffBrief {
  id: string;
  role: CompanyRole;
  name: string;
  initials: string;
  title: string;
  avatarColor: string;
  presence: Record<PresenceChannel, ChannelPresence>;
}

/** `GET /staff/:id/summary`. */
export interface StaffSummary extends StaffMember {
  assignedCustomers: number;
}

/** `GET /me/breaks`: the day's break log against the company's daily limit. */
export interface BreaksResponse {
  date: string;
  usedMinutes: number;
  limitMinutes: number;
  entries: BreakEntry[];
}

/** `GET /breaks?date=` (manager): one row per user. */
export interface UserBreaks extends BreaksResponse {
  userId: string;
  name: string;
}

export interface ContactImportResult {
  created: number;
  updated: number;
  skipped: number;
  errors: { row: number; message: string }[];
}

