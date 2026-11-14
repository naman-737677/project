"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.handleHeartbeat = handleHeartbeat;
const events_js_1 = require("../../types/events.js");
const client_js_1 = require("../../redis/client.js");
async function handleHeartbeat(conn, traceId, rawPayload) {
    const parseResult = events_js_1.HeartbeatPayloadSchema.safeParse(rawPayload);
    if (!parseResult.success) {
        return;
    }
    // Refresh watchdog
    conn.isAlive = true;
    // Extend online presence TTL in Redis
    await (0, client_js_1.setUserOnline)(conn.user.userId);
    // Return server timestamp ACK
    const envelope = {
        event: events_js_1.WsOutgoingEvent.HEARTBEAT_ACK,
        trace_id: traceId,
        timestamp: Date.now(),
        data: {
            server_time: Date.now(),
        },
    };
    conn.send(envelope);
}
