import { Controller, Get, HttpCode, Param, Post, Req } from '@nestjs/common';
import type { Request } from 'express';
import { z } from 'zod';
import { embeddedSignupSchema } from '@smart-reply/shared';
import type { EmbeddedSignupConfig } from '@smart-reply/shared';
import { Public } from '../../common/decorators';
import { ZBody } from '../../common/validation';
import { RateLimiter } from '../../infra/rate-limit';
import { WhatsappConnectService } from './whatsapp-connect.service';

/**
 * The business owner's one-time connect link. It opens only Meta's Embedded Signup popup;
 * the token in the URL is the only permission and works once.
 */
@Public()
@Controller('connect-links')
export class ConnectLinksController {
  constructor(
    private readonly svc: WhatsappConnectService,
    private readonly limiter: RateLimiter
  ) {}

  @Get(':token')
  async config(@Param('token') token: string, @Req() req: Request): Promise<EmbeddedSignupConfig> {
    await this.limiter.hit(`connect-link:ip:${req.ip}`, 60, 600);
    return this.svc.linkConfig(token);
  }

  @Post(':token/finish')
  @HttpCode(200)
  async finish(
    @Param('token') token: string,
    @ZBody(embeddedSignupSchema) body: z.infer<typeof embeddedSignupSchema>,
    @Req() req: Request
  ): Promise<{ ok: true; displayPhone: string | null }> {
    await this.limiter.hit(`connect-link:ip:${req.ip}`, 60, 600);
    await this.limiter.hit(`connect-link:finish:${token.slice(0, 16)}`, 10, 3600);
    return this.svc.finishLink(token, body);
  }
}
