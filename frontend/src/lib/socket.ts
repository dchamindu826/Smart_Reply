import { io, Socket } from 'socket.io-client';
import type { ClientToServerEvents, ServerToClientEvents } from '@smart-reply/shared';

export type AppSocket = Socket<ServerToClientEvents, ClientToServerEvents>;

/**
 * Live events. In production the socket shares the web app's origin (Nginx proxies
 * /socket.io). In development set NEXT_PUBLIC_SOCKET_URL=http://localhost:4000.
 * The httpOnly session cookie authenticates the connection.
 */
export function connectSocket(): AppSocket {
  const url = process.env.NEXT_PUBLIC_SOCKET_URL || undefined;
  return io(url ?? '', { path: '/socket.io', withCredentials: true, transports: ['websocket', 'polling'], reconnectionDelayMax: 10_000 });
}
