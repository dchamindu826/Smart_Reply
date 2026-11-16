import type { LoginResponse, MeResponse } from '@smart-reply/shared';
import { apiBase } from '@/lib/config';
import { ApiError, parseErrorBody } from '@/lib/errors';
import { readSecure, writeSecure } from '@/lib/storage';

export interface Tokens {
  accessToken: string;
  refreshToken: string;
  accessExpiresAt: string;
}

const TOKENS_KEY = 'sr.tokens';
/** Refresh this long before the access token runs out. */
const EARLY_MS = 30_000;

let tokens: Tokens | null = null;
let refreshing: Promise<Tokens | null> | null = null;

type EndedListener = (reason: string) => void;
type RefreshedListener = (me: MeResponse) => void;
const endedListeners = new Set<EndedListener>();
const refreshedListeners = new Set<RefreshedListener>();

function isTokens(v: unknown): v is Tokens {
  if (typeof v !== 'object' || v === null) return false;
  const t = v as Record<string, unknown>;
  return typeof t.accessToken === 'string' && typeof t.refreshToken === 'string' && typeof t.accessExpiresAt === 'string';
}

export async function loadTokens(): Promise<Tokens | null> {
  const raw = await readSecure(TOKENS_KEY);
  if (!raw) return null;
  try {
    const parsed: unknown = JSON.parse(raw);
    tokens = isTokens(parsed) ? parsed : null;
  } catch {
    tokens = null;
  }
  return tokens;
}

export function getTokens(): Tokens | null {
  return tokens;
}

export async function setTokens(next: Tokens | null): Promise<void> {
  tokens = next;
  await writeSecure(TOKENS_KEY, next ? JSON.stringify(next) : null);
}

/** Called when the session ends for any reason other than the user pressing Sign out. */
export function onSessionEnded(fn: EndedListener): () => void {
  endedListeners.add(fn);
  return () => endedListeners.delete(fn);
}

export function onSessionRefreshed(fn: RefreshedListener): () => void {
  refreshedListeners.add(fn);
  return () => refreshedListeners.delete(fn);
}

export async function endSession(reason: string): Promise<void> {
  const had = tokens !== null;
  await setTokens(null);
  if (had) endedListeners.forEach(fn => fn(reason));
}

export function accessExpiresSoon(t: Tokens, now = Date.now()): boolean {
  const exp = Date.parse(t.accessExpiresAt);
  return Number.isFinite(exp) && exp - now < EARLY_MS;
}

async function doRefresh(current: Tokens): Promise<Tokens | null> {
  let res: Response;
  try {
    res = await fetch(`${apiBase()}/auth/refresh`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json', 'x-sr-client': 'mobile' },
      body: JSON.stringify({ refreshToken: current.refreshToken })
    });
  } catch {
    // Offline: keep the session, the caller sees a network error.
    throw new ApiError('NETWORK', 'Cannot reach the server. Check your connection.', 0);
  }
  const text = await res.text();
  let body: unknown = null;
  try {
    body = text ? JSON.parse(text) : null;
  } catch {
    body = null;
  }
  if (!res.ok) {
    if (res.status === 401 || res.status === 403) {
      const err = parseErrorBody(body, res.status);
      await endSession(err.message);
      return null;
    }
    throw parseErrorBody(body, res.status);
  }
  const login = body as LoginResponse;
  if (!login.tokens) {
    await endSession('Sign in again.');
    return null;
  }
  // Another refresh may have replaced the tokens while this one ran; keep the newest.
  if (tokens && tokens.refreshToken !== current.refreshToken) return tokens;
  await setTokens(login.tokens);
  refreshedListeners.forEach(fn => fn(login.me));
  return login.tokens;
}

/** Rotates the refresh token. Concurrent callers share one request. Returns null when signed out. */
export function refreshTokens(): Promise<Tokens | null> {
  const current = tokens;
  if (!current) return Promise.resolve(null);
  if (!refreshing) {
    refreshing = doRefresh(current).finally(() => {
      refreshing = null;
    });
  }
  return refreshing;
}

/** An access token that is valid for at least the next 30 seconds, refreshing first if needed. */
export async function freshAccessToken(): Promise<string | null> {
  const t = tokens;
  if (!t) return null;
  if (!accessExpiresSoon(t)) return t.accessToken;
  const next = await refreshTokens();
  return next?.accessToken ?? null;
}
