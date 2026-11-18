import { ArgumentsHost, Catch, ExceptionFilter, HttpException, HttpStatus } from '@nestjs/common';
import type { Response } from 'express';
import type { ErrorCode } from '@smart-reply/shared';
import { logger } from '../infra/logger';

const STATUS: Partial<Record<ErrorCode, number>> = {
  BAD_REQUEST: 400,
  VALIDATION_FAILED: 400,
  UNAUTHENTICATED: 401,
  INVALID_CREDENTIALS: 401,
  TOKEN_INVALID: 401,
  FORBIDDEN: 403,
  ACCOUNT_DISABLED: 403,
  COMPANY_SUSPENDED: 403,
  NOT_FOUND: 404,
  CONFLICT: 409,
  EMAIL_TAKEN: 409,
  SEAT_LIMIT_REACHED: 409,
  WINDOW_CLOSED: 409,
  CALL_STATE: 409,
  CALL_PERMISSION_MISSING: 409,
  CALL_PERMISSION_LIMIT: 429,
  CALLING_NOT_ENABLED: 409,
  WHATSAPP_NOT_CONNECTED: 409,
  TEMPLATE_NOT_APPROVED: 409,
  AI_NOT_ACTIVE: 409,
  AI_NOT_CONFIGURED: 409,
  AI_PROVIDER_ERROR: 502,
  VOICE_UNAVAILABLE: 503,
  FILE_TOO_LARGE: 413,
  FILE_TYPE_NOT_ALLOWED: 415,
  RATE_LIMITED: 429,
  META_ERROR: 502,
  NOT_AVAILABLE: 501,
  INTERNAL: 500
};

/** Throw this from services. The filter turns it into `{ error: { code, message } }`. */
export class AppError extends Error {
  constructor(
    public readonly code: ErrorCode,
    message: string,
    public readonly details?: unknown
  ) {
    super(message);
  }
  get status(): number {
    return STATUS[this.code] ?? 400;
  }
}

export const notFound = (what = 'Item'): AppError => new AppError('NOT_FOUND', `${what} not found.`);
export const forbidden = (message = 'You do not have permission to do this.'): AppError =>
  new AppError('FORBIDDEN', message);

@Catch()
export class ErrorFilter implements ExceptionFilter {
  catch(exception: unknown, host: ArgumentsHost): void {
    const res = host.switchToHttp().getResponse<Response>();
    if (res.headersSent) return;
    if (exception instanceof AppError) {
      res.status(exception.status).json({
        error: { code: exception.code, message: exception.message, ...(exception.details ? { details: exception.details } : {}) }
      });
      return;
    }
    if (exception instanceof HttpException) {
      const status = exception.getStatus();
      const code: ErrorCode =
        status === 404 ? 'NOT_FOUND' : status === 401 ? 'UNAUTHENTICATED' : status === 403 ? 'FORBIDDEN' : status === 429 ? 'RATE_LIMITED' : status === 413 ? 'FILE_TOO_LARGE' : 'BAD_REQUEST';
      res.status(status).json({ error: { code, message: exception.message } });
      return;
    }
    logger.error({ err: exception }, 'Unhandled error');
    res.status(HttpStatus.INTERNAL_SERVER_ERROR).json({ error: { code: 'INTERNAL', message: 'Something went wrong. Try again.' } });
  }
}
