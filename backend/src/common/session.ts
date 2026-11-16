import type { Role, StaffPermission, StaffPermissions } from '@smart-reply/shared';

/** The signed-in user, attached to every authenticated request as `req.auth`. */
export interface Session {
  userId: string;
  role: Role;
  /** Null only for system admins outside an impersonation session. */
  companyId: string | null;
  name: string;
  permissions: StaffPermissions;
  impersonationId: string | null;
  adminUserId: string | null;
  client: 'web' | 'mobile';
}

/** A session that is inside a company (manager or staff). */
export interface CompanySession extends Session {
  companyId: string;
  role: 'manager' | 'staff';
}

export function isManager(s: Session): boolean {
  return s.role === 'manager';
}

export function can(s: Session, p: StaffPermission): boolean {
  return s.role === 'manager' || s.permissions[p] === true;
}

declare module 'express-serve-static-core' {
  interface Request {
    auth?: Session;
  }
}
