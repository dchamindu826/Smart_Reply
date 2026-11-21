import { connect, constants, ClientHttp2Session } from 'node:http2';
import { importPKCS8, SignJWT } from 'jose';
import { env } from '../config';
import { logger } from '../infra/logger';

/**
 * Apple VoIP pushes (PushKit) for incoming calls on iOS. Firebase cannot send these, so the API
 * talks to Apple directly over HTTP/2 with the team's APNs auth key (.p8).
 * Set APNS_KEY_ID, APNS_TEAM_ID and APNS_KEY_P8_BASE64 (`base64 -w0 AuthKey_XXXX.p8`).
 */
let key: Awaited<ReturnType<typeof importPKCS8>> | null | undefined;
let jwt: { token: string; at: number } | null = null;
let session: ClientHttp2Session | null = null;

export function apnsConfigured(): boolean {
  return Boolean(env.APNS_KEY_ID && env.APNS_TEAM_ID && env.APNS_KEY_P8_BASE64);
}

async function bearer(): Promise<string | null> {
  if (!apnsConfigured()) return null;
  // Apple wants a token newer than an hour and refreshed no more than every 20 minutes.
  if (jwt && Date.now() - jwt.at < 40 * 60_000) return jwt.token;
  if (key === undefined) {
    try {
      key = await importPKCS8(Buffer.from(env.APNS_KEY_P8_BASE64, 'base64').toString('utf8').trim(), 'ES256');
    } catch {
      logger.error('APNS_KEY_P8_BASE64 is not a valid .p8 key');
      key = null;
    }
  }
  if (!key) return null;
  const token = await new SignJWT({})
    .setProtectedHeader({ alg: 'ES256', kid: env.APNS_KEY_ID })
    .setIssuer(env.APNS_TEAM_ID)
    .setIssuedAt()
    .sign(key);
  jwt = { token, at: Date.now() };
  return token;
}

function client(): ClientHttp2Session {
  if (session && !session.closed && !session.destroyed) return session;
  const host = env.APNS_SANDBOX ? 'https://api.sandbox.push.apple.com' : 'https://api.push.apple.com';
  const s = connect(host);
  s.on('error', err => logger.warn({ err: err.message }, 'APNs connection error'));
  s.on('close', () => {
    if (session === s) session = null;
  });
  // Let the process exit while the connection is idle.
  s.unref();
  session = s;
  return s;
}

/** Sends one VoIP push. Returns 'unregistered' when Apple says the token is dead. */
export async function sendVoip(deviceToken: string, payload: Record<string, unknown>): Promise<'ok' | 'unregistered'> {
  const token = await bearer();
  if (!token) return 'ok';
  const body = JSON.stringify({ aps: {}, ...payload });
  return new Promise((resolve, reject) => {
    const req = client().request({
      [constants.HTTP2_HEADER_METHOD]: 'POST',
      [constants.HTTP2_HEADER_PATH]: `/3/device/${deviceToken}`,
      authorization: `bearer ${token}`,
      'apns-topic': `${env.APNS_BUNDLE_ID}.voip`,
      'apns-push-type': 'voip',
      'apns-priority': '10',
      'apns-expiration': String(Math.floor(Date.now() / 1000) + 40),
      'content-type': 'application/json'
    });
    let status = 0;
    let text = '';
    req.setTimeout(15_000, () => req.close(constants.NGHTTP2_CANCEL));
    req.on('response', h => (status = Number(h[constants.HTTP2_HEADER_STATUS] ?? 0)));
    req.setEncoding('utf8');
    req.on('data', d => (text += d));
    req.on('end', () => {
      if (status === 200) return resolve('ok');
      if (status === 410 || text.includes('BadDeviceToken') || text.includes('Unregistered')) return resolve('unregistered');
      reject(new Error(`APNs VoIP push failed (${status}) ${text.slice(0, 120)}`));
    });
    req.on('error', reject);
    req.end(body);
  });
}
