"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.handleTypingStatus = handleTypingStatus;
const manager_js_1 = require("../manager.js");
const events_js_1 = require("../../types/events.js");
const client_js_1 = require("../../redis/client.js");
const chatStore_js_1 = require("../../db/chatStore.js");
async function handleTypingStatus(conn, traceId, rawPayload) {
    const parseResult = events_js_1.TypingStatusPayloadSchema.safeParse(rawPayload);
    if (!parseResult.success) {
        return;
    }
    const payload = parseResult.data;
    const userId = conn.user.userId;
    // Verify chat membership if not already subscribed
    if (!conn.subscribedChats.has(payload.chat_id)) {
        try {
            const isMember = await (0, chatStore_js_1.checkParticipant)(payload.chat_id, userId);
            if (!isMember) {
                return;
            }
            conn.subscribeToChat(payload.chat_id);
        }
        catch {
            return;
        }
    }
    // Ephemeral broadcast via Redis Pub/Sub directly
    const envelope = {
        event: events_js_1.WsOutgoingEvent.USER_TYPING,
        trace_id: traceId,
        timestamp: Date.now(),
        data: {
            chat_id: payload.chat_id,
            user_id: userId,
            action: payload.is_typing ? payload.action : 'stopped',
        },
    };
    try {
        if (client_js_1.redisPub.status === 'ready') {
            await client_js_1.redisPub.publish(client_js_1.CHANNELS.chat(payload.chat_id), JSON.stringify(envelope));
        }
        else {
            // Local broadcast excluding the typing user
            manager_js_1.connectionManager.broadcastToChat(payload.chat_id, envelope, (c) => c.user.userId !== userId);
        }
    }
    catch (err) {
        manager_js_1.connectionManager.broadcastToChat(payload.chat_id, envelope, (c) => c.user.userId !== userId);
    }
}
