import {
  WsIncomingEvent,
  WsOutgoingEvent,
  WsEnvelope,
} from '../types';

export type ConnectionState = 'DISCONNECTED' | 'CONNECTING' | 'CONNECTED' | 'RECONNECTING';

export type EventListener = (envelope: WsEnvelope) => void;
export type StateListener = (state: ConnectionState) => void;

class WebSocketClient {
  private ws: WebSocket | null = null;
  private url: string = '';
  private token: string = '';
  private deviceId: string = '';
  private state: ConnectionState = 'DISCONNECTED';
  private listeners: Map<string, Set<EventListener>> = new Map();
  private stateListeners: Set<StateListener> = new Set();
  private heartbeatTimer: any = null;
  private reconnectTimer: any = null;
  private reconnectAttempts: number = 0;
  private maxReconnectAttempts: number = 10;
  private isExplicitlyClosed: boolean = false;
  private eventLog: Array<{ direction: 'IN' | 'OUT'; envelope: WsEnvelope; time: number }> = [];
  private logListeners: Set<(log: { direction: 'IN' | 'OUT'; envelope: WsEnvelope; time: number }) => void> = new Set();

  public getState(): ConnectionState {
    return this.state;
  }

  public getLogs() {
    return this.eventLog;
  }

  public onLog(cb: (log: { direction: 'IN' | 'OUT'; envelope: WsEnvelope; time: number }) => void) {
    this.logListeners.add(cb);
    return () => {
      this.logListeners.delete(cb);
    };
  }

  public onStateChange(listener: StateListener): () => void {
    this.stateListeners.add(listener);
    listener(this.state);
    return () => {
      this.stateListeners.delete(listener);
    };
  }

  private setState(newState: ConnectionState) {
    if (this.state !== newState) {
      this.state = newState;
      this.stateListeners.forEach((listener) => listener(newState));
    }
  }

  public on(event: string, listener: EventListener): () => void {
    if (!this.listeners.has(event)) {
      this.listeners.set(event, new Set());
    }
    this.listeners.get(event)!.add(listener);

    return () => {
      this.listeners.get(event)?.delete(listener);
    };
  }

  public connect(url: string, token: string, deviceId: string = 'browser-client') {
    this.url = url;
    this.token = token;
    this.deviceId = deviceId;
    this.isExplicitlyClosed = false;

    if (this.ws) {
      this.ws.close();
      this.ws = null;
    }

    this.setState(this.reconnectAttempts > 0 ? 'RECONNECTING' : 'CONNECTING');

    try {
      const fullUrl = `${this.url}?token=${encodeURIComponent(token)}&device_id=${encodeURIComponent(deviceId)}`;
      this.ws = new WebSocket(fullUrl);

      this.ws.onopen = () => {
        console.log('[WS] Connected to Telegram Gateway');
        this.setState('CONNECTED');
        this.reconnectAttempts = 0;
        this.startHeartbeat();
      };

      this.ws.onmessage = (event) => {
        try {
          const envelope: WsEnvelope = JSON.parse(event.data);
          this.logEvent('IN', envelope);

          // Dispatch to specific event listeners
          const handlers = this.listeners.get(envelope.event);
          if (handlers) {
            handlers.forEach((h) => h(envelope));
          }

          // Dispatch to catch-all '*' listeners
          const wildcardHandlers = this.listeners.get('*');
          if (wildcardHandlers) {
            wildcardHandlers.forEach((h) => h(envelope));
          }
        } catch (err) {
          console.error('[WS] Failed to parse message frame:', err, event.data);
        }
      };

      this.ws.onerror = (err) => {
        console.error('[WS Error]', err);
      };

      this.ws.onclose = (event) => {
        console.warn(`[WS Closed] code=${event.code}, reason=${event.reason}`);
        this.stopHeartbeat();
        this.ws = null;

        if (!this.isExplicitlyClosed) {
          this.setState('DISCONNECTED');
          this.scheduleReconnect();
        } else {
          this.setState('DISCONNECTED');
        }
      };
    } catch (err) {
      console.error('[WS Connection Error]', err);
      this.setState('DISCONNECTED');
      this.scheduleReconnect();
    }
  }

  public disconnect() {
    this.isExplicitlyClosed = true;
    this.stopHeartbeat();
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
    if (this.ws) {
      this.ws.close();
      this.ws = null;
    }
    this.setState('DISCONNECTED');
  }

  private scheduleReconnect() {
    if (this.reconnectAttempts >= this.maxReconnectAttempts) {
      console.error('[WS] Max reconnect attempts reached.');
      return;
    }

    const backoffMs = Math.min(1000 * Math.pow(1.5, this.reconnectAttempts), 15000);
    this.reconnectAttempts++;
    console.log(`[WS] Reconnecting in ${Math.round(backoffMs)}ms (Attempt ${this.reconnectAttempts})`);

    this.reconnectTimer = setTimeout(() => {
      if (!this.isExplicitlyClosed && this.url && this.token) {
        this.connect(this.url, this.token, this.deviceId);
      }
    }, backoffMs);
  }

  private startHeartbeat() {
    this.stopHeartbeat();
    this.heartbeatTimer = setInterval(() => {
      if (this.state === 'CONNECTED' && this.ws?.readyState === WebSocket.OPEN) {
        this.send(WsIncomingEvent.HEARTBEAT, {
          client_time: Date.now(),
        });
      }
    }, 25000);
  }

  private stopHeartbeat() {
    if (this.heartbeatTimer) {
      clearInterval(this.heartbeatTimer);
      this.heartbeatTimer = null;
    }
  }

  public send<T = any>(event: WsIncomingEvent | string, data: T, traceId?: string): string {
    const trace_id = traceId || `tr_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
    const envelope: WsEnvelope<T> = {
      event,
      trace_id,
      timestamp: Date.now(),
      data,
    };

    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify(envelope));
      this.logEvent('OUT', envelope);
    } else {
      console.warn(`[WS Send] Cannot send event ${event}, socket not open. State: ${this.state}`);
    }

    return trace_id;
  }

  private logEvent(direction: 'IN' | 'OUT', envelope: WsEnvelope) {
    const entry = { direction, envelope, time: Date.now() };
    this.eventLog.unshift(entry);
    if (this.eventLog.length > 100) {
      this.eventLog.pop();
    }
    this.logListeners.forEach((cb) => cb(entry));
  }
}

export const wsClient = new WebSocketClient();
