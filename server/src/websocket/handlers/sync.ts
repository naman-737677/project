import { ClientConnection } from '../connection.js';
import {
  SyncRequestPayloadSchema,
  WsOutgoingEvent,
  WsEnvelope,
  NewMessagePayload,
} from '../../types/events.js';
import { connectionManager } from '../manager.js';
import { checkParticipant, getMissedMessages } from '../../db/chatStore.js';

export async function handleSyncRequest(
  conn: ClientConnection,
  traceId: string,
  rawPayload: unknown
): Promise<void> {
  const parseResult = SyncRequestPayloadSchema.safeParse(rawPayload);
  if (!parseResult.success) {
    conn.sendError(traceId, `Invalid sync request: ${parseResult.error.message}`, 'VALIDATION_ERROR');
    return;
  }

  const { chat_id, last_synced_seq, limit } = parseResult.data;
  const userId = conn.user.userId;

  try {
    // 1. Ensure caller is a participant / auto-join
    const participant = await checkParticipant(chat_id, userId);

    if (!participant) {
      conn.sendError(traceId, 'Unauthorized for chat synchronization', 'FORBIDDEN');
      return;
    }

    // 2. Automatically register this connection for real-time updates for this chat
    connectionManager.subscribeToChat(conn, chat_id);

    // 3. Query for missed messages
    const { messages: missedMessages, hasMore } = await getMissedMessages(chat_id, last_synced_seq, limit);

    const formattedMessages: NewMessagePayload[] = missedMessages.map((m) => ({
      message_id: m.id,
      client_msg_id: m.clientMsgId || null,
      chat_id: m.chatId,
      sender_id: m.senderId,
      seq_id: m.seqId.toString(),
      type: m.type,
      content: m.content,
      reply_to_id: m.replyToId || null,
      attachments: m.attachments.map((a) => ({
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
      created_at: m.createdAt.toISOString(),
    }));

    const envelope: WsEnvelope<{ chat_id: string; messages: NewMessagePayload[]; has_more: boolean }> = {
      event: WsOutgoingEvent.SYNC_RESPONSE,
      trace_id: traceId,
      timestamp: Date.now(),
      data: {
        chat_id,
        messages: formattedMessages,
        has_more: hasMore,
      },
    };

    conn.send(envelope);
  } catch (err) {
    console.error('[handleSyncRequest] Error synchronizing chat messages:', err);
    conn.sendError(traceId, 'Failed to sync messages', 'INTERNAL_SERVER_ERROR');
  }
}
