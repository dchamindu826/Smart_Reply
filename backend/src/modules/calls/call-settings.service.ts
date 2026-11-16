/** Call settings, call hours on Meta, forwarding rules (company and personal) and the IVR menu. */
import { Injectable } from '@nestjs/common';
import { and, eq, inArray } from 'drizzle-orm';
import { z } from 'zod';
import {
  CallSettings,
  ForwardingRules,
  IvrMenu,
  IvrTestResult,
  callSettingsSchema,
  forwardingSchema,
  ivrSchema
} from '@smart-reply/shared';
import { Audit } from '../../common/audit';
import { AppError } from '../../common/errors';
import type { CompanySession } from '../../common/session';
import { FilesService } from '../../core/files.service';
import type { Db } from '../../db/client';
import { callSettings, files, ivrMenus, quickReplies, userForwarding, users, whatsappAccounts } from '../../db/schema';
import { InjectDb } from '../../infra/db';
import { logger } from '../../infra/logger';
import { GraphError, toAppError } from '../../meta/graph';
import { WhatsappAccounts } from '../../meta/platform';
import { CallSettingsRow, CallsCore } from './calls.core';

type CallSettingsInput = z.infer<typeof callSettingsSchema>;
type IvrInput = z.infer<typeof ivrSchema>;
type CallHours = CallSettingsInput['hours'];

/**
 * Meta needs a messaging limit of 2,000 or more for calling. Limits come as tiers
 * (`TIER_250`, `TIER_2K`, `TIER_10K`, `TIER_100K`, `TIER_UNLIMITED`) or as a number.
 */
export function limitAllowsCalling(limit: string | null): boolean {
  if (!limit) return false;
  const v = limit.toUpperCase().replace(/^TIER_/, '');
  if (v === 'UNLIMITED') return true;
  const m = /^(\d+(?:\.\d+)?)\s*([KM]?)$/.exec(v);
  if (!m) return false;
  const n = Number(m[1]) * (m[2] === 'K' ? 1000 : m[2] === 'M' ? 1_000_000 : 1);
  return n >= 2000;
}

/** Our call hours in Meta's `call_hours` shape. Sending it replaces the whole schedule. */
export function metaCallHours(h: CallHours): Record<string, unknown> {
  return {
    status: h.enabled ? 'ENABLED' : 'DISABLED',
    timezone_id: h.timezone,
    weekly_operating_hours: h.weekly.map(w => ({ day_of_week: w.day, open_time: w.open, close_time: w.close })),
    holiday_schedule: h.holidays.map(d => ({ date: d.date, start_time: d.open ?? '0000', end_time: d.close ?? '2359' }))
  };
}

const DEST_LABEL: Record<string, string> = {
  queue: 'Ring the team (queue)',
  wait: 'Keep the caller waiting in the queue',
  msg: 'Decline and send the missed-call message',
  vm: 'Decline and ask for a WhatsApp voice note',
  manager: 'Ring the managers',
  owner: 'Ring the customer’s owner'
};

@Injectable()
export class CallSettingsService {
  constructor(
    @InjectDb() private readonly db: Db,
    private readonly core: CallsCore,
    private readonly whatsapp: WhatsappAccounts,
    private readonly files: FilesService,
    private readonly audit: Audit
  ) {}

  /* ───────── Call settings ───────── */

  private async availability(companyId: string): Promise<{ enabled: boolean; reason: string | null }> {
    const [acc] = await this.db.select().from(whatsappAccounts).where(eq(whatsappAccounts.companyId, companyId)).limit(1);
    if (!acc || acc.status === 'disconnected') return { enabled: false, reason: 'WhatsApp is not connected yet. LUMI AI connects your number.' };
    if (acc.callingEnabled) return { enabled: true, reason: null };
    if (!limitAllowsCalling(acc.messagingLimit)) {
      return {
        enabled: false,
        reason: `Calling is not available yet: WhatsApp needs a messaging limit of 2,000 or more${acc.messagingLimit ? ` (this number: ${acc.messagingLimit})` : ''}.`
      };
    }
    return { enabled: false, reason: 'Calling is off for this number. Turn it on to take WhatsApp calls.' };
  }

  private present(row: CallSettingsRow, avail: { enabled: boolean; reason: string | null }): CallSettings {
    return {
      breakMaxMinutes: row.breakMaxMinutes,
      ringStrategy: row.ringStrategy,
      ringSeconds: row.ringSeconds,
      recording: { auto: row.recordAuto, announce: row.recordAnnounce, pauseAllowed: row.recordPauseAllowed, keepDays: row.recordKeepDays },
      linkPreviews: row.linkPreviews,
      forwarding: row.forwarding,
      hours: row.hours,
      callingEnabled: avail.enabled,
      callingUnavailableReason: avail.reason
    };
  }

  async get(s: CompanySession): Promise<CallSettings> {
    return this.present(await this.core.settings(s.companyId), await this.availability(s.companyId));
  }

  async put(s: CompanySession, input: CallSettingsInput): Promise<CallSettings> {
    await this.assertDestinations(s.companyId, Object.values(input.forwarding));
    await this.core.settings(s.companyId);
    const [row] = await this.db
      .update(callSettings)
      .set({
        breakMaxMinutes: input.breakMaxMinutes,
        ringStrategy: input.ringStrategy,
        ringSeconds: input.ringSeconds,
        recordAuto: input.recording.auto,
        recordAnnounce: input.recording.announce,
        recordPauseAllowed: input.recording.pauseAllowed,
        recordKeepDays: input.recording.keepDays,
        linkPreviews: input.linkPreviews,
        forwarding: input.forwarding,
        hours: input.hours
      })
      .where(eq(callSettings.companyId, s.companyId))
      .returning();
    await this.audit.log(s, { action: 'call_settings.update', targetType: 'call_settings', targetId: s.companyId, summary: 'Changed call settings' });
    const avail = await this.availability(s.companyId);
    const wa = await this.whatsapp.find(s.companyId);
    if (wa && avail.enabled) {
      try {
        await wa.graph.updateSettings(wa.phoneNumberId, { calling: { call_hours: metaCallHours(input.hours) } });
      } catch (err) {
        logger.warn({ err, companyId: s.companyId }, 'Call hours not accepted by WhatsApp');
        const detail = err instanceof GraphError ? err.details || err.message : 'WhatsApp could not be reached';
        return this.present(row, { enabled: avail.enabled, reason: `Saved here, but WhatsApp did not accept the call hours: ${detail}` });
      }
    }
    return this.present(row, avail);
  }

  /** Turn calling on for the number on Meta (needs a messaging limit of 2,000 or more). */
  async enableCalling(s: CompanySession): Promise<CallSettings> {
    const wa = await this.whatsapp.require(s.companyId);
    if (!limitAllowsCalling(wa.account.messagingLimit)) {
      throw new AppError('CALLING_NOT_ENABLED', 'Calling is off for this number, or its messaging limit is below 2,000');
    }
    const st = await this.core.settings(s.companyId);
    try {
      await wa.graph.updateSettings(wa.phoneNumberId, {
        calling: {
          status: 'ENABLED',
          call_icon_visibility: 'DEFAULT',
          callback_permission_status: 'ENABLED',
          call_hours: metaCallHours(st.hours)
        }
      });
    } catch (err) {
      throw toAppError(err);
    }
    await this.db.update(whatsappAccounts).set({ callingEnabled: true }).where(eq(whatsappAccounts.companyId, s.companyId));
    await this.audit.log(s, { action: 'calling.enable', targetType: 'whatsapp_account', targetId: wa.account.id, summary: 'Turned on WhatsApp calling' });
    return this.get(s);
  }

  /* ───────── Forwarding ───────── */

  /** `user:<id>` must be an active user and `quick_reply:<id>` a quick reply of this company. */
  private async assertDestinations(companyId: string, dests: string[]): Promise<void> {
    const userIds = [...new Set(dests.filter(d => d.startsWith('user:')).map(d => d.slice(5)))];
    const qrIds = [...new Set(dests.filter(d => d.startsWith('quick_reply:')).map(d => d.slice(12)))];
    if (userIds.length) {
      const found = await this.db
        .select({ id: users.id })
        .from(users)
        .where(and(eq(users.companyId, companyId), inArray(users.id, userIds), eq(users.status, 'active')));
      if (found.length !== userIds.length) throw new AppError('VALIDATION_FAILED', 'A forwarding destination names a person who is not in your team.');
    }
    if (qrIds.length) {
      const found = await this.db
        .select({ id: quickReplies.id })
        .from(quickReplies)
        .where(and(eq(quickReplies.companyId, companyId), inArray(quickReplies.id, qrIds)));
      if (found.length !== qrIds.length) throw new AppError('VALIDATION_FAILED', 'A destination names a quick reply that does not exist.');
    }
  }

  async getForwarding(s: CompanySession): Promise<ForwardingRules> {
    return (await this.core.settings(s.companyId)).forwarding;
  }

  async putForwarding(s: CompanySession, rules: z.infer<typeof forwardingSchema>): Promise<ForwardingRules> {
    await this.assertDestinations(s.companyId, Object.values(rules));
    await this.core.settings(s.companyId);
    await this.db.update(callSettings).set({ forwarding: rules }).where(eq(callSettings.companyId, s.companyId));
    await this.audit.log(s, { action: 'forwarding.update', targetType: 'call_settings', targetId: s.companyId, summary: 'Changed company call forwarding' });
    return rules;
  }

  async getMine(s: CompanySession): Promise<ForwardingRules> {
    return this.core.personalRules(s.companyId, s.userId);
  }

  async putMine(s: CompanySession, rules: z.infer<typeof forwardingSchema>): Promise<ForwardingRules> {
    await this.assertDestinations(s.companyId, Object.values(rules));
    await this.db
      .insert(userForwarding)
      .values({ userId: s.userId, companyId: s.companyId, rules })
      .onConflictDoUpdate({ target: userForwarding.userId, set: { rules } });
    await this.audit.log(s, { action: 'forwarding.update_mine', targetType: 'user', targetId: s.userId, summary: 'Changed personal call forwarding' });
    return rules;
  }

  /* ───────── IVR ───────── */

  private async ivrRow(companyId: string): Promise<typeof ivrMenus.$inferSelect> {
    const [row] = await this.db.select().from(ivrMenus).where(eq(ivrMenus.companyId, companyId)).limit(1);
    if (row) return row;
    await this.db.insert(ivrMenus).values({ companyId }).onConflictDoNothing();
    const [again] = await this.db.select().from(ivrMenus).where(eq(ivrMenus.companyId, companyId)).limit(1);
    return again!;
  }

  private async presentIvr(row: typeof ivrMenus.$inferSelect): Promise<IvrMenu> {
    const refs = await this.files.refs(row.greetingFileId ? [row.greetingFileId] : []);
    return {
      enabled: row.enabled,
      greetingMode: row.greetingMode,
      greetingText: row.greetingText,
      greetingAudio: row.greetingFileId ? (refs.get(row.greetingFileId) ?? null) : null,
      waitSeconds: row.waitSeconds,
      noInputDestination: row.noInputDestination,
      afterHoursEnabled: row.afterHoursEnabled,
      options: row.options,
      stageBRequired: true
    };
  }

  async getIvr(s: CompanySession): Promise<IvrMenu> {
    return this.presentIvr(await this.ivrRow(s.companyId));
  }

  async putIvr(s: CompanySession, input: IvrInput): Promise<IvrMenu> {
    const digits = input.options.map(o => o.digit);
    if (new Set(digits).size !== digits.length) throw new AppError('VALIDATION_FAILED', 'Each key can be used once in the menu.');
    await this.assertDestinations(s.companyId, [input.noInputDestination, ...input.options.map(o => o.destination)]);
    if (input.greetingFileId) {
      const [f] = await this.db
        .select({ id: files.id, kind: files.kind })
        .from(files)
        .where(and(eq(files.id, input.greetingFileId), eq(files.companyId, s.companyId)))
        .limit(1);
      if (!f) throw new AppError('NOT_FOUND', 'Greeting file not found.');
      if (f.kind !== 'audio') throw new AppError('VALIDATION_FAILED', 'The greeting must be an audio file.');
    }
    await this.ivrRow(s.companyId);
    const [row] = await this.db
      .update(ivrMenus)
      .set({
        enabled: input.enabled,
        greetingMode: input.greetingMode,
        greetingText: input.greetingText,
        greetingFileId: input.greetingFileId,
        waitSeconds: input.waitSeconds,
        noInputDestination: input.noInputDestination,
        afterHoursEnabled: input.afterHoursEnabled,
        options: input.options
      })
      .where(eq(ivrMenus.companyId, s.companyId))
      .returning();
    await this.audit.log(s, { action: 'ivr.update', targetType: 'ivr_menu', targetId: s.companyId, summary: 'Changed the IVR menu' });
    return this.presentIvr(row);
  }

  private async destinationLabel(companyId: string, dest: string): Promise<string> {
    if (DEST_LABEL[dest]) return DEST_LABEL[dest];
    if (dest.startsWith('user:')) {
      const [u] = await this.db
        .select({ name: users.name })
        .from(users)
        .where(and(eq(users.id, dest.slice(5)), eq(users.companyId, companyId)))
        .limit(1);
      return `Ring ${u?.name ?? 'a person who is no longer in the team'}`;
    }
    if (dest.startsWith('quick_reply:')) {
      const [q] = await this.db
        .select({ title: quickReplies.title })
        .from(quickReplies)
        .where(and(eq(quickReplies.id, dest.slice(12)), eq(quickReplies.companyId, companyId)))
        .limit(1);
      return `Decline and send the quick reply “${q?.title ?? 'deleted quick reply'}”`;
    }
    return dest;
  }

  /** Walk the menu with a key sequence. No real call is made. */
  async testIvr(s: CompanySession, keys: string): Promise<IvrTestResult> {
    const menu = await this.ivrRow(s.companyId);
    const path: string[] = [];
    if (!menu.enabled) {
      path.push('IVR is off');
      path.push(DEST_LABEL.queue);
      return { path };
    }
    path.push(
      menu.greetingMode === 'rec'
        ? menu.greetingFileId
          ? 'Play the recorded greeting'
          : 'Play the recorded greeting (none uploaded yet)'
        : `Read the greeting: “${menu.greetingText}”`
    );
    const key = keys.charAt(0);
    if (!key) {
      path.push(`No key pressed within ${menu.waitSeconds} s`);
      path.push(await this.destinationLabel(s.companyId, menu.noInputDestination));
      return { path };
    }
    const opt = menu.options.find(o => o.digit === key);
    if (!opt) {
      path.push(`Pressed ${key}: not on the menu`);
      path.push(await this.destinationLabel(s.companyId, menu.noInputDestination));
    } else {
      path.push(`Pressed ${key}: ${opt.label}`);
      path.push(await this.destinationLabel(s.companyId, opt.destination));
    }
    if (keys.length > 1) path.push(`Keys after the first (${keys.slice(1)}) are ignored: the menu has one level`);
    return { path };
  }
}
