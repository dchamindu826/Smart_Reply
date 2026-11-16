import { Global, Injectable, Module } from '@nestjs/common';
import nodemailer, { Transporter } from 'nodemailer';
import { env } from '../config';
import { logger } from './logger';

/** Sends account emails (invites, password resets). Without SMTP settings the link is logged instead. */
@Injectable()
export class Mailer {
  private readonly transport: Transporter | null = env.SMTP_HOST
    ? nodemailer.createTransport({
        host: env.SMTP_HOST,
        port: env.SMTP_PORT,
        secure: env.SMTP_PORT === 465,
        auth: env.SMTP_USER ? { user: env.SMTP_USER, pass: env.SMTP_PASS } : undefined
      })
    : null;

  get configured(): boolean {
    return this.transport !== null;
  }

  async send(to: string, subject: string, text: string, html?: string): Promise<boolean> {
    if (!this.transport) {
      logger.warn({ subject }, 'SMTP is not configured; email not sent. The link is returned to the caller instead.');
      return false;
    }
    try {
      await this.transport.sendMail({ from: env.SMTP_FROM, to, subject, text, html });
      return true;
    } catch (err) {
      logger.error({ err, subject }, 'Email failed');
      return false;
    }
  }
}

export function emailLayout(title: string, lines: string[], button?: { label: string; url: string }): string {
  const p = lines.map(l => `<p style="margin:0 0 12px;color:#334155;font-size:15px;line-height:1.5">${l}</p>`).join('');
  const b = button
    ? `<p style="margin:20px 0"><a href="${button.url}" style="background:#0F9D58;color:#fff;padding:12px 20px;border-radius:8px;text-decoration:none;font-weight:600">${button.label}</a></p><p style="color:#64748b;font-size:12px">Or open this link: ${button.url}</p>`
    : '';
  return `<div style="font-family:Arial,sans-serif;max-width:520px;margin:auto;padding:24px"><h2 style="color:#0b3d2e">${title}</h2>${p}${b}<p style="color:#94a3b8;font-size:12px;margin-top:24px">Smart Reply by LUMI AI</p></div>`;
}

@Global()
@Module({ providers: [Mailer], exports: [Mailer] })
export class MailerModule {}
