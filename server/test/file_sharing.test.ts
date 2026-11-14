import http from 'http';
import WebSocket from 'ws';
import jwt from 'jsonwebtoken';
import { config } from '../src/config/index.js';
import { handleHttpRequest } from '../src/index.js';
import { initWebSocketServer } from '../src/websocket/server.js';
import { getDeterministicDirectChatId } from '../src/db/friendsStore.js';
import { ensureChatExists, checkParticipant } from '../src/db/chatStore.js';

const PORT = 4999;
const JWT_SECRET = config.jwtSecret;
let server: http.Server;
let wss: any;

function createToken(userId: string, username: string) {
  return jwt.sign({ userId, username, displayName: username }, JWT_SECRET, { expiresIn: '1h' });
}

async function runTests() {
  process.env.NODE_ENV = 'test';
  console.log('=== Photo, File & Document Sharing Test Suite ===\n');

  server = http.createServer(handleHttpRequest);
  wss = initWebSocketServer(server);
  server.listen(PORT);
  await new Promise<void>((resolve) => server.once('listening', resolve));
  console.log(`[Test Server] Running on http://localhost:${PORT}`);

  try {
    const ALICE_ID = '11111111-1111-4111-8111-111111111111';
    const BOB_ID = '22222222-2222-4222-8222-222222222222';
    const directChatId = getDeterministicDirectChatId(ALICE_ID, BOB_ID);

    await ensureChatExists(directChatId, 'Direct Chat', 'DIRECT');
    await checkParticipant(directChatId, ALICE_ID);
    await checkParticipant(directChatId, BOB_ID);

    // 1. Upload Photo
    console.log('Test 1: Uploading Photo via POST /api/upload');
    const photoBuffer = Buffer.from('fake_image_pixels_data_12345');
    const photoBase64 = photoBuffer.toString('base64');

    const photoUploadRes = await fetch(`http://localhost:${PORT}/api/upload`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        fileName: 'vacation_photo.jpg',
        fileType: 'image/jpeg',
        fileSize: photoBuffer.length,
        fileData: photoBase64,
      }),
    });

    const photoUploadJson = await photoUploadRes.json();
    if (!photoUploadRes.ok || photoUploadJson.status !== 'success') {
      throw new Error(`Photo upload failed: ${JSON.stringify(photoUploadJson)}`);
    }

    const photoAttachment = photoUploadJson.attachment;
    if (!photoAttachment || !photoAttachment.file_url.startsWith('/api/files/')) {
      throw new Error(`Invalid photo attachment payload: ${JSON.stringify(photoAttachment)}`);
    }
    console.log('✔ Passed Test 1: Photo uploaded successfully, url:', photoAttachment.file_url);

    // 2. Upload Document
    console.log('\nTest 2: Uploading Document via POST /api/upload');
    const docBuffer = Buffer.from('%PDF-1.4 ... Report Content Here ...');
    const docBase64 = docBuffer.toString('base64');

    const docUploadRes = await fetch(`http://localhost:${PORT}/api/upload`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        fileName: 'quarterly_report.pdf',
        fileType: 'application/pdf',
        fileSize: docBuffer.length,
        fileData: docBase64,
      }),
    });

    const docUploadJson = await docUploadRes.json();
    if (!docUploadRes.ok || docUploadJson.status !== 'success') {
      throw new Error(`Document upload failed: ${JSON.stringify(docUploadJson)}`);
    }

    const docAttachment = docUploadJson.attachment;
    if (!docAttachment || docAttachment.file_name !== 'quarterly_report.pdf') {
      throw new Error(`Invalid document attachment payload: ${JSON.stringify(docAttachment)}`);
    }
    console.log('✔ Passed Test 2: Document uploaded successfully, url:', docAttachment.file_url);

    // 3. Download/Serve uploaded files
    console.log('\nTest 3: Fetching uploaded photo and document via GET /api/files/:filename');
    const getPhotoRes = await fetch(`http://localhost:${PORT}${photoAttachment.file_url}`);
    if (!getPhotoRes.ok) {
      throw new Error(`Failed to fetch photo from ${photoAttachment.file_url}`);
    }
    const photoContentType = getPhotoRes.headers.get('content-type');
    if (photoContentType !== 'image/jpeg') {
      throw new Error(`Expected image/jpeg content-type, got: ${photoContentType}`);
    }

    const getDocRes = await fetch(`http://localhost:${PORT}${docAttachment.file_url}`);
    if (!getDocRes.ok) {
      throw new Error(`Failed to fetch doc from ${docAttachment.file_url}`);
    }
    const docContentType = getDocRes.headers.get('content-type');
    if (docContentType !== 'application/pdf') {
      throw new Error(`Expected application/pdf content-type, got: ${docContentType}`);
    }
    console.log('✔ Passed Test 3: Files served with correct Content-Type and headers.');

    // 4. Send Photo Message over WebSocket from Alice to Bob
    console.log('\nTest 4: Sending photo & document messages between Alice and Bob via WebSocket');
    const aliceToken = createToken(ALICE_ID, 'alice');
    const bobToken = createToken(BOB_ID, 'bob');

    const aliceWs = new WebSocket(`ws://localhost:${PORT}/ws?token=${aliceToken}&device_id=alice-dev`);
    const bobWs = new WebSocket(`ws://localhost:${PORT}/ws?token=${bobToken}&device_id=bob-dev`);

    await Promise.all([
      new Promise<void>((resolve) => aliceWs.once('open', resolve)),
      new Promise<void>((resolve) => bobWs.once('open', resolve)),
    ]);

    // Bob listens for incoming message with photo attachment
    const bobMessagePromise = new Promise<any>((resolve) => {
      bobWs.on('message', (raw) => {
        const env = JSON.parse(raw.toString('utf-8'));
        if (env.event === 'NEW_MESSAGE') {
          resolve(env.data);
        }
      });
    });

    const photoMsgId = `cmsg_${Date.now()}_photo`;
    aliceWs.send(
      JSON.stringify({
        event: 'SEND_MESSAGE',
        trace_id: 'trace_photo_1',
        data: {
          client_msg_id: photoMsgId,
          chat_id: directChatId,
          type: 'IMAGE',
          content: 'Here is the vacation photo!',
          attachments: [
            {
              file_url: photoAttachment.file_url,
              file_name: photoAttachment.file_name,
              file_size: photoAttachment.file_size,
              mime_type: photoAttachment.mime_type,
            },
          ],
        },
      })
    );

    const receivedMsg = await bobMessagePromise;
    if (receivedMsg.chat_id !== directChatId || receivedMsg.type !== 'IMAGE') {
      throw new Error(`Received unexpected message format: ${JSON.stringify(receivedMsg)}`);
    }
    if (!receivedMsg.attachments || receivedMsg.attachments.length !== 1) {
      throw new Error('Received message does not have expected photo attachment');
    }
    if (receivedMsg.attachments[0].file_name !== 'vacation_photo.jpg') {
      throw new Error(`Attachment file_name mismatch: ${receivedMsg.attachments[0].file_name}`);
    }

    console.log('✔ Passed Test 4: Photo message delivered in real-time to Bob with attachment verified.');

    aliceWs.close();
    bobWs.close();

    console.log('\n=== All Photo, File & Document Sharing Tests Passed Successfully! ===');
  } finally {
    server.close();
  }
}

runTests().catch((err) => {
  console.error('❌ Test failed with error:', err);
  if (server) server.close();
  process.exit(1);
});
