import { Injectable } from '@nestjs/common';
import { Audit, AuditInput } from '../../common/audit';
import type { Session } from '../../common/session';
import type { Db, DbOrTx } from '../../db/client';
import { auditLogs } from '../../db/schema';
import { InjectDb } from '../../infra/db';

/**
 * Audit for system admin actions. Platform-level entries have no company. Entries about one
 * company carry its id, so the company's own audit log shows "LUMI AI support" did it.
 */
@Injectable()
export class AdminAudit {
  constructor(
    @InjectDb() private readonly db: Db,
    private readonly audit: Audit
  ) {}

  async log(s: Session, companyId: string | null, input: AuditInput, tx?: DbOrTx): Promise<void> {
    if (!companyId) {
      await this.audit.log(s, input, tx);
      return;
    }
    await (tx ?? this.db).insert(auditLogs).values({
      companyId,
      actorUserId: s.userId,
      actorName: 'LUMI AI support',
      actorKind: 'admin',
      action: input.action,
      targetType: input.targetType,
      targetId: input.targetId ?? null,
      summary: input.summary,
      meta: { ...(input.meta ?? {}), adminName: s.name },
      source: s.client
    });
  }
}
