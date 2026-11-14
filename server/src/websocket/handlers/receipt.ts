import { ClientConnection } from '../connection.js';
import { connectionManager } from '../manager.js';
import {
  ReadReceiptPayloadSchema,
  WsOutgoingEvent,
  ParticipantReadPayload,
  WsEnvelope,
} from '../../types/events.js';
import { redisPub, CHANNELS } from '../../redis/client.js';
import { checkParticipant, updateParticipantReadWatermark } from '../../db/chatStore.js';

export async function handleReadReceipt(
  conn: ClientConnection,
  traceId: string,
  rawPayload: unknown
): Promise<void> {
  const parseResult = ReadReceiptPayloadSchema.safeParse(rawPayload);
  if (!parseResult.success) {
    conn.sendError(traceId, `Invalid receipt payload: ${parseResult.error.message}`, 'VALIDATION_ERROR');
    return;
  }

  const payload = parseResult.data;
  const userId = conn.user.userId;

  try {
    const participant = await checkParticipant(payload.chat_id, userId);

    if (!participant) {
      conn.sendError(traceId, 'You are not a member of this chat', 'FORBIDDEN');
      return;
    }

    // Advance the read cursor watermark only if new max_seq_id is greater
    if (payload.max_seq_id > participant.lastReadSeqId) {
      await updateParticipantReadWatermark(payload.chat_id, userId, payload.max_seq_id);

      // Broadcast the read event to other participants
      const envelope: WsEnvelope<ParticipantReadPayload> = {
        event: WsOutgoingEvent.PARTICIPANT_READ,
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
        if (redisPub.status === 'ready') {
          await redisPub.publish(CHANNELS.chat(payload.chat_id), JSON.stringify(envelope));
        } else {
          connectionManager.broadcastToChat(payload.chat_id, envelope);
        }
      } catch (pubErr) {
        console.warn('[handleReadReceipt] Redis publish failed, falling back to local broadcast:', (pubErr as Error).message);
        connectionManager.broadcastToChat(payload.chat_id, envelope);
      }
    }
  } catch (error) {
    console.error('[handleReadReceipt] Error updating read watermark:', error);
  }
}
