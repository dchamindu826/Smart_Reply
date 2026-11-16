import { OnGatewayConnection, WebSocketGateway, WebSocketServer } from '@nestjs/websockets';
import { parse as parseCookie } from 'cookie';
import type { Server, Socket } from 'socket.io';
import type { ClientToServerEvents, ServerToClientEvents } from '@smart-reply/shared';
import { SessionLoader } from '../../common/session-loader';
import { ACCESS_COOKIE, verifyAccessToken } from '../../common/tokens';
import { logger } from '../../infra/logger';
import { rooms } from '../../infra/realtime';

/**
 * One Socket.IO connection per signed-in client. The server decides the rooms from the
 * session; a client cannot join a room by asking.
 */
@WebSocketGateway({ path: '/socket.io', cors: { origin: true, credentials: true } })
export class RealtimeGateway implements OnGatewayConnection {
  @WebSocketServer() server!: Server<ClientToServerEvents, ServerToClientEvents>;

  constructor(private readonly sessions: SessionLoader) {}

  async handleConnection(socket: Socket): Promise<void> {
    try {
      const fromAuth = typeof socket.handshake.auth?.token === 'string' ? (socket.handshake.auth.token as string) : null;
      const cookies = parseCookie(socket.handshake.headers.cookie ?? '');
      const token = fromAuth ?? cookies[ACCESS_COOKIE] ?? null;
      const claims = token ? await verifyAccessToken(token) : null;
      if (!claims) {
        socket.emit('session.revoked', { reason: 'Sign in again.' });
        socket.disconnect(true);
        return;
      }
      const s = await this.sessions.load(claims);
      const join = [rooms.user(s.userId)];
      if (s.role === 'system_admin' && !s.companyId) join.push(rooms.admins());
      if (s.companyId) {
        join.push(rooms.company(s.companyId));
        if (s.role === 'manager') join.push(rooms.managers(s.companyId));
        if (s.role === 'manager' || s.permissions.seeAllChats) join.push(`company:${s.companyId}:allchats`);
      }
      await socket.join(join);
      socket.data.userId = s.userId;
      socket.data.companyId = s.companyId;
    } catch (err) {
      logger.debug({ err }, 'Socket rejected');
      socket.emit('session.revoked', { reason: 'Sign in again.' });
      socket.disconnect(true);
    }
  }
}
