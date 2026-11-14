"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.handleReadReceipt = handleReadReceipt;
const manager_js_1 = require("../manager.js");
const events_js_1 = require("../../types/events.js");
const client_js_1 = require("../../redis/client.js");
const chatStore_js_1 = require("../../db/chatStore.js");
async function handleReadReceipt(conn, traceId, rawPayload) {
    const parseResult = events_js_1.ReadReceiptPayloadSchema.safeParse(rawPayload);
    if (!parseResult.success) {
        conn.sendError(traceId, `Invalid receipt payload: ${parseResult.error.message}`, 'VALIDATION_ERROR');
        return;
    }
    const payload = parseResult.data;
    const userId = conn.user.userId;
    try {
        const participant = await (0, chatStore_js_1.checkParticipant)(payload.chat_id, userId);
        if (!participant) {
            conn.sendError(traceId, 'You are not a member of this chat', 'FORBIDDEN');
            return;
        }
        // Advance the read cursor watermark only if new max_seq_id is greater
        if (payload.max_seq_id > participant.lastReadSeqId) {
            await (0, chatStore_js_1.updateParticipantReadWatermark)(payload.chat_id, userId, payload.max_seq_id);
            // Broadcast the read event to other participants
            const envelope = {
                event: events_js_1.WsOutgoingEvent.PARTICIPANT_READ,
                trace_id: traceId,
                timestamp: Date.now(),
                data: {
                    chat_id: payload.chat_id,
                    user_id: userId,
                    max_seq_id: payload.max_seq_id.toString(),
                    read_at: Date.now(),
                },
            };
            try {
                if (client_js_1.redisPub.status === 'ready') {
                    await client_js_1.redisPub.publish(client_js_1.CHANNELS.chat(payload.chat_id), JSON.stringify(envelope));
                }
                else {
                    manager_js_1.connectionManager.broadcastToChat(payload.chat_id, envelope);
                }
            }
            catch (pubErr) {
                console.warn('[handleReadReceipt] Redis publish failed, falling back to local broadcast:', pubErr.message);
                manager_js_1.connectionManager.broadcastToChat(payload.chat_id, envelope);
            }
        }
    }
    catch (error) {
        console.error('[handleReadReceipt] Error updating read watermark:', error);
    }
}
