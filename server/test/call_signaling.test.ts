import { connectionManager } from '../src/websocket/manager.js';
import { handleCallSignal } from '../src/websocket/handlers/call.js';
import { ClientConnection } from '../src/websocket/connection.js';
import { WsOutgoingEvent, CallSignalPayload } from '../src/types/events.js';

// In-memory mock socket
function createMockSocket(sentMessages: any[]) {
  return {
    readyState: 1, // WebSocket.OPEN
    send: (data: string) => {
      sentMessages.push(JSON.parse(data));
    },
    ping: () => {},
    close: () => {},
    terminate: () => {},
  } as any;
}

async function runCallSignalingTests() {
  console.log('=== WebRTC Call Signaling Test Suite ===\n');

  const ALICE_ID = '11111111-1111-4111-8111-111111111111';
  const BOB_ID = '22222222-2222-4222-8222-222222222222';

  const aliceMessages: any[] = [];
  const bobMessages: any[] = [];

  const aliceConn = new ClientConnection(createMockSocket(aliceMessages), {
    userId: ALICE_ID,
    username: 'alice',
    deviceId: 'alice-browser',
  });

  const bobConn = new ClientConnection(createMockSocket(bobMessages), {
    userId: BOB_ID,
    username: 'bob',
    deviceId: 'bob-browser',
  });

  // Register both connections
  connectionManager.register(aliceConn);
  connectionManager.register(bobConn);

  try {
    // -------------------------------------------------------------
    // Test 1: Alice initiates voice call to Bob (OFFER)
    // -------------------------------------------------------------
    console.log('Test 1: Alice sends CALL_SIGNAL OFFER to Bob');
    const callId = 'call_test_123';
    await handleCallSignal(aliceConn, 'tr_offer_1', {
      target_user_id: BOB_ID,
      signal_type: 'OFFER',
      call_id: callId,
      call_type: 'AUDIO',
      sdp: { type: 'offer', sdp: 'v=0\r\no=alice 1234 5678...' },
    });

    if (bobMessages.length !== 1) {
      throw new Error(`Expected Bob to receive 1 message, got ${bobMessages.length}`);
    }

    const bobOfferEnvelope = bobMessages[0];
    if (bobOfferEnvelope.event !== WsOutgoingEvent.CALL_SIGNAL) {
      throw new Error(`Expected event ${WsOutgoingEvent.CALL_SIGNAL}, got ${bobOfferEnvelope.event}`);
    }

    const offerData: CallSignalPayload = bobOfferEnvelope.data;
    if (offerData.signal_type !== 'OFFER') {
      throw new Error(`Expected signal_type OFFER, got ${offerData.signal_type}`);
    }
    if (offerData.caller_info?.username !== 'alice') {
      throw new Error(`Expected caller username 'alice', got '${offerData.caller_info?.username}'`);
    }
    console.log('✔ Passed Test 1: Bob received CALL_SIGNAL OFFER with Alice info and SDP.');

    // -------------------------------------------------------------
    // Test 2: Bob accepts call and sends ANSWER back to Alice
    // -------------------------------------------------------------
    console.log('\nTest 2: Bob sends CALL_SIGNAL ANSWER to Alice');
    await handleCallSignal(bobConn, 'tr_answer_1', {
      target_user_id: ALICE_ID,
      signal_type: 'ANSWER',
      call_id: callId,
      call_type: 'AUDIO',
      sdp: { type: 'answer', sdp: 'v=0\r\no=bob 8765 4321...' },
    });

    if (aliceMessages.length !== 1) {
      throw new Error(`Expected Alice to receive 1 message, got ${aliceMessages.length}`);
    }

    const aliceAnswerEnvelope = aliceMessages[0];
    if (aliceAnswerEnvelope.data.signal_type !== 'ANSWER') {
      throw new Error(`Expected signal_type ANSWER, got ${aliceAnswerEnvelope.data.signal_type}`);
    }
    console.log('✔ Passed Test 2: Alice received CALL_SIGNAL ANSWER with Bob SDP.');

    // -------------------------------------------------------------
    // Test 3: ICE Candidate exchange between Alice and Bob
    // -------------------------------------------------------------
    console.log('\nTest 3: ICE Candidate exchange');
    await handleCallSignal(aliceConn, 'tr_ice_1', {
      target_user_id: BOB_ID,
      signal_type: 'ICE_CANDIDATE',
      call_id: callId,
      call_type: 'AUDIO',
      candidate: { candidate: 'candidate:1 1 UDP 2130706431 192.168.1.1 50000 typ host', sdpMid: '0' },
    });

    if (bobMessages.length !== 2) {
      throw new Error(`Expected Bob to receive 2 messages, got ${bobMessages.length}`);
    }
    const bobIce = bobMessages[1];
    if (bobIce.data.signal_type !== 'ICE_CANDIDATE' || !bobIce.data.candidate) {
      throw new Error('Bob did not receive ICE candidate properly');
    }
    console.log('✔ Passed Test 3: Bob received ICE candidate from Alice.');

    // -------------------------------------------------------------
    // Test 4: Call Termination (END)
    // -------------------------------------------------------------
    console.log('\nTest 4: Call End signal');
    await handleCallSignal(aliceConn, 'tr_end_1', {
      target_user_id: BOB_ID,
      signal_type: 'END',
      call_id: callId,
      call_type: 'AUDIO',
    });

    if (bobMessages.length !== 3) {
      throw new Error(`Expected Bob to have 3 messages, got ${bobMessages.length}`);
    }
    const bobEnd = bobMessages[2];
    if (bobEnd.data.signal_type !== 'END') {
      throw new Error(`Expected signal_type END, got ${bobEnd.data.signal_type}`);
    }
    console.log('✔ Passed Test 4: Bob received END signal.');

    // -------------------------------------------------------------
    // Test 5: Call to Offline User returns immediate REJECT feedback
    // -------------------------------------------------------------
    console.log('\nTest 5: Call to offline user returns REJECT with friendly reason');
    const OFFLINE_USER_ID = '99999999-0000-0000-0000-000000000000';
    const alicePreCount = aliceMessages.length;

    await handleCallSignal(aliceConn, 'tr_offline_1', {
      target_user_id: OFFLINE_USER_ID,
      signal_type: 'OFFER',
      call_id: 'call_offline_test',
      call_type: 'AUDIO',
      sdp: { type: 'offer', sdp: 'test' },
    });

    if (aliceMessages.length !== alicePreCount + 1) {
      throw new Error('Alice did not receive offline reject feedback');
    }
    const offlineReject = aliceMessages[aliceMessages.length - 1];
    if (offlineReject.data.signal_type !== 'REJECT' || !offlineReject.data.reason?.includes('offline')) {
      throw new Error(`Expected REJECT with offline reason, got: ${JSON.stringify(offlineReject.data)}`);
    }
    console.log('✔ Passed Test 5: Alice received offline user feedback gracefully.');

    console.log('\n🎉 ALL 5 CALL SIGNALING TESTS PASSED SUCCESSFULLY! 🎉');
    process.exit(0);
  } finally {
    connectionManager.unregister(aliceConn);
    connectionManager.unregister(bobConn);
  }
}

runCallSignalingTests().catch((err) => {
  console.error('\n❌ Test failed with error:', err);
  process.exit(1);
});
