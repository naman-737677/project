"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.CallSignalPayloadSchema = exports.HeartbeatPayloadSchema = exports.SyncRequestPayloadSchema = exports.ReadReceiptPayloadSchema = exports.TypingStatusPayloadSchema = exports.SendMessagePayloadSchema = exports.WsOutgoingEvent = exports.WsIncomingEvent = void 0;
const zod_1 = require("zod");
var WsIncomingEvent;
(function (WsIncomingEvent) {
    WsIncomingEvent["SEND_MESSAGE"] = "SEND_MESSAGE";
    WsIncomingEvent["TYPING_STATUS"] = "TYPING_STATUS";
    WsIncomingEvent["READ_RECEIPT"] = "READ_RECEIPT";
    WsIncomingEvent["HEARTBEAT"] = "HEARTBEAT";
    WsIncomingEvent["SYNC_REQUEST"] = "SYNC_REQUEST";
    WsIncomingEvent["CALL_SIGNAL"] = "CALL_SIGNAL";
})(WsIncomingEvent || (exports.WsIncomingEvent = WsIncomingEvent = {}));
var WsOutgoingEvent;
(function (WsOutgoingEvent) {
    WsOutgoingEvent["MESSAGE_ACK"] = "MESSAGE_ACK";
    WsOutgoingEvent["NEW_MESSAGE"] = "NEW_MESSAGE";
    WsOutgoingEvent["USER_TYPING"] = "USER_TYPING";
    WsOutgoingEvent["PARTICIPANT_READ"] = "PARTICIPANT_READ";
    WsOutgoingEvent["HEARTBEAT_ACK"] = "HEARTBEAT_ACK";
    WsOutgoingEvent["USER_PRESENCE"] = "USER_PRESENCE";
    WsOutgoingEvent["SYNC_RESPONSE"] = "SYNC_RESPONSE";
    WsOutgoingEvent["CALL_SIGNAL"] = "CALL_SIGNAL";
    WsOutgoingEvent["ERROR"] = "ERROR";
})(WsOutgoingEvent || (exports.WsOutgoingEvent = WsOutgoingEvent = {}));
// ----------------------------------------------------------------------
// Payload Schemas (Zod validation for inbound traffic)
// ----------------------------------------------------------------------
exports.SendMessagePayloadSchema = zod_1.z.object({
    client_msg_id: zod_1.z.string().min(1).max(64),
    chat_id: zod_1.z.string().uuid(),
    type: zod_1.z.enum(['TEXT', 'IMAGE', 'VIDEO', 'AUDIO', 'FILE', 'LOCATION', 'SYSTEM']).default('TEXT'),
    content: zod_1.z.string().max(4096).optional(),
    reply_to_id: zod_1.z.string().uuid().optional().nullable(),
    attachments: zod_1.z.array(zod_1.z.object({
        file_url: zod_1.z.string().min(1),
        thumbnail_url: zod_1.z.string().optional().nullable(),
        file_name: zod_1.z.string().max(255),
        file_size: zod_1.z.union([zod_1.z.number().int().nonnegative(), zod_1.z.string().transform(Number)]),
        mime_type: zod_1.z.string().max(128),
        width: zod_1.z.number().int().optional().nullable(),
        height: zod_1.z.number().int().optional().nullable(),
        duration: zod_1.z.number().int().optional().nullable(),
    })).optional().default([]),
    e2ee_payload: zod_1.z.object({
        ratchet_key: zod_1.z.string(),
        counter: zod_1.z.number().int(),
        ciphertext: zod_1.z.string(),
        tag: zod_1.z.string(),
    }).optional(),
}).refine((data) => (data.content && data.content.trim().length > 0) || (data.attachments && data.attachments.length > 0) || !!data.e2ee_payload, { message: 'Message must have content, attachments, or an e2ee payload' });
exports.TypingStatusPayloadSchema = zod_1.z.object({
    chat_id: zod_1.z.string().uuid(),
    is_typing: zod_1.z.boolean(),
    action: zod_1.z.enum(['typing', 'uploading_photo', 'recording_voice']).default('typing'),
});
exports.ReadReceiptPayloadSchema = zod_1.z.object({
    chat_id: zod_1.z.string().uuid(),
    max_seq_id: zod_1.z.coerce.bigint().min(1n),
});
exports.SyncRequestPayloadSchema = zod_1.z.object({
    chat_id: zod_1.z.string().uuid(),
    last_synced_seq: zod_1.z.coerce.bigint().min(0n),
    limit: zod_1.z.number().int().min(1).max(200).default(50),
});
exports.HeartbeatPayloadSchema = zod_1.z.object({
    client_time: zod_1.z.number().int(),
});
exports.CallSignalPayloadSchema = zod_1.z.object({
    target_user_id: zod_1.z.string(),
    signal_type: zod_1.z.enum([
        'OFFER',
        'ANSWER',
        'ICE_CANDIDATE',
        'RINGING',
        'REJECT',
        'END',
        'BUSY',
        'TIMEOUT',
    ]),
    call_id: zod_1.z.string(),
    call_type: zod_1.z.enum(['AUDIO', 'VIDEO']).default('AUDIO'),
    sdp: zod_1.z.any().optional(),
    candidate: zod_1.z.any().optional(),
    caller_info: zod_1.z.object({
        user_id: zod_1.z.string(),
        username: zod_1.z.string(),
        display_name: zod_1.z.string(),
    }).optional(),
    chat_id: zod_1.z.string().optional(),
    reason: zod_1.z.string().optional(),
});
