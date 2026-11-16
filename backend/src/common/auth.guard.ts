import { CanActivate, ExecutionContext, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { Request } from 'express';
import type { Role, StaffPermission } from '@smart-reply/shared';
import { PERM_KEY, PUBLIC_KEY, ROLES_KEY } from './decorators';
import { AppError } from './errors';
import { can } from './session';
import { SessionLoader } from './session-loader';
import { ACCESS_COOKIE, verifyAccessToken } from './tokens';

const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);

export function readAccessToken(req: Request): { token: string | null; viaCookie: boolean } {
  const h = req.headers.authorization;
  if (h?.startsWith('Bearer ')) return { token: h.slice(7), viaCookie: false };
  const c = (req.cookies as Record<string, string> | undefined)?.[ACCESS_COOKIE];
  return { token: c ?? null, viaCookie: Boolean(c) };
}

/**
 * Runs on every route. Checks the access token, loads the session, then the route's
 * `@Roles` and `@Perm` rules. Company routes are closed to system admins unless they are in a
 * support (impersonation) session. Cookie-authenticated writes must carry `X-SR-Client`
 * (a header a cross-site form cannot set), which blocks CSRF.
 */
@Injectable()
export class AuthGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly sessions: SessionLoader
  ) {}

  async canActivate(ctx: ExecutionContext): Promise<boolean> {
    if (ctx.getType() !== 'http') return true;
    const targets = [ctx.getHandler(), ctx.getClass()];
    if (this.reflector.getAllAndOverride<boolean>(PUBLIC_KEY, targets)) return true;

    const req = ctx.switchToHttp().getRequest<Request>();
    const { token, viaCookie } = readAccessToken(req);
    if (!token) throw new AppError('UNAUTHENTICATED', 'Sign in first.');
    const claims = await verifyAccessToken(token);
    if (!claims) throw new AppError('UNAUTHENTICATED', 'Your session has expired. Sign in again.');
    if (viaCookie && !SAFE_METHODS.has(req.method) && !req.headers['x-sr-client']) {
      throw new AppError('FORBIDDEN', 'Missing client header.');
    }
    const session = await this.sessions.load(claims);
    req.auth = session;

    const roles = this.reflector.getAllAndOverride<Role[] | undefined>(ROLES_KEY, targets);
    if (roles?.length) {
      if (!roles.includes(session.role)) throw new AppError('FORBIDDEN', 'You do not have permission to do this.');
    } else if (!session.companyId || session.role === 'system_admin') {
      throw new AppError('FORBIDDEN', 'Open a company to use this.');
    }

    const perm = this.reflector.getAllAndOverride<StaffPermission | undefined>(PERM_KEY, targets);
    if (perm && !can(session, perm)) throw new AppError('FORBIDDEN', 'Your manager has not turned this on for you.');
    return true;
  }
}
