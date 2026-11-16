/**
 * Request bodies accepted by the Smart Reply API. The API validates every body with these
 * schemas; the web and mobile apps use the inferred types to build requests.
 */
import { z } from 'zod';
import {
  CALL_FILTERS,
  CONVERSATION_FILTERS,
  LABEL_COLORS,
  MAX_SEATS,
  PRESENCE_STATUSES,
  STAFF_PERMISSIONS
} from './constants';

const id = z.string().uuid();
const trimmed = (max: number) => z.string().trim().max(max);
const required = (max: number) => z.string().trim().min(1).max(max);
const email = z.string().trim().toLowerCase().email().max(254);
const password = z.string().min(8, 'Use at least 8 characters').max(200);
/** Phone in any common format; the API normalises it to digits with the country code. */
const phone = z.string().trim().regex(/^\+?[0-9 ()-]{7,20}$/, 'Enter a phone number with the country code');
const destination = z.string().regex(/^(queue|wait|msg|vm|manager|owner|user:[0-9a-f-]{36}|quick_reply:[0-9a-f-]{36})$/);
const hhmm = z.string().regex(/^([01][0-9]|2[0-3])[0-5][0-9]$/, 'Use HHMM, for example 0830');

/* ───────── Auth ───────── */

export const loginSchema = z.object({
  email,
  password: z.string().min(1).max(200),
  client: z.enum(['web', 'mobile']).default('web'),
  device: trimmed(120).optional()
});
export type LoginInput = z.infer<typeof loginSchema>;

export const refreshSchema = z.object({ refreshToken: z.string().min(10).max(500).optional() });
export const forgotPasswordSchema = z.object({ email });
export const resetPasswordSchema = z.object({ token: z.string().min(20).max(200), password });
export const acceptInviteSchema = z.object({ password, name: trimmed(80).optional() });
export const changePasswordSchema = z.object({ currentPassword: z.string().min(1).max(200), newPassword: password });

export const updateMeSchema = z.object({
  name: required(80).optional(),
  title: trimmed(80).optional(),
  phone: phone.nullable().optional(),
  language: z.enum(['en', 'si', 'ta']).optional(),
  signature: trimmed(200).optional(),
  notify: z
    .object({
      newChat: z.boolean(),
      newMessage: z.boolean(),
      missedCall: z.boolean(),
      sound: z.boolean(),
      desktop: z.boolean()
    })
    .partial()
    .optional()
});
export type UpdateMeInput = z.infer<typeof updateMeSchema>;

export const registerDeviceSchema = z.object({
  platform: z.enum(['android', 'ios', 'web']),
  pushToken: z.string().min(10).max(500),
  voipToken: z.string().max(500).optional()
});

/* ───────── Team ───────── */

export const presenceSchema = z.object({
  channel: z.enum(['call', 'chat', 'both']),
  status: z.enum(PRESENCE_STATUSES),
  reason: trimmed(60).default(''),
  plannedMinutes: z.number().int().min(0).max(480).default(0)
});
export type PresenceInput = z.infer<typeof presenceSchema>;

export const createInviteSchema = z.object({
  name: required(80),
  email,
  phone: phone.optional(),
  title: trimmed(80).default('Staff'),
  role: z.enum(['staff', 'manager']).default('staff')
});
export type CreateInviteInput = z.infer<typeof createInviteSchema>;

const permissionsShape = Object.fromEntries(STAFF_PERMISSIONS.map(k => [k, z.boolean()])) as Record<
  (typeof STAFF_PERMISSIONS)[number],
  z.ZodBoolean
>;
export const permissionsSchema = z.object(permissionsShape);
export const partialPermissionsSchema = permissionsSchema.partial();

export const updateStaffSchema = z.object({
  name: required(80).optional(),
  title: trimmed(80).optional(),
  phone: phone.nullable().optional(),
  note: trimmed(120).optional(),
  permissions: partialPermissionsSchema.optional(),
  status: z.enum(['active', 'disabled']).optional()
});
export type UpdateStaffInput = z.infer<typeof updateStaffSchema>;

export const updateRolesSchema = z.object({ staff: partialPermissionsSchema });

export const assignmentRulesSchema = z.object({
  autoAssign: z.enum(['off', 'round_robin', 'least_open']),
  stickyOwner: z.boolean(),
  maxOpenChats: z.number().int().min(1).max(500),
  unassignedAlertMinutes: z.number().int().min(1).max(1440),
  callRingOwnerFirst: z.boolean(),
  missedCallTemplateId: id.nullable(),
  skipOnBreak: z.boolean()
});

export const keywordRuleSchema = z.object({
  keywords: z.array(required(40)).min(1).max(20),
  labelId: id.nullable().default(null),
  assignUserId: id.nullable().default(null),
  quickReplyId: id.nullable().default(null),
  enabled: z.boolean().default(true)
});

export const targetsSchema = z.object({
  targets: z.array(z.object({ userId: id, resolvedTarget: z.number().int().min(0).max(10000) })).max(MAX_SEATS)
});

/* ───────── Customers ───────── */

export const createContactSchema = z.object({
  name: required(80),
  phone,
  city: trimmed(60).default(''),
  ownerUserId: id.nullable().optional(),
  labelIds: z.array(id).max(20).default([]),
  marketingOptIn: z.boolean().default(false)
});
export type CreateContactInput = z.infer<typeof createContactSchema>;

export const updateContactSchema = z.object({
  name: required(80).optional(),
  city: trimmed(60).optional(),
  notes: trimmed(2000).optional(),
  marketingOptIn: z.boolean().optional()
});

export const setOwnerSchema = z.object({ ownerUserId: id.nullable(), reason: trimmed(120).default('') });
export const bulkOwnerSchema = z.object({
  contactIds: z.array(id).min(1).max(500),
  ownerUserId: id.nullable(),
  reason: trimmed(120).default('')
});
export const setLabelsSchema = z.object({ labelIds: z.array(id).max(20) });
export const importContactsSchema = z.object({
  rows: z
    .array(
      z.object({
        name: required(80),
        phone,
        city: trimmed(60).optional(),
        ownerEmail: z.string().trim().toLowerCase().email().optional(),
        labels: z.array(required(40)).max(20).optional()
      })
    )
    .min(1)
    .max(5000)
});

export const labelSchema = z.object({
  name: required(40),
  color: z.enum(LABEL_COLORS).default(''),
  meaning: trimmed(160).default(''),
  autoRule: trimmed(160).default('')
});

export const contactListQuery = z.object({
  search: trimmed(80).optional(),
  owner: z.union([id, z.literal('none'), z.literal('me')]).optional(),
  label: id.optional(),
  cursor: z.string().max(200).optional(),
  limit: z.coerce.number().int().min(1).max(200).default(50)
});

/* ───────── Conversations ───────── */

export const conversationListQuery = z.object({
  filter: z.enum(CONVERSATION_FILTERS).default('all'),
  owner: z.union([id, z.literal('none'), z.literal('me')]).optional(),
  label: id.optional(),
  search: trimmed(80).optional(),
  cursor: z.string().max(200).optional(),
  limit: z.coerce.number().int().min(1).max(200).default(50)
});
export type ConversationListQuery = z.infer<typeof conversationListQuery>;

export const sendMessageSchema = z
  .object({
    text: trimmed(4096).default(''),
    fileIds: z.array(id).max(10).default([]),
    replyToId: id.optional(),
    voice: z.boolean().default(false)
  })
  .refine(v => v.text.length > 0 || v.fileIds.length > 0, { message: 'Write a message or attach a file' });
export type SendMessageInput = z.infer<typeof sendMessageSchema>;

export const noteSchema = z.object({ text: required(4096), fileIds: z.array(id).max(10).default([]) });

export const sendTemplateSchema = z.object({
  templateId: id,
  variables: z.array(trimmed(1024)).max(20).default([])
});
export type SendTemplateInput = z.infer<typeof sendTemplateSchema>;

export const startConversationSchema = z.object({
  contactId: id.optional(),
  phone: phone.optional(),
  name: trimmed(80).optional(),
  templateId: id,
  variables: z.array(trimmed(1024)).max(20).default([])
});

export const sendProductSchema = z.object({ productId: id });
export const conversationStateSchema = z.object({ favorite: z.boolean().optional(), archived: z.boolean().optional() });
export const botStateSchema = z.object({ active: z.boolean() });

export const createFileSchema = z.object({
  name: required(200),
  mime: required(120),
  sizeBytes: z.number().int().min(1),
  purpose: z.enum(['message', 'quick_reply', 'media', 'product', 'ivr', 'knowledge', 'import']).default('message')
});
export type CreateFileInput = z.infer<typeof createFileSchema>;

/* ───────── Content ───────── */

const templateButton = z.object({
  type: z.enum(['QUICK_REPLY', 'URL', 'PHONE_NUMBER']),
  text: required(25),
  url: z.string().url().max(2000).optional(),
  phoneNumber: phone.optional()
});

export const createTemplateSchema = z.object({
  name: z
    .string()
    .trim()
    .regex(/^[a-z0-9_]{1,512}$/, 'Lower-case letters, numbers and underscores only'),
  category: z.enum(['utility', 'marketing', 'authentication']),
  language: z.string().regex(/^[a-z]{2}(_[A-Z]{2})?$/, 'Language code such as en, si or en_US'),
  headerText: trimmed(60).nullable().default(null),
  body: required(1024),
  footer: trimmed(60).nullable().default(null),
  buttons: z.array(templateButton).max(10).default([]),
  examples: z.array(trimmed(200)).max(20).default([])
});
export type CreateTemplateInput = z.infer<typeof createTemplateSchema>;

export const quickReplySchema = z.object({
  command: z
    .string()
    .trim()
    .regex(/^\/[a-z0-9][a-z0-9_-]{0,30}$/, 'Start with / and use letters, numbers, - or _'),
  title: required(80),
  text: trimmed(4096).default(''),
  scope: z.enum(['everyone', 'only_me']).default('everyone'),
  fileIds: z.array(id).max(10).default([])
});
export type QuickReplyInput = z.infer<typeof quickReplySchema>;

export const collectionSchema = z.object({ name: required(60), position: z.number().int().min(0).max(1000).default(0) });

export const productSchema = z.object({
  collectionId: id.nullable().default(null),
  name: required(120),
  sku: trimmed(60).default(''),
  priceMinor: z.number().int().min(0).max(1_000_000_000_00),
  oldPriceMinor: z.number().int().min(0).nullable().default(null),
  currency: z.string().length(3).default('LKR'),
  priceUnit: trimmed(20).default(''),
  note: trimmed(300).default(''),
  status: z.enum(['active', 'hidden']).default('active'),
  imageFileId: id.nullable().default(null)
});
export type ProductInput = z.infer<typeof productSchema>;

export const mediaItemSchema = z.object({
  fileId: id,
  title: required(120),
  caption: trimmed(1024).default(''),
  categoryId: id.nullable().default(null),
  tags: z.array(required(30)).max(20).default([]),
  width: z.number().int().positive().nullable().default(null),
  height: z.number().int().positive().nullable().default(null),
  durationSeconds: z.number().int().positive().nullable().default(null)
});
export const updateMediaSchema = mediaItemSchema.omit({ fileId: true }).partial();
export const mediaQuery = z.object({
  kind: z.enum(['image', 'video']).optional(),
  category: id.optional(),
  search: trimmed(80).optional(),
  favorites: z.enum(['true', 'false']).transform(v => v === 'true').optional(),
  sort: z.enum(['newest', 'oldest', 'popular', 'name']).default('newest')
});
export const mediaCategorySchema = z.object({ name: required(40) });
export const favoriteSchema = z.object({ favorite: z.boolean() });

export const broadcastSchema = z.object({
  name: required(120),
  labelId: id.nullable(),
  templateId: id,
  variables: z.array(trimmed(1024)).max(20).default([]),
  scheduledAt: z.string().datetime().nullable().default(null)
});

export const flowSchema = z.object({
  name: required(80),
  kind: z.enum(['greeting', 'away', 'keyword']),
  enabled: z.boolean().default(true),
  keywords: z.array(required(40)).max(20).default([]),
  replyText: trimmed(4096).default(''),
  quickReplyId: id.nullable().default(null),
  onlyOutsideHours: z.boolean().default(false)
});

/* ───────── Calls ───────── */

export const callListQuery = z.object({
  filter: z.enum(CALL_FILTERS).default('all'),
  staff: id.optional(),
  search: trimmed(80).optional(),
  from: z.string().datetime().optional(),
  to: z.string().datetime().optional(),
  cursor: z.string().max(200).optional(),
  limit: z.coerce.number().int().min(1).max(200).default(50)
});

export const startCallSchema = z.object({ contactId: id, sdpOffer: z.string().min(10).max(20000) });
export const answerCallSchema = z.object({ sdpAnswer: z.string().min(10).max(20000) });
export const declineCallSchema = z.object({ messageText: trimmed(1024).optional() });
export const forwardCallSchema = z.object({ destination });
export const callNoteSchema = z.object({ note: required(2000) });
export const scheduledCallSchema = z.object({
  contactId: id,
  userId: id.optional(),
  scheduledAt: z.string().datetime(),
  note: trimmed(300).default('')
});

const forwardingShape = z.object({
  noAnswer: destination,
  busy: destination,
  onBreak: destination,
  away: destination,
  dnd: destination,
  afterHours: destination
});
export const forwardingSchema = forwardingShape;

export const callSettingsSchema = z.object({
  breakMaxMinutes: z.number().int().min(0).max(480),
  ringStrategy: z.enum(['all', 'rr', 'idle']),
  ringSeconds: z.number().int().min(5).max(55),
  recording: z.object({
    auto: z.boolean(),
    announce: z.boolean(),
    pauseAllowed: z.boolean(),
    keepDays: z.enum(['30', '90', '180', '365', 'forever'])
  }),
  linkPreviews: z.boolean(),
  forwarding: forwardingShape,
  hours: z.object({
    enabled: z.boolean(),
    timezone: z.string().min(3).max(60),
    weekly: z
      .array(
        z.object({
          day: z.enum(['MONDAY', 'TUESDAY', 'WEDNESDAY', 'THURSDAY', 'FRIDAY', 'SATURDAY', 'SUNDAY']),
          open: hhmm,
          close: hhmm
        })
      )
      .max(14),
    holidays: z
      .array(z.object({ date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/), open: hhmm.optional(), close: hhmm.optional() }))
      .max(50)
  })
});
export type CallSettingsInput = z.infer<typeof callSettingsSchema>;

export const ivrSchema = z.object({
  enabled: z.boolean(),
  greetingMode: z.enum(['rec', 'tts']),
  greetingText: trimmed(1000),
  greetingFileId: id.nullable().default(null),
  waitSeconds: z.number().int().min(3).max(30),
  noInputDestination: destination,
  afterHoursEnabled: z.boolean(),
  options: z
    .array(z.object({ digit: z.string().regex(/^[0-9*#]$/), label: required(60), destination }))
    .max(12)
});
export const ivrTestSchema = z.object({ keys: z.string().regex(/^[0-9*#]{0,5}$/) });

/* ───────── AI (manager) ───────── */

export const activationRequestSchema = z.object({ message: trimmed(500).default('') });

/* ───────── Insight and setup ───────── */

export const rangeQuery = z.object({
  range: z.enum(['today', '7d', '30d', 'month', 'custom']).default('7d'),
  from: z.string().datetime().optional(),
  to: z.string().datetime().optional()
});
export type RangeQuery = z.infer<typeof rangeQuery>;

export const exportSchema = z.object({
  kind: z.enum(['contacts', 'calls', 'reports', 'performance', 'audit', 'conversations']),
  format: z.enum(['csv']).default('csv'),
  params: z.record(z.string(), z.string()).default({})
});

export const businessProfileSchema = z.object({
  displayName: trimmed(80),
  about: trimmed(139),
  description: trimmed(512),
  address: trimmed(256),
  website: trimmed(256),
  email: z.union([z.literal(''), email]),
  vertical: trimmed(40),
  greetingText: trimmed(1024),
  greetingOn: z.boolean(),
  awayText: trimmed(1024),
  awayOn: z.boolean()
});

export const auditQuery = z.object({
  actor: id.optional(),
  action: trimmed(60).optional(),
  from: z.string().datetime().optional(),
  to: z.string().datetime().optional(),
  cursor: z.string().max(200).optional(),
  limit: z.coerce.number().int().min(1).max(200).default(50)
});

/** `GET /billing/usage?month=YYYY-MM`. Without a month, the current month in the company's timezone. */
export const usageQuery = z.object({
  month: z
    .string()
    .regex(/^\d{4}-(0[1-9]|1[0-2])$/, 'Use YYYY-MM, for example 2026-11')
    .optional()
});

/* ───────── System admin ───────── */

export const planSchema = z.object({
  name: required(60),
  seatLimit: z.number().int().min(1).max(MAX_SEATS),
  priceMinor: z.number().int().min(0),
  currency: z.string().length(3).default('LKR'),
  features: z.array(required(80)).max(30).default([])
});

export const createCompanySchema = z.object({
  name: required(120),
  slug: z
    .string()
    .trim()
    .regex(/^[a-z0-9][a-z0-9-]{1,60}$/, 'Lower-case letters, numbers and dashes')
    .optional(),
  planId: id.nullable().default(null),
  seatLimit: z.number().int().min(1).max(MAX_SEATS).optional(),
  timezone: z.string().min(3).max(60).default('Asia/Colombo'),
  manager: z.object({ name: required(80), email, phone: phone.optional(), password: password.optional() })
});
export type CreateCompanyInput = z.infer<typeof createCompanySchema>;

export const updateCompanySchema = z.object({
  name: required(120).optional(),
  planId: id.nullable().optional(),
  seatLimit: z.number().int().min(1).max(MAX_SEATS).optional(),
  timezone: z.string().min(3).max(60).optional(),
  status: z.enum(['active', 'suspended', 'closed']).optional()
});

export const addManagerSchema = z.object({ name: required(80), email, phone: phone.optional() });
export const impersonateSchema = z.object({ reason: required(200) });

export const platformMetaSchema = z.object({
  appId: z.string().trim().regex(/^\d{5,25}$/, 'Meta app id is a number').or(z.literal('')),
  appSecret: z.string().trim().min(10).max(200).optional(),
  graphVersion: z.string().regex(/^v\d{2}\.\d$/, 'For example v23.0'),
  verifyToken: z.string().trim().min(8).max(200).optional(),
  embeddedSignupConfigId: z.string().trim().max(40).default(''),
  systemToken: z.string().trim().min(20).max(1000).optional()
});

export const manualWhatsappSchema = z.object({
  wabaId: z.string().trim().regex(/^\d{5,25}$/),
  phoneNumberId: z.string().trim().regex(/^\d{5,25}$/),
  accessToken: z.string().trim().min(20).max(1000),
  pin: z.string().regex(/^\d{6}$/).optional()
});

export const embeddedSignupSchema = z.object({
  code: z.string().min(10).max(2000),
  wabaId: z.string().trim().regex(/^\d{5,25}$/),
  phoneNumberId: z.string().trim().regex(/^\d{5,25}$/),
  pin: z.string().regex(/^\d{6}$/).optional()
});

export const platformAiSchema = z.object({
  provider: z.enum(['openai', 'anthropic', 'none']),
  apiKey: z.string().trim().min(10).max(500).optional(),
  defaultModel: trimmed(80),
  baseUrl: z.union([z.literal(''), z.string().url().max(300)]).default(''),
  defaultPrompt: trimmed(8000),
  globalOff: z.boolean()
});

export const aiAddonPlanSchema = z.object({
  name: required(60),
  priceMinor: z.number().int().min(0),
  currency: z.string().length(3).default('LKR'),
  monthlyReplyLimit: z.number().int().min(0).max(10_000_000),
  voiceIncluded: z.boolean().default(false)
});

export const setAiAddonSchema = z.object({
  status: z.enum(['off', 'active', 'paused', 'expired']),
  planId: id.nullable().default(null),
  activeUntil: z.string().datetime().nullable().default(null),
  monthlyReplyLimit: z.number().int().min(0).max(10_000_000)
});

export const aiSettingsSchema = z.object({
  chatBotEnabled: z.boolean(),
  voiceBotEnabled: z.boolean(),
  chatBotMode: z.enum(['always', 'after_hours', 'staff_busy']),
  personaName: trimmed(60),
  languageMode: z.enum(['trilingual', 'sinhala', 'english']),
  systemPrompt: trimmed(16000),
  confidenceThreshold: z.number().int().min(0).max(100),
  autoHandoffOnNegotiation: z.boolean(),
  autoHandoffOnComplaint: z.boolean(),
  autoHandoffOnStaffRequest: z.boolean(),
  welcomeMessage: trimmed(1024),
  fallbackMessage: trimmed(1024),
  voiceModel: trimmed(60),
  voiceGreeting: trimmed(1024),
  autoTranscribeCalls: z.boolean(),
  autoSummarizeCalls: z.boolean(),
  missedCallAutoFollowup: z.boolean(),
  missedCallMessageTemplate: trimmed(1024),
  voiceLanguage: z.enum(['trilingual', 'sinhala', 'english']),
  voiceSpeed: z.number().min(0.8).max(1.2),
  model: trimmed(80)
});
export type AiSettingsInput = z.infer<typeof aiSettingsSchema>;

export const knowledgeSchema = z.object({
  title: required(120),
  source: z.enum(['text', 'upload', 'catalog']),
  text: trimmed(200_000).optional(),
  fileId: id.optional()
});
export const trainingExampleSchema = z.object({ question: required(2000), idealAnswer: required(4000) });
export const simulateSchema = z.object({
  message: required(2000),
  history: z
    .array(z.object({ role: z.enum(['user', 'bot']), text: trimmed(2000) }))
    .max(20)
    .default([])
});

export const webhookEventsQuery = z.object({
  company: id.optional(),
  status: z.enum(['all', 'failed', 'pending', 'processed']).default('all'),
  limit: z.coerce.number().int().min(1).max(200).default(50)
});

/* ───────── Content: list queries and partial updates ───────── */

export const templateListQuery = z.object({
  status: z.enum(['approved', 'pending', 'rejected', 'paused', 'disabled']).optional()
});
export const updateQuickReplySchema = quickReplySchema.partial();
export const updateCollectionSchema = collectionSchema.partial();
export const productListQuery = z.object({
  /** A collection id, or `none` for products outside any collection. */
  collection: z.union([id, z.literal('none')]).optional(),
  search: trimmed(80).optional()
});
export const updateProductSchema = productSchema.partial();
export const updateFlowSchema = flowSchema.partial();

/* ───────── System admin: webhook and AI training extras ───────── */

export const platformWebhookSchema = z.object({
  verifyToken: z.string().trim().min(8).max(200).optional(),
  subscribedFields: z
    .array(z.string().trim().regex(/^[a-z_]{2,60}$/, 'Meta webhook field name, for example messages'))
    .min(1)
    .max(30)
    .optional()
});
export const exampleFromLogSchema = z.object({ idealAnswer: required(4000) });
export const aiLogsQuery = z.object({ channel: z.enum(['chat', 'call']).optional() });

/* ───────── Team additions ───────── */

export const staffListQuery = z.object({ include: z.enum(['disabled']).optional() });
export const breaksQuery = z.object({
  date: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, 'Use YYYY-MM-DD')
    .optional()
});
