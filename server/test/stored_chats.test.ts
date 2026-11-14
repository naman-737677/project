import http from 'http';
import assert from 'node:assert';
import { handleHttpRequest } from '../src/index.js';
import {
  ensureChatExists,
  persistMessage,
  getAllChatsForUser,
  getAllMessagesForChat,
  loadChatsAndMessagesFromDisk,
  saveChatsToDisk,
  saveMessagesToDisk,
} from '../src/db/chatStore.js';

const TEST_PORT = 5005;

async function runStoredChatsTests() {
  console.log('--- Starting Stored Previous Chats Tests ---');

  const server = http.createServer(handleHttpRequest);
  await new Promise<void>((resolve) => {
    server.listen(TEST_PORT, () => resolve());
  });

  try {
    const testUserId = 'test-user-' + Date.now();
    const testChatId = 'test-chat-' + Date.now();

    // Test 1: Chat creation and message persistence
    console.log('Test 1: Creating chat and persisting messages');
    const createdChat = await ensureChatExists(testChatId, 'Stored History Test Chat', 'GROUP');
    assert.strictEqual(createdChat.id, testChatId);
    assert.strictEqual(createdChat.title, 'Stored History Test Chat');

    const msg1 = await persistMessage({
      chatId: testChatId,
      senderId: testUserId,
      seqId: 1n,
      clientMsgId: 'cmsg_1',
      type: 'TEXT',
      content: 'Hello, this is a saved message before logout!',
    });
    assert.strictEqual(msg1.content, 'Hello, this is a saved message before logout!');

    const msg2 = await persistMessage({
      chatId: testChatId,
      senderId: 'friend-user-999',
      seqId: 2n,
      clientMsgId: 'cmsg_2',
      type: 'TEXT',
      content: 'This message should also be retained.',
    });
    assert.strictEqual(msg2.content, 'This message should also be retained.');
    console.log('✔ Passed Test 1');

    // Test 2: In-memory & disk retrieval
    console.log('Test 2: Retrieving chats and messages for user');
    const userChats = getAllChatsForUser(testUserId);
    const foundChat = userChats.find((c) => c.id === testChatId);
    assert.ok(foundChat, 'Chat should be found in user chats');
    assert.strictEqual(foundChat.lastMessage, 'This message should also be retained.');

    const messages = getAllMessagesForChat(testChatId);
    assert.strictEqual(messages.length, 2);
    assert.strictEqual(messages[0].content, 'Hello, this is a saved message before logout!');
    assert.strictEqual(messages[1].content, 'This message should also be retained.');
    console.log('✔ Passed Test 2');

    // Test 3: Reloading from disk simulates restarting server / restoring after logout
    console.log('Test 3: Simulating reload from disk persistence');
    saveChatsToDisk();
    saveMessagesToDisk();
    loadChatsAndMessagesFromDisk();

    const reloadedMessages = getAllMessagesForChat(testChatId);
    assert.strictEqual(reloadedMessages.length, 2);
    assert.strictEqual(reloadedMessages[0].content, 'Hello, this is a saved message before logout!');
    console.log('✔ Passed Test 3');

    // Test 4: HTTP GET /api/chats returns previous chats
    console.log('Test 4: HTTP GET /api/chats returns user previous chats');
    await new Promise<void>((resolve, reject) => {
      http.get(`http://localhost:${TEST_PORT}/api/chats?userId=${testUserId}`, (res) => {
        assert.strictEqual(res.statusCode, 200);
        let raw = '';
        res.on('data', (c) => (raw += c));
        res.on('end', () => {
          const json = JSON.parse(raw);
          assert.strictEqual(json.status, 'success');
          assert.ok(Array.isArray(json.chats));
          const hasChat = json.chats.some((c: any) => c.id === testChatId);
          assert.ok(hasChat, 'User chats should contain testChatId');
          resolve();
        });
      }).on('error', reject);
    });
    console.log('✔ Passed Test 4');

    // Test 5: HTTP GET /api/chats/:chatId/messages returns chat history
    console.log('Test 5: HTTP GET /api/chats/:chatId/messages returns stored messages');
    await new Promise<void>((resolve, reject) => {
      http.get(`http://localhost:${TEST_PORT}/api/chats/${testChatId}/messages`, (res) => {
        assert.strictEqual(res.statusCode, 200);
        let raw = '';
        res.on('data', (c) => (raw += c));
        res.on('end', () => {
          const json = JSON.parse(raw);
          assert.strictEqual(json.status, 'success');
          assert.strictEqual(json.chatId, testChatId);
          assert.strictEqual(json.messages.length, 2);
          assert.strictEqual(json.messages[0].content, 'Hello, this is a saved message before logout!');
          resolve();
        });
      }).on('error', reject);
    });
    console.log('✔ Passed Test 5');

    console.log('--- All Stored Previous Chats Tests Passed Successfully! ---');
  } finally {
    server.close();
  }
}

runStoredChatsTests().catch((err) => {
  console.error('Test failed with error:', err);
  process.exit(1);
});
