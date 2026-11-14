import { z } from 'zod';

export enum WsIncomingEvent {
  SEND_MESSAGE = 'SEND_MESSAGE',
  TYPING_STATUS = 'TYPING_STATUS',
  READ_RECEIPT = 'READ_RECEIPT',
  HEARTBEAT = 'HEARTBEAT',
  SYNC_REQUEST = 'SYNC_REQUEST',
  CALL_SIGNAL = 'CALL_SIGNAL',
}

export enum WsOutgoingEvent {
  MESSAGE_ACK = 'MESSAGE_ACK',
  NEW_MESSAGE = 'NEW_MESSAGE',
  USER_TYPING = 'USER_TYPING',
  PARTICIPANT_READ = 'PARTICIPANT_READ',
  HEARTBEAT_ACK = 'HEARTBEAT_ACK',
  USER_PRESENCE = 'USER_PRESENCE',
  SYNC_RESPONSE = 'SYNC_RESPONSE',
  CALL_SIGNAL = 'CALL_SIGNAL',
  ERROR = 'ERROR',
}

export interface WsEnvelope<T> {
  event: string;
  trace_id: string;
  timestamp: number;
  data: T;
}

// ----------------------------------------------------------------------
// Payload Schemas (Zod validation for inbound traffic)
// ----------------------------------------------------------------------

export const SendMessagePayloadSchema = z.object({
  client_msg_id: z.string().min(1).max(64),
  chat_id: z.string().uuid(),
  type: z.enum(['TEXT', 'IMAGE', 'VIDEO', 'AUDIO', 'FILE', 'LOCATION', 'SYSTEM']).default('TEXT'),
  content: z.string().max(4096).optional(),
  reply_to_id: z.string().uuid().optional().nullable(),
  attachments: z.array(z.object({
    file_url: z.string().min(1),
    thumbnail_url: z.string().optional().nullable(),
    file_name: z.string().max(255),
    file_size: z.union([z.number().int().nonnegative(), z.string().transform(Number)]),
    mime_type: z.string().max(128),
    width: z.number().int().optional().nullable(),
    height: z.number().int().optional().nullable(),
    duration: z.number().int().optional().nullable(),
  })).optional().default([]),
  e2ee_payload: z.object({
    ratchet_key: z.string(),
    counter: z.number().int(),
    ciphertext: z.string(),
    tag: z.string(),
  }).optional(),
}).refine(
  (data) => (data.content && data.content.trim().length > 0) || (data.attachments && data.attachments.length > 0) || !!data.e2ee_payload,
  { message: 'Message must have content, attachments, or an e2ee payload' }
);

export type SendMessagePayload = z.infer<typeof SendMessagePayloadSchema>;

export const TypingStatusPayloadSchema = z.object({
  chat_id: z.string().uuid(),
  is_typing: z.boolean(),
  action: z.enum(['typing', 'uploading_photo', 'recording_voice']).default('typing'),
});

export type TypingStatusPayload = z.infer<typeof TypingStatusPayloadSchema>;

export const ReadReceiptPayloadSchema = z.object({
  chat_id: z.string().uuid(),
  max_seq_id: z.coerce.bigint().min(1n),
});

export type ReadReceiptPayload = z.infer<typeof ReadReceiptPayloadSchema>;

export const SyncRequestPayloadSchema = z.object({
  chat_id: z.string().uuid(),
  last_synced_seq: z.coerce.bigint().min(0n),
  limit: z.number().int().min(1).max(200).default(50),
});

export type SyncRequestPayload = z.infer<typeof SyncRequestPayloadSchema>;

export const HeartbeatPayloadSchema = z.object({
  client_time: z.number().int(),
});

export type HeartbeatPayload = z.infer<typeof HeartbeatPayloadSchema>;

// ----------------------------------------------------------------------
// Outbound Payload Types
// ----------------------------------------------------------------------

export interface MessageAckPayload {
  client_msg_id: string;
  message_id: string;
  chat_id: string;
  seq_id: string; // Serialized string for BigInt safety
  server_timestamp: number;
  status: 'PERSISTED' | 'QUEUED' | 'FAILED';
  error?: string;
}

export interface NewMessagePayload {
  message_id: string;
  client_msg_id?: string | null;
  chat_id: string;
  sender_id: string | null;
  seq_id: string;
  type: string;
  content: string | null;
  reply_to_id: string | null;
  attachments: Array<{
    id: string;
    file_url: string;
    thumbnail_url: string | null;
    file_name: string;
    file_size: string;
    mime_type: string;
    width: number | null;
    height: number | null;
    duration: number | null;
  }>;
  e2ee_payload?: {
    ratchet_key: string;
    counter: number;
    ciphertext: string;
    tag: string;
  };
  created_at: string;
}

export interface UserTypingPayload {
  chat_id: string;
  user_id: string;
  action: string;
}

export interface ParticipantReadPayload {
  chat_id: string;
  user_id: string;
  max_seq_id: string;
  read_at: number;
}

export interface UserPresencePayload {
  user_id: string;
  status: 'ONLINE' | 'OFFLINE' | 'AWAY';
  last_seen_at: number;
}

export const CallSignalPayloadSchema = z.object({
  target_user_id: z.string(),
  signal_type: z.enum([
    'OFFER',
    'ANSWER',
    'ICE_CANDIDATE',
    'RINGING',
    'REJECT',
    'END',
    'BUSY',
    'TIMEOUT',
  ]),
  call_id: z.string(),
  call_type: z.enum(['AUDIO', 'VIDEO']).default('AUDIO'),
  sdp: z.any().optional(),
  candidate: z.any().optional(),
  caller_info: z.object({
    user_id: z.string(),
    username: z.string(),
    display_name: z.string(),
  }).optional(),
  chat_id: z.string().optional(),
  reason: z.string().optional(),
});

export type CallSignalPayload = z.infer<typeof CallSignalPayloadSchema>;

