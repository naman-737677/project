import { ClientConnection } from '../connection.js';
import {
  HeartbeatPayloadSchema,
  WsOutgoingEvent,
  WsEnvelope,
} from '../../types/events.js';
import { setUserOnline } from '../../redis/client.js';

export async function handleHeartbeat(
  conn: ClientConnection,
  traceId: string,
  rawPayload: unknown
): Promise<void> {
  const parseResult = HeartbeatPayloadSchema.safeParse(rawPayload);
  if (!parseResult.success) {
    return;
  }

  // Refresh watchdog
  conn.isAlive = true;

  // Extend online presence TTL in Redis
  await setUserOnline(conn.user.userId);

  // Return server timestamp ACK
  const envelope: WsEnvelope<{ server_time: number }> = {
    event: WsOutgoingEvent.HEARTBEAT_ACK,
    trace_id: traceId,
    timestamp: Date.now(),
    data: {
      server_time: Date.now(),
    },
  };

  conn.send(envelope);
}
