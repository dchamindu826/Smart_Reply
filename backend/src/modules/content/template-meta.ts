/**
 * Conversions between our `templates` rows and Meta's message template objects.
 * Shapes follow Meta's "Message templates" reference (WhatsApp Business Management API).
 */
import {
  CreateTemplateInput,
  Template,
  TemplateButton,
  normalizePhone,
  templateVariableCount
} from '@smart-reply/shared';
import type { templates } from '../../db/schema';
import type { MetaTemplate } from '../../meta/graph';

export type TemplateRow = typeof templates.$inferSelect;
export type TemplateStatus = TemplateRow['status'];
export type TemplateQuality = TemplateRow['quality'];
export type TemplateCategory = TemplateRow['category'];

/** Meta template status → ours. FLAGGED stays approved (quality drops to low). */
export function statusFromMeta(status: string | undefined | null): TemplateStatus | null {
  switch ((status ?? '').toUpperCase()) {
    case 'APPROVED':
    case 'FLAGGED':
      return 'approved';
    case 'PENDING':
    case 'IN_APPEAL':
    case 'REINSTATED':
      return 'pending';
    case 'REJECTED':
      return 'rejected';
    case 'PAUSED':
      return 'paused';
    case 'DISABLED':
    case 'DELETED':
    case 'PENDING_DELETION':
    case 'ARCHIVED':
    case 'LIMIT_EXCEEDED':
      return 'disabled';
    default:
      return null;
  }
}

/** GREEN / YELLOW / RED → high / medium / low. */
export function qualityFromMeta(score: string | undefined | null): TemplateQuality {
  switch ((score ?? '').toUpperCase()) {
    case 'GREEN':
    case 'HIGH':
      return 'high';
    case 'YELLOW':
    case 'MEDIUM':
      return 'medium';
    case 'RED':
    case 'LOW':
      return 'low';
    default:
      return 'unknown';
  }
}

export function categoryFromMeta(category: string | undefined | null): TemplateCategory | null {
  const c = (category ?? '').toLowerCase();
  return c === 'utility' || c === 'marketing' || c === 'authentication' ? c : null;
}

/** Meta answers "NONE" when there is no rejection reason. */
export function reasonFromMeta(reason: unknown): string | null {
  if (typeof reason !== 'string' || !reason || reason.toUpperCase() === 'NONE') return null;
  return reason.replace(/_/g, ' ').toLowerCase().replace(/^\w/, c => c.toUpperCase());
}

export interface ParsedComponents {
  headerText: string | null;
  body: string;
  footer: string | null;
  buttons: TemplateButton[];
}

export function parseComponents(components: MetaTemplate['components'] | undefined): ParsedComponents {
  const out: ParsedComponents = { headerText: null, body: '', footer: null, buttons: [] };
  for (const c of components ?? []) {
    const type = c.type.toUpperCase();
    if (type === 'HEADER' && (c.format ?? 'TEXT').toUpperCase() === 'TEXT') out.headerText = c.text ?? null;
    else if (type === 'BODY') out.body = c.text ?? '';
    else if (type === 'FOOTER') out.footer = c.text ?? null;
    else if (type === 'BUTTONS') {
      for (const b of c.buttons ?? []) {
        const bt = b.type.toUpperCase();
        if (bt === 'QUICK_REPLY') out.buttons.push({ type: 'QUICK_REPLY', text: b.text });
        else if (bt === 'URL') out.buttons.push({ type: 'URL', text: b.text, ...(b.url ? { url: b.url } : {}) });
        else if (bt === 'PHONE_NUMBER') out.buttons.push({ type: 'PHONE_NUMBER', text: b.text, ...(b.phone_number ? { phoneNumber: b.phone_number } : {}) });
      }
    }
  }
  return out;
}

function examplesFor(count: number, examples: string[], offset = 0): string[] {
  return Array.from({ length: count }, (_, i) => examples[offset + i] || 'sample');
}

/** Request body for `POST /<WABA_ID>/message_templates`. */
export function buildCreateBody(input: CreateTemplateInput): Record<string, unknown> {
  const components: Record<string, unknown>[] = [];
  if (input.category === 'authentication') {
    // Authentication templates use Meta's fixed text; only the copy-code button is configurable.
    components.push({ type: 'BODY', add_security_recommendation: true });
    components.push({ type: 'BUTTONS', buttons: [{ type: 'OTP', otp_type: 'COPY_CODE', text: input.buttons[0]?.text ?? 'Copy code' }] });
  } else {
    let offset = 0;
    if (input.headerText) {
      const n = templateVariableCount(input.headerText);
      components.push({
        type: 'HEADER',
        format: 'TEXT',
        text: input.headerText,
        ...(n > 0 ? { example: { header_text: examplesFor(n, input.examples) } } : {})
      });
      offset = n;
    }
    const n = templateVariableCount(input.body);
    components.push({
      type: 'BODY',
      text: input.body,
      ...(n > 0 ? { example: { body_text: [examplesFor(n, input.examples, offset)] } } : {})
    });
    if (input.footer) components.push({ type: 'FOOTER', text: input.footer });
    if (input.buttons.length) {
      components.push({
        type: 'BUTTONS',
        buttons: input.buttons.map(b => {
          if (b.type === 'URL') return { type: 'URL', text: b.text, url: b.url ?? '' };
          if (b.type === 'PHONE_NUMBER') return { type: 'PHONE_NUMBER', text: b.text, phone_number: normalizePhone(b.phoneNumber ?? '') };
          return { type: 'QUICK_REPLY', text: b.text };
        })
      });
    }
  }
  return {
    name: input.name,
    language: input.language,
    category: input.category.toUpperCase(),
    parameter_format: 'positional',
    components
  };
}

export function presentTemplate(r: TemplateRow): Template {
  return {
    id: r.id,
    name: r.name,
    category: r.category,
    language: r.language,
    status: r.status,
    quality: r.quality,
    headerText: r.headerText,
    body: r.body,
    footer: r.footer,
    buttons: r.buttons,
    rejectionReason: r.rejectionReason,
    usedCount: r.usedCount,
    variableCount: templateVariableCount(r.body),
    updatedAt: r.updatedAt.toISOString()
  };
}
