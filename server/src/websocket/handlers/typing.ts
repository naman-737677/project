import { ClientConnection } from '../connection.js';
import { connectionManager } from '../manager.js';
import {
  TypingStatusPayloadSchema,
  WsOutgoingEvent,
  UserTypingPayload,
  WsEnvelope,
} from '../../types/events.js';
import { redisPub, CHANNELS } from '../../redis/client.js';
import { checkParticipant } from '../../db/chatStore.js';

export async function handleTypingStatus(
  conn: ClientConnection,
  traceId: string,
  rawPayload: unknown
): Promise<void> {
  const parseResult = TypingStatusPayloadSchema.safeParse(rawPayload);
  if (!parseResult.success) {
    return;
  }

  const payload = parseResult.data;
  const userId = conn.user.userId;

  // Verify chat membership if not already subscribed
  if (!conn.subscribedChats.has(payload.chat_id)) {
    try {
      const isMember = await checkParticipant(payload.chat_id, userId);
      if (!isMember) {
        return;
      }
      conn.subscribeToChat(payload.chat_id);
    } catch {
      return;
    }
  }

  // Ephemeral broadcast via Redis Pub/Sub directly
  const envelope: WsEnvelope<UserTypingPayload> = {
    event: WsOutgoingEvent.USER_TYPING,
    trace_id: traceId,
    timestamp: Date.now(),
    data: {
      chat_id: payload.chat_id,
      user_id: userId,
      action: payload.is_typing ? payload.action : 'stopped',
    },
  };

  try {
    if (redisPub.status === 'ready') {
      await redisPub.publish(CHANNELS.chat(payload.chat_id), JSON.stringify(envelope));
    } else {
      // Local broadcast excluding the typing user
      connectionManager.broadcastToChat(payload.chat_id, envelope, (c) => c.user.userId !== userId);
    }
  } catch (err) {
    connectionManager.broadcastToChat(payload.chat_id, envelope, (c) => c.user.userId !== userId);
  }
}
