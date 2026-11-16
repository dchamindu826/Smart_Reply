import { getServer } from './config';
import { getTokens } from '@/auth/session';

const LOOPBACK = /^(https?:\/\/)(localhost|127\.0\.0\.1|0\.0\.0\.0)(:\d+)?/i;

/**
 * Makes a URL from the API reachable from the phone:
 * relative paths get the server prefix, and a loopback host (the API's own idea of its
 * address in local development) is swapped for the server the app talks to.
 */
export function reachableUrl(url: string, server: string = getServer()): string {
  if (!url) return url;
  if (url.startsWith('/')) return `${server}${url}`;
  if (LOOPBACK.test(url) && !LOOPBACK.test(server)) return url.replace(LOOPBACK, server);
  return url;
}

export function isOwnServer(url: string, server: string = getServer()): boolean {
  return url.startsWith(server);
}

export interface RemoteSource {
  uri: string;
  headers?: Record<string, string>;
}

/** An image or audio source. API-served files that are not pre-signed get the access token. */
export function mediaSource(url: string): RemoteSource {
  const uri = reachableUrl(url);
  const signed = /[?&](sig|X-Amz-Signature)=/i.test(uri);
  const token = getTokens()?.accessToken;
  if (!signed && token && isOwnServer(uri)) {
    return { uri, headers: { Authorization: `Bearer ${token}`, 'x-sr-client': 'mobile' } };
  }
  return { uri };
}
