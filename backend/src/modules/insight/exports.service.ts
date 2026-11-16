/**
 * CSV exports. Managers may export every kind; staff may export only their own performance,
 * and only with the `exportOwn` switch. Message text appears only in the `conversations`
 * export, which is manager-only.
 */
import { Injectable } from '@nestjs/common';
import { sql, SQL } from 'drizzle-orm';
import { z } from 'zod';
import { ExportResponse, exportSchema, formatPhone, rangeQuery } from '@smart-reply/shared';
import { Audit } from '../../common/audit';
import { AppError, forbidden, notFound } from '../../common/errors';
import { CompanySession, can } from '../../common/session';
import { parse } from '../../common/validation';
import { FilesService } from '../../core/files.service';
import type { Db } from '../../db/client';
import { InjectDb } from '../../infra/db';
import { CsvCell, toCsv } from './csv';
import { InsightService } from './insight.service';
import { MetricsService } from './metrics.service';
import { localDate, resolveRange, Window } from './time';

export type ExportInput = z.infer<typeof exportSchema>;
type Kind = ExportInput['kind'];

const MAX_ROWS = 50_000;

@Injectable()
export class ExportsService {
  constructor(
    @InjectDb() private readonly db: Db,
    private readonly files: FilesService,
    private readonly metrics: MetricsService,
    private readonly insight: InsightService,
    private readonly audit: Audit
  ) {}

  private async rows<T extends Record<string, unknown>>(q: SQL): Promise<T[]> {
    return (await this.db.execute<T>(q)).rows as T[];
  }

  async create(s: CompanySession, input: ExportInput): Promise<ExportResponse> {
    if (s.role !== 'manager') {
      if (input.kind !== 'performance' || !can(s, 'exportOwn')) throw forbidden('You can export only your own performance.');
    }
    const c = await this.metrics.company(s.companyId);
    const range = parse(rangeQuery, {
      range: input.params.range ?? (input.kind === 'contacts' ? undefined : '30d'),
      from: input.params.from,
      to: input.params.to
    });
    const w = resolveRange(range, c.tz);
    const { header, rows } = await this.build(s, input.kind, input.params, w, c.tz);
    const bytes = toCsv(header, rows);
    const fileName = `${input.kind}-${localDate(new Date(), c.tz)}.csv`;
    const file = await this.files.storeBuffer(s.companyId, {
      name: fileName,
      mime: 'text/csv',
      bytes,
      purpose: 'export',
      kind: 'document',
      createdBy: s.userId
    });
    await this.audit.log(s, {
      action: 'export.create',
      targetType: 'export',
      targetId: file.id,
      summary: `Exported ${input.kind} (${rows.length} rows)`,
      meta: { kind: input.kind, from: w.from.toISOString(), to: w.to.toISOString() }
    });
    return { url: (await this.files.ref(file)).url, fileName };
  }

  private async build(s: CompanySession, kind: Kind, params: Record<string, string>, w: Window, tz: string): Promise<{ header: string[]; rows: CsvCell[][] }> {
    switch (kind) {
      case 'contacts':
        return this.contacts(s.companyId);
      case 'calls':
        return this.calls(s.companyId, w);
      case 'reports':
        return this.reports(s, w, tz);
      case 'performance':
        return this.performance(s, params, w);
      case 'audit':
        return this.auditRows(s.companyId, w);
      case 'conversations':
        return this.conversations(s.companyId, w);
    }
  }

  private async contacts(companyId: string): Promise<{ header: string[]; rows: CsvCell[][] }> {
    const rows = await this.rows<{
      name: string;
      profile_name: string;
      wa_id: string | null;
      username: string | null;
      city: string;
      owner: string | null;
      labels: string | null;
      marketing_opt_in: boolean;
      blocked: boolean;
      first_seen_at: Date;
    }>(sql`
      select ct.name, ct.profile_name, ct.wa_id, ct.username, ct.city, u.name as owner,
        (select string_agg(l.name, '; ' order by l.name) from contact_labels cl join labels l on l.id = cl.label_id
          where cl.contact_id = ct.id and cl.company_id = ${companyId}) as labels,
        ct.marketing_opt_in, ct.blocked_at is not null as blocked, ct.first_seen_at
      from contacts ct
      left join users u on u.id = ct.owner_user_id and u.company_id = ${companyId}
      where ct.company_id = ${companyId}
      order by ct.first_seen_at asc
      limit ${MAX_ROWS}`);
    return {
      header: ['Name', 'Phone', 'Username', 'City', 'Owner', 'Labels', 'Marketing opt-in', 'Blocked', 'First seen'],
      rows: rows.map(r => [
        r.name || r.profile_name,
        r.wa_id ? formatPhone(r.wa_id) : '',
        r.username,
        r.city,
        r.owner ?? '',
        r.labels ?? '',
        r.marketing_opt_in,
        r.blocked,
        new Date(r.first_seen_at)
      ])
    };
  }

  private async calls(companyId: string, w: Window): Promise<{ header: string[]; rows: CsvCell[][] }> {
    const rows = await this.rows<{
      started_at: Date;
      direction: string;
      outcome: string;
      name: string;
      profile_name: string;
      wa_id: string | null;
      handled_by: string | null;
      duration_seconds: number | null;
      ivr_option: string | null;
      note: string;
    }>(sql`
      select c.started_at, c.direction, c.outcome, ct.name, ct.profile_name, ct.wa_id, u.name as handled_by,
        c.duration_seconds, c.ivr_option, c.note
      from calls c
      join contacts ct on ct.id = c.contact_id
      left join users u on u.id = c.handled_by_user_id and u.company_id = ${companyId}
      where c.company_id = ${companyId} and c.started_at >= ${w.from} and c.started_at < ${w.to}
      order by c.started_at asc
      limit ${MAX_ROWS}`);
    return {
      header: ['Started', 'Direction', 'Outcome', 'Customer', 'Phone', 'Handled by', 'Duration (s)', 'IVR option', 'Note'],
      rows: rows.map(r => [
        new Date(r.started_at),
        r.direction === 'in' ? 'incoming' : 'outgoing',
        r.outcome,
        r.name || r.profile_name,
        r.wa_id ? formatPhone(r.wa_id) : '',
        r.handled_by ?? '',
        r.duration_seconds,
        r.ivr_option ?? '',
        r.note
      ])
    };
  }

  private async reports(s: CompanySession, w: Window, tz: string): Promise<{ header: string[]; rows: CsvCell[][] }> {
    const people = await this.metrics.people(s.companyId);
    const rows = await this.metrics.reportRows(s.companyId, people, w, tz);
    return {
      header: ['Name', 'Chats handled', 'Resolved', 'Avg first reply (s)', 'Calls answered', 'Calls missed', 'Break minutes', 'Target %'],
      rows: rows.map(r => [r.name, r.chatsHandled, r.resolved, r.avgFirstReplySeconds, r.callsAnswered, r.callsMissed, r.breakMinutes, r.targetPercent])
    };
  }

  private async performance(s: CompanySession, params: Record<string, string>, w: Window): Promise<{ header: string[]; rows: CsvCell[][] }> {
    let userId = s.userId;
    if (s.role === 'manager' && params.userId) {
      const [p] = await this.metrics.people(s.companyId, /^[0-9a-f-]{36}$/i.test(params.userId) ? params.userId : undefined);
      if (!p || p.userId !== params.userId) throw notFound('Staff member');
      userId = p.userId;
    }
    const perf = await this.insight.performance(s, { range: 'custom', from: w.from.toISOString(), to: w.to.toISOString() }, userId);
    const rows: CsvCell[][] = perf.daily.map(d => [d.date, d.resolved, d.calls]);
    rows.push(['Total', perf.resolved, perf.callsAnswered + perf.callsMissed]);
    return { header: ['Date', 'Resolved', 'Calls'], rows };
  }

  private async auditRows(companyId: string, w: Window): Promise<{ header: string[]; rows: CsvCell[][] }> {
    const rows = await this.rows<{ at: Date; actor_name: string; actor_kind: string; action: string; target_type: string; target_id: string | null; summary: string; source: string }>(sql`
      select at, actor_name, actor_kind, action, target_type, target_id, summary, source from audit_logs
      where company_id = ${companyId} and at >= ${w.from} and at < ${w.to}
      order by at asc
      limit ${MAX_ROWS}`);
    return {
      header: ['At', 'Actor', 'Actor kind', 'Action', 'Target type', 'Target id', 'Summary', 'Source'],
      rows: rows.map(r => [new Date(r.at), r.actor_name, r.actor_kind, r.action, r.target_type, r.target_id, r.summary, r.source])
    };
  }

  /** Manager-only (checked in `create`): the one export that carries message text. */
  private async conversations(companyId: string, w: Window): Promise<{ header: string[]; rows: CsvCell[][] }> {
    const rows = await this.rows<{
      at: Date;
      conversation_id: string;
      name: string;
      profile_name: string;
      wa_id: string | null;
      direction: string;
      sender_kind: string;
      sender: string | null;
      type: string;
      template_name: string | null;
      body: string;
      status: string;
    }>(sql`
      select m.created_at as at, m.conversation_id, ct.name, ct.profile_name, ct.wa_id, m.direction, m.sender_kind,
        u.name as sender, m.type, m.template_name, m.body, m.status
      from messages m
      join conversations c on c.id = m.conversation_id
      join contacts ct on ct.id = c.contact_id
      left join users u on u.id = m.sender_user_id and u.company_id = ${companyId}
      where m.company_id = ${companyId} and m.created_at >= ${w.from} and m.created_at < ${w.to}
      order by m.conversation_id, m.created_at asc
      limit ${MAX_ROWS}`);
    if (rows.length >= MAX_ROWS) throw new AppError('BAD_REQUEST', 'Too many messages for one export. Choose a shorter range.');
    return {
      header: ['At', 'Conversation', 'Customer', 'Phone', 'Direction', 'Sender', 'Type', 'Template', 'Text', 'Status'],
      rows: rows.map(r => [
        new Date(r.at),
        r.conversation_id,
        r.name || r.profile_name,
        r.wa_id ? formatPhone(r.wa_id) : '',
        r.direction,
        r.sender ?? r.sender_kind,
        r.type,
        r.template_name ?? '',
        r.body,
        r.status
      ])
    };
  }
}
