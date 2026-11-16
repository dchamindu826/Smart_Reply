import { SignJWT, jwtVerify } from 'jose';
import { env } from '../config';

const secret = new TextEncoder().encode(env.JWT_SECRET);

export interface AccessClaims {
  sub: string;
  tv: number;
  imp: string | null;
  cl: 'web' | 'mobile';
}

export async function signAccessToken(claims: AccessClaims): Promise<{ token: string; expiresAt: Date }> {
  const expiresAt = new Date(Date.now() + env.ACCESS_TOKEN_MINUTES * 60_000);
  const token = await new SignJWT({ tv: claims.tv, imp: claims.imp, cl: claims.cl })
    .setProtectedHeader({ alg: 'HS256' })
    .setSubject(claims.sub)
    .setIssuedAt()
    .setExpirationTime(Math.floor(expiresAt.getTime() / 1000))
    .setIssuer('smart-reply')
    .sign(secret);
  return { token, expiresAt };
}

export async function verifyAccessToken(token: string): Promise<AccessClaims | null> {
  try {
    const { payload } = await jwtVerify(token, secret, { issuer: 'smart-reply', algorithms: ['HS256'] });
    if (typeof payload.sub !== 'string') return null;
    return {
      sub: payload.sub,
      tv: Number(payload.tv ?? 0),
      imp: typeof payload.imp === 'string' ? payload.imp : null,
      cl: payload.cl === 'mobile' ? 'mobile' : 'web'
    };
  } catch {
    return null;
  }
}

export const ACCESS_COOKIE = 'sr_at';
export const REFRESH_COOKIE = 'sr_rt';
