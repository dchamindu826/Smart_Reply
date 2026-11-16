import { Injectable } from '@nestjs/common';
import { eq } from 'drizzle-orm';
import { hmacSha256, safeEqual, sha256 } from '../../common/crypto';
import type { Db } from '../../db/client';
import { webhookEvents } from '../../db/schema';
import { InjectDb } from '../../infra/db';
import { logger } from '../../infra/logger';
import { Queues } from '../../infra/queues';
import { Platform } from '../../meta/platform';

interface WebhookBody {
  object?: string;
  entry?: { id?: string; changes?: { field?: string; value?: Record<string, unknown> }[] }[];
}

export function kindOf(field: string, value: Record<string, unknown>): string {
  if (field === 'messages') {
    if (Array.isArray(value.messages) && value.messages.length) return 'message';
    if (Array.isArray(value.statuses) && value.statuses.length) return 'status';
    return 'other';
  }
  if (field === 'calls') {
    const calls = value.calls as { event?: string }[] | undefined;
    if (calls?.[0]?.event) return String(calls[0].event);
    if (Array.isArray(value.statuses)) return 'call_status';
    return 'call';
  }
  return field;
}

/** Verify, store, enqueue. Nothing else happens inside the HTTP request. */
@Injectable()
export class WebhooksService {
  constructor(
    @InjectDb() private readonly db: Db,
    private readonly queues: Queues,
    private readonly platform: Platform
  ) {}

  async verifyHandshake(mode: string | undefined, token: string | undefined): Promise<boolean> {
    const { verifyToken } = await this.platform.get();
    return mode === 'subscribe' && Boolean(verifyToken) && Boolean(token) && safeEqual(token!, verifyToken!);
  }

  async verifySignature(raw: Buffer | undefined, header: string | undefined): Promise<boolean> {
    const { appSecret } = await this.platform.get();
    if (!appSecret || !raw || !header?.startsWith('sha256=')) return false;
    return safeEqual(header.slice(7), hmacSha256(appSecret, raw));
  }

  /** Store each change once (the dedupe key makes redelivery harmless) and queue it. */
  async store(body: WebhookBody): Promise<number> {
    let stored = 0;
    for (const entry of body.entry ?? []) {
      for (const change of entry.changes ?? []) {
        const field = change.field ?? 'unknown';
        const value = change.value ?? {};
        const metadata = value.metadata as { phone_number_id?: string } | undefined;
        const payload = { wabaId: entry.id ?? null, field, value };
        const dedupeKey = `${field}:${sha256(JSON.stringify(value))}`;
        const [row] = await this.db
          .insert(webhookEvents)
          .values({ phoneNumberId: metadata?.phone_number_id ?? null, field, kind: kindOf(field, value), dedupeKey, payload })
          .onConflictDoNothing({ target: webhookEvents.dedupeKey })
          .returning({ id: webhookEvents.id });
        if (row) {
          stored++;
          await this.queues.add('webhook.process', { eventId: row.id }, { jobId: `wh-${row.id}`, attempts: 8 });
        }
      }
    }
    return stored;
  }

  /** Put a stored event back on the queue (admin "replay"). */
  async replay(id: string): Promise<void> {
    await this.db.update(webhookEvents).set({ processedAt: null, error: null }).where(eq(webhookEvents.id, id));
    await this.queues.add('webhook.process', { eventId: id }, { jobId: `wh-${id}-replay-${Date.now()}`, attempts: 3 });
    logger.info({ eventId: id }, 'Webhook event replayed');
  }
}
