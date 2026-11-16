/** Fixed product rules shared by the API, web app and mobile app. */

export const MAX_SEATS = 100;

export const ROLES = ['system_admin', 'manager', 'staff'] as const;
export type Role = (typeof ROLES)[number];
export type CompanyRole = Exclude<Role, 'system_admin'>;

export const PRESENCE_STATUSES = ['available', 'oncall', 'brk', 'away', 'dnd'] as const;
export type PresenceStatus = (typeof PRESENCE_STATUSES)[number];
export const PRESENCE_CHANNELS = ['call', 'chat'] as const;
export type PresenceChannel = (typeof PRESENCE_CHANNELS)[number];

/** Switches a manager can turn on or off for the staff role (Staff manage screen). */
export const STAFF_PERMISSIONS = [
  'replyAssigned',
  'sendTemplates',
  'seeAllChats',
  'createTemplates',
  'exportOwn',
  'editPrices',
  'makeCalls',
  'editSharedQuickReplies'
] as const;
export type StaffPermission = (typeof STAFF_PERMISSIONS)[number];
export type StaffPermissions = Record<StaffPermission, boolean>;

export const DEFAULT_STAFF_PERMISSIONS: StaffPermissions = {
  replyAssigned: true,
  sendTemplates: true,
  seeAllChats: false,
  createTemplates: false,
  exportOwn: true,
  editPrices: false,
  makeCalls: true,
  editSharedQuickReplies: false
};

/** WhatsApp Cloud API media limits, in bytes. */
export const MEDIA_LIMITS = {
  image: { max: 5 * 1024 * 1024, mimes: ['image/jpeg', 'image/png'] },
  audio: {
    max: 16 * 1024 * 1024,
    mimes: ['audio/aac', 'audio/amr', 'audio/mpeg', 'audio/mp4', 'audio/ogg', 'audio/webm', 'audio/x-m4a']
  },
  video: { max: 16 * 1024 * 1024, mimes: ['video/mp4', 'video/3gpp'] },
  document: {
    max: 100 * 1024 * 1024,
    mimes: [
      'application/pdf',
      'application/msword',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      'application/vnd.ms-excel',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'application/vnd.ms-powerpoint',
      'application/vnd.openxmlformats-officedocument.presentationml.presentation',
      'text/plain',
      'text/csv'
    ]
  },
  sticker: { max: 500 * 1024, mimes: ['image/webp'] }
} as const;
export type MediaKind = keyof typeof MEDIA_LIMITS;

/** Images that are not sent to WhatsApp (avatars, gallery thumbnails, greetings) may also be these. */
export const EXTRA_IMAGE_MIMES = ['image/webp', 'image/gif', 'image/svg+xml'] as const;

export function mediaKindForMime(mime: string): MediaKind | null {
  for (const kind of Object.keys(MEDIA_LIMITS) as MediaKind[]) {
    if ((MEDIA_LIMITS[kind].mimes as readonly string[]).includes(mime)) return kind;
  }
  return null;
}

export const WINDOW_HOURS = 24;

/** Stable error codes. The API answers `{ error: { code, message } }`. */
export const ERROR_CODES = [
  'BAD_REQUEST',
  'VALIDATION_FAILED',
  'UNAUTHENTICATED',
  'FORBIDDEN',
  'NOT_FOUND',
  'CONFLICT',
  'RATE_LIMITED',
  'INVALID_CREDENTIALS',
  'ACCOUNT_DISABLED',
  'COMPANY_SUSPENDED',
  'TOKEN_INVALID',
  'SEAT_LIMIT_REACHED',
  'EMAIL_TAKEN',
  'WINDOW_CLOSED',
  'WHATSAPP_NOT_CONNECTED',
  'META_ERROR',
  'CALL_PERMISSION_MISSING',
  'CALL_PERMISSION_LIMIT',
  'CALLING_NOT_ENABLED',
  'CALL_STATE',
  'FILE_TOO_LARGE',
  'FILE_TYPE_NOT_ALLOWED',
  'TEMPLATE_NOT_APPROVED',
  'AI_NOT_ACTIVE',
  'AI_NOT_CONFIGURED',
  'NOT_AVAILABLE',
  'INTERNAL'
] as const;
export type ErrorCode = (typeof ERROR_CODES)[number];

export interface ApiErrorBody {
  error: { code: ErrorCode; message: string; details?: unknown };
}

export const CONVERSATION_FILTERS = [
  'all',
  'unread',
  'expiring',
  'labeled',
  'no_owner',
  'pool',
  'mine',
  'favorites',
  'archived',
  'resolved'
] as const;
export type ConversationFilter = (typeof CONVERSATION_FILTERS)[number];

export const CALL_FILTERS = ['all', 'missed', 'rejected', 'recorded', 'incoming', 'outgoing'] as const;
export type CallFilter = (typeof CALL_FILTERS)[number];

/** Forwarding destinations used by call settings, forwarding and IVR. `user:<id>` is also allowed. */
export const FORWARD_DESTINATIONS = ['queue', 'wait', 'msg', 'vm', 'manager', 'owner'] as const;

export const LABEL_COLORS = ['', 'i', 'w', 'ok', 'b'] as const;
export type LabelColor = (typeof LABEL_COLORS)[number];
