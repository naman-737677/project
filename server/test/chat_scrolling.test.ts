import assert from 'assert';
import {
  ensureChatExists,
  persistMessage,
  getAllMessagesForChat,
} from '../src/db/chatStore.js';

async function testScrollingPagination() {
  console.log('--- Starting Chat Scrolling & Previous Messages Pagination Test ---');

  const testChatId = 'scroll-chat-' + Date.now();
  await ensureChatExists(testChatId, 'Scroll Test Chat', 'GROUP');

  // Insert 8 test messages
  console.log('Inserting 8 test messages into chat...');
  for (let i = 1; i <= 8; i++) {
    await persistMessage({
      chatId: testChatId,
      senderId: '11111111-1111-4111-8111-111111111111',
      seqId: BigInt(i),
      clientMsgId: `scroll_msg_${i}`,
      type: 'TEXT',
      content: `Message #${i} for scrolling test`,
    });
  }

  // 1. Initial fetch: limit = 3 (no beforeSeq -> newest 3 messages: #6, #7, #8)
  console.log('Test 1: Initial fetch latest 3 messages');
  const batch1 = getAllMessagesForChat(testChatId, 3);
  assert.strictEqual(batch1.messages.length, 3, 'Batch 1 should have 3 messages');
  assert.strictEqual(batch1.hasMore, true, 'Batch 1 should have hasMore = true');
  assert.strictEqual(batch1.messages[0].seqId, '6', 'First msg in batch 1 should be seq 6');
  assert.strictEqual(batch1.messages[2].seqId, '8', 'Last msg in batch 1 should be seq 8');
  console.log('✔ Passed Test 1');

  // 2. Fetch earlier messages: limit = 3, beforeSeq = 6 (messages #3, #4, #5)
  console.log('Test 2: Fetch earlier messages before seq 6');
  const batch2 = getAllMessagesForChat(testChatId, 3, '6');
  assert.strictEqual(batch2.messages.length, 3, 'Batch 2 should have 3 messages');
  assert.strictEqual(batch2.hasMore, true, 'Batch 2 should have hasMore = true');
  assert.strictEqual(batch2.messages[0].seqId, '3', 'First msg in batch 2 should be seq 3');
  assert.strictEqual(batch2.messages[2].seqId, '5', 'Last msg in batch 2 should be seq 5');
  console.log('✔ Passed Test 2');

  // 3. Fetch earlier messages: limit = 3, beforeSeq = 3 (messages #1, #2)
  console.log('Test 3: Fetch beginning of history before seq 3');
  const batch3 = getAllMessagesForChat(testChatId, 3, '3');
  assert.strictEqual(batch3.messages.length, 2, 'Batch 3 should have remaining 2 messages');
  assert.strictEqual(batch3.hasMore, false, 'Batch 3 should have hasMore = false (reached beginning)');
  assert.strictEqual(batch3.messages[0].seqId, '1', 'First msg in batch 3 should be seq 1');
  assert.strictEqual(batch3.messages[1].seqId, '2', 'Last msg in batch 3 should be seq 2');
  console.log('✔ Passed Test 3');

  // 4. Fetch before seq 1: should return 0 messages and hasMore = false
  console.log('Test 4: Fetch before seq 1 (past the beginning)');
  const batch4 = getAllMessagesForChat(testChatId, 3, '1');
  assert.strictEqual(batch4.messages.length, 0, 'Batch 4 should have 0 messages');
  assert.strictEqual(batch4.hasMore, false, 'Batch 4 should have hasMore = false');
  console.log('✔ Passed Test 4');

  console.log('--- All Chat Scrolling & Pagination Tests Passed Successfully! ---');
  process.exit(0);
}

testScrollingPagination().catch((err) => {
  console.error('Test failed with error:', err);
  process.exit(1);
});
