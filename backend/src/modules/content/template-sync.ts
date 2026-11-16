import { Injectable } from '@nestjs/common';
import { and, eq, ne } from 'drizzle-orm';
import { Audit } from '../../common/audit';
import type { Db } from '../../db/client';
import { templates } from '../../db/schema';
import { InjectDb } from '../../infra/db';
import { logger } from '../../infra/logger';
import { Queues } from '../../infra/queues';
import { Realtime, rooms } from '../../infra/realtime';
import { toAppError } from '../../meta/graph';
import { WhatsappAccounts } from '../../meta/platform';
import {
  TemplateRow,
  categoryFromMeta,
  parseComponents,
  presentTemplate,
  qualityFromMeta,
  reasonFromMeta,
  statusFromMeta
} from './template-meta';

type Patch = Partial<Pick<TemplateRow, 'status' | 'quality' | 'rejectionReason' | 'category' | 'headerText' | 'body' | 'footer' | 'buttons' | 'metaTemplateId'>>;

function str(v: unknown): string | null {
  if (typeof v === 'string' && v) return v;
  if (typeof v === 'number') return String(v);
  return null;
}

/** Keeps the templates table in step with Meta: full sync and template webhooks. */
@Injectable()
export class TemplateSync {
  constructor(
    @InjectDb() private readonly db: Db,
    private readonly whatsapp: WhatsappAccounts,
    private readonly realtime: Realtime,
    private readonly audit: Audit,
    private readonly queues: Queues
  ) {}

  /** Pull every template from Meta, upsert by name and language, disable ones Meta no longer has. */
  async syncCompany(companyId: string): Promise<{ updated: number }> {
    const wa = await this.whatsapp.find(companyId);
    if (!wa) return { updated: 0 };
    let remote;
    try {
      remote = await wa.graph.listTemplates(wa.wabaId);
    } catch (err) {
      throw toAppError(err);
    }
    const local = await this.db.select().from(templates).where(eq(templates.companyId, companyId));
    const byKey = new Map(local.map(r => [`${r.name}|${r.language}`, r]));
    const seen = new Set<string>();
    let updated = 0;

    for (const t of remote) {
      const key = `${t.name}|${t.language}`;
      seen.add(key);
      const parsed = parseComponents(t.components);
      const status = statusFromMeta(t.status) ?? 'pending';
      const flagged = t.status?.toUpperCase() === 'FLAGGED';
      const values = {
        metaTemplateId: t.id,
        status,
        category: categoryFromMeta(t.category) ?? 'utility',
        quality: flagged ? ('low' as const) : qualityFromMeta(t.quality_score?.score),
        headerText: parsed.headerText,
        body: parsed.body,
        footer: parsed.footer,
        buttons: parsed.buttons,
        rejectionReason: status === 'rejected' ? reasonFromMeta(t.rejected_reason) : null
      };
      const existing = byKey.get(key);
      if (!existing) {
        await this.db
          .insert(templates)
          .values({ companyId, name: t.name, language: t.language, ...values })
          .onConflictDoUpdate({ target: [templates.companyId, templates.name, templates.language], set: values });
        updated++;
        continue;
      }
      const changed =
        existing.metaTemplateId !== values.metaTemplateId ||
        existing.status !== values.status ||
        existing.category !== values.category ||
        existing.quality !== values.quality ||
        existing.headerText !== values.headerText ||
        existing.body !== values.body ||
        existing.footer !== values.footer ||
        existing.rejectionReason !== values.rejectionReason ||
        JSON.stringify(existing.buttons) !== JSON.stringify(values.buttons);
      if (changed) {
        await this.db.update(templates).set(values).where(eq(templates.id, existing.id));
        updated++;
      }
    }

    for (const r of local) {
      if (seen.has(`${r.name}|${r.language}`) || r.status === 'disabled') continue;
      await this.db.update(templates).set({ status: 'disabled' }).where(eq(templates.id, r.id));
      updated++;
    }
    logger.info({ companyId, remote: remote.length, updated }, 'Templates synced');
    return { updated };
  }

  /**
   * `message_template_status_update`, `message_template_quality_update`,
   * `message_template_components_update` and `template_category_update` webhooks.
   */
  async applyWebhook(companyId: string, field: string, value: Record<string, unknown>): Promise<void> {
    const row = await this.findRow(companyId, value);
    if (!row) {
      // A template created outside Smart Reply (or before we stored it): pull the full list.
      await this.queues.add('templates.sync', { companyId }, { jobId: `tpl-sync-${companyId}-${Math.floor(Date.now() / 60_000)}` });
      return;
    }
    const patch: Patch = {};
    const metaId = str(value.message_template_id);
    if (metaId && !row.metaTemplateId) patch.metaTemplateId = metaId;

    if (field === 'message_template_status_update') {
      const event = String(value.event ?? '').toUpperCase();
      const status = statusFromMeta(event);
      if (status) patch.status = status;
      if (event === 'FLAGGED') patch.quality = 'low';
      if (status === 'rejected') patch.rejectionReason = reasonFromMeta(value.reason) ?? 'Rejected by Meta';
      else if (status === 'approved') patch.rejectionReason = null;
    } else if (field === 'message_template_quality_update') {
      patch.quality = qualityFromMeta(str(value.new_quality_score));
    } else if (field === 'template_category_update') {
      const c = categoryFromMeta(str(value.new_category));
      if (c) patch.category = c;
    } else if (field === 'message_template_components_update') {
      if (typeof value.message_template_element === 'string') patch.body = value.message_template_element;
      if ('message_template_title' in value) patch.headerText = str(value.message_template_title);
      if ('message_template_footer' in value) patch.footer = str(value.message_template_footer);
      const buttons = value.message_template_buttons;
      if (Array.isArray(buttons)) {
        patch.buttons = parseComponents([
          {
            type: 'BUTTONS',
            buttons: (buttons as Record<string, unknown>[]).map(b => ({
              type: String(b.message_template_button_type ?? ''),
              text: String(b.message_template_button_text ?? ''),
              url: str(b.message_template_button_url) ?? undefined,
              phone_number: str(b.message_template_button_phone_number) ?? undefined
            }))
          }
        ]).buttons;
      }
    } else {
      return;
    }
    if (Object.keys(patch).length === 0) return;

    const [u] = await this.db.update(templates).set(patch).where(eq(templates.id, row.id)).returning();
    this.realtime.emit([rooms.managers(companyId)], 'template.status', { template: presentTemplate(u) });

    if (patch.status && patch.status !== row.status && (patch.status === 'approved' || patch.status === 'rejected' || patch.status === 'paused' || patch.status === 'disabled')) {
      const verb = { approved: 'approved', rejected: 'rejected', paused: 'paused', disabled: 'disabled' }[patch.status];
      await this.audit.system(companyId, {
        kind: 'meta',
        action: `template.${patch.status}`,
        targetType: 'template',
        targetId: row.id,
        summary: `Meta ${verb} template “${row.name}” (${row.language})${patch.status === 'rejected' && patch.rejectionReason ? `: ${patch.rejectionReason}` : ''}`
      });
    }
  }

  private async findRow(companyId: string, value: Record<string, unknown>): Promise<TemplateRow | null> {
    const metaId = str(value.message_template_id);
    if (metaId) {
      const [r] = await this.db
        .select()
        .from(templates)
        .where(and(eq(templates.companyId, companyId), eq(templates.metaTemplateId, metaId)))
        .limit(1);
      if (r) return r;
    }
    const name = str(value.message_template_name);
    const language = str(value.message_template_language);
    if (!name) return null;
    const rows = await this.db
      .select()
      .from(templates)
      .where(and(eq(templates.companyId, companyId), eq(templates.name, name), language ? eq(templates.language, language) : ne(templates.status, 'disabled')))
      .limit(2);
    return rows.length === 1 ? rows[0] : null;
  }
}
