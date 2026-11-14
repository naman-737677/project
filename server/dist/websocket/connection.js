"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.ClientConnection = void 0;
const ws_1 = require("ws");
class ClientConnection {
    socket;
    user;
    isAlive = true;
    subscribedChats = new Set();
    connectedAt = new Date();
    constructor(socket, user) {
        this.socket = socket;
        this.user = user;
    }
    /**
     * Safely serialize and transmit a strongly typed envelope.
     */
    send(envelope) {
        if (this.socket.readyState !== ws_1.WebSocket.OPEN) {
            return false;
        }
        try {
            this.socket.send(JSON.stringify(envelope, (_, value) => typeof value === 'bigint' ? value.toString() : value));
            return true;
        }
        catch (err) {
            console.error(`[WS] Send error to user ${this.user.userId}:`, err);
            return false;
        }
    }
    sendError(traceId, message, code = 'BAD_REQUEST') {
        this.send({
            event: 'ERROR',
            trace_id: traceId,
            timestamp: Date.now(),
            data: { code, message },
        });
    }
    subscribeToChat(chatId) {
        this.subscribedChats.add(chatId);
    }
    unsubscribeFromChat(chatId) {
        this.subscribedChats.delete(chatId);
    }
}
exports.ClientConnection = ClientConnection;
