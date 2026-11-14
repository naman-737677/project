import { ClientConnection } from '../connection.js';
import { connectionManager } from '../manager.js';
import {
  CallSignalPayloadSchema,
  WsOutgoingEvent,
  CallSignalPayload,
  WsEnvelope,
} from '../../types/events.js';
import { redisPub, CHANNELS } from '../../redis/client.js';

export async function handleCallSignal(
  conn: ClientConnection,
  traceId: string,
  rawPayload: unknown
): Promise<void> {
  const parseResult = CallSignalPayloadSchema.safeParse(rawPayload);
  if (!parseResult.success) {
    conn.sendError(traceId, `Invalid call signal payload: ${parseResult.error.message}`, 'VALIDATION_ERROR');
    return;
  }

  const payload = parseResult.data;
  const callerUser = conn.user;

  // Enrich caller_info to prevent identity spoofing
  const enrichedPayload: CallSignalPayload = {
    ...payload,
    caller_info: {
      user_id: callerUser.userId,
      username: callerUser.username,
      display_name: callerUser.username,
    },
  };

  const envelope: WsEnvelope<CallSignalPayload> = {
    event: WsOutgoingEvent.CALL_SIGNAL,
    trace_id: traceId,
    timestamp: Date.now(),
    data: enrichedPayload,
  };

  const targetHasConnections = connectionManager.hasUserConnections(payload.target_user_id);

  // If this is an OFFER and target is not connected anywhere locally or in Redis, notify caller
  if (payload.signal_type === 'OFFER' && !targetHasConnections && redisPub.status !== 'ready') {
    conn.send<CallSignalPayload>({
      event: WsOutgoingEvent.CALL_SIGNAL,
      trace_id: traceId,
      timestamp: Date.now(),
      data: {
        ...enrichedPayload,
        signal_type: 'REJECT',
        reason: 'Friend is currently offline',
      },
    });
    return;
  }

  // Deliver envelope to target user's local connection(s)
  connectionManager.sendToUser(payload.target_user_id, envelope);

  // Publish to Redis distributed user channel if active
  if (redisPub.status === 'ready') {
    try {
      await redisPub.publish(CHANNELS.user(payload.target_user_id), JSON.stringify(envelope));
    } catch (err) {
      console.warn('[CallSignal] Redis pub error:', err);
    }
  }
}
