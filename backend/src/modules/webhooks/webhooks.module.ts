import { Controller, Get, HttpCode, Module, Post, Query, Req, Res } from '@nestjs/common';
import type { RawBodyRequest } from '@nestjs/common';
import type { Request, Response } from 'express';
import { Public } from '../../common/decorators';
import { logger } from '../../infra/logger';
import { WebhooksService } from './webhooks.service';

/** One URL for every company: `/api/v1/webhooks/whatsapp`. The worker routes by phone number id. */
@Controller('webhooks/whatsapp')
class WebhooksController {
  constructor(private readonly svc: WebhooksService) {}

  @Public()
  @Get()
  async handshake(
    @Query('hub.mode') mode: string | undefined,
    @Query('hub.verify_token') token: string | undefined,
    @Query('hub.challenge') challenge: string | undefined,
    @Res() res: Response
  ): Promise<void> {
    if (await this.svc.verifyHandshake(mode, token)) {
      res.status(200).type('text/plain').send(challenge ?? '');
      return;
    }
    res.status(403).send('Forbidden');
  }

  @Public()
  @Post()
  @HttpCode(200)
  async receive(@Req() req: RawBodyRequest<Request>, @Res() res: Response): Promise<void> {
    const ok = await this.svc.verifySignature(req.rawBody, req.headers['x-hub-signature-256'] as string | undefined);
    if (!ok) {
      logger.warn('Webhook with a bad or missing signature rejected');
      res.status(401).send('Bad signature');
      return;
    }
    await this.svc.store(req.body as Parameters<WebhooksService['store']>[0]);
    res.status(200).send('OK');
  }
}

@Module({ controllers: [WebhooksController], providers: [WebhooksService], exports: [WebhooksService] })
export class WebhooksModule {}
