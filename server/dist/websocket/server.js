"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.initWebSocketServer = initWebSocketServer;
const ws_1 = require("ws");
const jsonwebtoken_1 = __importDefault(require("jsonwebtoken"));
const index_js_1 = require("../config/index.js");
const connection_js_1 = require("./connection.js");
const manager_js_1 = require("./manager.js");
const events_js_1 = require("../types/events.js");
const message_js_1 = require("./handlers/message.js");
const typing_js_1 = require("./handlers/typing.js");
const receipt_js_1 = require("./handlers/receipt.js");
const presence_js_1 = require("./handlers/presence.js");
const sync_js_1 = require("./handlers/sync.js");
const call_js_1 = require("./handlers/call.js");
const client_js_1 = require("../redis/client.js");
function initWebSocketServer(server) {
    const wss = new ws_1.WebSocketServer({
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
    server.on('upgrade', (request, socket, head) => {
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
            const decoded = jsonwebtoken_1.default.verify(token, index_js_1.config.jwtSecret);
            if (!decoded || !decoded.userId || !decoded.username) {
                socket.write('HTTP/1.1 401 Unauthorized\r\n\r\n');
                socket.destroy();
                return;
            }
            const authUser = {
                userId: decoded.userId,
                username: decoded.username,
                deviceId: decoded.deviceId || deviceId,
            };
            wss.handleUpgrade(request, socket, head, (ws) => {
                wss.emit('connection', ws, request, authUser);
            });
        }
        catch (err) {
            console.warn('[WS Auth] Authentication failed:', err.message);
            socket.write('HTTP/1.1 401 Unauthorized\r\n\r\n');
            socket.destroy();
        }
    });
    // ----------------------------------------------------------------------
    // 2. Connection Lifecycle
    // ----------------------------------------------------------------------
    wss.on('connection', async (ws, request, authUser) => {
        const conn = new connection_js_1.ClientConnection(ws, authUser);
        manager_js_1.connectionManager.register(conn);
        await (0, client_js_1.setUserOnline)(authUser.userId);
        // Broadcast ONLINE presence to other clients
        const onlinePresenceEnv = {
            event: events_js_1.WsOutgoingEvent.USER_PRESENCE,
            trace_id: 'pres_' + Date.now(),
            timestamp: Date.now(),
            data: {
                user_id: authUser.userId,
                status: 'ONLINE',
                last_seen_at: Date.now(),
            },
        };
        for (const c of manager_js_1.connectionManager.getAllConnections()) {
            if (c.user.userId !== authUser.userId) {
                c.send(onlinePresenceEnv);
            }
        }
        // Native ping-pong response
        ws.on('pong', () => {
            conn.isAlive = true;
        });
        // Inbound frame router
        ws.on('message', async (data) => {
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
                    case events_js_1.WsIncomingEvent.SEND_MESSAGE:
                        await (0, message_js_1.handleSendMessage)(conn, trace_id, payload);
                        break;
                    case events_js_1.WsIncomingEvent.TYPING_STATUS:
                        await (0, typing_js_1.handleTypingStatus)(conn, trace_id, payload);
                        break;
                    case events_js_1.WsIncomingEvent.READ_RECEIPT:
                        await (0, receipt_js_1.handleReadReceipt)(conn, trace_id, payload);
                        break;
                    case events_js_1.WsIncomingEvent.HEARTBEAT:
                        await (0, presence_js_1.handleHeartbeat)(conn, trace_id, payload);
                        break;
                    case events_js_1.WsIncomingEvent.SYNC_REQUEST:
                        await (0, sync_js_1.handleSyncRequest)(conn, trace_id, payload);
                        break;
                    case events_js_1.WsIncomingEvent.CALL_SIGNAL:
                        await (0, call_js_1.handleCallSignal)(conn, trace_id, payload);
                        break;
                    default:
                        conn.sendError(trace_id, `Unknown event type: ${event}`);
                }
            }
            catch (err) {
                console.error('[WS Message Handler] Error processing message:', err);
                conn.sendError('unknown', 'Malformed JSON payload');
            }
        });
        ws.on('close', async () => {
            manager_js_1.connectionManager.unregister(conn);
            if (!manager_js_1.connectionManager.hasUserConnections(authUser.userId)) {
                await (0, client_js_1.setUserOffline)(authUser.userId);
                const offlinePresenceEnv = {
                    event: events_js_1.WsOutgoingEvent.USER_PRESENCE,
                    trace_id: 'pres_' + Date.now(),
                    timestamp: Date.now(),
                    data: {
                        user_id: authUser.userId,
                        status: 'OFFLINE',
                        last_seen_at: Date.now(),
                    },
                };
                for (const c of manager_js_1.connectionManager.getAllConnections()) {
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
        const connections = manager_js_1.connectionManager.getAllConnections();
        for (const conn of connections) {
            if (!conn.isAlive) {
                console.warn(`[Watchdog] Terminating unresponsive connection for user ${conn.user.userId}`);
                conn.socket.terminate();
                continue;
            }
            conn.isAlive = false;
            conn.socket.ping();
        }
    }, index_js_1.config.wsHeartbeatIntervalMs);
    wss.on('close', () => {
        clearInterval(interval);
    });
    console.log('[WebSocket Server] Initialized on path /ws');
    return wss;
}
