import { useQueryClient } from '@tanstack/react-query';
import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import { AppState } from 'react-native';
import { io, type Socket } from 'socket.io-client';
import { SOCKET_PATH, type ClientToServerEvents, type ServerToClientEvents } from '@smart-reply/shared';
import { endSession, freshAccessToken, getTokens, refreshTokens } from '@/auth/session';
import { getServer } from '@/lib/config';
import { useToast } from '@/ui/Toast';
import { cacheHandlers, refetchAfterReconnect } from './handlers';

export type AppSocket = Socket<ServerToClientEvents, ClientToServerEvents>;

interface SocketState {
  socket: AppSocket | null;
  connected: boolean;
  /** True once the first connection attempt has finished, so the offline banner does not flash at start. */
  settled: boolean;
}

const SocketContext = createContext<SocketState>({ socket: null, connected: false, settled: false });

export function useSocket(): SocketState {
  return useContext(SocketContext);
}

/** One Socket.IO connection while signed in. Events update the query cache; the app never polls. */
export function SocketProvider({ enabled, children }: { enabled: boolean; children: ReactNode }) {
  const qc = useQueryClient();
  const toast = useToast();
  const [state, setState] = useState<SocketState>({ socket: null, connected: false, settled: false });

  useEffect(() => {
    if (!enabled) return;
    const socket: AppSocket = io(getServer(), {
      path: SOCKET_PATH,
      transports: ['websocket'],
      reconnectionDelay: 1000,
      reconnectionDelayMax: 10_000,
      // Called before every (re)connect, so a reconnect always carries a valid token.
      auth: cb => {
        freshAccessToken()
          .then(token => cb({ token: token ?? '' }))
          .catch(() => cb({ token: getTokens()?.accessToken ?? '' }));
      }
    });

    let everConnected = false;
    let lastRevokeRetry = 0;

    socket.on('connect', () => {
      if (everConnected) refetchAfterReconnect(qc);
      everConnected = true;
      setState({ socket, connected: true, settled: true });
    });
    socket.on('disconnect', () => setState(s => ({ ...s, connected: false })));
    socket.on('connect_error', () => setState(s => ({ ...s, connected: false, settled: true })));

    const handlers = cacheHandlers(qc, toast);
    for (const [event, fn] of Object.entries(handlers)) {
      socket.on(event as keyof ServerToClientEvents, fn as (...args: unknown[]) => void);
    }

    // The server also sends this when the handshake token has expired; try one refresh first.
    socket.on('session.revoked', ({ reason }) => {
      const now = Date.now();
      if (now - lastRevokeRetry > 30_000) {
        lastRevokeRetry = now;
        void refreshTokens()
          .then(t => {
            if (t) socket.connect();
          })
          .catch(() => undefined);
        return;
      }
      void endSession(reason || 'You were signed out.');
    });

    const appState = AppState.addEventListener('change', s => {
      if (s === 'active' && !socket.connected) socket.connect();
    });

    setState({ socket, connected: false, settled: false });
    const settle = setTimeout(() => setState(s => ({ ...s, settled: true })), 4000);
    return () => {
      clearTimeout(settle);
      appState.remove();
      socket.removeAllListeners();
      socket.disconnect();
      setState({ socket: null, connected: false, settled: false });
    };
  }, [enabled, qc, toast]);

  return <SocketContext.Provider value={state}>{children}</SocketContext.Provider>;
}
