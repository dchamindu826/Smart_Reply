/**
 * HTTP client for the Smart Reply API. The web app signs in with httpOnly cookies, so every
 * call is same-origin (`/api/v1/...`, proxied to the API by Next in development and by Nginx
 * in production). Writes carry the `X-SR-Client` header that the API requires against CSRF.
 */
import type { ApiErrorBody, ErrorCode } from '@smart-reply/shared';

export const API_BASE = '/api/v1';

export class ApiError extends Error {
  constructor(
    public readonly status: number,
    public readonly code: ErrorCode | 'NETWORK',
    message: string,
    public readonly details?: unknown
  ) {
    super(message);
  }
}

let refreshing: Promise<boolean> | null = null;
let onSignedOut: (() => void) | null = null;

/** Called when the session can no longer be refreshed. */
export function setSignedOutHandler(fn: () => void): void {
  onSignedOut = fn;
}

async function refreshSession(): Promise<boolean> {
  refreshing ??= fetch(`${API_BASE}/auth/refresh`, {
    method: 'POST',
    credentials: 'include',
    headers: { 'Content-Type': 'application/json', 'X-SR-Client': 'web' },
    body: '{}'
  })
    .then(r => r.ok)
    .catch(() => false)
    .finally(() => {
      setTimeout(() => (refreshing = null), 0);
    });
  return refreshing;
}

type Query = Record<string, string | number | boolean | null | undefined>;

function withQuery(path: string, query?: Query): string {
  if (!query) return path;
  const params = new URLSearchParams();
  for (const [k, v] of Object.entries(query)) {
    if (v === undefined || v === null || v === '') continue;
    params.set(k, String(v));
  }
  const qs = params.toString();
  return qs ? `${path}${path.includes('?') ? '&' : '?'}${qs}` : path;
}

async function request<T>(method: string, path: string, body?: unknown, query?: Query, retried = false): Promise<T> {
  let res: Response;
  try {
    res = await fetch(`${API_BASE}${withQuery(path, query)}`, {
      method,
      credentials: 'include',
      headers: {
        'X-SR-Client': 'web',
        ...(body !== undefined ? { 'Content-Type': 'application/json' } : {})
      },
      body: body !== undefined ? JSON.stringify(body) : undefined
    });
  } catch {
    throw new ApiError(0, 'NETWORK', 'Cannot reach Smart Reply. Check your internet connection.');
  }

  if (res.status === 401 && !retried && !path.startsWith('/auth/')) {
    if (await refreshSession()) return request<T>(method, path, body, query, true);
    onSignedOut?.();
  }
  if (res.status === 204) return undefined as T;
  const text = await res.text();
  let data: unknown = null;
  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    data = null;
  }
  if (!res.ok) {
    const e = (data as ApiErrorBody | null)?.error;
    throw new ApiError(res.status, e?.code ?? 'INTERNAL', e?.message ?? `Request failed (${res.status})`, e?.details);
  }
  return data as T;
}

/** POST that returns a file (e.g. the voice preview WAV). Errors read like other API errors. */
async function postBlob(path: string, body: unknown, retried = false): Promise<Blob> {
  let res: Response;
  try {
    res = await fetch(`${API_BASE}${path}`, {
      method: 'POST',
      credentials: 'include',
      headers: { 'X-SR-Client': 'web', 'Content-Type': 'application/json' },
      body: JSON.stringify(body)
    });
  } catch {
    throw new ApiError(0, 'NETWORK', 'Cannot reach Smart Reply. Check your internet connection.');
  }
  if (res.status === 401 && !retried) {
    if (await refreshSession()) return postBlob(path, body, true);
    onSignedOut?.();
  }
  if (!res.ok) {
    const data = (await res.json().catch(() => null)) as ApiErrorBody | null;
    throw new ApiError(res.status, data?.error?.code ?? 'INTERNAL', data?.error?.message ?? `Request failed (${res.status})`);
  }
  return res.blob();
}

export const api = {
  blob: (path: string, body: unknown = {}) => postBlob(path, body),
  get: <T>(path: string, query?: Query) => request<T>('GET', path, undefined, query),
  post: <T>(path: string, body: unknown = {}) => request<T>('POST', path, body),
  put: <T>(path: string, body: unknown = {}) => request<T>('PUT', path, body),
  patch: <T>(path: string, body: unknown = {}) => request<T>('PATCH', path, body),
  del: <T = void>(path: string) => request<T>('DELETE', path)
};

export function errorMessage(err: unknown): string {
  if (err instanceof ApiError) return err.message;
  if (err instanceof Error) return err.message;
  return 'Something went wrong. Try again.';
}
