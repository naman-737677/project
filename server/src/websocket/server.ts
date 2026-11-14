import { IncomingMessage, Server } from 'http';
import { WebSocketServer, WebSocket } from 'ws';
import jwt from 'jsonwebtoken';
import { config } from '../config/index.js';
import { ClientConnection, AuthenticatedUser } from './connection.js';
import { connectionManager } from './manager.js';
import { WsIncomingEvent, WsOutgoingEvent } from '../types/events.js';
import { handleSendMessage } from './handlers/message.js';
import { handleTypingStatus } from './handlers/typing.js';
import { handleReadReceipt } from './handlers/receipt.js';
import { handleHeartbeat } from './handlers/presence.js';
import { handleSyncRequest } from './handlers/sync.js';
import { handleCallSignal } from './handlers/call.js';
import { setUserOffline, setUserOnline } from '../redis/client.js';

interface JwtPayload {
  userId: string;
  username: string;
  deviceId?: string;
}

export function initWebSocketServer(server: Server): WebSocketServer {
  const wss = new WebSocketServer({
    noServer: true,
    handleProtocols: (protocols) => {
      // Echo back the requested protocol so browser clients using Sec-WebSocket-Protocol auth don't fail handshake
      const [first] = protocols;
      return first || false;
    },
  });

  // ----------------------------------------------------------------------
  // 1. HTTP Upgrade & Auth Verification
  // ----------------------------------------------------------------------
  server.on('upgrade', (request: IncomingMessage, socket, head) => {
    const host = request.headers.host || 'localhost';
    const parsedUrl = new URL(request.url || '', `http://${host}`);

    if (parsedUrl.pathname !== '/ws') {
      socket.write('HTTP/1.1 404 Not Found\r\n\r\n');
      socket.destroy();
      return;
    }

    // Extract token from query params, Authorization header, or Sec-WebSocket-Protocol
    const authHeader = request.headers['authorization'];
    const bearerToken = authHeader?.startsWith('Bearer ') ? authHeader.slice(7) : authHeader;
    const protocolHeader = request.headers['sec-websocket-protocol'];
    const protocolToken = typeof protocolHeader === 'string'
      ? protocolHeader.split(',')[0].trim()
      : undefined;

    const token = parsedUrl.searchParams.get('token') || bearerToken || protocolToken || '';
    const deviceId = parsedUrl.searchParams.get('device_id') || 'default-browser';

    if (!token) {
      socket.write('HTTP/1.1 401 Unauthorized\r\n\r\n');
      socket.destroy();
      return;
    }

    try {
      const decoded = jwt.verify(token, config.jwtSecret) as JwtPayload;
      if (!decoded || !decoded.userId || !decoded.username) {
        socket.write('HTTP/1.1 401 Unauthorized\r\n\r\n');
        socket.destroy();
        return;
      }

      const authUser: AuthenticatedUser = {
        userId: decoded.userId,
        username: decoded.username,
        deviceId: decoded.deviceId || deviceId,
      };

      wss.handleUpgrade(request, socket, head, (ws) => {
        wss.emit('connection', ws, request, authUser);
      });
    } catch (err) {
      console.warn('[WS Auth] Authentication failed:', (err as Error).message);
      socket.write('HTTP/1.1 401 Unauthorized\r\n\r\n');
      socket.destroy();
    }
  });

  // ----------------------------------------------------------------------
  // 2. Connection Lifecycle
  // ----------------------------------------------------------------------
  wss.on('connection', async (ws: WebSocket, request: IncomingMessage, authUser: AuthenticatedUser) => {
    const conn = new ClientConnection(ws, authUser);
    connectionManager.register(conn);
    await setUserOnline(authUser.userId);

    // Broadcast ONLINE presence to other clients
    const onlinePresenceEnv = {
      event: WsOutgoingEvent.USER_PRESENCE,
      trace_id: 'pres_' + Date.now(),
      timestamp: Date.now(),
      data: {
        user_id: authUser.userId,
        status: 'ONLINE' as const,
        last_seen_at: Date.now(),
      },
    };
    for (const c of connectionManager.getAllConnections()) {
      if (c.user.userId !== authUser.userId) {
        c.send(onlinePresenceEnv);
      }
    }

    // Native ping-pong response
    ws.on('pong', () => {
      conn.isAlive = true;
    });

    // Inbound frame router
    ws.on('message', async (data: Buffer | string) => {
      try {
        const text = data.toString('utf-8');
        const envelope = JSON.parse(text);

        if (!envelope || typeof envelope !== 'object') {
          conn.sendError('unknown', 'Malformed envelope: expected JSON object');
          return;
        }

        const { event, trace_id, data: payload } = envelope;
        if (!event || !trace_id) {
          conn.sendError(trace_id || 'unknown', 'Invalid envelope structure: missing event or trace_id');
          return;
        }

        switch (event) {
          case WsIncomingEvent.SEND_MESSAGE:
            await handleSendMessage(conn, trace_id, payload);
            break;

          case WsIncomingEvent.TYPING_STATUS:
            await handleTypingStatus(conn, trace_id, payload);
            break;

          case WsIncomingEvent.READ_RECEIPT:
            await handleReadReceipt(conn, trace_id, payload);
            break;

          case WsIncomingEvent.HEARTBEAT:
            await handleHeartbeat(conn, trace_id, payload);
            break;

          case WsIncomingEvent.SYNC_REQUEST:
            await handleSyncRequest(conn, trace_id, payload);
            break;

          case WsIncomingEvent.CALL_SIGNAL:
            await handleCallSignal(conn, trace_id, payload);
            break;

          default:
            conn.sendError(trace_id, `Unknown event type: ${event}`);
        }
      } catch (err) {
        console.error('[WS Message Handler] Error processing message:', err);
        conn.sendError('unknown', 'Malformed JSON payload');
      }
    });

    ws.on('close', async () => {
      connectionManager.unregister(conn);
      if (!connectionManager.hasUserConnections(authUser.userId)) {
        await setUserOffline(authUser.userId);
        const offlinePresenceEnv = {
          event: WsOutgoingEvent.USER_PRESENCE,
          trace_id: 'pres_' + Date.now(),
          timestamp: Date.now(),
          data: {
            user_id: authUser.userId,
            status: 'OFFLINE' as const,
            last_seen_at: Date.now(),
          },
        };
        for (const c of connectionManager.getAllConnections()) {
          c.send(offlinePresenceEnv);
        }
      }
    });

    ws.on('error', (err) => {
      console.error(`[WS Error] Socket error for user ${authUser.userId}:`, err);
    });
  });

  // ----------------------------------------------------------------------
  // 3. Heartbeat Watchdog (Zombie Connection Detector)
  // ----------------------------------------------------------------------
  const interval = setInterval(() => {
    const connections = connectionManager.getAllConnections();
    for (const conn of connections) {
      if (!conn.isAlive) {
        console.warn(`[Watchdog] Terminating unresponsive connection for user ${conn.user.userId}`);
        conn.socket.terminate();
        continue;
      }

      conn.isAlive = false;
      conn.socket.ping();
    }
  }, config.wsHeartbeatIntervalMs);

  wss.on('close', () => {
    clearInterval(interval);
  });

  console.log('[WebSocket Server] Initialized on path /ws');
  return wss;
}
