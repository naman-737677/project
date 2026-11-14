import { ClientConnection } from './connection.js';
import { redisSub, CHANNELS } from '../redis/client.js';
import { WsEnvelope } from '../types/events.js';

export class ConnectionManager {
  // Map of userId -> Set of ClientConnections (supporting multiple tabs / devices)
  private userSockets: Map<string, Set<ClientConnection>> = new Map();
  // Map of chatId -> Set of local ClientConnections subscribed to this chat
  private chatSubscribers: Map<string, Set<ClientConnection>> = new Map();

  /**
   * Register a new authenticated client connection.
   */
  public register(conn: ClientConnection): void {
    const userId = conn.user.userId;
    if (!this.userSockets.has(userId)) {
      this.userSockets.set(userId, new Set());
      // First connection for this user on this node: subscribe to user-specific channel
      if (redisSub.status === 'ready') {
        redisSub.subscribe(CHANNELS.user(userId)).catch((err) => {
          console.error(`[RedisSub] Failed to subscribe to user ${userId}:`, err);
        });
      }
    }
    this.userSockets.get(userId)!.add(conn);
    console.log(`[Manager] User ${userId} (${conn.user.username}) registered on device ${conn.user.deviceId}. Active connections: ${this.userSockets.get(userId)!.size}`);
  }

  /**
   * Unregister an existing client connection.
   */
  public unregister(conn: ClientConnection): void {
    const userId = conn.user.userId;
    const sockets = this.userSockets.get(userId);
    if (sockets) {
      sockets.delete(conn);
      if (sockets.size === 0) {
        this.userSockets.delete(userId);
        // Unsubscribe from user channel on Redis
        if (redisSub.status === 'ready') {
          redisSub.unsubscribe(CHANNELS.user(userId)).catch((err) => {
            console.error(`[RedisSub] Failed to unsubscribe from user ${userId}:`, err);
          });
        }
      }
    }

    // Unregister from all subscribed chats (copy to array to avoid mutating set while iterating)
    const chats = Array.from(conn.subscribedChats);
    for (const chatId of chats) {
      this.unsubscribeFromChat(conn, chatId);
    }

    console.log(`[Manager] User ${userId} disconnected. Remaining on node: ${this.userSockets.get(userId)?.size ?? 0}`);
  }

  /**
   * Subscribe a local connection to a chat.
   */
  public subscribeToChat(conn: ClientConnection, chatId: string): void {
    conn.subscribeToChat(chatId);

    if (!this.chatSubscribers.has(chatId)) {
      this.chatSubscribers.set(chatId, new Set());
      // Subscribe this server instance to the Redis chat channel
      if (redisSub.status === 'ready') {
        redisSub.subscribe(CHANNELS.chat(chatId)).catch((err) => {
          console.error(`[RedisSub] Failed to subscribe to chat ${chatId}:`, err);
        });
      }
    }

    this.chatSubscribers.get(chatId)!.add(conn);
  }

  /**
   * Unsubscribe a connection from a chat.
   */
  public unsubscribeFromChat(conn: ClientConnection, chatId: string): void {
    conn.unsubscribeFromChat(chatId);

    const subscribers = this.chatSubscribers.get(chatId);
    if (subscribers) {
      subscribers.delete(conn);
      if (subscribers.size === 0) {
        this.chatSubscribers.delete(chatId);
        if (redisSub.status === 'ready') {
          redisSub.unsubscribe(CHANNELS.chat(chatId)).catch((err) => {
            console.error(`[RedisSub] Failed to unsubscribe from chat ${chatId}:`, err);
          });
        }
      }
    }
  }

  /**
   * Send an envelope to all local active sessions of a specific user.
   */
  public sendToUser<T>(userId: string, envelope: WsEnvelope<T>): void {
    const sockets = this.userSockets.get(userId);
    if (!sockets) return;

    for (const conn of sockets) {
      conn.send(envelope);
    }
  }

  /**
   * Broadcast an envelope to all local clients subscribed to a chat.
   * If `filterOrExclude` is provided:
   * - if a function: only connections returning true receive the envelope
   * - if a ClientConnection: that connection is skipped (e.g. echo suppression)
   */
  public broadcastToChat<T>(
    chatId: string,
    envelope: WsEnvelope<T>,
    filterOrExclude?: ClientConnection | ((conn: ClientConnection) => boolean)
  ): void {
    const subscribers = this.chatSubscribers.get(chatId);
    if (!subscribers) return;

    for (const conn of subscribers) {
      if (typeof filterOrExclude === 'function') {
        if (!filterOrExclude(conn)) continue;
      } else if (filterOrExclude && conn === filterOrExclude) {
        continue;
      }
      conn.send(envelope);
    }
  }

  /**
   * Get all active connections for heartbeat ping-sweep.
   */
  public getAllConnections(): ClientConnection[] {
    const all: ClientConnection[] = [];
    for (const sockets of this.userSockets.values()) {
      for (const conn of sockets) {
        all.push(conn);
      }
    }
    return all;
  }

  public hasUserConnections(userId: string): boolean {
    return (this.userSockets.get(userId)?.size ?? 0) > 0;
  }
}

export const connectionManager = new ConnectionManager();
