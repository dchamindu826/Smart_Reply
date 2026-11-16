/**
 * Counting queries behind the dashboard, reports, progress and performance screens. Every
 * query is scoped to one company; local days and hours use the company's timezone.
 */
import { Injectable } from '@nestjs/common';
import { sql, SQL } from 'drizzle-orm';
import type { ReportRow } from '@smart-reply/shared';
import { notFound } from '../../common/errors';
import type { Db } from '../../db/client';
import { InjectDb } from '../../infra/db';
import { safeTz, thisWeek, Window } from './time';

export interface CompanyInfo {
  id: string;
  name: string;
  tz: string;
  countryCode: string;
}

export interface PersonRow {
  userId: string;
  name: string;
  initials: string;
}

const CLOSING_SOON_MS = 2 * 3600_000;

function num(v: unknown): number {
  const n = typeof v === 'number' ? v : Number(v ?? 0);
  return Number.isFinite(n) ? n : 0;
}
function numOrNull(v: unknown): number | null {
  if (v === null || v === undefined) return null;
  const n = Number(v);
  return Number.isFinite(n) ? Math.round(n) : null;
}
function uuidArray(ids: string[]): SQL {
  return sql`${`{${ids.join(',')}}`}::uuid[]`;
}

export function percentOf(done: number, target: number): number {
  if (target <= 0) return 0;
  return Math.round((done / target) * 100);
}

@Injectable()
export class MetricsService {
  constructor(@InjectDb() private readonly db: Db) {}

  private async rows<T extends Record<string, unknown>>(q: SQL): Promise<T[]> {
    const res = await this.db.execute<T>(q);
    return res.rows as T[];
  }

  async company(companyId: string): Promise<CompanyInfo> {
    const [c] = await this.rows<{ id: string; name: string; timezone: string; default_country_code: string }>(
      sql`select id, name, timezone, default_country_code from companies where id = ${companyId}`
    );
    if (!c) throw notFound('Company');
    return { id: c.id, name: c.name, tz: safeTz(c.timezone), countryCode: c.default_country_code };
  }

  /** Active managers and staff, by name. */
  async people(companyId: string, onlyUserId?: string): Promise<PersonRow[]> {
    const rows = await this.rows<{ id: string; name: string; initials: string }>(sql`
      select id, name, initials from users
      where company_id = ${companyId} and status = 'active' and role in ('manager', 'staff')
      ${onlyUserId ? sql`and id = ${onlyUserId}` : sql``}
      order by name asc`);
    return rows.map(r => ({ userId: r.id, name: r.name, initials: r.initials }));
  }

  /* ───────── Company-wide ───────── */

  async chatCounts(companyId: string, ownerUserId?: string): Promise<{ open: number; unassigned: number; closingSoon: number; unread: number }> {
    const now = new Date();
    const soon = new Date(now.getTime() + CLOSING_SOON_MS);
    const [r] = await this.rows<{ open: number; unassigned: number; closing: number; unread: number }>(sql`
      select
        count(*)::int as open,
        count(*) filter (where ct.owner_user_id is null)::int as unassigned,
        count(*) filter (where c.window_expires_at > ${now} and c.window_expires_at <= ${soon})::int as closing,
        count(*) filter (where c.unread_count > 0)::int as unread
      from conversations c
      join contacts ct on ct.id = c.contact_id
      where c.company_id = ${companyId} and c.status = 'open' and c.last_message_at is not null
      ${ownerUserId ? sql`and ct.owner_user_id = ${ownerUserId}` : sql``}`);
    return { open: num(r?.open), unassigned: num(r?.unassigned), closingSoon: num(r?.closing), unread: num(r?.unread) };
  }

  async newCustomers(companyId: string, w: Window): Promise<number> {
    const [r] = await this.rows<{ n: number }>(
      sql`select count(*)::int as n from contacts where company_id = ${companyId} and first_seen_at >= ${w.from} and first_seen_at < ${w.to}`
    );
    return num(r?.n);
  }

  async messageTotals(companyId: string, w: Window): Promise<{ in: number; out: number; templates: number }> {
    const [r] = await this.rows<{ i: number; o: number; t: number }>(sql`
      select
        count(*) filter (where direction = 'in')::int as i,
        count(*) filter (where direction = 'out')::int as o,
        count(*) filter (where direction = 'out' and type = 'template')::int as t
      from messages
      where company_id = ${companyId} and created_at >= ${w.from} and created_at < ${w.to}`);
    return { in: num(r?.i), out: num(r?.o), templates: num(r?.t) };
  }

  async callTotals(companyId: string, w: Window, userId?: string): Promise<{ total: number; answered: number; missed: number }> {
    const who = userId
      ? sql`and (c.handled_by_user_id = ${userId} or (c.outcome = 'missed' and (${userId} = any(c.ringing_user_ids) or (c.handled_by_user_id is null and ct.owner_user_id = ${userId}))))`
      : sql``;
    const [r] = await this.rows<{ total: number; answered: number; missed: number }>(sql`
      select
        count(*)::int as total,
        count(*) filter (where c.answered_at is not null ${userId ? sql`and c.handled_by_user_id = ${userId}` : sql``})::int as answered,
        count(*) filter (where c.outcome = 'missed')::int as missed
      from calls c
      join contacts ct on ct.id = c.contact_id
      where c.company_id = ${companyId} and c.started_at >= ${w.from} and c.started_at < ${w.to} ${who}`);
    return { total: num(r?.total), answered: num(r?.answered), missed: num(r?.missed) };
  }

  async resolvedCount(companyId: string, w: Window, userId?: string): Promise<number> {
    const [r] = await this.rows<{ n: number }>(sql`
      select count(*)::int as n from conversations
      where company_id = ${companyId} and status = 'resolved' and resolved_at >= ${w.from} and resolved_at < ${w.to}
      ${userId ? sql`and resolved_by = ${userId}` : sql``}`);
    return num(r?.n);
  }

  /**
   * Average seconds from the customer's first message to the first staff reply, for
   * conversations whose first inbound message falls in the window.
   */
  async avgFirstReply(companyId: string, w: Window, ownerUserId?: string): Promise<number | null> {
    const [r] = await this.rows<{ avg: number | null }>(sql`
      with fi as (
        select conversation_id, min(created_at) as t from messages
        where company_id = ${companyId} and direction = 'in'
        group by conversation_id
      )
      select avg(extract(epoch from (c.first_response_at - fi.t)))::float8 as avg
      from conversations c
      join fi on fi.conversation_id = c.id
      join contacts ct on ct.id = c.contact_id
      where c.company_id = ${companyId} and fi.t >= ${w.from} and fi.t < ${w.to}
        and c.first_response_at is not null and c.first_response_at >= fi.t
        ${ownerUserId ? sql`and ct.owner_user_id = ${ownerUserId}` : sql``}`);
    return numOrNull(r?.avg);
  }

  /** 24 local-hour buckets of messages (in and out) and calls. */
  async hourly(companyId: string, w: Window, tz: string): Promise<{ hour: number; messages: number; calls: number }[]> {
    const msgs = await this.rows<{ h: number; n: number }>(sql`
      select extract(hour from created_at at time zone ${tz})::int as h, count(*)::int as n from messages
      where company_id = ${companyId} and direction in ('in', 'out') and created_at >= ${w.from} and created_at < ${w.to}
      group by 1`);
    const calls = await this.rows<{ h: number; n: number }>(sql`
      select extract(hour from started_at at time zone ${tz})::int as h, count(*)::int as n from calls
      where company_id = ${companyId} and started_at >= ${w.from} and started_at < ${w.to}
      group by 1`);
    const out = Array.from({ length: 24 }, (_, hour) => ({ hour, messages: 0, calls: 0 }));
    for (const m of msgs) if (out[num(m.h)]) out[num(m.h)].messages = num(m.n);
    for (const c of calls) if (out[num(c.h)]) out[num(c.h)].calls = num(c.n);
    return out;
  }

  /** Per local date: messages in/out and calls. */
  async dailyTraffic(companyId: string, w: Window, tz: string): Promise<Map<string, { messagesIn: number; messagesOut: number; calls: number }>> {
    const msgs = await this.rows<{ d: string; i: number; o: number }>(sql`
      select to_char(created_at at time zone ${tz}, 'YYYY-MM-DD') as d,
        count(*) filter (where direction = 'in')::int as i,
        count(*) filter (where direction = 'out')::int as o
      from messages
      where company_id = ${companyId} and created_at >= ${w.from} and created_at < ${w.to}
      group by 1`);
    const calls = await this.rows<{ d: string; n: number }>(sql`
      select to_char(started_at at time zone ${tz}, 'YYYY-MM-DD') as d, count(*)::int as n from calls
      where company_id = ${companyId} and started_at >= ${w.from} and started_at < ${w.to}
      group by 1`);
    const out = new Map<string, { messagesIn: number; messagesOut: number; calls: number }>();
    const get = (d: string) => {
      let v = out.get(d);
      if (!v) out.set(d, (v = { messagesIn: 0, messagesOut: 0, calls: 0 }));
      return v;
    };
    for (const m of msgs) Object.assign(get(m.d), { messagesIn: num(m.i), messagesOut: num(m.o) });
    for (const c of calls) get(c.d).calls = num(c.n);
    return out;
  }

  /** Per local date for one person: conversations they resolved and calls they handled. */
  async dailyPersonal(companyId: string, userId: string, w: Window, tz: string): Promise<Map<string, { resolved: number; calls: number }>> {
    const res = await this.rows<{ d: string; n: number }>(sql`
      select to_char(resolved_at at time zone ${tz}, 'YYYY-MM-DD') as d, count(*)::int as n from conversations
      where company_id = ${companyId} and status = 'resolved' and resolved_by = ${userId} and resolved_at >= ${w.from} and resolved_at < ${w.to}
      group by 1`);
    const calls = await this.rows<{ d: string; n: number }>(sql`
      select to_char(started_at at time zone ${tz}, 'YYYY-MM-DD') as d, count(*)::int as n from calls
      where company_id = ${companyId} and handled_by_user_id = ${userId} and started_at >= ${w.from} and started_at < ${w.to}
      group by 1`);
    const out = new Map<string, { resolved: number; calls: number }>();
    for (const r of res) out.set(r.d, { resolved: num(r.n), calls: 0 });
    for (const c of calls) out.set(c.d, { resolved: out.get(c.d)?.resolved ?? 0, calls: num(c.n) });
    return out;
  }

  async byLabel(companyId: string, w: Window): Promise<{ labelId: string; name: string; color: string; count: number }[]> {
    const rows = await this.rows<{ id: string; name: string; color: string; n: number }>(sql`
      select l.id, l.name, l.color, count(distinct cl.contact_id)::int as n
      from labels l
      left join contact_labels cl on cl.label_id = l.id and cl.company_id = ${companyId}
        and exists (
          select 1 from conversations c join messages m on m.conversation_id = c.id
          where c.contact_id = cl.contact_id and c.company_id = ${companyId}
            and m.created_at >= ${w.from} and m.created_at < ${w.to} and m.direction in ('in', 'out')
        )
      where l.company_id = ${companyId}
      group by l.id, l.name, l.color
      order by n desc, l.name asc`);
    return rows.map(r => ({ labelId: r.id, name: r.name, color: r.color, count: num(r.n) }));
  }

  /* ───────── Per person ───────── */

  /** Report rows for these people over the window. Targets compare this week's resolved chats. */
  async reportRows(companyId: string, people: PersonRow[], w: Window, tz: string): Promise<ReportRow[]> {
    if (people.length === 0) return [];
    const ids = uuidArray(people.map(p => p.userId));
    const week = thisWeek(tz);
    const [handled, resolved, resolvedWeek, answered, missed, firstReply, breaks, targets] = await Promise.all([
      this.rows<{ u: string; n: number }>(sql`
        select sender_user_id as u, count(distinct conversation_id)::int as n from messages
        where company_id = ${companyId} and direction = 'out' and sender_kind = 'user'
          and sender_user_id = any(${ids}) and created_at >= ${w.from} and created_at < ${w.to}
        group by 1`),
      this.groupedResolved(companyId, ids, w),
      this.groupedResolved(companyId, ids, week),
      this.rows<{ u: string; n: number }>(sql`
        select handled_by_user_id as u, count(*)::int as n from calls
        where company_id = ${companyId} and answered_at is not null and handled_by_user_id = any(${ids})
          and started_at >= ${w.from} and started_at < ${w.to}
        group by 1`),
      this.rows<{ u: string; n: number }>(sql`
        select u, count(distinct id)::int as n from (
          select c.id, unnest(c.ringing_user_ids) as u from calls c
          where c.company_id = ${companyId} and c.outcome = 'missed' and c.started_at >= ${w.from} and c.started_at < ${w.to}
          union all
          select c.id, coalesce(c.handled_by_user_id, ct.owner_user_id) as u from calls c
          join contacts ct on ct.id = c.contact_id
          where c.company_id = ${companyId} and c.outcome = 'missed' and c.started_at >= ${w.from} and c.started_at < ${w.to}
        ) x
        where u = any(${ids})
        group by u`),
      this.rows<{ u: string; avg: number | null }>(sql`
        with fi as (
          select conversation_id, min(created_at) as t from messages
          where company_id = ${companyId} and direction = 'in'
          group by conversation_id
        )
        select ct.owner_user_id as u, avg(extract(epoch from (c.first_response_at - fi.t)))::float8 as avg
        from conversations c
        join fi on fi.conversation_id = c.id
        join contacts ct on ct.id = c.contact_id
        where c.company_id = ${companyId} and fi.t >= ${w.from} and fi.t < ${w.to}
          and c.first_response_at is not null and c.first_response_at >= fi.t
          and ct.owner_user_id = any(${ids})
        group by 1`),
      this.rows<{ u: string; n: number }>(sql`
        select user_id as u,
          coalesce(sum(extract(epoch from (least(coalesce(ended_at, now()), ${w.to}::timestamptz) - greatest(started_at, ${w.from}::timestamptz)))), 0)::float8 / 60 as n
        from break_log
        where company_id = ${companyId} and user_id = any(${ids})
          and started_at < ${w.to} and coalesce(ended_at, now()) > ${w.from}
        group by 1`),
      this.targets(companyId)
    ]);
    const map = (rows: { u: string; n: number }[]) => new Map(rows.map(r => [r.u, num(r.n)]));
    const h = map(handled);
    const r = map(resolved);
    const rw = map(resolvedWeek);
    const a = map(answered);
    const m = map(missed);
    const b = map(breaks);
    const f = new Map(firstReply.map(x => [x.u, numOrNull(x.avg)]));
    const t = new Map(targets.map(x => [x.userId, x.resolvedTarget]));
    return people.map(p => ({
      userId: p.userId,
      name: p.name,
      chatsHandled: h.get(p.userId) ?? 0,
      resolved: r.get(p.userId) ?? 0,
      avgFirstReplySeconds: f.get(p.userId) ?? null,
      callsAnswered: a.get(p.userId) ?? 0,
      callsMissed: m.get(p.userId) ?? 0,
      breakMinutes: Math.round(b.get(p.userId) ?? 0),
      targetPercent: percentOf(rw.get(p.userId) ?? 0, t.get(p.userId) ?? 0)
    }));
  }

  private groupedResolved(companyId: string, ids: SQL, w: Window): Promise<{ u: string; n: number }[]> {
    return this.rows<{ u: string; n: number }>(sql`
      select resolved_by as u, count(*)::int as n from conversations
      where company_id = ${companyId} and status = 'resolved' and resolved_by = any(${ids})
        and resolved_at >= ${w.from} and resolved_at < ${w.to}
      group by 1`);
  }

  async openChatsByOwner(companyId: string): Promise<Map<string, number>> {
    const rows = await this.rows<{ u: string; n: number }>(sql`
      select ct.owner_user_id as u, count(*)::int as n from conversations c
      join contacts ct on ct.id = c.contact_id
      where c.company_id = ${companyId} and c.status = 'open' and c.last_message_at is not null and ct.owner_user_id is not null
      group by 1`);
    return new Map(rows.map(r => [r.u, num(r.n)]));
  }

  async callsByHandler(companyId: string, w: Window): Promise<Map<string, number>> {
    const rows = await this.rows<{ u: string; n: number }>(sql`
      select handled_by_user_id as u, count(*)::int as n from calls
      where company_id = ${companyId} and handled_by_user_id is not null and started_at >= ${w.from} and started_at < ${w.to}
      group by 1`);
    return new Map(rows.map(r => [r.u, num(r.n)]));
  }

  async resolvedByUser(companyId: string, w: Window): Promise<Map<string, number>> {
    const rows = await this.rows<{ u: string; n: number }>(sql`
      select resolved_by as u, count(*)::int as n from conversations
      where company_id = ${companyId} and status = 'resolved' and resolved_by is not null and resolved_at >= ${w.from} and resolved_at < ${w.to}
      group by 1`);
    return new Map(rows.map(r => [r.u, num(r.n)]));
  }

  /** Targets for every active person; people without a row get 0. */
  async targets(companyId: string): Promise<{ userId: string; resolvedTarget: number }[]> {
    const rows = await this.rows<{ user_id: string; resolved_target: number }>(sql`
      select u.id as user_id, coalesce(t.resolved_target, 0)::int as resolved_target
      from users u
      left join staff_targets t on t.user_id = u.id and t.company_id = ${companyId}
      where u.company_id = ${companyId} and u.status = 'active' and u.role in ('manager', 'staff')
      order by u.name asc`);
    return rows.map(r => ({ userId: r.user_id, resolvedTarget: num(r.resolved_target) }));
  }

  async scheduledCalls(
    companyId: string,
    userId: string,
    w: Window
  ): Promise<{ id: string; contact_id: string; contact_name: string; profile_name: string; wa_id: string | null; user_id: string; user_name: string; scheduled_at: Date | string; note: string; status: 'pending' | 'done' | 'cancelled' }[]> {
    return this.rows(sql`
      select s.id, s.contact_id, ct.name as contact_name, ct.profile_name, ct.wa_id, s.user_id, u.name as user_name, s.scheduled_at, s.note, s.status
      from scheduled_calls s
      join contacts ct on ct.id = s.contact_id
      join users u on u.id = s.user_id
      where s.company_id = ${companyId} and s.user_id = ${userId} and s.status = 'pending'
        and s.scheduled_at >= ${w.from} and s.scheduled_at < ${w.to}
      order by s.scheduled_at asc`);
  }
}
