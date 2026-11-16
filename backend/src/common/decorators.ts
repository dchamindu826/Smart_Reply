import { createParamDecorator, ExecutionContext, SetMetadata } from '@nestjs/common';
import type { Request } from 'express';
import type { Role, StaffPermission } from '@smart-reply/shared';
import { AppError } from './errors';
import type { CompanySession, Session } from './session';

export const PUBLIC_KEY = 'sr:public';
export const ROLES_KEY = 'sr:roles';
export const PERM_KEY = 'sr:perm';

/** No sign-in needed (login, webhook, invite pages). */
export const Public = (): MethodDecorator & ClassDecorator => SetMetadata(PUBLIC_KEY, true);

/**
 * Who may call this route. Without it, any manager or staff member inside a company may.
 * System admin routes use `@Roles('system_admin')`.
 */
export const Roles = (...roles: Role[]): MethodDecorator & ClassDecorator => SetMetadata(ROLES_KEY, roles);

/** Staff need this permission switch on; managers always pass. */
export const Perm = (p: StaffPermission): MethodDecorator & ClassDecorator => SetMetadata(PERM_KEY, p);

/** The signed-in session inside a company. */
export const Auth = createParamDecorator((_: unknown, ctx: ExecutionContext): CompanySession => {
  const s = ctx.switchToHttp().getRequest<Request>().auth;
  if (!s) throw new AppError('UNAUTHENTICATED', 'Sign in first.');
  if (!s.companyId) throw new AppError('FORBIDDEN', 'This needs a company account.');
  return s as CompanySession;
});

/** The signed-in session, including system admins. */
export const AnyAuth = createParamDecorator((_: unknown, ctx: ExecutionContext): Session => {
  const s = ctx.switchToHttp().getRequest<Request>().auth;
  if (!s) throw new AppError('UNAUTHENTICATED', 'Sign in first.');
  return s;
});

/** Where the request came from, for the audit log. */
export const Source = createParamDecorator((_: unknown, ctx: ExecutionContext): 'web' | 'mobile' => {
  const s = ctx.switchToHttp().getRequest<Request>().auth;
  return s?.client ?? 'web';
});
