import { useQueryClient } from '@tanstack/react-query';
import * as Device from 'expo-device';
import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { Platform } from 'react-native';
import type { LoginResponse } from '@smart-reply/shared';
import { qk } from '@/features/keys';
import { request } from '@/lib/api';
import { loadServer, saveServer } from '@/lib/config';
import { ApiError } from '@/lib/errors';
import { unregisterPush } from '@/push/push';
import { getTokens, loadTokens, onSessionEnded, onSessionRefreshed, setTokens } from './session';

export type AuthStatus = 'loading' | 'signedOut' | 'signedIn';

interface AuthContextValue {
  status: AuthStatus;
  /** Why the last session ended on its own (revoked, expired), shown on the sign-in screen. */
  endedReason: string | null;
  signIn: (email: string, password: string, server: string) => Promise<void>;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth outside AuthProvider');
  return ctx;
}

function deviceName(): string {
  const model = Device.modelName ?? Device.deviceName ?? 'Phone';
  return `Smart Reply ${Platform.OS === 'ios' ? 'iOS' : 'Android'} · ${model}`.slice(0, 120);
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const qc = useQueryClient();
  const [status, setStatus] = useState<AuthStatus>('loading');
  const [endedReason, setEndedReason] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    void (async () => {
      await loadServer();
      const t = await loadTokens();
      if (alive) setStatus(t ? 'signedIn' : 'signedOut');
    })();
    const offEnded = onSessionEnded(reason => {
      qc.clear();
      setEndedReason(reason);
      setStatus('signedOut');
    });
    const offRefreshed = onSessionRefreshed(me => qc.setQueryData(qk.me, me));
    return () => {
      alive = false;
      offEnded();
      offRefreshed();
    };
  }, [qc]);

  const signIn = useCallback(
    async (email: string, password: string, server: string) => {
      await saveServer(server);
      const res = await request<LoginResponse>('POST', '/auth/login', {
        auth: false,
        body: { email: email.trim().toLowerCase(), password, client: 'mobile', device: deviceName() }
      });
      if (!res.tokens) throw new ApiError('INTERNAL', 'The server did not return a mobile session. Update the server.', 0);
      if (!res.me.company) {
        await request<void>('POST', '/auth/logout', { auth: false, body: { refreshToken: res.tokens.refreshToken } }).catch(() => undefined);
        throw new ApiError('FORBIDDEN', 'The system admin console is on the web. Sign in with a company account.', 403);
      }
      await setTokens(res.tokens);
      qc.clear();
      qc.setQueryData(qk.me, res.me);
      setEndedReason(null);
      setStatus('signedIn');
    },
    [qc]
  );

  const signOut = useCallback(async () => {
    const t = getTokens();
    await unregisterPush().catch(() => undefined);
    if (t) await request<void>('POST', '/auth/logout', { auth: false, body: { refreshToken: t.refreshToken } }).catch(() => undefined);
    await setTokens(null);
    qc.clear();
    setEndedReason(null);
    setStatus('signedOut');
  }, [qc]);

  const value = useMemo(() => ({ status, endedReason, signIn, signOut }), [status, endedReason, signIn, signOut]);
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}
