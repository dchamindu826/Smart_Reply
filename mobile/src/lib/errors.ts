import type { ErrorCode } from '@smart-reply/shared';

export type ClientErrorCode = ErrorCode | 'NETWORK' | 'UNKNOWN';

export class ApiError extends Error {
  constructor(
    readonly code: ClientErrorCode,
    message: string,
    readonly status: number,
    readonly details?: unknown
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null;
}

/** Reads `{ error: { code, message } }` from an API response body. */
export function parseErrorBody(body: unknown, status: number): ApiError {
  if (isRecord(body) && isRecord(body.error)) {
    const { code, message, details } = body.error;
    if (typeof code === 'string' && typeof message === 'string') {
      return new ApiError(code as ErrorCode, message, status, details);
    }
  }
  if (status === 401) return new ApiError('UNAUTHENTICATED', 'Sign in again.', status);
  if (status === 404) return new ApiError('NOT_FOUND', 'Not found.', status);
  if (status >= 500) return new ApiError('INTERNAL', 'The server had a problem. Try again in a moment.', status);
  return new ApiError('UNKNOWN', `Request failed (${status}).`, status);
}

/** A message that is safe to show to the user for any thrown value. */
export function errorMessage(err: unknown): string {
  if (err instanceof ApiError) return err.message;
  if (err instanceof Error && err.message) return err.message;
  return 'Something went wrong.';
}

export function errorCode(err: unknown): ClientErrorCode | null {
  return err instanceof ApiError ? err.code : null;
}
