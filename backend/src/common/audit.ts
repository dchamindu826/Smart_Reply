import { Global, Injectable, Module } from '@nestjs/common';
import type { DbOrTx } from '../db/client';
import { auditLogs } from '../db/schema';
import { InjectDb } from '../infra/db';
import type { Db } from '../db/client';
import type { Session } from './session';

export interface AuditInput {
  action: string;
  targetType: string;
  targetId?: string | null;
  summary: string;
  meta?: Record<string, unknown>;
}

/** Append-only trail for staff, permissions, ownership, templates, settings, billing and support sessions. */
@Injectable()
export class Audit {
  constructor(@InjectDb() private readonly db: Db) {}

  async log(session: Session, input: AuditInput, tx?: DbOrTx): Promise<void> {
    const actorName = session.adminUserId ? `LUMI AI support (as ${session.name})` : session.name;
    await (tx ?? this.db).insert(auditLogs).values({
      companyId: session.companyId,
      actorUserId: session.adminUserId ?? session.userId,
      actorName,
      actorKind: session.adminUserId || session.role === 'system_admin' ? 'admin' : 'user',
      action: input.action,
      targetType: input.targetType,
      targetId: input.targetId ?? null,
      summary: input.summary,
      meta: input.meta ?? null,
      source: session.client
    });
  }

  async system(companyId: string | null, input: AuditInput & { kind?: 'system' | 'meta' }, tx?: DbOrTx): Promise<void> {
    await (tx ?? this.db).insert(auditLogs).values({
      companyId,
      actorUserId: null,
      actorName: input.kind === 'meta' ? 'Meta' : 'System',
      actorKind: input.kind ?? 'system',
      action: input.action,
      targetType: input.targetType,
      targetId: input.targetId ?? null,
      summary: input.summary,
      meta: input.meta ?? null,
      source: input.kind === 'meta' ? 'meta' : 'system'
    });
  }
}

@Global()
@Module({ providers: [Audit], exports: [Audit] })
export class AuditModule {}
