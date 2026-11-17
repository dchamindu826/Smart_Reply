import { importPKCS8, SignJWT } from 'jose';
import { env } from '../config';
import { logger } from '../infra/logger';

/**
 * Firebase Cloud Messaging HTTP v1, for the Flutter app (Android and iOS).
 * Set FCM_SERVICE_ACCOUNT_JSON to the service account key of the Firebase project
 * (Firebase console → Project settings → Service accounts → Generate new private key), as one line.
 */
interface ServiceAccount {
  project_id: string;
  client_email: string;
  private_key: string;
}

let account: ServiceAccount | null | undefined;
let cached: { token: string; expiresAt: number } | null = null;

function serviceAccount(): ServiceAccount | null {
  if (account !== undefined) return account;
  try {
    account = env.FCM_SERVICE_ACCOUNT_JSON ? (JSON.parse(env.FCM_SERVICE_ACCOUNT_JSON) as ServiceAccount) : null;
  } catch {
    logger.error('FCM_SERVICE_ACCOUNT_JSON is not valid JSON');
    account = null;
  }
  return account;
}

export function fcmConfigured(): boolean {
  return serviceAccount() !== null;
}

async function accessToken(sa: ServiceAccount): Promise<string> {
  if (cached && cached.expiresAt > Date.now() + 60_000) return cached.token;
  const key = await importPKCS8(sa.private_key, 'RS256');
  const now = Math.floor(Date.now() / 1000);
  const assertion = await new SignJWT({ scope: 'https://www.googleapis.com/auth/firebase.messaging' })
    .setProtectedHeader({ alg: 'RS256', typ: 'JWT' })
    .setIssuer(sa.client_email)
    .setSubject(sa.client_email)
    .setAudience('https://oauth2.googleapis.com/token')
    .setIssuedAt(now)
    .setExpirationTime(now + 3600)
    .sign(key);
  const res = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer', assertion }),
    signal: AbortSignal.timeout(15_000)
  });
  const data = (await res.json().catch(() => ({}))) as { access_token?: string; expires_in?: number };
  if (!res.ok || !data.access_token) throw new Error(`FCM token request failed (${res.status})`);
  cached = { token: data.access_token, expiresAt: Date.now() + (data.expires_in ?? 3600) * 1000 };
  return data.access_token;
}

/** Sends one push. Returns 'unregistered' when the device token is dead and should be deleted. */
export async function sendFcm(
  token: string,
  msg: { title: string; body: string; data: Record<string, string>; channel: 'messages' | 'calls' }
): Promise<'ok' | 'unregistered'> {
  const sa = serviceAccount();
  if (!sa) return 'ok';
  const res = await fetch(`https://fcm.googleapis.com/v1/projects/${sa.project_id}/messages:send`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${await accessToken(sa)}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      message: {
        token,
        notification: { title: msg.title, body: msg.body },
        data: msg.data,
        android: { priority: 'HIGH', notification: { channel_id: msg.channel, sound: 'default' } },
        apns: { payload: { aps: { sound: 'default' } } }
      }
    }),
    signal: AbortSignal.timeout(15_000)
  });
  if (res.ok) return 'ok';
  const text = await res.text();
  if (res.status === 404 || text.includes('UNREGISTERED')) return 'unregistered';
  throw new Error(`FCM send failed (${res.status})`);
}
