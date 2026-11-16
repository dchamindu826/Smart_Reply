'use client';

import React, { createContext, ReactNode, useCallback, useContext, useEffect, useMemo } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import type { LoginResponse, MeResponse } from '@smart-reply/shared';
import { api, ApiError, setSignedOutHandler } from '@/lib/api';
import { qk } from '@/lib/query';

interface SessionValue {
  me: MeResponse | null;
  loading: boolean;
  login: (email: string, password: string) => Promise<MeResponse>;
  logout: () => Promise<void>;
  refreshMe: () => Promise<void>;
  setMe: (me: MeResponse) => void;
}

const SessionContext = createContext<SessionValue | undefined>(undefined);

export function SessionProvider({ children }: { children: ReactNode }) {
  const qc = useQueryClient();
  const meQuery = useQuery({
    queryKey: qk.me,
    queryFn: async () => {
      try {
        return await api.get<MeResponse>('/me');
      } catch (err) {
        if (err instanceof ApiError && (err.status === 401 || err.status === 403)) return null;
        throw err;
      }
    },
    staleTime: 60_000
  });

  /** Drop every cached query except the session itself, so its observer keeps working. */
  const resetCache = useCallback(() => {
    qc.removeQueries({ predicate: q => q.queryKey[0] !== qk.me[0] });
  }, [qc]);

  const signedOut = useCallback(() => {
    resetCache();
    qc.setQueryData(qk.me, null);
  }, [qc, resetCache]);

  useEffect(() => {
    setSignedOutHandler(signedOut);
  }, [signedOut]);

  const value = useMemo<SessionValue>(
    () => ({
      me: meQuery.data ?? null,
      loading: meQuery.isLoading,
      login: async (email, password) => {
        const res = await api.post<LoginResponse>('/auth/login', { email, password, client: 'web' });
        resetCache();
        qc.setQueryData(qk.me, res.me);
        return res.me;
      },
      logout: async () => {
        await api.post('/auth/logout').catch(() => undefined);
        signedOut();
      },
      refreshMe: async () => {
        await qc.invalidateQueries({ queryKey: qk.me });
      },
      setMe: me => {
        resetCache();
        qc.setQueryData(qk.me, me);
      }
    }),
    [meQuery.data, meQuery.isLoading, qc, signedOut, resetCache]
  );

  return <SessionContext.Provider value={value}>{children}</SessionContext.Provider>;
}

export function useSession(): SessionValue {
  const ctx = useContext(SessionContext);
  if (!ctx) throw new Error('useSession must be used within SessionProvider');
  return ctx;
}
