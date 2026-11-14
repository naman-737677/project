import http from 'http';
import { WebSocket } from 'ws';
import jwt from 'jsonwebtoken';
import assert from 'node:assert';
import { config } from '../src/config/index.js';
import { initWebSocketServer } from '../src/websocket/server.js';
import { ClientConnection } from '../src/websocket/connection.js';
import { connectionManager } from '../src/websocket/manager.js';
import { WsEnvelope, WsIncomingEvent, WsOutgoingEvent } from '../src/types/events.js';

const TEST_PORT = 4999;
const TEST_JWT_SECRET = config.jwtSecret;

function generateToken(payload: { userId: string; username: string; deviceId?: string }) {
  return jwt.sign(payload, TEST_JWT_SECRET, { expiresIn: '1h' });
}

async function runTests() {
  console.log('--- Starting Integration & Unit Tests ---');

  // Create test HTTP & WS server
  const server = http.createServer((req, res) => {
    const url = req.url || '';
    if ((url === '/health' || url.startsWith('/health?') || url === '/health/') && req.method === 'GET') {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ status: 'ok', timestamp: Date.now() }));
      return;
    }

    res.writeHead(404, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'Not found' }));
  });

  const wss = initWebSocketServer(server);

  await new Promise<void>((resolve) => {
    server.listen(TEST_PORT, () => resolve());
  });
  console.log(`[Test Server] Listening on port ${TEST_PORT}`);

  try {
    // ----------------------------------------------------
    // Test 1: HTTP /health Endpoint
    // ----------------------------------------------------
    console.log('Test 1: HTTP /health endpoint returns 200 OK');
    await new Promise<void>((resolve, reject) => {
      http.get(`http://localhost:${TEST_PORT}/health`, (res) => {
        assert.strictEqual(res.statusCode, 200);
        let data = '';
        res.on('data', (chunk) => (data += chunk));
        res.on('end', () => {
          const body = JSON.parse(data);
          assert.strictEqual(body.status, 'ok');
          resolve();
        });
      }).on('error', reject);
    });
    console.log('✔ Passed Test 1');

    // ----------------------------------------------------
    // Test 2: HTTP 404 for unknown route
    // ----------------------------------------------------
    console.log('Test 2: HTTP unknown route returns 404');
    await new Promise<void>((resolve, reject) => {
      http.get(`http://localhost:${TEST_PORT}/non-existent`, (res) => {
        assert.strictEqual(res.statusCode, 404);
        resolve();
      }).on('error', reject);
    });
    console.log('✔ Passed Test 2');

    // ----------------------------------------------------
    // Test 3: WS rejection without token (401)
    // ----------------------------------------------------
    console.log('Test 3: WS connection without token is rejected with 401');
    await new Promise<void>((resolve, reject) => {
      const ws = new WebSocket(`ws://localhost:${TEST_PORT}/ws`);
      ws.on('unexpected-response', (_, res) => {
        assert.strictEqual(res.statusCode, 401);
        resolve();
      });
      ws.on('open', () => reject(new Error('Connection should not have opened')));
      ws.on('error', () => {
        // error event expected along with unexpected-response
      });
    });
    console.log('✔ Passed Test 3');

    // ----------------------------------------------------
    // Test 4: WS rejection with invalid token (401)
    // ----------------------------------------------------
    console.log('Test 4: WS connection with invalid token is rejected with 401');
    await new Promise<void>((resolve, reject) => {
      const ws = new WebSocket(`ws://localhost:${TEST_PORT}/ws?token=invalid.jwt.token`);
      ws.on('unexpected-response', (_, res) => {
        assert.strictEqual(res.statusCode, 401);
        resolve();
      });
      ws.on('open', () => reject(new Error('Connection should not have opened')));
      ws.on('error', () => {});
    });
    console.log('✔ Passed Test 4');

    // ----------------------------------------------------
    // Test 5: WS rejection on wrong path (404)
    // ----------------------------------------------------
    console.log('Test 5: WS connection on wrong path /chat is rejected with 404');
    await new Promise<void>((resolve, reject) => {
      const token = generateToken({ userId: 'u1', username: 'alice' });
      const ws = new WebSocket(`ws://localhost:${TEST_PORT}/chat?token=${token}`);
      ws.on('unexpected-response', (_, res) => {
        assert.strictEqual(res.statusCode, 404);
        resolve();
      });
      ws.on('open', () => reject(new Error('Connection should not have opened')));
      ws.on('error', () => {});
    });
    console.log('✔ Passed Test 5');

    // ----------------------------------------------------
    // Test 6: WS connection success with query token
    // ----------------------------------------------------
    console.log('Test 6: WS connection succeeds with valid query param token');
    const token1 = generateToken({ userId: 'u1', username: 'alice', deviceId: 'dev1' });
    const ws1 = await new Promise<WebSocket>((resolve, reject) => {
      const ws = new WebSocket(`ws://localhost:${TEST_PORT}/ws?token=${token1}`);
      ws.on('open', () => resolve(ws));
      ws.on('error', reject);
    });
    console.log('✔ Passed Test 6');

    // ----------------------------------------------------
    // Test 7: WS connection success with Authorization Header
    // ----------------------------------------------------
    console.log('Test 7: WS connection succeeds with Authorization Bearer header');
    const token2 = generateToken({ userId: 'u2', username: 'bob', deviceId: 'dev2' });
    const ws2 = await new Promise<WebSocket>((resolve, reject) => {
      const ws = new WebSocket(`ws://localhost:${TEST_PORT}/ws`, {
        headers: {
          Authorization: `Bearer ${token2}`,
        },
      });
      ws.on('open', () => resolve(ws));
      ws.on('error', reject);
    });
    console.log('✔ Passed Test 7');

    // ----------------------------------------------------
    // Test 8: WS connection success with Sec-WebSocket-Protocol
    // ----------------------------------------------------
    console.log('Test 8: WS connection succeeds with Sec-WebSocket-Protocol subprotocol token');
    const token3 = generateToken({ userId: 'u3', username: 'charlie' });
    const ws3 = await new Promise<WebSocket>((resolve, reject) => {
      const ws = new WebSocket(`ws://localhost:${TEST_PORT}/ws`, [token3]);
      ws.on('open', () => resolve(ws));
      ws.on('error', reject);
    });
    console.log('✔ Passed Test 8');

    // ----------------------------------------------------
    // Test 9: Heartbeat event & Heartbeat ACK
    // ----------------------------------------------------
    console.log('Test 9: Client sends HEARTBEAT and receives HEARTBEAT_ACK');
    await new Promise<void>((resolve, reject) => {
      const traceId = 'trace-heartbeat-123';
      const handler = (data: Buffer | string) => {
        const msg = JSON.parse(data.toString());
        if (msg.event === WsOutgoingEvent.HEARTBEAT_ACK && msg.trace_id === traceId) {
          assert(msg.data.server_time > 0);
          ws1.off('message', handler);
          resolve();
        }
      };
      ws1.on('message', handler);

      ws1.send(
        JSON.stringify({
          event: WsIncomingEvent.HEARTBEAT,
          trace_id: traceId,
          timestamp: Date.now(),
          data: {
            client_time: Date.now(),
          },
        })
      );
    });
    console.log('✔ Passed Test 9');

    // ----------------------------------------------------
    // Test 10: Malformed JSON envelope error response
    // ----------------------------------------------------
    console.log('Test 10: Server safely responds with ERROR for malformed payload');
    await new Promise<void>((resolve) => {
      const handler = (data: Buffer | string) => {
        const msg = JSON.parse(data.toString());
        if (msg.event === 'ERROR') {
          assert(msg.data.message.includes('Malformed') || msg.data.message.includes('Invalid'));
          ws1.off('message', handler);
          resolve();
        }
      };
      ws1.on('message', handler);
      ws1.send('not valid json {');
    });
    console.log('✔ Passed Test 10');

    // ----------------------------------------------------
    // Test 11: Missing event/trace_id error response
    // ----------------------------------------------------
    console.log('Test 11: Server responds with ERROR for missing trace_id or event');
    await new Promise<void>((resolve) => {
      const handler = (data: Buffer | string) => {
        const msg = JSON.parse(data.toString());
        if (msg.event === 'ERROR') {
          assert(msg.data.message.includes('missing event or trace_id'));
          ws1.off('message', handler);
          resolve();
        }
      };
      ws1.on('message', handler);
      ws1.send(JSON.stringify({ some_other_field: 123 }));
    });
    console.log('✔ Passed Test 11');

    // ----------------------------------------------------
    // Test 12: Unknown event error response
    // ----------------------------------------------------
    console.log('Test 12: Server responds with ERROR for unknown event type');
    await new Promise<void>((resolve) => {
      const traceId = 'trace-unknown-999';
      const handler = (data: Buffer | string) => {
        const msg = JSON.parse(data.toString());
        if (msg.event === 'ERROR' && msg.trace_id === traceId) {
          assert(msg.data.message.includes('Unknown event type: FOO_BAR'));
          ws1.off('message', handler);
          resolve();
        }
      };
      ws1.on('message', handler);
      ws1.send(
        JSON.stringify({
          event: 'FOO_BAR',
          trace_id: traceId,
          timestamp: Date.now(),
          data: {},
        })
      );
    });
    console.log('✔ Passed Test 12');

    // ----------------------------------------------------
    // Test 13: SEND_MESSAGE validation failure for empty payload
    // ----------------------------------------------------
    console.log('Test 13: SEND_MESSAGE with invalid payload returns VALIDATION_ERROR');
    await new Promise<void>((resolve) => {
      const traceId = 'trace-sendmsg-invalid';
      const handler = (data: Buffer | string) => {
        const msg = JSON.parse(data.toString());
        if (msg.event === 'ERROR' && msg.trace_id === traceId) {
          assert.strictEqual(msg.data.code, 'VALIDATION_ERROR');
          ws1.off('message', handler);
          resolve();
        }
      };
      ws1.on('message', handler);
      ws1.send(
        JSON.stringify({
          event: WsIncomingEvent.SEND_MESSAGE,
          trace_id: traceId,
          timestamp: Date.now(),
          data: {
            client_msg_id: 'client-id-1',
            chat_id: 'not-a-uuid',
            content: '',
          },
        })
      );
    });
    console.log('✔ Passed Test 13');

    // ----------------------------------------------------
    // Test 14: ClientConnection BigInt Serialization Safety
    // ----------------------------------------------------
    console.log('Test 14: ClientConnection safely serializes BigInt values without throwing');
    const dummyConn = new ClientConnection(ws1, { userId: 'u1', username: 'alice', deviceId: 'd1' });
    const success = dummyConn.send<any>({
      event: 'TEST_BIGINT',
      trace_id: 't-bigint',
      timestamp: Date.now(),
      data: {
        seq: BigInt(9007199254740993),
        normal: 123,
      },
    });
    assert.strictEqual(success, true);
    console.log('✔ Passed Test 14');

    // ----------------------------------------------------
    // Test 15: ConnectionManager chat broadcast filtering
    // ----------------------------------------------------
    console.log('Test 15: ConnectionManager broadcastToChat filter predicate works');
    const mockSocket = {
      readyState: WebSocket.OPEN,
      send: (data: string) => sentData.push(data),
    } as any;
    const sentData: string[] = [];

    const testConnA = new ClientConnection(mockSocket, { userId: 'userA', username: 'userA', deviceId: 'dA' });
    const testConnB = new ClientConnection(mockSocket, { userId: 'userB', username: 'userB', deviceId: 'dB' });

    connectionManager.subscribeToChat(testConnA, 'chat-room-1');
    connectionManager.subscribeToChat(testConnB, 'chat-room-1');

    const envelope: WsEnvelope<any> = {
      event: WsOutgoingEvent.USER_TYPING,
      trace_id: 't-type',
      timestamp: Date.now(),
      data: { chat_id: 'chat-room-1', user_id: 'userA', action: 'typing' },
    };

    // Filter out userA so only userB gets it
    connectionManager.broadcastToChat('chat-room-1', envelope, (conn) => conn.user.userId !== 'userA');
    assert.strictEqual(sentData.length, 1);

    // Clean up
    connectionManager.unregister(testConnA);
    connectionManager.unregister(testConnB);
    console.log('✔ Passed Test 15');

    // ----------------------------------------------------
    // Test 16: SEND_MESSAGE delivers MESSAGE_ACK and broadcasts NEW_MESSAGE
    // ----------------------------------------------------
    console.log('Test 16: SEND_MESSAGE delivers MESSAGE_ACK and broadcasts NEW_MESSAGE');
    const demoChatId = '99999999-9999-4999-8999-999999999999';
    const clientMsgId = `test_cmsg_${Date.now()}`;

    // Subscribe ws2 (Bob) to the chat first via a SYNC_REQUEST
    await new Promise<void>((resolve) => {
      const subHandler = (data: Buffer | string) => {
        const env = JSON.parse(data.toString());
        if (env.event === WsOutgoingEvent.SYNC_RESPONSE) {
          ws2.off('message', subHandler);
          resolve();
        }
      };
      ws2.on('message', subHandler);
      ws2.send(
        JSON.stringify({
          event: WsIncomingEvent.SYNC_REQUEST,
          trace_id: 'sync-init-bob',
          timestamp: Date.now(),
          data: { chat_id: demoChatId, last_synced_seq: '0', limit: 10 },
        })
      );
    });

    let savedSeqId = '';
    await Promise.all([
      // Sender (Alice / ws1) receives MESSAGE_ACK
      new Promise<void>((resolve, reject) => {
        const ackHandler = (data: Buffer | string) => {
          try {
            const env = JSON.parse(data.toString());
            if (env.event === WsOutgoingEvent.MESSAGE_ACK && env.data?.client_msg_id === clientMsgId) {
              assert.strictEqual(env.data.status, 'PERSISTED');
              assert.ok(env.data.message_id, 'Message ID should be populated');
              assert.ok(env.data.seq_id, 'Sequence ID should be populated');
              savedSeqId = env.data.seq_id;
              ws1.off('message', ackHandler);
              resolve();
            }
          } catch (e) {
            ws1.off('message', ackHandler);
            reject(e);
          }
        };
        ws1.on('message', ackHandler);
      }),
      // Recipient (Bob / ws2) receives NEW_MESSAGE
      new Promise<void>((resolve, reject) => {
        const msgHandler = (data: Buffer | string) => {
          try {
            const env = JSON.parse(data.toString());
            if (env.event === WsOutgoingEvent.NEW_MESSAGE && env.data?.client_msg_id === clientMsgId) {
              assert.strictEqual(env.data.content, 'Hello from Alice test!');
              assert.strictEqual(env.data.chat_id, demoChatId);
              ws2.off('message', msgHandler);
              resolve();
            }
          } catch (e) {
            ws2.off('message', msgHandler);
            reject(e);
          }
        };
        ws2.on('message', msgHandler);
      }),
      // Trigger message send
      new Promise<void>((resolve) => {
        ws1.send(
          JSON.stringify({
            event: WsIncomingEvent.SEND_MESSAGE,
            trace_id: 'tr-msg-test-16',
            timestamp: Date.now(),
            data: {
              client_msg_id: clientMsgId,
              chat_id: demoChatId,
              type: 'TEXT',
              content: 'Hello from Alice test!',
            },
          })
        );
        resolve();
      }),
    ]);
    console.log('✔ Passed Test 16');

    // ----------------------------------------------------
    // Test 17: SYNC_REQUEST retrieves missed messages via SYNC_RESPONSE
    // ----------------------------------------------------
    console.log('Test 17: SYNC_REQUEST retrieves missed messages via SYNC_RESPONSE');
    await new Promise<void>((resolve, reject) => {
      const syncHandler = (data: Buffer | string) => {
        try {
          const env = JSON.parse(data.toString());
          if (env.event === WsOutgoingEvent.SYNC_RESPONSE && env.trace_id === 'tr-sync-17') {
            assert.strictEqual(env.data.chat_id, demoChatId);
            assert.ok(Array.isArray(env.data.messages));
            const found = env.data.messages.some((m: any) => m.client_msg_id === clientMsgId);
            assert.ok(found, 'Synced messages should include the newly sent message');
            ws1.off('message', syncHandler);
            resolve();
          }
        } catch (e) {
          ws1.off('message', syncHandler);
          reject(e);
        }
      };
      ws1.on('message', syncHandler);
      ws1.send(
        JSON.stringify({
          event: WsIncomingEvent.SYNC_REQUEST,
          trace_id: 'tr-sync-17',
          timestamp: Date.now(),
          data: {
            chat_id: demoChatId,
            last_synced_seq: '0',
            limit: 50,
          },
        })
      );
    });
    console.log('✔ Passed Test 17');

    // ----------------------------------------------------
    // Test 18: READ_RECEIPT updates read watermark and broadcasts PARTICIPANT_READ
    // ----------------------------------------------------
    console.log('Test 18: READ_RECEIPT updates read watermark and broadcasts PARTICIPANT_READ');
    await Promise.all([
      // Sender (Alice / ws1) receives PARTICIPANT_READ
      new Promise<void>((resolve, reject) => {
        const readHandler = (data: Buffer | string) => {
          try {
            const env = JSON.parse(data.toString());
            if (env.event === WsOutgoingEvent.PARTICIPANT_READ && env.data?.chat_id === demoChatId) {
              assert.strictEqual(env.data.user_id, 'u2');
              assert.strictEqual(env.data.max_seq_id, savedSeqId);
              ws1.off('message', readHandler);
              resolve();
            }
          } catch (e) {
            ws1.off('message', readHandler);
            reject(e);
          }
        };
        ws1.on('message', readHandler);
      }),
      // Bob sends READ_RECEIPT
      new Promise<void>((resolve) => {
        ws2.send(
          JSON.stringify({
            event: WsIncomingEvent.READ_RECEIPT,
            trace_id: 'tr-receipt-18',
            timestamp: Date.now(),
            data: {
              chat_id: demoChatId,
              max_seq_id: savedSeqId,
            },
          })
        );
        resolve();
      }),
    ]);
    console.log('✔ Passed Test 18');

    // Clean up connections
    ws1.close();
    ws2.close();
    ws3.close();

    await new Promise<void>((resolve) => {
      wss.close(() => {
        server.close(() => resolve());
      });
    });

    console.log('\n--- All 18 Integration & Unit Tests Passed Successfully! ---');
  } catch (err) {
    console.error('Test failed with error:', err);
    process.exit(1);
  }
}

runTests();
