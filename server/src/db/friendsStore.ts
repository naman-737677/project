import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import { prisma } from './prisma.js';
import { isDbAvailable, ensureChatExists, checkParticipant, ChatRecord } from './chatStore.js';
import { findUserById, findUserByUsername } from '../auth/store.js';
import { connectionManager } from '../websocket/manager.js';

export interface FriendInfo {
  id: string;
  username: string;
  displayName: string;
  status: 'ONLINE' | 'OFFLINE';
  lastSeenAt: number;
  directChatId: string;
}

export interface DirectConversationInfo {
  chatId: string;
  friend: FriendInfo;
  lastMessage?: string;
  lastMessageTime?: number;
  unreadCount: number;
}

const DATA_DIR = path.resolve(process.cwd(), 'data');
const FRIENDS_FILE = path.join(DATA_DIR, 'friends.json');

// Map of userId -> Set of friend user IDs
const memoryFriends = new Map<string, Set<string>>();

const ALICE_ID = '11111111-1111-4111-8111-111111111111';
const BOB_ID = '22222222-2222-4222-8222-222222222222';
const CHARLIE_ID = '33333333-3333-4333-8333-333333333333';

function saveFriendsToDisk() {
  try {
    if (!fs.existsSync(DATA_DIR)) {
      fs.mkdirSync(DATA_DIR, { recursive: true });
    }
    const data: Record<string, string[]> = {};
    for (const [uid, friendsSet] of memoryFriends.entries()) {
      data[uid] = Array.from(friendsSet);
    }
    fs.writeFileSync(FRIENDS_FILE, JSON.stringify(data, null, 2), 'utf-8');
  } catch {
    // Ignore
  }
}

function loadFriendsFromDisk() {
  try {
    if (fs.existsSync(FRIENDS_FILE)) {
      const content = fs.readFileSync(FRIENDS_FILE, 'utf-8');
      const data: Record<string, string[]> = JSON.parse(content);
      for (const [uid, friendsList] of Object.entries(data)) {
        memoryFriends.set(uid, new Set(friendsList));
      }
    }
  } catch {
    // Ignore
  }
}

// Initialize default friendships between demo users
function initDefaultFriends() {
  // Alice is friends with Bob and Charlie
  if (!memoryFriends.has(ALICE_ID)) {
    memoryFriends.set(ALICE_ID, new Set([BOB_ID, CHARLIE_ID]));
  }
  // Bob is friends with Alice and Charlie
  if (!memoryFriends.has(BOB_ID)) {
    memoryFriends.set(BOB_ID, new Set([ALICE_ID, CHARLIE_ID]));
  }
  // Charlie is friends with Alice and Bob
  if (!memoryFriends.has(CHARLIE_ID)) {
    memoryFriends.set(CHARLIE_ID, new Set([ALICE_ID, BOB_ID]));
  }
}

initDefaultFriends();
loadFriendsFromDisk();

/**
 * Generate a deterministic UUID for a direct 1-on-1 chat between two users.
 */
export function getDeterministicDirectChatId(userAId: string, userBId: string): string {
  const [first, second] = [userAId, userBId].sort();
  const hash = crypto.createHash('md5').update(`tg_direct_${first}_${second}`).digest('hex');
  return `${hash.slice(0, 8)}-${hash.slice(8, 12)}-4${hash.slice(13, 16)}-a${hash.slice(17, 20)}-${hash.slice(20, 32)}`;
}

/**
 * Ensure a 1-on-1 direct chat exists between two users and both are registered participants.
 */
export async function getOrCreateDirectChat(userAId: string, userBId: string): Promise<ChatRecord> {
  const directChatId = getDeterministicDirectChatId(userAId, userBId);
  const userB = await findUserById(userBId);
  const chatTitle = userB ? userB.displayName : `Direct Chat`;

  const chat = await ensureChatExists(directChatId, chatTitle, 'DIRECT');
  await checkParticipant(directChatId, userAId);
  await checkParticipant(directChatId, userBId);

  return chat;
}

/**
 * Get all friends for a given user.
 */
export async function getFriendsForUser(userId: string): Promise<FriendInfo[]> {
  const friendIds = memoryFriends.get(userId) || new Set<string>();
  const results: FriendInfo[] = [];

  for (const fId of friendIds) {
    const friendUser = await findUserById(fId);
    if (!friendUser) continue;

    const isOnline = connectionManager.hasUserConnections(fId);
    const directChatId = getDeterministicDirectChatId(userId, fId);

    results.push({
      id: friendUser.id,
      username: friendUser.username,
      displayName: friendUser.displayName,
      status: isOnline ? 'ONLINE' : 'OFFLINE',
      lastSeenAt: Date.now(),
      directChatId,
    });
  }

  return results;
}

/**
 * Add a friend by username or UUID.
 */
export async function addFriendForUser(
  userId: string,
  targetUsernameOrId: string
): Promise<{ success: boolean; friend?: FriendInfo; error?: string }> {
  const clean = targetUsernameOrId.trim().replace(/^@+/, '');
  if (!clean) {
    return { success: false, error: 'Please enter a valid username' };
  }

  // Find user by username or ID
  let targetUser = await findUserByUsername(clean);
  if (!targetUser) {
    targetUser = await findUserById(clean);
  }

  if (!targetUser) {
    return { success: false, error: `User "@${clean}" not found` };
  }

  if (targetUser.id === userId) {
    return { success: false, error: 'You cannot add yourself as a friend' };
  }

  // Ensure friendship sets exist
  if (!memoryFriends.has(userId)) {
    memoryFriends.set(userId, new Set());
  }
  if (!memoryFriends.has(targetUser.id)) {
    memoryFriends.set(targetUser.id, new Set());
  }

  // Add reciprocal friendship
  memoryFriends.get(userId)!.add(targetUser.id);
  memoryFriends.get(targetUser.id)!.add(userId);
  saveFriendsToDisk();

  // Create the 1-on-1 direct chat
  const directChat = await getOrCreateDirectChat(userId, targetUser.id);

  const isOnline = connectionManager.hasUserConnections(targetUser.id);
  const friendInfo: FriendInfo = {
    id: targetUser.id,
    username: targetUser.username,
    displayName: targetUser.displayName,
    status: isOnline ? 'ONLINE' : 'OFFLINE',
    lastSeenAt: Date.now(),
    directChatId: directChat.id,
  };

  return { success: true, friend: friendInfo };
}

/**
 * Remove a friend.
 */
export async function removeFriendForUser(userId: string, friendId: string): Promise<boolean> {
  const setA = memoryFriends.get(userId);
  if (setA) {
    setA.delete(friendId);
  }
  const setB = memoryFriends.get(friendId);
  if (setB) {
    setB.delete(userId);
  }
  saveFriendsToDisk();
  return true;
}

/**
 * Get all users whom the current user has messaged or has an active 1-on-1 direct chat with.
 */
export async function getDirectConversationsForUser(userId: string): Promise<DirectConversationInfo[]> {
  const friends = await getFriendsForUser(userId);
  const conversations: DirectConversationInfo[] = [];

  for (const friend of friends) {
    conversations.push({
      chatId: friend.directChatId,
      friend,
      unreadCount: 0,
    });
  }

  return conversations;
}
