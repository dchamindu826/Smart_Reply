import { Injectable } from '@nestjs/common';
import { and, eq, isNull } from 'drizzle-orm';
import { DEFAULT_STAFF_PERMISSIONS, STAFF_PERMISSIONS, StaffPermissions } from '@smart-reply/shared';
import type { Db } from '../db/client';
import { companies, impersonations, rolePermissions, userPermissions, users } from '../db/schema';
import { InjectDb } from '../infra/db';
import { AppError } from './errors';
import type { AccessClaims } from './tokens';
import type { Session } from './session';

const ALL_ON = Object.fromEntries(STAFF_PERMISSIONS.map(p => [p, true])) as StaffPermissions;
const TTL_MS = 10_000;

/** Turns token claims into a checked session: user active, company active, token not revoked. */
@Injectable()
export class SessionLoader {
  private readonly cache = new Map<string, { at: number; session: Session; tv: number }>();

  constructor(@InjectDb() private readonly db: Db) {}

  invalidate(userId: string): void {
    for (const k of this.cache.keys()) if (k.startsWith(userId)) this.cache.delete(k);
  }

  async load(claims: AccessClaims): Promise<Session> {
    const key = `${claims.sub}:${claims.imp ?? ''}:${claims.cl}`;
    const hit = this.cache.get(key);
    if (hit && Date.now() - hit.at < TTL_MS && hit.tv === claims.tv) return hit.session;

    const [u] = await this.db.select().from(users).where(eq(users.id, claims.sub)).limit(1);
    if (!u || u.tokenVersion !== claims.tv) throw new AppError('UNAUTHENTICATED', 'Your session has ended. Sign in again.');
    if (u.status !== 'active') throw new AppError('ACCOUNT_DISABLED', 'This account is disabled.');

    let session: Session;
    if (claims.imp) {
      // A system admin acting as a company's manager for support.
      const [imp] = await this.db
        .select()
        .from(impersonations)
        .where(and(eq(impersonations.id, claims.imp), eq(impersonations.adminUserId, u.id), isNull(impersonations.endedAt)))
        .limit(1);
      if (!imp || u.role !== 'system_admin') throw new AppError('UNAUTHENTICATED', 'Support session ended.');
      const [as] = await this.db.select().from(users).where(eq(users.id, imp.asUserId)).limit(1);
      if (!as) throw new AppError('UNAUTHENTICATED', 'Support session ended.');
      session = {
        userId: as.id,
        role: as.role,
        companyId: imp.companyId,
        name: as.name,
        permissions: ALL_ON,
        impersonationId: imp.id,
        adminUserId: u.id,
        client: claims.cl
      };
    } else {
      session = {
        userId: u.id,
        role: u.role,
        companyId: u.companyId,
        name: u.name,
        permissions: ALL_ON,
        impersonationId: null,
        adminUserId: null,
        client: claims.cl
      };
    }

    if (session.companyId) {
      const [c] = await this.db.select({ status: companies.status }).from(companies).where(eq(companies.id, session.companyId)).limit(1);
      if (!c) throw new AppError('UNAUTHENTICATED', 'Company not found.');
      if (c.status !== 'active' && !session.impersonationId) {
        throw new AppError('COMPANY_SUSPENDED', 'This company account is suspended. Contact LUMI AI.');
      }
      if (session.role === 'staff') session.permissions = await this.staffPermissions(session.companyId, session.userId);
    }

    this.cache.set(key, { at: Date.now(), session, tv: claims.tv });
    return session;
  }

  async staffPermissions(companyId: string, userId: string): Promise<StaffPermissions> {
    const [role] = await this.db.select().from(rolePermissions).where(eq(rolePermissions.companyId, companyId)).limit(1);
    const [own] = await this.db.select().from(userPermissions).where(eq(userPermissions.userId, userId)).limit(1);
    return { ...DEFAULT_STAFF_PERMISSIONS, ...(role?.staff ?? {}), ...(own?.overrides ?? {}) };
  }
}
