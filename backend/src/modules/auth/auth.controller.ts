import { Controller, Delete, Get, HttpCode, Param, Patch, Post, Req, Res } from '@nestjs/common';
import type { CookieOptions, Request, Response } from 'express';
import { z } from 'zod';
import {
  LoginResponse,
  MeResponse,
  acceptInviteSchema,
  changePasswordSchema,
  forgotPasswordSchema,
  loginSchema,
  refreshSchema,
  registerDeviceSchema,
  resetPasswordSchema,
  updateMeSchema
} from '@smart-reply/shared';
import { cookieSecure, env } from '../../config';
import { AnyAuth, Public, Roles } from '../../common/decorators';
import type { Session } from '../../common/session';
import { ACCESS_COOKIE, REFRESH_COOKIE } from '../../common/tokens';
import { ZBody } from '../../common/validation';
import { AppError } from '../../common/errors';
import { RateLimiter } from '../../infra/rate-limit';
import { AuthService, IssuedTokens } from './auth.service';

const ALL_ROLES = ['system_admin', 'manager', 'staff'] as const;

function baseCookie(): CookieOptions {
  return { httpOnly: true, secure: cookieSecure, sameSite: 'lax', ...(env.COOKIE_DOMAIN ? { domain: env.COOKIE_DOMAIN } : {}) };
}

export function setAuthCookies(res: Response, t: IssuedTokens): void {
  res.cookie(ACCESS_COOKIE, t.accessToken, { ...baseCookie(), path: '/', expires: t.accessExpiresAt });
  res.cookie(REFRESH_COOKIE, t.refreshToken, { ...baseCookie(), path: '/api/v1/auth', expires: t.refreshExpiresAt });
}

export function clearAuthCookies(res: Response): void {
  res.clearCookie(ACCESS_COOKIE, { ...baseCookie(), path: '/' });
  res.clearCookie(REFRESH_COOKIE, { ...baseCookie(), path: '/api/v1/auth' });
}

function clientOf(req: Request): 'web' | 'mobile' {
  return req.headers['x-sr-client'] === 'mobile' ? 'mobile' : 'web';
}

@Controller()
export class AuthController {
  constructor(
    private readonly auth: AuthService,
    private readonly limiter: RateLimiter
  ) {}

  @Public()
  @Post('auth/login')
  @HttpCode(200)
  async login(@ZBody(loginSchema) body: z.infer<typeof loginSchema>, @Req() req: Request, @Res({ passthrough: true }) res: Response): Promise<LoginResponse> {
    await this.limiter.hit(`login:ip:${req.ip}`, 30, 600);
    await this.limiter.hit(`login:email:${body.email}`, 10, 600);
    const client = body.client === 'mobile' ? 'mobile' : clientOf(req);
    const result = await this.auth.login(body.email, body.password, client, body.device ?? (req.headers['user-agent'] ?? '').slice(0, 100));
    await this.limiter.reset(`login:email:${body.email}`);
    if (client === 'web') setAuthCookies(res, result.tokens);
    return this.auth.toLoginResponse(result, client);
  }

  @Public()
  @Post('auth/refresh')
  @HttpCode(200)
  async refresh(@ZBody(refreshSchema) body: z.infer<typeof refreshSchema>, @Req() req: Request, @Res({ passthrough: true }) res: Response): Promise<LoginResponse> {
    const fromCookie = (req.cookies as Record<string, string> | undefined)?.[REFRESH_COOKIE];
    const token = body.refreshToken ?? fromCookie;
    if (!token) throw new AppError('TOKEN_INVALID', 'Sign in again.');
    await this.limiter.hit(`refresh:ip:${req.ip}`, 120, 600);
    const client = body.refreshToken ? 'mobile' : 'web';
    try {
      const result = await this.auth.refresh(token, client);
      if (client === 'web') setAuthCookies(res, result.tokens);
      return this.auth.toLoginResponse(result, client);
    } catch (err) {
      if (client === 'web') clearAuthCookies(res);
      throw err;
    }
  }

  @Public()
  @Post('auth/logout')
  @HttpCode(204)
  async logout(@ZBody(refreshSchema) body: z.infer<typeof refreshSchema>, @Req() req: Request, @Res({ passthrough: true }) res: Response): Promise<void> {
    const fromCookie = (req.cookies as Record<string, string> | undefined)?.[REFRESH_COOKIE];
    await this.auth.logout(body.refreshToken ?? fromCookie);
    clearAuthCookies(res);
  }

  @Public()
  @Post('auth/forgot-password')
  @HttpCode(200)
  async forgot(@ZBody(forgotPasswordSchema) body: z.infer<typeof forgotPasswordSchema>, @Req() req: Request): Promise<{ sent: boolean }> {
    await this.limiter.hit(`forgot:ip:${req.ip}`, 10, 3600);
    await this.limiter.hit(`forgot:email:${body.email}`, 3, 3600);
    return this.auth.forgotPassword(body.email);
  }

  @Public()
  @Post('auth/reset-password')
  @HttpCode(204)
  async reset(@ZBody(resetPasswordSchema) body: z.infer<typeof resetPasswordSchema>, @Req() req: Request): Promise<void> {
    await this.limiter.hit(`reset:ip:${req.ip}`, 20, 3600);
    await this.auth.resetPassword(body.token, body.password);
  }

  @Public()
  @Get('auth/invite/:token')
  async invite(@Param('token') token: string, @Req() req: Request): Promise<{ name: string; email: string; companyName: string; role: string }> {
    await this.limiter.hit(`invite:ip:${req.ip}`, 60, 600);
    return this.auth.inviteInfo(token);
  }

  @Public()
  @Post('auth/invite/:token/accept')
  @HttpCode(200)
  async acceptInvite(
    @Param('token') token: string,
    @ZBody(acceptInviteSchema) body: z.infer<typeof acceptInviteSchema>,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response
  ): Promise<LoginResponse> {
    await this.limiter.hit(`invite:ip:${req.ip}`, 60, 600);
    const client = clientOf(req);
    const result = await this.auth.acceptInvite(token, body.password, body.name, client);
    if (client === 'web') setAuthCookies(res, result.tokens);
    return this.auth.toLoginResponse(result, client);
  }

  @Roles(...ALL_ROLES)
  @Get('me')
  me(@AnyAuth() s: Session): Promise<MeResponse> {
    return this.auth.me(s);
  }

  @Roles(...ALL_ROLES)
  @Patch('me')
  updateMe(@AnyAuth() s: Session, @ZBody(updateMeSchema) body: z.infer<typeof updateMeSchema>): Promise<MeResponse> {
    return this.auth.updateMe(s, body);
  }

  @Roles(...ALL_ROLES)
  @Post('me/password')
  @HttpCode(204)
  async password(@AnyAuth() s: Session, @ZBody(changePasswordSchema) body: z.infer<typeof changePasswordSchema>): Promise<void> {
    if (s.impersonationId) throw new AppError('FORBIDDEN', 'Support sessions cannot change passwords.');
    await this.auth.changePassword(s, body.currentPassword, body.newPassword);
  }

  @Roles(...ALL_ROLES)
  @Post('me/devices')
  device(@AnyAuth() s: Session, @ZBody(registerDeviceSchema) body: z.infer<typeof registerDeviceSchema>): Promise<{ id: string }> {
    return this.auth.registerDevice(s, body.platform, body.pushToken, body.voipToken);
  }

  @Roles(...ALL_ROLES)
  @Delete('me/devices/:id')
  @HttpCode(204)
  async removeDevice(@AnyAuth() s: Session, @Param('id') id: string): Promise<void> {
    await this.auth.removeDevice(s, id);
  }

  @Roles('manager', 'staff')
  @Post('auth/end-support')
  @HttpCode(200)
  async endSupport(@AnyAuth() s: Session, @Req() req: Request, @Res({ passthrough: true }) res: Response): Promise<LoginResponse> {
    const client = clientOf(req);
    const result = await this.auth.endImpersonation(s, client);
    if (client === 'web') setAuthCookies(res, result.tokens);
    return this.auth.toLoginResponse(result, client);
  }
}
