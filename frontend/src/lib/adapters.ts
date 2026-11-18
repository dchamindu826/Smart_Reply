/**
 * Maps API objects (from @smart-reply/shared) onto the view types the screens were designed
 * with (`src/types`). Keeping the mapping here lets the screens stay as designed.
 */
import type {
  AiBotLog as ApiAiLog,
  Call as ApiCall,
  CallSettings as ApiCallSettings,
  ChannelPresence,
  Contact as ApiContact,
  Conversation as ApiConversation,
  FileRef,
  IvrMenu,
  MediaItem as ApiMedia,
  Message as ApiMessage,
  OwnerHistoryEntry,
  Product as ApiProduct,
  QuickReply as ApiQuickReply,
  StaffMember,
  Template as ApiTemplate
} from '@smart-reply/shared';
import { formatMoney } from '@smart-reply/shared';
import type {
  AIBotLog,
  Attachment,
  CallConfig,
  CallLogItem,
  ChannelStatus,
  Contact,
  Conversation,
  IVROption,
  MediaItem,
  Message,
  Product,
  QuickReply,
  Staff,
  StatusType,
  Template
} from '@/types';

/* ───────── Time ───────── */

export function hhmm(iso: string | Date): string {
  const d = typeof iso === 'string' ? new Date(iso) : iso;
  return d.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', hour12: false });
}

function startOfDay(d: Date): number {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
}

/** `10:42`, `Yesterday`, `Mon`, or `12 Oct` — like WhatsApp's chat list. */
export function listTime(iso: string | null): string {
  if (!iso) return '';
  const d = new Date(iso);
  const days = Math.round((startOfDay(new Date()) - startOfDay(d)) / 86_400_000);
  if (days <= 0) return hhmm(d);
  if (days === 1) return 'Yesterday';
  if (days < 7) return d.toLocaleDateString('en-GB', { weekday: 'short' });
  return d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });
}

/** `Today 10:50`, `Yesterday 14:20`, or `2026-10-01 09:15` — like the call log. */
export function logTime(iso: string): string {
  const d = new Date(iso);
  const days = Math.round((startOfDay(new Date()) - startOfDay(d)) / 86_400_000);
  if (days <= 0) return `Today ${hhmm(d)}`;
  if (days === 1) return `Yesterday ${hhmm(d)}`;
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')} ${hhmm(d)}`;
}

export function monthYear(iso: string): string {
  return new Date(iso).toLocaleDateString('en-GB', { month: 'short', year: 'numeric' });
}

export function mmss(seconds: number | null | undefined): string {
  const s = Math.max(0, Math.round(seconds ?? 0));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}

export function replyTime(seconds: number | null): string {
  if (seconds === null || seconds === undefined) return '—';
  const s = Math.round(seconds);
  if (s < 60) return `${s}s`;
  if (s < 3600) return `${Math.floor(s / 60)}m ${String(s % 60).padStart(2, '0')}s`;
  return `${Math.floor(s / 3600)}h ${String(Math.floor((s % 3600) / 60)).padStart(2, '0')}m`;
}

/* ───────── People ───────── */

const STATUS_TEXT: Record<StatusType, string> = {
  available: 'Available',
  oncall: 'On a call',
  brk: 'On break',
  away: 'Away',
  dnd: 'Do not disturb'
};
const STATUS_CLASS: Record<StatusType, string> = { oncall: 'call', available: '', brk: 'away', away: 'away', dnd: 'call' };

export function toChannel(p: ChannelPresence | undefined): ChannelStatus {
  return {
    st: (p?.status ?? 'away') as StatusType,
    r: p?.reason ?? '',
    since: p ? new Date(p.since).getTime() : Date.now(),
    mins: p?.plannedMinutes ?? 0
  };
}

export function statusText(c: ChannelStatus): string {
  return c.st === 'brk' ? `${c.r || 'On'} break` : STATUS_TEXT[c.st];
}

export function toStaff(m: StaffMember): Staff {
  const call = toChannel(m.presence?.call);
  const chat = toChannel(m.presence?.chat);
  const scope = (s: string) => (s === 'both' ? 'Calls + chats' : s === 'call' ? 'Calls' : 'Chats');
  return {
    id: m.id,
    n: m.name,
    i: m.initials,
    st: STATUS_CLASS[call.st],
    stt: statusText(call),
    open: m.stats?.openChats ?? 0,
    rep: replyTime(m.stats?.avgFirstReplySeconds ?? null),
    calls: m.stats?.callsToday ?? 0,
    done: m.stats?.targetPercent ?? 0,
    res: m.stats?.resolved ?? 0,
    miss: m.stats?.callsMissed ?? 0,
    call,
    chat,
    used: m.breaks?.usedMinutes ?? 0,
    log: (m.breaks?.entries ?? []).map(e => [e.reason, hhmm(e.startedAt), e.minutes, scope(e.scope)] as [string, string, number, string]),
    noteS: m.note || undefined,
    role: m.role,
    email: m.email,
    phone: m.phone,
    title: m.title,
    status: m.status,
    permissions: m.permissions as unknown as Record<string, boolean>
  };
}

export function toContact(c: ApiContact, history: OwnerHistoryEntry[] = []): Contact {
  return {
    id: c.id,
    n: c.name,
    i: c.initials,
    a: c.avatarColor,
    ph: c.phone || c.username || '',
    since: monthYear(c.firstSeenAt),
    city: c.city,
    to: c.ownerUserId,
    perm: c.callPermission.status === 'temporary' || c.callPermission.status === 'permanent',
    labels: c.labels.map(l => [l.name, l.color] as [string, string]),
    hist: history.map(h => {
      const what = h.toName ? (h.fromName ? `Moved from ${h.fromName} to ${h.toName}` : `Assigned to ${h.toName}`) : `Unassigned${h.fromName ? ` (was ${h.fromName})` : ''}`;
      return [logTime(h.at), what, `${h.actorName}${h.reason ? ` · ${h.reason}` : ''}`] as [string, string, string];
    }),
    labelIds: c.labels.map(l => l.id),
    blocked: c.blocked,
    permStatus: c.callPermission.status,
    permExpiresAt: c.callPermission.expiresAt,
    optIn: c.marketingOptIn,
    notes: c.notes
  };
}

/* ───────── Chats ───────── */

export function toAttachment(f: FileRef): Attachment {
  return {
    type: f.kind === 'image' || f.kind === 'sticker' ? 'image' : f.kind === 'audio' ? 'voice' : 'file',
    name: f.name,
    size: f.sizeBytes,
    url: f.url,
    real: true,
    dur: f.durationSeconds ? mmss(f.durationSeconds) : undefined,
    fileId: f.id,
    mime: f.mime
  };
}

export function toMessage(m: ApiMessage): Message {
  const dir: Message['dir'] = m.direction === 'system' ? 'sys' : m.direction;
  const type: Message['type'] = m.direction === 'note' ? 'note' : m.direction === 'system' ? 'sys' : m.type === 'template' ? 'tpl' : 'text';
  return {
    id: m.id,
    dir,
    type,
    text: m.body,
    time: hhmm(m.createdAt),
    at: m.createdAt,
    sender: m.type === 'template' ? (m.templateName ?? undefined) : (m.sender.name ?? (m.sender.kind === 'bot' ? 'AI bot' : m.sender.kind === 'system' && m.direction === 'out' ? 'Auto-reply' : undefined)),
    read: m.status === 'read' || m.status === 'delivered' ? 1 : 0,
    status: m.status,
    error: m.error,
    buttons: m.buttons.length ? m.buttons : undefined,
    attachments: m.attachments.length ? m.attachments.map(toAttachment) : undefined
  };
}

export function toConversation(c: ApiConversation, msgs: Message[] = []): Conversation {
  const exp = c.windowExpiresAt ? new Date(c.windowExpiresAt).getTime() : undefined;
  const left = exp ? exp - Date.now() : 0;
  return {
    id: c.id,
    c: c.contactId,
    pv: c.lastPreview,
    t: listTime(c.lastMessageAt),
    un: c.unreadCount,
    win: exp && left > 0 ? Math.ceil(left / 3_600_000) : null,
    exp,
    msgs,
    status: c.status,
    botActive: c.botActive,
    favorite: c.favorite,
    archived: c.archived,
    lastAt: c.lastMessageAt
  };
}

/* ───────── Calls ───────── */

export function toCallLog(c: ApiCall): CallLogItem {
  const d: CallLogItem['d'] =
    c.outcome === 'ringing'
      ? 'ringing'
      : c.outcome === 'missed' || c.outcome === 'failed'
        ? 'missed'
        : c.outcome === 'rejected'
          ? 'rejected'
          : c.outcome === 'forwarded'
            ? 'forwarded'
            : c.outcome === 'transferred'
              ? 'transferred'
              : c.direction === 'in'
                ? 'incoming'
                : 'outgoing';
  return {
    id: c.id,
    c: c.contactId,
    d,
    t: c.outcome === 'ringing' ? 'now' : logTime(c.startedAt),
    dur: c.durationSeconds ? mmss(c.durationSeconds) : undefined,
    by: c.aiAgent ? 'AI agent' : (c.handledBy?.name ?? '—'),
    note: c.note || undefined,
    rec: c.hasRecording ? 1 : 0,
    ai: c.hasSummary ? 1 : 0,
    recUrl: c.recordingUrl,
    summary: c.summary,
    startedAt: c.startedAt
  };
}

export function toCallConfig(s: ApiCallSettings): CallConfig {
  return {
    brkmax: s.breakMaxMinutes,
    ring: s.ringStrategy,
    ringsec: s.ringSeconds,
    rec: { auto: s.recording.auto, ann: s.recording.announce, pause: s.recording.pauseAllowed, keep: s.recording.keepDays },
    link: s.linkPreviews,
    fwd: {
      noans: s.forwarding.noAnswer,
      busy: s.forwarding.busy,
      brk: s.forwarding.onBreak,
      away: s.forwarding.away,
      dnd: s.forwarding.dnd,
      after: s.forwarding.afterHours
    }
  };
}

export function fromCallConfig(c: CallConfig, base: ApiCallSettings): Omit<ApiCallSettings, 'callingEnabled' | 'callingUnavailableReason'> {
  return {
    breakMaxMinutes: c.brkmax,
    ringStrategy: c.ring,
    ringSeconds: c.ringsec,
    recording: { auto: c.rec.auto, announce: c.rec.ann, pauseAllowed: c.rec.pause, keepDays: c.rec.keep as ApiCallSettings['recording']['keepDays'] },
    linkPreviews: c.link,
    forwarding: { noAnswer: c.fwd.noans, busy: c.fwd.busy, onBreak: c.fwd.brk, away: c.fwd.away, dnd: c.fwd.dnd, afterHours: c.fwd.after },
    hours: base.hours
  };
}

export interface IvrView {
  on: boolean;
  mode: 'rec' | 'tts';
  wait: number;
  none: string;
  after: boolean;
  greet: string;
  audio?: { type: 'voice'; name: string; size: number; dur: string };
  opts: IVROption[];
  greetingFileId?: string | null;
}

export function toIvr(m: IvrMenu): IvrView {
  return {
    on: m.enabled,
    mode: m.greetingMode,
    wait: m.waitSeconds,
    none: m.noInputDestination,
    after: m.afterHoursEnabled,
    greet: m.greetingText,
    audio: m.greetingAudio
      ? { type: 'voice', name: m.greetingAudio.name, size: m.greetingAudio.sizeBytes, dur: mmss(m.greetingAudio.durationSeconds) }
      : undefined,
    opts: m.options.map(o => ({ k: o.digit, t: o.label, to: o.destination })),
    greetingFileId: m.greetingAudio?.id ?? null
  };
}

/* ───────── Content ───────── */

const LANGS: Record<string, string> = { en: 'English', en_US: 'English (US)', en_GB: 'English (UK)', si: 'Sinhala', ta: 'Tamil' };

export function toTemplate(t: ApiTemplate): Template {
  const st: Template['st'] = t.status === 'approved' ? 'ok' : t.status === 'pending' ? 'w' : 'b';
  const stt = { approved: 'Approved', pending: 'In review', rejected: 'Rejected', paused: 'Paused', disabled: 'Disabled' }[t.status];
  return {
    id: t.id,
    n: t.name,
    cat: t.category[0].toUpperCase() + t.category.slice(1),
    lang: LANGS[t.language] ?? t.language,
    st,
    stt,
    q: t.status === 'approved' ? ({ high: 'High', medium: 'Medium', low: 'Low', unknown: '—' }[t.quality] ?? '—') : '—',
    used: t.usedCount,
    body: t.body,
    why: t.rejectionReason ?? undefined,
    btn: t.buttons.length ? t.buttons.map(b => b.text) : undefined,
    vars: t.variableCount
  };
}

export function artworkFor(collectionName: string, productName: string): Product['k'] {
  const s = `${collectionName} ${productName}`.toLowerCase();
  if (s.includes('vanit') || s.includes('bath')) return 'vanity';
  if (s.includes('wardrobe')) return 'wardrobe';
  if (s.includes('overhead') || s.includes('cabinet')) return 'overhead';
  return 'pantry';
}

export function toProduct(p: ApiProduct): Product {
  return {
    id: p.id,
    n: p.name,
    col: p.collectionName,
    p: formatMoney(p.price.amountMinor, p.price.currency) + (p.priceUnit ? ` ${p.priceUnit}` : ''),
    old: p.oldPrice ? formatMoney(p.oldPrice.amountMinor, p.oldPrice.currency) : undefined,
    note: p.note,
    k: artworkFor(p.collectionName, p.name),
    sku: p.sku,
    st: p.status === 'active' ? 'ok' : 'w',
    img: p.imageUrl,
    collectionId: p.collectionId,
    priceMinor: p.price.amountMinor
  };
}

export function toQuickReply(q: ApiQuickReply): QuickReply {
  return {
    id: q.id,
    cmd: q.command,
    t: q.title,
    x: q.text,
    att: q.attachments.map(toAttachment),
    used: q.usedCount,
    by: q.ownerName,
    scope: q.scope,
    ownerId: q.ownerUserId
  };
}

export function toMedia(m: ApiMedia): MediaItem {
  return {
    id: m.id,
    title: m.title,
    type: m.kind,
    url: m.file.url,
    thumbnail: m.thumbnailUrl ?? (m.kind === 'image' ? m.file.url : undefined),
    caption: m.caption,
    size: m.file.sizeBytes,
    duration: m.file.durationSeconds ? mmss(m.file.durationSeconds) : undefined,
    category: m.categoryName,
    tags: m.tags,
    addedAt: m.createdAt,
    addedBy: m.addedBy,
    isFavorite: m.favorite,
    downloads: m.downloadCount,
    shares: m.shareCount,
    width: m.width ?? undefined,
    height: m.height ?? undefined,
    fileId: m.file.id,
    categoryId: m.categoryId
  };
}

export function toAiLog(l: ApiAiLog): AIBotLog {
  return {
    id: l.id,
    channel: l.channel,
    contactName: l.contactName,
    contactPhone: l.contactPhone,
    timestamp: logTime(l.timestamp),
    intent: l.intent,
    confidence: l.confidence,
    userInput: l.userInput,
    botOutput: l.botOutput,
    status: l.status,
    agent: l.agent ?? undefined,
    tokensUsed: l.tokensUsed,
    latencyMs: l.latencyMs,
    callDuration: l.callDuration ?? undefined
  };
}

/** Destinations shown in forwarding and IVR pickers: fixed ones plus every active person. */
export function destinationLabels(people: { id: string; n: string; role?: string }[]): Record<string, string> {
  const out: Record<string, string> = {
    queue: 'Team queue (ring everyone available)',
    wait: 'Call waiting (keep ringing)',
    msg: 'Missed-call message + callback',
    vm: 'Ask for a WhatsApp voice note',
    manager: 'Manager',
    owner: 'Customer’s owner'
  };
  for (const p of people) out[`user:${p.id}`] = p.n;
  return out;
}
