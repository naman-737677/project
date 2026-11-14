import { WebSocket } from 'ws';
import { WsEnvelope } from '../types/events.js';

export interface AuthenticatedUser {
  userId: string;
  username: string;
  deviceId: string;
}

export class ClientConnection {
  public readonly socket: WebSocket;
  public readonly user: AuthenticatedUser;
  public isAlive: boolean = true;
  public readonly subscribedChats: Set<string> = new Set();
  public readonly connectedAt: Date = new Date();

  constructor(socket: WebSocket, user: AuthenticatedUser) {
    this.socket = socket;
    this.user = user;
  }

  /**
   * Safely serialize and transmit a strongly typed envelope.
   */
  public send<T>(envelope: WsEnvelope<T>): boolean {
    if (this.socket.readyState !== WebSocket.OPEN) {
      return false;
    }

    try {
      this.socket.send(
        JSON.stringify(envelope, (_, value) =>
          typeof value === 'bigint' ? value.toString() : value
        )
      );
      return true;
    } catch (err) {
      console.error(`[WS] Send error to user ${this.user.userId}:`, err);
      return false;
    }
  }

  public sendError(traceId: string, message: string, code = 'BAD_REQUEST'): void {
    this.send({
      event: 'ERROR',
      trace_id: traceId,
      timestamp: Date.now(),
      data: { code, message },
    });
  }

  public subscribeToChat(chatId: string): void {
    this.subscribedChats.add(chatId);
  }

  public unsubscribeFromChat(chatId: string): void {
    this.subscribedChats.delete(chatId);
  }
}
