"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.connectionManager = exports.ConnectionManager = void 0;
const client_js_1 = require("../redis/client.js");
class ConnectionManager {
    // Map of userId -> Set of ClientConnections (supporting multiple tabs / devices)
    userSockets = new Map();
    // Map of chatId -> Set of local ClientConnections subscribed to this chat
    chatSubscribers = new Map();
    /**
     * Register a new authenticated client connection.
     */
    register(conn) {
        const userId = conn.user.userId;
        if (!this.userSockets.has(userId)) {
            this.userSockets.set(userId, new Set());
            // First connection for this user on this node: subscribe to user-specific channel
            if (client_js_1.redisSub.status === 'ready') {
                client_js_1.redisSub.subscribe(client_js_1.CHANNELS.user(userId)).catch((err) => {
                    console.error(`[RedisSub] Failed to subscribe to user ${userId}:`, err);
                });
            }
        }
        this.userSockets.get(userId).add(conn);
        console.log(`[Manager] User ${userId} (${conn.user.username}) registered on device ${conn.user.deviceId}. Active connections: ${this.userSockets.get(userId).size}`);
    }
    /**
     * Unregister an existing client connection.
     */
    unregister(conn) {
        const userId = conn.user.userId;
        const sockets = this.userSockets.get(userId);
        if (sockets) {
            sockets.delete(conn);
            if (sockets.size === 0) {
                this.userSockets.delete(userId);
                // Unsubscribe from user channel on Redis
                if (client_js_1.redisSub.status === 'ready') {
                    client_js_1.redisSub.unsubscribe(client_js_1.CHANNELS.user(userId)).catch((err) => {
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
    subscribeToChat(conn, chatId) {
        conn.subscribeToChat(chatId);
        if (!this.chatSubscribers.has(chatId)) {
            this.chatSubscribers.set(chatId, new Set());
            // Subscribe this server instance to the Redis chat channel
            if (client_js_1.redisSub.status === 'ready') {
                client_js_1.redisSub.subscribe(client_js_1.CHANNELS.chat(chatId)).catch((err) => {
                    console.error(`[RedisSub] Failed to subscribe to chat ${chatId}:`, err);
                });
            }
        }
        this.chatSubscribers.get(chatId).add(conn);
    }
    /**
     * Unsubscribe a connection from a chat.
     */
    unsubscribeFromChat(conn, chatId) {
        conn.unsubscribeFromChat(chatId);
        const subscribers = this.chatSubscribers.get(chatId);
        if (subscribers) {
            subscribers.delete(conn);
            if (subscribers.size === 0) {
                this.chatSubscribers.delete(chatId);
                if (client_js_1.redisSub.status === 'ready') {
                    client_js_1.redisSub.unsubscribe(client_js_1.CHANNELS.chat(chatId)).catch((err) => {
                        console.error(`[RedisSub] Failed to unsubscribe from chat ${chatId}:`, err);
                    });
                }
            }
        }
    }
    /**
     * Send an envelope to all local active sessions of a specific user.
     */
    sendToUser(userId, envelope) {
        const sockets = this.userSockets.get(userId);
        if (!sockets)
            return;
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
    broadcastToChat(chatId, envelope, filterOrExclude) {
        const subscribers = this.chatSubscribers.get(chatId);
        if (!subscribers)
            return;
        for (const conn of subscribers) {
            if (typeof filterOrExclude === 'function') {
                if (!filterOrExclude(conn))
                    continue;
            }
            else if (filterOrExclude && conn === filterOrExclude) {
                continue;
            }
            conn.send(envelope);
        }
    }
    /**
     * Get all active connections for heartbeat ping-sweep.
     */
    getAllConnections() {
        const all = [];
        for (const sockets of this.userSockets.values()) {
            for (const conn of sockets) {
                all.push(conn);
            }
        }
        return all;
    }
    hasUserConnections(userId) {
        return (this.userSockets.get(userId)?.size ?? 0) > 0;
    }
}
exports.ConnectionManager = ConnectionManager;
exports.connectionManager = new ConnectionManager();
