import { redisSub } from '../redis/client.js';
import { connectionManager } from './manager.js';
import { WsEnvelope, WsOutgoingEvent } from '../types/events.js';

export function initPubSubDispatcher(): void {
  redisSub.on('message', (channel: string, message: string) => {
    try {
      const envelope: WsEnvelope<any> = JSON.parse(message);

      if (channel.startsWith('pubsub:chat:')) {
        const chatId = channel.replace('pubsub:chat:', '');
        // Fan out to local sockets listening to this chat
        if (envelope.event === WsOutgoingEvent.USER_TYPING && envelope.data?.user_id) {
          // Suppress typing echo back to the user who is typing
          connectionManager.broadcastToChat(chatId, envelope, (conn) => conn.user.userId !== envelope.data.user_id);
        } else {
          connectionManager.broadcastToChat(chatId, envelope);
        }
      } else if (channel.startsWith('pubsub:user:')) {
        const userId = channel.replace('pubsub:user:', '');
        // Fan out to all local device sessions for this user
        connectionManager.sendToUser(userId, envelope);
      }
    } catch (err) {
      console.error(`[PubSub Dispatcher] Failed to parse message from channel ${channel}:`, err);
    }
  });

  console.log('[PubSub Dispatcher] Initialized and listening for distributed events.');
}
