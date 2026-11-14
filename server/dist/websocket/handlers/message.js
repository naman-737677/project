"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.handleSendMessage = handleSendMessage;
const manager_js_1 = require("../manager.js");
const events_js_1 = require("../../types/events.js");
const client_js_1 = require("../../redis/client.js");
const chatStore_js_1 = require("../../db/chatStore.js");
async function handleSendMessage(conn, traceId, rawPayload) {
    const parseResult = events_js_1.SendMessagePayloadSchema.safeParse(rawPayload);
    if (!parseResult.success) {
        conn.sendError(traceId, `Invalid payload: ${parseResult.error.message}`, 'VALIDATION_ERROR');
        return;
    }
    const payload = parseResult.data;
    const userId = conn.user.userId;
    // 1. Idempotency Check
    const isNew = await (0, client_js_1.checkAndSetIdempotency)(userId, payload.client_msg_id);
    if (!isNew) {
        // Already processed or in-flight; fetch existing message to reply with ACK
        let existing = await (0, chatStore_js_1.findMessageByClientMsgId)(payload.chat_id, payload.client_msg_id);
        if (!existing) {
            // In-flight concurrent request: wait briefly and retry
            await new Promise((resolve) => setTimeout(resolve, 150));
            existing = await (0, chatStore_js_1.findMessageByClientMsgId)(payload.chat_id, payload.client_msg_id);
        }
        if (existing) {
            conn.send({
                event: events_js_1.WsOutgoingEvent.MESSAGE_ACK,
                trace_id: traceId,
                timestamp: Date.now(),
                data: {
                    client_msg_id: payload.client_msg_id,
                    message_id: existing.id,
                    chat_id: existing.chatId,
                    seq_id: existing.seqId.toString(),
                    server_timestamp: existing.createdAt.getTime(),
                    status: 'PERSISTED',
                },
            });
            return;
        }
        // In-flight deduplication: return QUEUED status without duplicating row
        conn.send({
            event: events_js_1.WsOutgoingEvent.MESSAGE_ACK,
            trace_id: traceId,
            timestamp: Date.now(),
            data: {
                client_msg_id: payload.client_msg_id,
                message_id: '',
                chat_id: payload.chat_id,
                seq_id: '0',
                server_timestamp: Date.now(),
                status: 'QUEUED',
            },
        });
        return;
    }
    try {
        // 2. Verify / ensure chat participation
        const participant = await (0, chatStore_js_1.checkParticipant)(payload.chat_id, userId);
        if (!participant) {
            await (0, client_js_1.clearIdempotency)(userId, payload.client_msg_id);
            conn.sendError(traceId, 'You are not a member of this chat', 'FORBIDDEN');
            return;
        }
        // Ensure connection is subscribed to this chat for incoming broadcasts
        if (!conn.subscribedChats.has(payload.chat_id)) {
            manager_js_1.connectionManager.subscribeToChat(conn, payload.chat_id);
        }
        // Validate reply_to_id if present
        if (payload.reply_to_id) {
            const replyTarget = await (0, chatStore_js_1.findMessageById)(payload.reply_to_id);
            if (!replyTarget || replyTarget.chatId !== payload.chat_id) {
                await (0, client_js_1.clearIdempotency)(userId, payload.client_msg_id);
                conn.sendError(traceId, 'Invalid reply_to_id: message does not exist in this chat', 'VALIDATION_ERROR');
                return;
            }
        }
        // 3. Atomically allocate next monotonic seq_id
        const nextSeq = await (0, chatStore_js_1.allocateNextSeq)(payload.chat_id);
        // 4. Persist (Message + Attachments + Sequence sync)
        const content = payload.content ?? (payload.e2ee_payload ? JSON.stringify(payload.e2ee_payload) : null);
        const message = await (0, chatStore_js_1.persistMessage)({
            chatId: payload.chat_id,
            senderId: userId,
            seqId: nextSeq,
            clientMsgId: payload.client_msg_id,
            type: payload.type,
            content,
            replyToId: payload.reply_to_id,
            attachments: payload.attachments,
        });
        // 5. Send Terminal ACK to the sender
        const ackEnvelope = {
            event: events_js_1.WsOutgoingEvent.MESSAGE_ACK,
            trace_id: traceId,
            timestamp: Date.now(),
            data: {
                client_msg_id: payload.client_msg_id,
                message_id: message.id,
                chat_id: message.chatId,
                seq_id: message.seqId.toString(),
                server_timestamp: message.createdAt.getTime(),
                status: 'PERSISTED',
            },
        };
        conn.send(ackEnvelope);
        // 6. Fan out NEW_MESSAGE to the Redis cluster channel / local connections for this chat
        const newMsgEnvelope = {
            event: events_js_1.WsOutgoingEvent.NEW_MESSAGE,
            trace_id: traceId,
            timestamp: Date.now(),
            data: {
                message_id: message.id,
                client_msg_id: message.clientMsgId,
                chat_id: message.chatId,
                sender_id: message.senderId,
                seq_id: message.seqId.toString(),
                type: message.type,
                content: message.content,
                reply_to_id: message.replyToId || null,
                attachments: message.attachments.map((a) => ({
                    id: a.id,
                    file_url: a.fileUrl,
                    thumbnail_url: a.thumbnailUrl || null,
                    file_name: a.fileName,
                    file_size: a.fileSize.toString(),
                    mime_type: a.mimeType,
                    width: a.width || null,
                    height: a.height || null,
                    duration: a.duration || null,
                })),
                e2ee_payload: payload.e2ee_payload,
                created_at: message.createdAt.toISOString(),
            },
        };
        try {
            if (client_js_1.redisPub.status === 'ready') {
                await client_js_1.redisPub.publish(client_js_1.CHANNELS.chat(message.chatId), JSON.stringify(newMsgEnvelope));
            }
            else {
                // Fallback to local broadcast when Redis is disconnected
                manager_js_1.connectionManager.broadcastToChat(message.chatId, newMsgEnvelope);
            }
        }
        catch (pubErr) {
            console.warn('[handleSendMessage] Redis publish failed, falling back to local broadcast:', pubErr.message);
            manager_js_1.connectionManager.broadcastToChat(message.chatId, newMsgEnvelope);
        }
        // Deliver directly to all active connections of participants of this chat
        const participantIds = (0, chatStore_js_1.getChatParticipantIds)(message.chatId);
        for (const pid of participantIds) {
            manager_js_1.connectionManager.sendToUser(pid, newMsgEnvelope);
        }
    }
    catch (error) {
        console.error('[handleSendMessage] Error persisting message:', error);
        await (0, client_js_1.clearIdempotency)(userId, payload.client_msg_id);
        conn.send({
            event: events_js_1.WsOutgoingEvent.MESSAGE_ACK,
            trace_id: traceId,
            timestamp: Date.now(),
            data: {
                client_msg_id: payload.client_msg_id,
                message_id: '',
                chat_id: payload.chat_id,
                seq_id: '0',
                server_timestamp: Date.now(),
                status: 'FAILED',
                error: 'Failed to persist message',
            },
        });
    }
}
