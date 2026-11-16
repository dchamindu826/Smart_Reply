/**
 * Database schema (PostgreSQL, Drizzle ORM). Column names are snake_case in the database
 * (Drizzle `casing: 'snake_case'`), camelCase in TypeScript.
 *
 * Every table with `companyId` holds one company's business data. Query it only through
 * the company-scoped helpers in `src/common/tenant.ts`.
 */
import { sql } from 'drizzle-orm';
import {
  bigint,
  boolean,
  date,
  index,
  integer,
  jsonb,
  pgTable,
  primaryKey,
  real,
  text,
  timestamp,
  uniqueIndex,
  uuid
} from 'drizzle-orm/pg-core';
import { v7 as uuidv7 } from 'uuid';
import type {
  CallHours,
  ForwardingRules,
  IvrOption,
  NotifySettings,
  StaffPermissions,
  TemplateButton
} from '@smart-reply/shared';

const pk = () =>
  uuid()
    .primaryKey()
    .$defaultFn(() => uuidv7());
const ts = () => timestamp({ withTimezone: true, mode: 'date' });
const created = () => ts().notNull().defaultNow();
const updated = () =>
  ts()
    .notNull()
    .defaultNow()
    .$onUpdate(() => new Date());
const companyRef = () =>
  uuid()
    .notNull()
    .references(() => companies.id, { onDelete: 'cascade' });

/* ───────────────────────── Platform ───────────────────────── */

export const platformSettings = pgTable('platform_settings', {
  id: integer().primaryKey().default(1),
  metaAppId: text().notNull().default(''),
  metaAppSecretEnc: text(),
  metaGraphVersion: text().notNull().default('v26.0'),
  metaVerifyTokenEnc: text(),
  metaEmbeddedSignupConfigId: text().notNull().default(''),
  metaSystemTokenEnc: text(),
  metaSubscribedFields: text().array().notNull().default(sql`ARRAY['messages','calls','message_template_status_update','message_template_quality_update','phone_number_quality_update','account_update']::text[]`),
  aiProvider: text().$type<'openai' | 'anthropic' | 'none'>().notNull().default('none'),
  aiApiKeyEnc: text(),
  aiDefaultModel: text().notNull().default(''),
  aiBaseUrl: text().notNull().default(''),
  aiDefaultPrompt: text().notNull().default(''),
  aiGlobalOff: boolean().notNull().default(false),
  updatedAt: updated()
});

export const plans = pgTable('plans', {
  id: pk(),
  name: text().notNull(),
  seatLimit: integer().notNull(),
  priceMinor: bigint({ mode: 'number' }).notNull().default(0),
  currency: text().notNull().default('LKR'),
  features: text().array().notNull().default(sql`ARRAY[]::text[]`),
  createdAt: created(),
  updatedAt: updated()
});

export const aiAddonPlans = pgTable('ai_addon_plans', {
  id: pk(),
  name: text().notNull(),
  priceMinor: bigint({ mode: 'number' }).notNull().default(0),
  currency: text().notNull().default('LKR'),
  monthlyReplyLimit: integer().notNull().default(1000),
  voiceIncluded: boolean().notNull().default(false),
  createdAt: created(),
  updatedAt: updated()
});

export const companies = pgTable(
  'companies',
  {
    id: pk(),
    name: text().notNull(),
    slug: text().notNull(),
    planId: uuid().references(() => plans.id, { onDelete: 'set null' }),
    seatLimit: integer().notNull().default(5),
    status: text().$type<'active' | 'suspended' | 'closed'>().notNull().default('active'),
    timezone: text().notNull().default('Asia/Colombo'),
    locale: text().notNull().default('en'),
    defaultCountryCode: text().notNull().default('94'),
    createdBy: uuid(),
    /** Round-robin pointer for auto-assignment and ringing. */
    rrCursor: integer().notNull().default(0),
    createdAt: created(),
    updatedAt: updated()
  },
  t => [uniqueIndex('companies_slug_uq').on(t.slug)]
);

export const users = pgTable(
  'users',
  {
    id: pk(),
    companyId: uuid().references(() => companies.id, { onDelete: 'cascade' }),
    role: text().$type<'system_admin' | 'manager' | 'staff'>().notNull(),
    name: text().notNull(),
    initials: text().notNull(),
    title: text().notNull().default(''),
    email: text().notNull(),
    phone: text(),
    passwordHash: text(),
    status: text().$type<'invited' | 'active' | 'disabled'>().notNull().default('active'),
    language: text().notNull().default('en'),
    signature: text().notNull().default(''),
    note: text().notNull().default(''),
    notify: jsonb()
      .$type<NotifySettings>()
      .notNull()
      .default({ newChat: true, newMessage: true, missedCall: true, sound: true, desktop: true }),
    avatarColor: text().notNull().default('a1'),
    /** Bumped to log a user out everywhere (disable, password change). */
    tokenVersion: integer().notNull().default(0),
    lastLoginAt: ts(),
    lastAssignedAt: ts(),
    createdAt: created(),
    updatedAt: updated()
  },
  t => [uniqueIndex('users_email_uq').on(t.email), index('users_company_idx').on(t.companyId)]
);

export const refreshTokens = pgTable(
  'refresh_tokens',
  {
    id: pk(),
    userId: uuid()
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    tokenHash: text().notNull(),
    device: text().notNull().default(''),
    impersonationId: uuid(),
    expiresAt: ts().notNull(),
    revokedAt: ts(),
    replacedBy: uuid(),
    createdAt: created()
  },
  t => [uniqueIndex('refresh_tokens_hash_uq').on(t.tokenHash), index('refresh_tokens_user_idx').on(t.userId)]
);

export const invites = pgTable(
  'invites',
  {
    id: pk(),
    companyId: companyRef(),
    name: text().notNull(),
    email: text().notNull(),
    phone: text(),
    title: text().notNull().default('Staff'),
    role: text().$type<'manager' | 'staff'>().notNull().default('staff'),
    tokenHash: text().notNull(),
    invitedBy: uuid(),
    expiresAt: ts().notNull(),
    acceptedAt: ts(),
    cancelledAt: ts(),
    createdAt: created()
  },
  t => [uniqueIndex('invites_token_uq').on(t.tokenHash), index('invites_company_idx').on(t.companyId)]
);

export const passwordResets = pgTable('password_resets', {
  id: pk(),
  userId: uuid()
    .notNull()
    .references(() => users.id, { onDelete: 'cascade' }),
  tokenHash: text().notNull().unique(),
  expiresAt: ts().notNull(),
  usedAt: ts(),
  createdAt: created()
});

export const devices = pgTable(
  'devices',
  {
    id: pk(),
    userId: uuid()
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    platform: text().$type<'android' | 'ios' | 'web'>().notNull(),
    pushToken: text().notNull(),
    voipToken: text(),
    lastSeenAt: ts().notNull().defaultNow(),
    createdAt: created()
  },
  t => [uniqueIndex('devices_token_uq').on(t.pushToken)]
);

export const impersonations = pgTable('impersonations', {
  id: pk(),
  adminUserId: uuid()
    .notNull()
    .references(() => users.id),
  companyId: companyRef(),
  asUserId: uuid()
    .notNull()
    .references(() => users.id),
  reason: text().notNull(),
  startedAt: created(),
  endedAt: ts()
});

/** One-time links that open only Meta's Embedded Signup popup for a company. */
export const connectLinks = pgTable('connect_links', {
  id: pk(),
  companyId: companyRef(),
  tokenHash: text().notNull().unique(),
  createdBy: uuid().notNull(),
  expiresAt: ts().notNull(),
  usedAt: ts(),
  createdAt: created()
});

/* ───────────────────────── Company settings ───────────────────────── */

export const rolePermissions = pgTable('role_permissions', {
  companyId: companyRef().primaryKey(),
  staff: jsonb().$type<StaffPermissions>().notNull(),
  updatedAt: updated()
});

export const userPermissions = pgTable('user_permissions', {
  userId: uuid()
    .primaryKey()
    .references(() => users.id, { onDelete: 'cascade' }),
  companyId: companyRef(),
  overrides: jsonb().$type<Partial<StaffPermissions>>().notNull().default({}),
  updatedAt: updated()
});

export const whatsappAccounts = pgTable(
  'whatsapp_accounts',
  {
    id: pk(),
    companyId: companyRef(),
    wabaId: text().notNull(),
    phoneNumberId: text().notNull(),
    displayPhone: text(),
    verifiedName: text(),
    nameStatus: text(),
    qualityRating: text(),
    messagingLimit: text(),
    callingEnabled: boolean().notNull().default(false),
    accessTokenEnc: text().notNull(),
    tokenSetAt: ts().notNull().defaultNow(),
    webhookSubscribedAt: ts(),
    connectedAt: ts().notNull().defaultNow(),
    connectedBy: uuid(),
    connectMethod: text().$type<'embedded_signup' | 'manual'>().notNull(),
    status: text().$type<'connected' | 'disconnected' | 'error' | 'pending'>().notNull().default('pending'),
    lastError: text(),
    createdAt: created(),
    updatedAt: updated()
  },
  t => [
    uniqueIndex('whatsapp_accounts_company_uq').on(t.companyId),
    uniqueIndex('whatsapp_accounts_phone_uq').on(t.phoneNumberId)
  ]
);

export const businessProfiles = pgTable('business_profiles', {
  companyId: companyRef().primaryKey(),
  displayName: text().notNull().default(''),
  about: text().notNull().default(''),
  description: text().notNull().default(''),
  address: text().notNull().default(''),
  website: text().notNull().default(''),
  email: text().notNull().default(''),
  vertical: text().notNull().default(''),
  greetingText: text().notNull().default(''),
  greetingOn: boolean().notNull().default(false),
  awayText: text().notNull().default(''),
  awayOn: boolean().notNull().default(false),
  syncedAt: ts(),
  updatedAt: updated()
});

export const callSettings = pgTable('call_settings', {
  companyId: companyRef().primaryKey(),
  breakMaxMinutes: integer().notNull().default(60),
  ringStrategy: text().$type<'all' | 'rr' | 'idle'>().notNull().default('all'),
  ringSeconds: integer().notNull().default(20),
  recordAuto: boolean().notNull().default(false),
  recordAnnounce: boolean().notNull().default(true),
  recordPauseAllowed: boolean().notNull().default(true),
  recordKeepDays: text().notNull().default('90'),
  linkPreviews: boolean().notNull().default(false),
  forwarding: jsonb()
    .$type<ForwardingRules>()
    .notNull()
    .default({ noAnswer: 'queue', busy: 'wait', onBreak: 'queue', away: 'queue', dnd: 'msg', afterHours: 'msg' }),
  hours: jsonb()
    .$type<CallHours>()
    .notNull()
    .default({ enabled: false, timezone: 'Asia/Colombo', weekly: [], holidays: [] }),
  updatedAt: updated()
});

/** Personal forwarding rules (Call forwarding screen, "my rules"). */
export const userForwarding = pgTable('user_forwarding', {
  userId: uuid()
    .primaryKey()
    .references(() => users.id, { onDelete: 'cascade' }),
  companyId: companyRef(),
  rules: jsonb().$type<ForwardingRules>().notNull(),
  updatedAt: updated()
});

export const ivrMenus = pgTable('ivr_menus', {
  companyId: companyRef().primaryKey(),
  enabled: boolean().notNull().default(false),
  greetingMode: text().$type<'rec' | 'tts'>().notNull().default('tts'),
  greetingText: text().notNull().default(''),
  greetingFileId: uuid(),
  waitSeconds: integer().notNull().default(8),
  noInputDestination: text().notNull().default('queue'),
  afterHoursEnabled: boolean().notNull().default(false),
  options: jsonb().$type<IvrOption[]>().notNull().default([]),
  updatedAt: updated()
});

export const assignmentRules = pgTable('assignment_rules', {
  companyId: companyRef().primaryKey(),
  autoAssign: text().$type<'off' | 'round_robin' | 'least_open'>().notNull().default('round_robin'),
  stickyOwner: boolean().notNull().default(true),
  maxOpenChats: integer().notNull().default(25),
  unassignedAlertMinutes: integer().notNull().default(10),
  callRingOwnerFirst: boolean().notNull().default(true),
  missedCallTemplateId: uuid(),
  skipOnBreak: boolean().notNull().default(true),
  updatedAt: updated()
});

export const keywordRules = pgTable(
  'keyword_rules',
  {
    id: pk(),
    companyId: companyRef(),
    keywords: text().array().notNull(),
    labelId: uuid(),
    assignUserId: uuid(),
    quickReplyId: uuid(),
    enabled: boolean().notNull().default(true),
    matchCount: integer().notNull().default(0),
    createdAt: created(),
    updatedAt: updated()
  },
  t => [index('keyword_rules_company_idx').on(t.companyId)]
);

export const flows = pgTable(
  'flows',
  {
    id: pk(),
    companyId: companyRef(),
    name: text().notNull(),
    kind: text().$type<'greeting' | 'away' | 'keyword'>().notNull(),
    enabled: boolean().notNull().default(true),
    keywords: text().array().notNull().default(sql`ARRAY[]::text[]`),
    replyText: text().notNull().default(''),
    quickReplyId: uuid(),
    onlyOutsideHours: boolean().notNull().default(false),
    matchCount: integer().notNull().default(0),
    createdAt: created(),
    updatedAt: updated()
  },
  t => [index('flows_company_idx').on(t.companyId)]
);

export const aiAddons = pgTable('ai_addons', {
  companyId: companyRef().primaryKey(),
  status: text().$type<'off' | 'active' | 'paused' | 'expired'>().notNull().default('off'),
  addonPlanId: uuid().references(() => aiAddonPlans.id, { onDelete: 'set null' }),
  activatedBy: uuid(),
  activatedAt: ts(),
  activeUntil: ts(),
  monthlyReplyLimit: integer().notNull().default(0),
  usageMonth: text().notNull().default(''),
  repliesThisMonth: integer().notNull().default(0),
  tokensThisMonth: integer().notNull().default(0),
  costMinorThisMonth: integer().notNull().default(0),
  requestedAt: ts(),
  requestedBy: uuid(),
  requestMessage: text().notNull().default(''),
  updatedAt: updated()
});

export const aiBotSettings = pgTable('ai_bot_settings', {
  companyId: companyRef().primaryKey(),
  chatBotEnabled: boolean().notNull().default(false),
  voiceBotEnabled: boolean().notNull().default(false),
  chatBotMode: text().$type<'always' | 'after_hours' | 'staff_busy'>().notNull().default('after_hours'),
  personaName: text().notNull().default('Assistant'),
  languageMode: text().$type<'trilingual' | 'sinhala' | 'english'>().notNull().default('trilingual'),
  systemPrompt: text().notNull().default(''),
  confidenceThreshold: integer().notNull().default(75),
  autoHandoffOnNegotiation: boolean().notNull().default(true),
  autoHandoffOnComplaint: boolean().notNull().default(true),
  autoHandoffOnStaffRequest: boolean().notNull().default(true),
  welcomeMessage: text().notNull().default(''),
  fallbackMessage: text().notNull().default('Thank you. One of our team will reply shortly.'),
  voiceModel: text().notNull().default(''),
  voiceGreeting: text().notNull().default(''),
  autoTranscribeCalls: boolean().notNull().default(false),
  autoSummarizeCalls: boolean().notNull().default(false),
  missedCallAutoFollowup: boolean().notNull().default(false),
  missedCallMessageTemplate: text().notNull().default(''),
  voiceLanguage: text().$type<'trilingual' | 'sinhala' | 'english'>().notNull().default('trilingual'),
  voiceSpeed: real().notNull().default(1),
  model: text().notNull().default(''),
  updatedBy: uuid(),
  updatedAt: updated()
});

export const knowledgeDocuments = pgTable(
  'knowledge_documents',
  {
    id: pk(),
    companyId: companyRef(),
    title: text().notNull(),
    source: text().$type<'upload' | 'catalog' | 'text' | 'chat_examples'>().notNull(),
    content: text().notNull().default(''),
    fileId: uuid(),
    status: text().$type<'ready' | 'processing' | 'failed'>().notNull().default('ready'),
    addedBy: uuid(),
    createdAt: created(),
    updatedAt: updated()
  },
  t => [index('knowledge_documents_company_idx').on(t.companyId)]
);

export const aiTrainingExamples = pgTable(
  'ai_training_examples',
  {
    id: pk(),
    companyId: companyRef(),
    question: text().notNull(),
    idealAnswer: text().notNull(),
    sourceMessageId: uuid(),
    approvedBy: uuid(),
    createdAt: created(),
    updatedAt: updated()
  },
  t => [index('ai_training_examples_company_idx').on(t.companyId)]
);

/* ───────────────────────── People and presence ───────────────────────── */

export const presence = pgTable(
  'presence',
  {
    userId: uuid()
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    channel: text().$type<'call' | 'chat'>().notNull(),
    companyId: companyRef(),
    status: text().$type<'available' | 'oncall' | 'brk' | 'away' | 'dnd'>().notNull().default('away'),
    reason: text().notNull().default(''),
    since: ts().notNull().defaultNow(),
    plannedMinutes: integer().notNull().default(0)
  },
  t => [primaryKey({ columns: [t.userId, t.channel] }), index('presence_company_idx').on(t.companyId)]
);

export const breakLog = pgTable(
  'break_log',
  {
    id: pk(),
    companyId: companyRef(),
    userId: uuid()
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    reason: text().notNull(),
    scope: text().$type<'call' | 'chat' | 'both'>().notNull(),
    plannedMinutes: integer().notNull().default(0),
    startedAt: ts().notNull().defaultNow(),
    endedAt: ts()
  },
  t => [index('break_log_user_idx').on(t.userId, t.startedAt)]
);

export const staffTargets = pgTable(
  'staff_targets',
  {
    companyId: companyRef(),
    userId: uuid()
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    resolvedTarget: integer().notNull().default(0),
    updatedAt: updated()
  },
  t => [primaryKey({ columns: [t.companyId, t.userId] })]
);

/* ───────────────────────── Customers and conversations ───────────────────────── */

export const contacts = pgTable(
  'contacts',
  {
    id: pk(),
    companyId: companyRef(),
    /** Phone number in digits with country code. Meta may omit it for users who only have a BSUID. */
    waId: text(),
    /** Meta business-scoped user id (`CC.xxxx`), present in webhooks since April 2026. */
    bsuid: text(),
    username: text(),
    name: text().notNull().default(''),
    profileName: text().notNull().default(''),
    city: text().notNull().default(''),
    notes: text().notNull().default(''),
    ownerUserId: uuid().references(() => users.id, { onDelete: 'set null' }),
    callPermission: text().$type<'none' | 'requested' | 'temporary' | 'permanent'>().notNull().default('none'),
    callPermissionExpiresAt: ts(),
    callPermissionRequests: jsonb().$type<string[]>().notNull().default([]),
    unansweredBusinessCalls: integer().notNull().default(0),
    marketingOptIn: boolean().notNull().default(false),
    blockedAt: ts(),
    firstSeenAt: ts().notNull().defaultNow(),
    avatarColor: text().notNull().default('a1'),
    createdAt: created(),
    updatedAt: updated()
  },
  t => [
    uniqueIndex('contacts_company_wa_uq').on(t.companyId, t.waId),
    uniqueIndex('contacts_company_bsuid_uq').on(t.companyId, t.bsuid),
    index('contacts_owner_idx').on(t.companyId, t.ownerUserId)
  ]
);

export const contactOwnerHistory = pgTable(
  'contact_owner_history',
  {
    id: pk(),
    companyId: companyRef(),
    contactId: uuid()
      .notNull()
      .references(() => contacts.id, { onDelete: 'cascade' }),
    fromUserId: uuid(),
    toUserId: uuid(),
    actorUserId: uuid(),
    actorKind: text().$type<'user' | 'auto_assign' | 'rule' | 'system'>().notNull(),
    reason: text().notNull().default(''),
    at: ts().notNull().defaultNow()
  },
  t => [index('contact_owner_history_contact_idx').on(t.contactId, t.at)]
);

export const labels = pgTable(
  'labels',
  {
    id: pk(),
    companyId: companyRef(),
    name: text().notNull(),
    color: text().notNull().default(''),
    meaning: text().notNull().default(''),
    autoRule: text().notNull().default(''),
    createdAt: created(),
    updatedAt: updated()
  },
  t => [uniqueIndex('labels_company_name_uq').on(t.companyId, t.name)]
);

export const contactLabels = pgTable(
  'contact_labels',
  {
    companyId: companyRef(),
    contactId: uuid()
      .notNull()
      .references(() => contacts.id, { onDelete: 'cascade' }),
    labelId: uuid()
      .notNull()
      .references(() => labels.id, { onDelete: 'cascade' }),
    addedBy: uuid(),
    addedAt: ts().notNull().defaultNow()
  },
  t => [primaryKey({ columns: [t.contactId, t.labelId] }), index('contact_labels_label_idx').on(t.labelId)]
);

export const conversations = pgTable(
  'conversations',
  {
    id: pk(),
    companyId: companyRef(),
    contactId: uuid()
      .notNull()
      .references(() => contacts.id, { onDelete: 'cascade' }),
    status: text().$type<'open' | 'resolved'>().notNull().default('open'),
    lastMessageAt: ts(),
    lastPreview: text().notNull().default(''),
    lastInboundAt: ts(),
    windowExpiresAt: ts(),
    unreadCount: integer().notNull().default(0),
    botActive: boolean().notNull().default(true),
    firstResponseAt: ts(),
    resolvedAt: ts(),
    resolvedBy: uuid(),
    createdAt: created(),
    updatedAt: updated()
  },
  t => [
    uniqueIndex('conversations_contact_uq').on(t.companyId, t.contactId),
    index('conversations_last_idx').on(t.companyId, t.lastMessageAt)
  ]
);

export const conversationUserState = pgTable(
  'conversation_user_state',
  {
    conversationId: uuid()
      .notNull()
      .references(() => conversations.id, { onDelete: 'cascade' }),
    userId: uuid()
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    companyId: companyRef(),
    favorite: boolean().notNull().default(false),
    archived: boolean().notNull().default(false),
    lastReadAt: ts()
  },
  t => [primaryKey({ columns: [t.conversationId, t.userId] })]
);

export const messages = pgTable(
  'messages',
  {
    id: pk(),
    companyId: companyRef(),
    conversationId: uuid()
      .notNull()
      .references(() => conversations.id, { onDelete: 'cascade' }),
    direction: text().$type<'in' | 'out' | 'note' | 'system'>().notNull(),
    type: text().notNull().default('text'),
    body: text().notNull().default(''),
    waMessageId: text(),
    senderUserId: uuid(),
    senderKind: text().$type<'user' | 'bot' | 'system' | 'customer'>().notNull(),
    templateId: uuid(),
    templateName: text(),
    buttons: jsonb().$type<string[]>().notNull().default([]),
    replyToId: uuid(),
    status: text().$type<'queued' | 'sent' | 'delivered' | 'read' | 'failed'>().notNull().default('queued'),
    error: text(),
    pricingCategory: text(),
    billable: boolean(),
    raw: jsonb(),
    sentAt: ts(),
    deliveredAt: ts(),
    readAt: ts(),
    createdAt: created()
  },
  t => [
    index('messages_conversation_idx').on(t.conversationId, t.createdAt),
    uniqueIndex('messages_wa_uq').on(t.companyId, t.waMessageId),
    index('messages_company_created_idx').on(t.companyId, t.createdAt)
  ]
);

/** Every stored file: chat media, quick reply attachments, gallery, product photos, IVR greeting. */
export const files = pgTable(
  'files',
  {
    id: pk(),
    companyId: uuid().references(() => companies.id, { onDelete: 'cascade' }),
    purpose: text().notNull().default('message'),
    kind: text().$type<'image' | 'audio' | 'video' | 'document' | 'sticker'>().notNull(),
    name: text().notNull(),
    mime: text().notNull(),
    sizeBytes: bigint({ mode: 'number' }).notNull(),
    storageKey: text().notNull(),
    uploaded: boolean().notNull().default(false),
    voice: boolean().notNull().default(false),
    waMediaId: text(),
    waMediaUploadedAt: ts(),
    sha256: text(),
    durationSeconds: integer(),
    width: integer(),
    height: integer(),
    createdBy: uuid(),
    createdAt: created()
  },
  t => [index('files_company_idx').on(t.companyId, t.createdAt)]
);

export const messageAttachments = pgTable(
  'message_attachments',
  {
    messageId: uuid()
      .notNull()
      .references(() => messages.id, { onDelete: 'cascade' }),
    fileId: uuid()
      .notNull()
      .references(() => files.id, { onDelete: 'cascade' }),
    companyId: companyRef(),
    position: integer().notNull().default(0)
  },
  t => [primaryKey({ columns: [t.messageId, t.fileId] })]
);

/* ───────────────────────── Content ───────────────────────── */

export const templates = pgTable(
  'templates',
  {
    id: pk(),
    companyId: companyRef(),
    metaTemplateId: text(),
    name: text().notNull(),
    category: text().$type<'utility' | 'marketing' | 'authentication'>().notNull(),
    language: text().notNull(),
    status: text().$type<'approved' | 'pending' | 'rejected' | 'paused' | 'disabled'>().notNull().default('pending'),
    quality: text().$type<'high' | 'medium' | 'low' | 'unknown'>().notNull().default('unknown'),
    headerText: text(),
    body: text().notNull(),
    footer: text(),
    buttons: jsonb().$type<TemplateButton[]>().notNull().default([]),
    rejectionReason: text(),
    usedCount: integer().notNull().default(0),
    submittedBy: uuid(),
    createdAt: created(),
    updatedAt: updated()
  },
  t => [uniqueIndex('templates_company_name_lang_uq').on(t.companyId, t.name, t.language)]
);

export const quickReplies = pgTable(
  'quick_replies',
  {
    id: pk(),
    companyId: companyRef(),
    command: text().notNull(),
    title: text().notNull(),
    text: text().notNull().default(''),
    scope: text().$type<'everyone' | 'only_me'>().notNull().default('everyone'),
    ownerUserId: uuid().references(() => users.id, { onDelete: 'set null' }),
    fileIds: uuid().array().notNull().default(sql`ARRAY[]::uuid[]`),
    usedCount: integer().notNull().default(0),
    createdAt: created(),
    updatedAt: updated()
  },
  t => [uniqueIndex('quick_replies_company_cmd_uq').on(t.companyId, t.command)]
);

export const productCollections = pgTable('product_collections', {
  id: pk(),
  companyId: companyRef(),
  name: text().notNull(),
  position: integer().notNull().default(0),
  createdAt: created(),
  updatedAt: updated()
});

export const products = pgTable(
  'products',
  {
    id: pk(),
    companyId: companyRef(),
    collectionId: uuid().references(() => productCollections.id, { onDelete: 'set null' }),
    name: text().notNull(),
    sku: text().notNull().default(''),
    priceMinor: bigint({ mode: 'number' }).notNull().default(0),
    oldPriceMinor: bigint({ mode: 'number' }),
    currency: text().notNull().default('LKR'),
    priceUnit: text().notNull().default(''),
    note: text().notNull().default(''),
    status: text().$type<'active' | 'hidden'>().notNull().default('active'),
    imageFileId: uuid(),
    createdAt: created(),
    updatedAt: updated()
  },
  t => [index('products_company_idx').on(t.companyId)]
);

export const mediaCategories = pgTable('media_categories', {
  id: pk(),
  companyId: companyRef(),
  name: text().notNull(),
  createdAt: created()
});

export const mediaItems = pgTable(
  'media_items',
  {
    id: pk(),
    companyId: companyRef(),
    title: text().notNull(),
    kind: text().$type<'image' | 'video'>().notNull(),
    fileId: uuid()
      .notNull()
      .references(() => files.id, { onDelete: 'cascade' }),
    caption: text().notNull().default(''),
    categoryId: uuid().references(() => mediaCategories.id, { onDelete: 'set null' }),
    tags: text().array().notNull().default(sql`ARRAY[]::text[]`),
    width: integer(),
    height: integer(),
    durationSeconds: integer(),
    addedBy: uuid(),
    shareCount: integer().notNull().default(0),
    downloadCount: integer().notNull().default(0),
    createdAt: created(),
    updatedAt: updated()
  },
  t => [index('media_items_company_idx').on(t.companyId, t.createdAt)]
);

export const mediaFavorites = pgTable(
  'media_favorites',
  {
    mediaItemId: uuid()
      .notNull()
      .references(() => mediaItems.id, { onDelete: 'cascade' }),
    userId: uuid()
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    companyId: companyRef()
  },
  t => [primaryKey({ columns: [t.mediaItemId, t.userId] })]
);

export const broadcasts = pgTable('broadcasts', {
  id: pk(),
  companyId: companyRef(),
  name: text().notNull(),
  labelId: uuid().references(() => labels.id, { onDelete: 'set null' }),
  templateId: uuid()
    .notNull()
    .references(() => templates.id),
  variables: jsonb().$type<string[]>().notNull().default([]),
  status: text()
    .$type<'draft' | 'scheduled' | 'sending' | 'done' | 'failed' | 'cancelled'>()
    .notNull()
    .default('draft'),
  scheduledAt: ts(),
  startedAt: ts(),
  finishedAt: ts(),
  createdBy: uuid(),
  createdAt: created(),
  updatedAt: updated()
});

export const broadcastRecipients = pgTable(
  'broadcast_recipients',
  {
    broadcastId: uuid()
      .notNull()
      .references(() => broadcasts.id, { onDelete: 'cascade' }),
    contactId: uuid()
      .notNull()
      .references(() => contacts.id, { onDelete: 'cascade' }),
    companyId: companyRef(),
    messageId: uuid(),
    status: text().$type<'pending' | 'sent' | 'delivered' | 'read' | 'replied' | 'failed' | 'skipped'>().notNull().default('pending'),
    error: text()
  },
  t => [primaryKey({ columns: [t.broadcastId, t.contactId] }), index('broadcast_recipients_message_idx').on(t.messageId)]
);

/* ───────────────────────── Calls ───────────────────────── */

export const calls = pgTable(
  'calls',
  {
    id: pk(),
    companyId: companyRef(),
    contactId: uuid()
      .notNull()
      .references(() => contacts.id, { onDelete: 'cascade' }),
    waCallId: text(),
    direction: text().$type<'in' | 'out'>().notNull(),
    outcome: text()
      .$type<'ringing' | 'ongoing' | 'answered' | 'missed' | 'rejected' | 'forwarded' | 'transferred' | 'failed'>()
      .notNull()
      .default('ringing'),
    handledByUserId: uuid(),
    ringingUserIds: uuid().array().notNull().default(sql`ARRAY[]::uuid[]`),
    sdpOffer: text(),
    ivrOption: text(),
    startedAt: ts().notNull().defaultNow(),
    answeredAt: ts(),
    endedAt: ts(),
    durationSeconds: integer(),
    note: text().notNull().default(''),
    recordingFileId: uuid(),
    transcript: jsonb(),
    aiSummary: text(),
    createdAt: created(),
    updatedAt: updated()
  },
  t => [uniqueIndex('calls_wa_uq').on(t.companyId, t.waCallId), index('calls_company_started_idx').on(t.companyId, t.startedAt)]
);

export const callEvents = pgTable(
  'call_events',
  {
    id: pk(),
    companyId: companyRef(),
    callId: uuid()
      .notNull()
      .references(() => calls.id, { onDelete: 'cascade' }),
    kind: text().notNull(),
    actorUserId: uuid(),
    data: jsonb(),
    at: ts().notNull().defaultNow()
  },
  t => [index('call_events_call_idx').on(t.callId, t.at)]
);

export const scheduledCalls = pgTable(
  'scheduled_calls',
  {
    id: pk(),
    companyId: companyRef(),
    contactId: uuid()
      .notNull()
      .references(() => contacts.id, { onDelete: 'cascade' }),
    userId: uuid()
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    scheduledAt: ts().notNull(),
    note: text().notNull().default(''),
    status: text().$type<'pending' | 'done' | 'cancelled'>().notNull().default('pending'),
    remindedAt: ts(),
    createdAt: created()
  },
  t => [index('scheduled_calls_company_idx').on(t.companyId, t.scheduledAt)]
);

/* ───────────────────────── Insight and trail ───────────────────────── */

export const auditLogs = pgTable(
  'audit_logs',
  {
    id: pk(),
    companyId: uuid().references(() => companies.id, { onDelete: 'cascade' }),
    actorUserId: uuid(),
    actorName: text().notNull().default(''),
    actorKind: text().$type<'user' | 'system' | 'meta' | 'admin'>().notNull(),
    action: text().notNull(),
    targetType: text().notNull(),
    targetId: text(),
    summary: text().notNull(),
    meta: jsonb(),
    source: text().$type<'web' | 'mobile' | 'system' | 'meta'>().notNull().default('web'),
    at: ts().notNull().defaultNow()
  },
  t => [index('audit_logs_company_idx').on(t.companyId, t.at)]
);

export const usageDaily = pgTable(
  'usage_daily',
  {
    companyId: companyRef(),
    date: date({ mode: 'string' }).notNull(),
    category: text().notNull(),
    deliveredCount: integer().notNull().default(0),
    billableCount: integer().notNull().default(0),
    costMinor: integer().notNull().default(0),
    currency: text().notNull().default('USD')
  },
  t => [primaryKey({ columns: [t.companyId, t.date, t.category] })]
);

export const aiBotLogs = pgTable(
  'ai_bot_logs',
  {
    id: pk(),
    companyId: companyRef(),
    channel: text().$type<'chat' | 'call'>().notNull(),
    contactId: uuid(),
    conversationId: uuid(),
    messageId: uuid(),
    intent: text().notNull().default(''),
    confidence: integer().notNull().default(0),
    userInput: text().notNull().default(''),
    botOutput: text().notNull().default(''),
    status: text().$type<'handled' | 'handed_off' | 'resolved'>().notNull(),
    agentUserId: uuid(),
    tokensUsed: integer().notNull().default(0),
    latencyMs: integer().notNull().default(0),
    createdAt: created()
  },
  t => [index('ai_bot_logs_company_idx').on(t.companyId, t.createdAt)]
);

export const webhookEvents = pgTable(
  'webhook_events',
  {
    id: pk(),
    companyId: uuid().references(() => companies.id, { onDelete: 'set null' }),
    phoneNumberId: text(),
    field: text().notNull(),
    kind: text().notNull().default(''),
    dedupeKey: text().notNull(),
    payload: jsonb().notNull(),
    attempts: integer().notNull().default(0),
    receivedAt: ts().notNull().defaultNow(),
    processedAt: ts(),
    error: text()
  },
  t => [uniqueIndex('webhook_events_dedupe_uq').on(t.dedupeKey), index('webhook_events_received_idx').on(t.receivedAt)]
);

export const invoices = pgTable('invoices', {
  id: pk(),
  companyId: companyRef(),
  number: text().notNull(),
  period: text().notNull(),
  amountMinor: bigint({ mode: 'number' }).notNull(),
  currency: text().notNull().default('LKR'),
  status: text().$type<'paid' | 'due' | 'void'>().notNull().default('due'),
  issuedAt: ts().notNull().defaultNow()
});
