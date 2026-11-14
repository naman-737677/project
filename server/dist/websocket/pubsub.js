"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.initPubSubDispatcher = initPubSubDispatcher;
const client_js_1 = require("../redis/client.js");
const manager_js_1 = require("./manager.js");
const events_js_1 = require("../types/events.js");
function initPubSubDispatcher() {
    client_js_1.redisSub.on('message', (channel, message) => {
        try {
            const envelope = JSON.parse(message);
            if (channel.startsWith('pubsub:chat:')) {
                const chatId = channel.replace('pubsub:chat:', '');
                // Fan out to local sockets listening to this chat
                if (envelope.event === events_js_1.WsOutgoingEvent.USER_TYPING && envelope.data?.user_id) {
                    // Suppress typing echo back to the user who is typing
                    manager_js_1.connectionManager.broadcastToChat(chatId, envelope, (conn) => conn.user.userId !== envelope.data.user_id);
                }
                else {
                    manager_js_1.connectionManager.broadcastToChat(chatId, envelope);
                }
            }
            else if (channel.startsWith('pubsub:user:')) {
                const userId = channel.replace('pubsub:user:', '');
                // Fan out to all local device sessions for this user
                manager_js_1.connectionManager.sendToUser(userId, envelope);
            }
        }
        catch (err) {
            console.error(`[PubSub Dispatcher] Failed to parse message from channel ${channel}:`, err);
        }
    });
    console.log('[PubSub Dispatcher] Initialized and listening for distributed events.');
}
