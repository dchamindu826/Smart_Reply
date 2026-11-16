import { apiBase } from './config';
import { ApiError, parseErrorBody } from './errors';
import { getTokens, refreshTokens } from '@/auth/session';

export type QueryValue = string | number | boolean | null | undefined;
export type QueryParams = Record<string, QueryValue>;

export interface RequestOptions {
  body?: unknown;
  query?: QueryParams;
  /** Send the access token. Defaults to true. */
  auth?: boolean;
  signal?: AbortSignal;
  idempotencyKey?: string;
  timeoutMs?: number;
}

type Method = 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';

export function buildUrl(base: string, path: string, query?: QueryParams): string {
  const qs = query
    ? Object.entries(query)
        .filter((e): e is [string, string | number | boolean] => e[1] !== undefined && e[1] !== null && e[1] !== '')
        .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(String(v))}`)
        .join('&')
    : '';
  return `${base}${path.startsWith('/') ? path : `/${path}`}${qs ? `?${qs}` : ''}`;
}

async function send(method: Method, path: string, opts: RequestOptions, accessToken: string | null): Promise<Response> {
  const headers: Record<string, string> = { Accept: 'application/json', 'x-sr-client': 'mobile' };
  if (opts.body !== undefined) headers['Content-Type'] = 'application/json';
  if (accessToken) headers.Authorization = `Bearer ${accessToken}`;
  if (opts.idempotencyKey) headers['Idempotency-Key'] = opts.idempotencyKey;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), opts.timeoutMs ?? 30_000);
  const onAbort = () => controller.abort();
  opts.signal?.addEventListener('abort', onAbort);
  try {
    return await fetch(buildUrl(apiBase(), path, opts.query), {
      method,
      headers,
      body: opts.body === undefined ? undefined : JSON.stringify(opts.body),
      signal: controller.signal
    });
  } catch {
    if (opts.signal?.aborted) throw new ApiError('UNKNOWN', 'Cancelled.', 0);
    throw new ApiError('NETWORK', 'Cannot reach the server. Check your connection.', 0);
  } finally {
    clearTimeout(timer);
    opts.signal?.removeEventListener('abort', onAbort);
  }
}

async function readBody(res: Response): Promise<unknown> {
  if (res.status === 204) return undefined;
  const text = await res.text();
  if (!text) return undefined;
  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
}

/**
 * Calls the Smart Reply API. On a 401 the refresh token is rotated once (shared between
 * concurrent requests) and the request retried; if that fails the session ends.
 */
export async function request<T>(method: Method, path: string, opts: RequestOptions = {}): Promise<T> {
  const useAuth = opts.auth !== false;
  let res = await send(method, path, opts, useAuth ? (getTokens()?.accessToken ?? null) : null);
  if (res.status === 401 && useAuth && getTokens()) {
    const next = await refreshTokens();
    if (!next) throw new ApiError('UNAUTHENTICATED', 'Your session ended. Sign in again.', 401);
    res = await send(method, path, opts, next.accessToken);
  }
  const body = await readBody(res);
  if (!res.ok) throw parseErrorBody(body, res.status);
  return body as T;
}

export const api = {
  get: <T>(path: string, query?: QueryParams, signal?: AbortSignal) => request<T>('GET', path, { query, signal }),
  post: <T>(path: string, body?: unknown, opts: Omit<RequestOptions, 'body'> = {}) =>
    request<T>('POST', path, { ...opts, body: body ?? {} }),
  put: <T>(path: string, body?: unknown) => request<T>('PUT', path, { body: body ?? {} }),
  patch: <T>(path: string, body?: unknown) => request<T>('PATCH', path, { body: body ?? {} }),
  del: <T>(path: string) => request<T>('DELETE', path)
};

/** Lists may come back as a bare array or as `{ items }`. */
export function asItems<T>(value: T[] | { items: T[] } | null | undefined): T[] {
  if (!value) return [];
  return Array.isArray(value) ? value : value.items;
}
