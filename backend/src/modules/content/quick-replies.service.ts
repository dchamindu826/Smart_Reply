import { Injectable } from '@nestjs/common';
import { and, asc, eq, inArray, or } from 'drizzle-orm';
import { z } from 'zod';
import { FileRef, QuickReply, QuickReplyInput, updateQuickReplySchema } from '@smart-reply/shared';
import { Audit } from '../../common/audit';
import { AppError, forbidden, notFound } from '../../common/errors';
import { CompanySession, can } from '../../common/session';
import { findOwned } from '../../common/tenant';
import { FilesService } from '../../core/files.service';
import type { Db } from '../../db/client';
import { quickReplies, users } from '../../db/schema';
import { InjectDb } from '../../infra/db';
import { isUniqueViolation } from './util';

type Row = typeof quickReplies.$inferSelect;
type UpdateInput = z.infer<typeof updateQuickReplySchema>;

const SHARED_DENIED = 'Only a manager can change shared quick replies unless your manager turns on “Edit shared quick replies”.';

@Injectable()
export class QuickRepliesService {
  constructor(
    @InjectDb() private readonly db: Db,
    private readonly files: FilesService,
    private readonly audit: Audit
  ) {}

  private async present(rows: Row[]): Promise<QuickReply[]> {
    const ownerIds = [...new Set(rows.map(r => r.ownerUserId).filter((x): x is string => Boolean(x)))];
    const owners = ownerIds.length ? await this.db.select({ id: users.id, name: users.name }).from(users).where(inArray(users.id, ownerIds)) : [];
    const nameBy = new Map(owners.map(o => [o.id, o.name]));
    const refs = await this.files.refs(rows.flatMap(r => r.fileIds));
    return rows.map(r => ({
      id: r.id,
      command: r.command,
      title: r.title,
      text: r.text,
      scope: r.scope,
      ownerUserId: r.ownerUserId,
      ownerName: r.ownerUserId ? (nameBy.get(r.ownerUserId) ?? '') : '',
      attachments: r.fileIds.map(id => refs.get(id)).filter((x): x is FileRef => Boolean(x)),
      usedCount: r.usedCount
    }));
  }

  async list(s: CompanySession): Promise<QuickReply[]> {
    const rows = await this.db
      .select()
      .from(quickReplies)
      .where(and(eq(quickReplies.companyId, s.companyId), or(eq(quickReplies.scope, 'everyone'), eq(quickReplies.ownerUserId, s.userId))))
      .orderBy(asc(quickReplies.command));
    return this.present(rows);
  }

  /** A quick reply the user may see. Someone else's private one answers 404 (managers excepted). */
  private async load(s: CompanySession, id: string): Promise<Row> {
    const row = await findOwned(this.db, quickReplies, s.companyId, id, 'Quick reply');
    if (s.role !== 'manager' && row.scope === 'only_me' && row.ownerUserId !== s.userId) throw notFound('Quick reply');
    return row;
  }

  private assertMayEdit(s: CompanySession, row: Row): void {
    if (s.role === 'manager') return;
    if (row.ownerUserId === s.userId && row.scope === 'only_me') return;
    // Shared replies need the permission, even ones this staff member created.
    if (row.scope === 'everyone' && can(s, 'editSharedQuickReplies')) return;
    throw forbidden(SHARED_DENIED);
  }

  private conflict(command: string): AppError {
    return new AppError('CONFLICT', `The command ${command} is already in use.`);
  }

  async create(s: CompanySession, input: QuickReplyInput): Promise<QuickReply> {
    if (input.scope === 'everyone' && !can(s, 'editSharedQuickReplies')) throw forbidden(SHARED_DENIED);
    if (!input.text && input.fileIds.length === 0) throw new AppError('VALIDATION_FAILED', 'Write a reply or attach a file.');
    await this.files.requireUploaded(s.companyId, input.fileIds);
    let row: Row;
    try {
      [row] = await this.db
        .insert(quickReplies)
        .values({ companyId: s.companyId, command: input.command, title: input.title, text: input.text, scope: input.scope, ownerUserId: s.userId, fileIds: input.fileIds })
        .returning();
    } catch (err) {
      if (isUniqueViolation(err)) throw this.conflict(input.command);
      throw err;
    }
    await this.audit.log(s, { action: 'quick_reply.create', targetType: 'quick_reply', targetId: row.id, summary: `Added quick reply ${row.command} (${row.scope === 'everyone' ? 'shared' : 'only me'})` });
    return (await this.present([row]))[0];
  }

  async update(s: CompanySession, id: string, input: UpdateInput): Promise<QuickReply> {
    const row = await this.load(s, id);
    this.assertMayEdit(s, row);
    if (input.scope === 'everyone' && row.scope !== 'everyone' && !can(s, 'editSharedQuickReplies')) throw forbidden(SHARED_DENIED);
    const text = input.text ?? row.text;
    const fileIds = input.fileIds ?? row.fileIds;
    if (!text && fileIds.length === 0) throw new AppError('VALIDATION_FAILED', 'Write a reply or attach a file.');
    if (input.fileIds) await this.files.requireUploaded(s.companyId, input.fileIds);
    let u: Row;
    try {
      [u] = await this.db
        .update(quickReplies)
        .set({
          ...(input.command !== undefined ? { command: input.command } : {}),
          ...(input.title !== undefined ? { title: input.title } : {}),
          ...(input.scope !== undefined ? { scope: input.scope } : {}),
          text,
          fileIds
        })
        .where(eq(quickReplies.id, row.id))
        .returning();
    } catch (err) {
      if (isUniqueViolation(err)) throw this.conflict(input.command ?? row.command);
      throw err;
    }
    await this.audit.log(s, { action: 'quick_reply.update', targetType: 'quick_reply', targetId: row.id, summary: `Changed quick reply ${u.command}` });
    return (await this.present([u]))[0];
  }

  async remove(s: CompanySession, id: string): Promise<{ ok: true }> {
    const row = await this.load(s, id);
    this.assertMayEdit(s, row);
    await this.db.delete(quickReplies).where(eq(quickReplies.id, row.id));
    await this.audit.log(s, { action: 'quick_reply.delete', targetType: 'quick_reply', targetId: row.id, summary: `Deleted quick reply ${row.command}` });
    return { ok: true };
  }
}
