import { Injectable } from '@nestjs/common';
import { and, desc, eq, exists, ilike, inArray, isNull, lt, or, SQL, sql } from 'drizzle-orm';
import { z } from 'zod';
import {
  Call,
  Contact,
  ContactImportResult,
  OwnerHistoryEntry,
  Page,
  contactListQuery,
  createContactSchema,
  importContactsSchema,
  updateContactSchema,
  avatarColorFor
} from '@smart-reply/shared';
import { Audit } from '../../common/audit';
import { AppError, forbidden, notFound } from '../../common/errors';
import { CompanySession, can } from '../../common/session';
import { FilesService } from '../../core/files.service';
import { ContactRow, InboxService, contactVisibility, viewerOf } from '../../core/inbox.service';
import { MessagingService, windowOpen } from '../../core/messaging.service';
import { PushService } from '../../core/push.service';
import type { Db, DbOrTx } from '../../db/client';
import { calls, companies, contactLabels, contactOwnerHistory, contacts, labels, users } from '../../db/schema';
import { InjectDb } from '../../infra/db';
import { Realtime, rooms } from '../../infra/realtime';

type ListQuery = z.infer<typeof contactListQuery>;
type CreateInput = z.infer<typeof createContactSchema>;
type UpdateInput = z.infer<typeof updateContactSchema>;
type ImportRow = z.infer<typeof importContactsSchema>['rows'][number];
type CallRow = typeof calls.$inferSelect;

const DAY_MS = 24 * 3600_000;
const CALL_PERMISSION_TEXT = 'Can we call you on WhatsApp about your enquiry?';
const ACTOR_NAMES: Record<OwnerHistoryEntry['actorKind'], string> = {
  user: 'Former staff member',
  auto_assign: 'Auto-assign',
  rule: 'Keyword rule',
  system: 'System'
};

function encodeCursor(at: Date, id: string): string {
  return Buffer.from(`${at.toISOString()}|${id}`).toString('base64url');
}
function decodeCursor(c: string | undefined): { at: Date; id: string } | null {
  if (!c) return null;
  try {
    const [a, id] = Buffer.from(c, 'base64url').toString().split('|');
    if (!a || !id) return null;
    const at = new Date(a);
    return Number.isNaN(at.getTime()) ? null : { at, id };
  } catch {
    return null;
  }
}

/** Postgres unique violation, whether or not the driver error is wrapped. */
export function isUniqueViolation(err: unknown): boolean {
  const code = (e: unknown): string | undefined =>
    typeof e === 'object' && e !== null && 'code' in e && typeof (e as { code: unknown }).code === 'string' ? (e as { code: string }).code : undefined;
  if (code(err) === '23505') return true;
  const cause = typeof err === 'object' && err !== null && 'cause' in err ? (err as { cause: unknown }).cause : undefined;
  return code(cause) === '23505';
}

function validWaId(waId: string): boolean {
  return /^\d{8,15}$/.test(waId);
}

@Injectable()
export class ContactsService {
  constructor(
    @InjectDb() private readonly db: Db,
    private readonly inbox: InboxService,
    private readonly messaging: MessagingService,
    private readonly files: FilesService,
    private readonly push: PushService,
    private readonly realtime: Realtime,
    private readonly audit: Audit
  ) {}

  private async countryCode(companyId: string): Promise<string> {
    const [c] = await this.db.select({ cc: companies.defaultCountryCode }).from(companies).where(eq(companies.id, companyId)).limit(1);
    return c?.cc ?? '94';
  }

  private async present(row: ContactRow): Promise<Contact> {
    const [c] = await this.inbox.presentContacts([row]);
    return c;
  }

  private async reload(companyId: string, id: string): Promise<Contact> {
    const [row] = await this.db.select().from(contacts).where(and(eq(contacts.id, id), eq(contacts.companyId, companyId))).limit(1);
    if (!row) throw notFound('Customer');
    return this.present(row);
  }

  /** Every id must be one of the company's labels. */
  private async checkLabels(companyId: string, ids: string[], tx?: DbOrTx): Promise<string[]> {
    const unique = [...new Set(ids)];
    if (unique.length === 0) return [];
    const found = await (tx ?? this.db)
      .select({ id: labels.id })
      .from(labels)
      .where(and(eq(labels.companyId, companyId), inArray(labels.id, unique)));
    if (found.length !== unique.length) throw notFound('Label');
    return unique;
  }

  /* ───────── List and read ───────── */

  async list(s: CompanySession, q: ListQuery): Promise<Page<Contact>> {
    const conds: (SQL | undefined)[] = [eq(contacts.companyId, s.companyId), contactVisibility(viewerOf(s))];
    if (q.owner === 'none') conds.push(isNull(contacts.ownerUserId));
    else if (q.owner === 'me') conds.push(eq(contacts.ownerUserId, s.userId));
    else if (q.owner) conds.push(eq(contacts.ownerUserId, q.owner));
    if (q.label) {
      const labelId = q.label;
      conds.push(
        exists(this.db.select({ x: sql`1` }).from(contactLabels).where(and(eq(contactLabels.contactId, contacts.id), eq(contactLabels.labelId, labelId))))
      );
    }
    if (q.search) {
      const term = `%${q.search.replace(/[%_\\]/g, '')}%`;
      const digits = q.search.replace(/\D/g, '');
      conds.push(
        or(ilike(contacts.name, term), ilike(contacts.profileName, term), ...(digits.length >= 3 ? [ilike(contacts.waId, `%${digits}%`)] : []))
      );
    }
    const cur = decodeCursor(q.cursor);
    if (cur) conds.push(or(lt(contacts.createdAt, cur.at), and(eq(contacts.createdAt, cur.at), lt(contacts.id, cur.id))));
    const rows = await this.db
      .select()
      .from(contacts)
      .where(and(...conds))
      .orderBy(desc(contacts.createdAt), desc(contacts.id))
      .limit(q.limit + 1);
    const page = rows.slice(0, q.limit);
    const last = page[page.length - 1];
    return {
      items: await this.inbox.presentContacts(page),
      nextCursor: rows.length > q.limit && last ? encodeCursor(last.createdAt, last.id) : null
    };
  }

  async get(s: CompanySession, id: string): Promise<Contact> {
    return this.present(await this.inbox.visibleContact(viewerOf(s), id));
  }

  /* ───────── Create, import, update ───────── */

  async create(s: CompanySession, input: CreateInput): Promise<Contact> {
    const waId = InboxService.normalize(input.phone, await this.countryCode(s.companyId));
    if (!validWaId(waId)) throw new AppError('VALIDATION_FAILED', 'phone: Enter a phone number with the country code');
    const ownerUserId = s.role === 'manager' ? (input.ownerUserId ?? null) : s.userId;
    const [dupe] = await this.db
      .select()
      .from(contacts)
      .where(and(eq(contacts.companyId, s.companyId), eq(contacts.waId, waId)))
      .limit(1);
    if (dupe) throw new AppError('CONFLICT', `This number is already saved as ${dupe.name || dupe.profileName || 'another customer'}.`);
    let row: ContactRow;
    try {
      row = await this.db.transaction(async tx => {
        const labelIds = await this.checkLabels(s.companyId, input.labelIds, tx);
        const [created] = await tx
          .insert(contacts)
          .values({
            companyId: s.companyId,
            waId,
            name: input.name,
            city: input.city,
            marketingOptIn: input.marketingOptIn,
            avatarColor: avatarColorFor(waId)
          })
          .returning();
        await this.inbox.ensureConversation(s.companyId, created.id, tx);
        if (ownerUserId) {
          await this.inbox.setOwner(s.companyId, created, ownerUserId, { userId: s.userId, name: s.name, kind: 'user' }, 'Added the customer', tx);
        }
        if (labelIds.length) {
          await tx.insert(contactLabels).values(labelIds.map(labelId => ({ companyId: s.companyId, contactId: created.id, labelId, addedBy: s.userId })));
        }
        return created;
      });
    } catch (err) {
      if (isUniqueViolation(err)) throw new AppError('CONFLICT', 'This number is already saved as another customer.');
      throw err;
    }
    await this.inbox.emitContact(s.companyId, row.id);
    return this.reload(s.companyId, row.id);
  }

  async import(s: CompanySession, rows: ImportRow[]): Promise<ContactImportResult> {
    const cc = await this.countryCode(s.companyId);
    const people = await this.db
      .select({ id: users.id, email: users.email })
      .from(users)
      .where(and(eq(users.companyId, s.companyId), inArray(users.role, ['manager', 'staff']), eq(users.status, 'active')));
    const ownerByEmail = new Map(people.map(p => [p.email.toLowerCase(), p.id]));
    const existingLabels = await this.db.select({ id: labels.id, name: labels.name }).from(labels).where(eq(labels.companyId, s.companyId));
    const labelByName = new Map(existingLabels.map(l => [l.name.toLowerCase(), l.id]));
    const result: ContactImportResult = { created: 0, updated: 0, skipped: 0, errors: [] };
    const seen = new Set<string>();
    const actor = { userId: s.userId, name: s.name, kind: 'user' as const };

    const labelId = async (name: string): Promise<string> => {
      const key = name.trim().toLowerCase();
      const hit = labelByName.get(key);
      if (hit) return hit;
      await this.db.insert(labels).values({ companyId: s.companyId, name: name.trim() }).onConflictDoNothing();
      const [l] = await this.db
        .select({ id: labels.id })
        .from(labels)
        .where(and(eq(labels.companyId, s.companyId), sql`lower(${labels.name}) = ${key}`))
        .limit(1);
      labelByName.set(key, l.id);
      return l.id;
    };

    for (const [i, r] of rows.entries()) {
      const rowNo = i + 1;
      const waId = InboxService.normalize(r.phone, cc);
      if (!validWaId(waId)) {
        result.errors.push({ row: rowNo, message: 'The phone number is not valid.' });
        continue;
      }
      if (seen.has(waId)) {
        result.skipped++;
        continue;
      }
      seen.add(waId);
      let ownerId: string | undefined;
      if (r.ownerEmail) {
        ownerId = ownerByEmail.get(r.ownerEmail);
        if (!ownerId) {
          result.errors.push({ row: rowNo, message: `No active team member has the email ${r.ownerEmail}.` });
          continue;
        }
      }
      try {
        const labelIds: string[] = [];
        for (const name of r.labels ?? []) labelIds.push(await labelId(name));
        const changed = await this.db.transaction(async tx => {
          const [existing] = await tx
            .select()
            .from(contacts)
            .where(and(eq(contacts.companyId, s.companyId), eq(contacts.waId, waId)))
            .limit(1);
          let contact: ContactRow;
          let touched = false;
          if (!existing) {
            [contact] = await tx
              .insert(contacts)
              .values({ companyId: s.companyId, waId, name: r.name, city: r.city ?? '', avatarColor: avatarColorFor(waId) })
              .returning();
            await this.inbox.ensureConversation(s.companyId, contact.id, tx);
          } else {
            contact = existing;
            const patch: Partial<ContactRow> = {};
            if (r.name !== existing.name) patch.name = r.name;
            if (r.city !== undefined && r.city !== existing.city) patch.city = r.city;
            if (Object.keys(patch).length) {
              [contact] = await tx.update(contacts).set(patch).where(eq(contacts.id, existing.id)).returning();
              touched = true;
            }
          }
          if (ownerId && (await this.inbox.setOwner(s.companyId, contact, ownerId, actor, 'Imported', tx))) touched = true;
          if (labelIds.length) {
            const added = await tx
              .insert(contactLabels)
              .values(labelIds.map(l => ({ companyId: s.companyId, contactId: contact.id, labelId: l, addedBy: s.userId })))
              .onConflictDoNothing()
              .returning({ id: contactLabels.labelId });
            if (added.length) touched = true;
          }
          return existing ? (touched ? 'updated' : 'skipped') : 'created';
        });
        result[changed]++;
      } catch (err) {
        result.errors.push({ row: rowNo, message: isUniqueViolation(err) ? 'This number was saved twice at the same time.' : 'Could not save this row.' });
      }
    }
    await this.audit.log(s, {
      action: 'contacts.imported',
      targetType: 'contact',
      summary: `Imported customers: ${result.created} new, ${result.updated} updated, ${result.skipped} skipped, ${result.errors.length} errors`
    });
    return result;
  }

  async update(s: CompanySession, id: string, input: UpdateInput): Promise<Contact> {
    const c = await this.inbox.visibleContact(viewerOf(s), id);
    const patch: Partial<ContactRow> = {};
    if (input.name !== undefined) patch.name = input.name;
    if (input.city !== undefined) patch.city = input.city;
    if (input.notes !== undefined) patch.notes = input.notes;
    if (input.marketingOptIn !== undefined) patch.marketingOptIn = input.marketingOptIn;
    if (Object.keys(patch).length === 0) return this.present(c);
    const [row] = await this.db.update(contacts).set(patch).where(eq(contacts.id, c.id)).returning();
    await this.inbox.emitContact(s.companyId, row.id);
    return this.present(row);
  }

  /* ───────── Owner ───────── */

  async setOwner(s: CompanySession, id: string, ownerUserId: string | null, reason: string): Promise<Contact> {
    const c = await this.inbox.visibleContact(viewerOf(s), id);
    if (s.role !== 'manager') {
      const own = c.ownerUserId === s.userId;
      const pool = c.ownerUserId === null;
      // Transfer own (to anyone, or back to the pool), or take from the pool for yourself.
      const allowed = own || (pool && ownerUserId === s.userId);
      if (!allowed) throw forbidden('You can transfer your own customers, release them to the team, or take one from the team queue.');
    }
    await this.changeOwner(s, c, ownerUserId, reason);
    return this.reload(s.companyId, c.id);
  }

  async bulkOwner(s: CompanySession, ids: string[], ownerUserId: string | null, reason: string): Promise<{ changed: number }> {
    if (ownerUserId) {
      const [u] = await this.db
        .select({ id: users.id })
        .from(users)
        .where(and(eq(users.id, ownerUserId), eq(users.companyId, s.companyId), eq(users.status, 'active'), inArray(users.role, ['manager', 'staff'])))
        .limit(1);
      if (!u) throw notFound('Staff member');
    }
    const rows = await this.db
      .select()
      .from(contacts)
      .where(and(eq(contacts.companyId, s.companyId), inArray(contacts.id, [...new Set(ids)])));
    let changed = 0;
    for (const c of rows) if (await this.changeOwner(s, c, ownerUserId, reason, false)) changed++;
    if (changed) {
      await this.audit.log(s, {
        action: 'contact.owner_bulk',
        targetType: 'contact',
        summary: `Moved ${changed} customer${changed === 1 ? '' : 's'} to ${ownerUserId ? 'a new owner' : 'the team pool'}`,
        meta: { ownerUserId, contactIds: rows.map(r => r.id) }
      });
    }
    return { changed };
  }

  /** Owner change with history, chat line, live events and a push to the new owner. */
  private async changeOwner(s: CompanySession, c: ContactRow, to: string | null, reason: string, auditEach = true): Promise<boolean> {
    const previous = c.ownerUserId;
    const changed = await this.inbox.setOwner(s.companyId, c, to, { userId: s.userId, name: s.name, kind: 'user' }, reason);
    if (!changed) return false;
    const conv = await this.inbox.ensureConversation(s.companyId, c.id);
    await this.inbox.emitConversation(s.companyId, conv.id, previous);
    await this.inbox.emitContact(s.companyId, c.id);
    if (to) {
      const presented = await this.inbox.conversationById(s.companyId, conv.id, null);
      if (presented) this.realtime.emit([rooms.user(to)], 'conversation.assigned', { conversation: presented, byName: s.name });
      if (to !== s.userId) {
        const name = c.name || c.profileName || 'A customer';
        await this.push.notify([to], 'New chat assigned to you', `${name} · from ${s.name}`, {
          conversationId: conv.id,
          contactId: c.id,
          kind: 'assigned'
        });
      }
    }
    if (auditEach) {
      const names = await this.userNames([previous, to]);
      await this.audit.log(s, {
        action: 'contact.owner',
        targetType: 'contact',
        targetId: c.id,
        summary: `Owner of ${c.name || c.profileName || 'customer'}: ${previous ? (names.get(previous) ?? 'someone') : 'team pool'} → ${to ? (names.get(to) ?? 'someone') : 'team pool'}${reason ? ` (${reason})` : ''}`
      });
    }
    return true;
  }

  private async userNames(ids: (string | null)[]): Promise<Map<string, string>> {
    const list = [...new Set(ids.filter((x): x is string => Boolean(x)))];
    if (list.length === 0) return new Map();
    const rows = await this.db.select({ id: users.id, name: users.name }).from(users).where(inArray(users.id, list));
    return new Map(rows.map(r => [r.id, r.name]));
  }

  async ownerHistory(s: CompanySession, id: string): Promise<OwnerHistoryEntry[]> {
    const c = await this.inbox.visibleContact(viewerOf(s), id);
    const rows = await this.db
      .select()
      .from(contactOwnerHistory)
      .where(and(eq(contactOwnerHistory.companyId, s.companyId), eq(contactOwnerHistory.contactId, c.id)))
      .orderBy(desc(contactOwnerHistory.at), desc(contactOwnerHistory.id))
      .limit(200);
    const names = await this.userNames(rows.flatMap(r => [r.fromUserId, r.toUserId, r.actorUserId]));
    return rows.map(r => ({
      id: r.id,
      at: r.at.toISOString(),
      fromUserId: r.fromUserId,
      fromName: r.fromUserId ? (names.get(r.fromUserId) ?? null) : null,
      toUserId: r.toUserId,
      toName: r.toUserId ? (names.get(r.toUserId) ?? null) : null,
      actorName: r.actorUserId ? (names.get(r.actorUserId) ?? ACTOR_NAMES.user) : ACTOR_NAMES[r.actorKind],
      actorKind: r.actorKind,
      reason: r.reason
    }));
  }

  /* ───────── Labels, block ───────── */

  async setLabels(s: CompanySession, id: string, labelIds: string[]): Promise<Contact> {
    const c = await this.inbox.visibleContact(viewerOf(s), id);
    await this.db.transaction(async tx => {
      const ids = await this.checkLabels(s.companyId, labelIds, tx);
      await tx.delete(contactLabels).where(and(eq(contactLabels.contactId, c.id), eq(contactLabels.companyId, s.companyId)));
      if (ids.length) {
        await tx.insert(contactLabels).values(ids.map(labelId => ({ companyId: s.companyId, contactId: c.id, labelId, addedBy: s.userId })));
      }
    });
    await this.inbox.emitContact(s.companyId, c.id);
    return this.reload(s.companyId, c.id);
  }

  async setBlocked(s: CompanySession, id: string, blocked: boolean): Promise<Contact> {
    const c = await this.inbox.visibleContact(viewerOf(s), id);
    if ((c.blockedAt !== null) !== blocked) {
      await this.db
        .update(contacts)
        .set({ blockedAt: blocked ? new Date() : null })
        .where(eq(contacts.id, c.id));
      await this.audit.log(s, {
        action: blocked ? 'contact.blocked' : 'contact.unblocked',
        targetType: 'contact',
        targetId: c.id,
        summary: `${blocked ? 'Blocked' : 'Unblocked'} ${c.name || c.profileName || 'a customer'}`
      });
      await this.inbox.emitContact(s.companyId, c.id);
    }
    return this.reload(s.companyId, c.id);
  }

  /* ───────── Calls ───────── */

  async calls(s: CompanySession, id: string): Promise<Call[]> {
    const c = await this.inbox.visibleContact(viewerOf(s), id);
    const rows = await this.db
      .select()
      .from(calls)
      .where(and(eq(calls.companyId, s.companyId), eq(calls.contactId, c.id)))
      .orderBy(desc(calls.startedAt))
      .limit(200);
    return this.presentCalls(rows, await this.present(c));
  }

  private async presentCalls(rows: CallRow[], contact: Contact): Promise<Call[]> {
    const names = await this.userNames(rows.map(r => r.handledByUserId));
    const recordings = await this.files.refs(rows.map(r => r.recordingFileId).filter((x): x is string => Boolean(x)));
    return rows.map(r => {
      const rec = r.recordingFileId ? recordings.get(r.recordingFileId) : undefined;
      return {
        id: r.id,
        contactId: r.contactId,
        contact: { id: contact.id, name: contact.name, initials: contact.initials, phone: contact.phone, avatarColor: contact.avatarColor },
        direction: r.direction,
        outcome: r.outcome,
        handledBy: r.handledByUserId ? { userId: r.handledByUserId, name: names.get(r.handledByUserId) ?? 'Former staff member' } : null,
        startedAt: r.startedAt.toISOString(),
        answeredAt: r.answeredAt?.toISOString() ?? null,
        endedAt: r.endedAt?.toISOString() ?? null,
        durationSeconds: r.durationSeconds,
        note: r.note,
        hasRecording: Boolean(rec),
        recordingUrl: rec?.url ?? null,
        hasSummary: Boolean(r.aiSummary),
        summary: r.aiSummary,
        ivrOption: r.ivrOption
      };
    });
  }

  /**
   * WhatsApp's "allow calls" request. Meta allows one per 24 hours and two per 7 days for
   * each customer; we track the times we sent one on the contact.
   */
  async requestCallPermission(s: CompanySession, id: string): Promise<Contact> {
    if (!can(s, 'makeCalls')) throw forbidden('Your manager has turned off calling for you.');
    const c = await this.inbox.visibleContact(viewerOf(s), id);
    const now = Date.now();
    if (c.callPermission === 'permanent') throw new AppError('CONFLICT', 'This customer already allows calls.');
    if (c.callPermission === 'temporary' && c.callPermissionExpiresAt && c.callPermissionExpiresAt.getTime() > now) {
      throw new AppError('CONFLICT', 'This customer already allows calls for now.');
    }
    const recent = c.callPermissionRequests
      .map(t => new Date(t).getTime())
      .filter(t => Number.isFinite(t) && now - t < 7 * DAY_MS)
      .sort((a, b) => a - b);
    const lastDay = recent.filter(t => now - t < DAY_MS);
    if (lastDay.length >= 1) {
      const at = new Date(lastDay[0] + DAY_MS);
      throw new AppError('CALL_PERMISSION_LIMIT', `You can ask once every 24 hours. Try again after ${at.toISOString()}.`, { retryAt: at.toISOString() });
    }
    if (recent.length >= 2) {
      const at = new Date(recent[recent.length - 2] + 7 * DAY_MS);
      throw new AppError('CALL_PERMISSION_LIMIT', `You can ask twice in 7 days. Try again after ${at.toISOString()}.`, { retryAt: at.toISOString() });
    }
    const conv = await this.inbox.ensureConversation(s.companyId, c.id);
    if (!windowOpen(conv)) throw new AppError('WINDOW_CLOSED', 'Outside the 24-hour window. Send the call_permission template instead.');
    await this.messaging.sendCallPermissionRequest(s.companyId, conv, c, { userId: s.userId, kind: 'user' }, CALL_PERMISSION_TEXT);
    const requests = [...recent.map(t => new Date(t).toISOString()), new Date(now).toISOString()];
    const expiredTemporary = c.callPermission === 'temporary';
    await this.db
      .update(contacts)
      .set({
        callPermissionRequests: requests,
        ...(c.callPermission === 'none' || expiredTemporary ? { callPermission: 'requested' as const, callPermissionExpiresAt: null } : {})
      })
      .where(eq(contacts.id, c.id));
    await this.inbox.emitContact(s.companyId, c.id);
    return this.reload(s.companyId, c.id);
  }
}
