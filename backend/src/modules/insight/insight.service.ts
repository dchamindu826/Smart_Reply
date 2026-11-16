import { Injectable } from '@nestjs/common';
import {
  DashboardResponse,
  MyDashboardResponse,
  PerformanceResponse,
  ProgressResponse,
  RangeQuery,
  ReportsResponse,
  LabelColor,
  formatPhone
} from '@smart-reply/shared';
import type { CompanySession } from '../../common/session';
import { MetricsService, percentOf } from './metrics.service';
import { localDates, resolveRange, thisWeek, today } from './time';

@Injectable()
export class InsightService {
  constructor(private readonly m: MetricsService) {}

  async dashboard(s: CompanySession): Promise<DashboardResponse> {
    const c = await this.m.company(s.companyId);
    const day = today(c.tz);
    const [chats, newCustomers, msgs, calls, avg, resolved, hourly, people, open, resolvedBy, callsBy] = await Promise.all([
      this.m.chatCounts(s.companyId),
      this.m.newCustomers(s.companyId, day),
      this.m.messageTotals(s.companyId, day),
      this.m.callTotals(s.companyId, day),
      this.m.avgFirstReply(s.companyId, day),
      this.m.resolvedCount(s.companyId, day),
      this.m.hourly(s.companyId, day, c.tz),
      this.m.people(s.companyId),
      this.m.openChatsByOwner(s.companyId),
      this.m.resolvedByUser(s.companyId, day),
      this.m.callsByHandler(s.companyId, day)
    ]);
    return {
      today: {
        chatsOpen: chats.open,
        chatsUnassigned: chats.unassigned,
        chatsClosingSoon: chats.closingSoon,
        newCustomers,
        messagesIn: msgs.in,
        messagesOut: msgs.out,
        callsAnswered: calls.answered,
        callsMissed: calls.missed,
        avgFirstReplySeconds: avg,
        resolved
      },
      hourly,
      team: people.map(p => ({
        userId: p.userId,
        name: p.name,
        initials: p.initials,
        openChats: open.get(p.userId) ?? 0,
        resolved: resolvedBy.get(p.userId) ?? 0,
        callsToday: callsBy.get(p.userId) ?? 0
      }))
    };
  }

  async myDashboard(s: CompanySession): Promise<MyDashboardResponse> {
    const c = await this.m.company(s.companyId);
    const day = today(c.tz);
    const week = thisWeek(c.tz);
    const [chats, calls, resolvedToday, resolvedWeek, avg, targets, scheduled] = await Promise.all([
      this.m.chatCounts(s.companyId, s.userId),
      this.m.callTotals(s.companyId, day, s.userId),
      this.m.resolvedCount(s.companyId, day, s.userId),
      this.m.resolvedCount(s.companyId, week, s.userId),
      this.m.avgFirstReply(s.companyId, day, s.userId),
      this.m.targets(s.companyId),
      this.m.scheduledCalls(s.companyId, s.userId, day)
    ]);
    const target = targets.find(t => t.userId === s.userId)?.resolvedTarget ?? 0;
    return {
      openChats: chats.open,
      unread: chats.unread,
      closingSoon: chats.closingSoon,
      callsToday: calls.total,
      callsMissed: calls.missed,
      resolvedToday,
      avgFirstReplySeconds: avg,
      targetPercent: percentOf(resolvedWeek, target),
      scheduledCalls: scheduled.map(r => ({
        id: r.id,
        contactId: r.contact_id,
        contactName: r.contact_name || r.profile_name || (r.wa_id ? formatPhone(r.wa_id) : 'WhatsApp user'),
        userId: r.user_id,
        userName: r.user_name,
        scheduledAt: new Date(r.scheduled_at).toISOString(),
        note: r.note,
        status: r.status
      }))
    };
  }

  async reports(s: CompanySession, q: RangeQuery): Promise<ReportsResponse> {
    const c = await this.m.company(s.companyId);
    const w = resolveRange(q, c.tz);
    const [msgs, calls, newCustomers, resolved, avg, daily, people, byLabel] = await Promise.all([
      this.m.messageTotals(s.companyId, w),
      this.m.callTotals(s.companyId, w),
      this.m.newCustomers(s.companyId, w),
      this.m.resolvedCount(s.companyId, w),
      this.m.avgFirstReply(s.companyId, w),
      this.m.dailyTraffic(s.companyId, w, c.tz),
      this.m.people(s.companyId),
      this.m.byLabel(s.companyId, w)
    ]);
    const byStaff = await this.m.reportRows(s.companyId, people, w, c.tz);
    return {
      range: { from: w.from.toISOString(), to: w.to.toISOString() },
      totals: {
        messagesIn: msgs.in,
        messagesOut: msgs.out,
        newCustomers,
        resolved,
        callsAnswered: calls.answered,
        callsMissed: calls.missed,
        avgFirstReplySeconds: avg,
        templatesSent: msgs.templates
      },
      daily: localDates(w, c.tz).map(date => ({ date, messagesIn: 0, messagesOut: 0, calls: 0, ...daily.get(date) })),
      byStaff,
      byLabel: byLabel.map(l => ({ ...l, color: l.color as LabelColor }))
    };
  }

  async progress(s: CompanySession, q: RangeQuery): Promise<ProgressResponse> {
    const c = await this.m.company(s.companyId);
    const w = resolveRange(q, c.tz);
    const people = await this.m.people(s.companyId);
    const [rows, targets] = await Promise.all([this.m.reportRows(s.companyId, people, w, c.tz), this.m.targets(s.companyId)]);
    return { range: { from: w.from.toISOString(), to: w.to.toISOString() }, rows, targets };
  }

  async performance(s: CompanySession, q: RangeQuery, userId = s.userId): Promise<PerformanceResponse> {
    const c = await this.m.company(s.companyId);
    const w = resolveRange(q, c.tz);
    const people = await this.m.people(s.companyId, userId);
    const person = people[0] ?? { userId, name: s.name, initials: '' };
    const [[row], daily, targets] = await Promise.all([
      this.m.reportRows(s.companyId, [person], w, c.tz),
      this.m.dailyPersonal(s.companyId, userId, w, c.tz),
      this.m.targets(s.companyId)
    ]);
    return {
      range: { from: w.from.toISOString(), to: w.to.toISOString() },
      chatsHandled: row.chatsHandled,
      resolved: row.resolved,
      avgFirstReplySeconds: row.avgFirstReplySeconds,
      callsAnswered: row.callsAnswered,
      callsMissed: row.callsMissed,
      breakMinutes: row.breakMinutes,
      targetPercent: row.targetPercent,
      resolvedTarget: targets.find(t => t.userId === userId)?.resolvedTarget ?? 0,
      daily: localDates(w, c.tz).map(date => ({ date, resolved: 0, calls: 0, ...daily.get(date) }))
    };
  }
}
