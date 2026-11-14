import fs from 'fs';
import path from 'path';
import { prisma } from './prisma.js';
import { redis, getNextChatSeq as getRedisChatSeq } from '../redis/client.js';

export interface ChatRecord {
  id: string;
  type: 'DIRECT' | 'GROUP' | 'CHANNEL' | 'SECRET';
  title: string;
  currentSeqId: bigint;
  createdAt: Date;
}

export interface ChatParticipantRecord {
  chatId: string;
  userId: string;
  role: 'OWNER' | 'ADMIN' | 'MEMBER';
  lastReadSeqId: bigint;
  lastReadAt: Date;
}

export interface MessageAttachmentRecord {
  id: string;
  fileUrl: string;
  thumbnailUrl?: string | null;
  fileName: string;
  fileSize: bigint;
  mimeType: string;
  width?: number | null;
  height?: number | null;
  duration?: number | null;
}

export interface MessageRecord {
  id: string;
  chatId: string;
  senderId: string | null;
  seqId: bigint;
  clientMsgId?: string | null;
  type: string;
  content: string | null;
  replyToId?: string | null;
  attachments: MessageAttachmentRecord[];
  createdAt: Date;
}

// ----------------------------------------------------
// In-Memory Persistent Fallback Stores
// ----------------------------------------------------
const memoryChats = new Map<string, ChatRecord>();
const memoryParticipants = new Map<string, ChatParticipantRecord>(); // key: `${chatId}_${userId}`
const memoryMessages = new Map<string, MessageRecord[]>(); // key: chatId -> messages
const memoryChatSeqs = new Map<string, bigint>(); // key: chatId -> currentSeqId

// Seed initial rooms
const DEMO_CHAT_1 = '99999999-9999-4999-8999-999999999999';
const DEMO_CHAT_2 = '88888888-8888-4888-8888-888888888888';

const ALICE_ID = '11111111-1111-4111-8111-111111111111';
const BOB_ID = '22222222-2222-4222-8222-222222222222';
const CHARLIE_ID = '33333333-3333-4333-8333-333333333333';

function initMemoryStore() {
  memoryChats.set(DEMO_CHAT_1, {
    id: DEMO_CHAT_1,
    type: 'GROUP',
    title: '🚀 Telegram Core Team',
    currentSeqId: 1n,
    createdAt: new Date(),
  });
  memoryChatSeqs.set(DEMO_CHAT_1, 1n);

  memoryChats.set(DEMO_CHAT_2, {
    id: DEMO_CHAT_2,
    type: 'GROUP',
    title: '💬 General Lounge',
    currentSeqId: 1n,
    createdAt: new Date(),
  });
  memoryChatSeqs.set(DEMO_CHAT_2, 1n);

  for (const chatId of [DEMO_CHAT_1, DEMO_CHAT_2]) {
    for (const uid of [ALICE_ID, BOB_ID, CHARLIE_ID]) {
      const key = `${chatId}_${uid}`;
      memoryParticipants.set(key, {
        chatId,
        userId: uid,
        role: uid === ALICE_ID ? 'OWNER' : 'MEMBER',
        lastReadSeqId: 0n,
        lastReadAt: new Date(),
      });
    }

    // Seed welcome message in each demo chat
    memoryMessages.set(chatId, [
      {
        id: crypto.randomUUID(),
        chatId,
        senderId: ALICE_ID,
        seqId: 1n,
        clientMsgId: `welcome_${chatId.slice(0, 8)}`,
        type: 'TEXT',
        content: chatId === DEMO_CHAT_1
          ? 'Welcome to the real-time cluster! Scalable WebSocket & E2EE engine is active.'
          : 'High-throughput WebSocket messaging is active. Type here to test live fan-out!',
        attachments: [],
        createdAt: new Date(Date.now() - 3600000),
      },
    ]);
  }
}

initMemoryStore();

function getDataDir(): string {
  const primary = path.resolve(process.cwd(), 'data');
  if (fs.existsSync(primary)) return primary;
  const parent = path.resolve(process.cwd(), '..', 'data');
  if (fs.existsSync(parent)) return parent;
  try {
    fs.mkdirSync(primary, { recursive: true });
    return primary;
  } catch {
    return primary;
  }
}

export function saveChatsToDisk() {
  try {
    const dataDir = getDataDir();
    if (!fs.existsSync(dataDir)) {
      fs.mkdirSync(dataDir, { recursive: true });
    }
    const chatsArray = Array.from(memoryChats.values()).map((c) => ({
      ...c,
      currentSeqId: c.currentSeqId.toString(),
      createdAt: c.createdAt.toISOString(),
    }));
    const participantsArray = Array.from(memoryParticipants.values()).map((p) => ({
      ...p,
      lastReadSeqId: p.lastReadSeqId.toString(),
      lastReadAt: p.lastReadAt.toISOString(),
    }));
    const seqsRecord: Record<string, string> = {};
    for (const [k, v] of memoryChatSeqs.entries()) {
      seqsRecord[k] = v.toString();
    }
    const data = {
      chats: chatsArray,
      participants: participantsArray,
      chatSeqs: seqsRecord,
    };
    fs.writeFileSync(path.join(dataDir, 'chats.json'), JSON.stringify(data, null, 2), 'utf-8');
  } catch {
    // Ignore error
  }
}

export function saveMessagesToDisk() {
  try {
    const dataDir = getDataDir();
    if (!fs.existsSync(dataDir)) {
      fs.mkdirSync(dataDir, { recursive: true });
    }
    const msgsRecord: Record<string, any[]> = {};
    for (const [chatId, msgs] of memoryMessages.entries()) {
      msgsRecord[chatId] = msgs.map((m) => ({
        ...m,
        seqId: m.seqId.toString(),
        createdAt: m.createdAt.toISOString(),
        attachments: m.attachments.map((a) => ({
          ...a,
          fileSize: a.fileSize.toString(),
        })),
      }));
    }
    fs.writeFileSync(path.join(dataDir, 'messages.json'), JSON.stringify(msgsRecord, null, 2), 'utf-8');
  } catch {
    // Ignore error
  }
}

export function loadChatsAndMessagesFromDisk() {
  try {
    const dataDir = getDataDir();
    const chatsFile = path.join(dataDir, 'chats.json');
    if (fs.existsSync(chatsFile)) {
      const content = fs.readFileSync(chatsFile, 'utf-8');
      const data = JSON.parse(content);
      if (Array.isArray(data.chats)) {
        for (const c of data.chats) {
          memoryChats.set(c.id, {
            ...c,
            currentSeqId: BigInt(c.currentSeqId || '0'),
            createdAt: new Date(c.createdAt),
          });
        }
      }
      if (Array.isArray(data.participants)) {
        for (const p of data.participants) {
          const key = `${p.chatId}_${p.userId}`;
          memoryParticipants.set(key, {
            ...p,
            lastReadSeqId: BigInt(p.lastReadSeqId || '0'),
            lastReadAt: new Date(p.lastReadAt),
          });
        }
      }
      if (data.chatSeqs && typeof data.chatSeqs === 'object') {
        for (const [k, v] of Object.entries(data.chatSeqs)) {
          memoryChatSeqs.set(k, BigInt((v as string) || '0'));
        }
      }
    }

    const messagesFile = path.join(dataDir, 'messages.json');
    if (fs.existsSync(messagesFile)) {
      const content = fs.readFileSync(messagesFile, 'utf-8');
      const data = JSON.parse(content);
      if (data && typeof data === 'object') {
        for (const [chatId, msgs] of Object.entries(data)) {
          if (Array.isArray(msgs)) {
            const parsedMsgs: MessageRecord[] = msgs.map((m: any) => ({
              ...m,
              seqId: BigInt(m.seqId || '0'),
              createdAt: new Date(m.createdAt),
              attachments: Array.isArray(m.attachments)
                ? m.attachments.map((a: any) => ({
                    ...a,
                    fileSize: BigInt(a.fileSize || '0'),
                  }))
                : [],
            }));
            memoryMessages.set(chatId, parsedMsgs);
          }
        }
      }
    }
  } catch {
    // Ignore
  }
}

loadChatsAndMessagesFromDisk();

// ----------------------------------------------------
// Fast Database Availability Probe
// ----------------------------------------------------
let dbOnline: boolean | null = null;
let lastDbProbe = 0;
const DB_PROBE_INTERVAL = 30000;

export async function isDbAvailable(): Promise<boolean> {
  const now = Date.now();
  if (dbOnline !== null && now - lastDbProbe < DB_PROBE_INTERVAL) {
    return dbOnline;
  }
  lastDbProbe = now;
  try {
    const timeout = new Promise<never>((_, reject) =>
      setTimeout(() => reject(new Error('DB Timeout')), 1000)
    );
    await Promise.race([prisma.$queryRaw`SELECT 1`, timeout]);
    dbOnline = true;
  } catch {
    dbOnline = false;
  }
  return dbOnline;
}

// ----------------------------------------------------
// Chat & Participation Methods
// ----------------------------------------------------

export async function ensureChatExists(
  chatId: string,
  title?: string,
  type: 'DIRECT' | 'GROUP' | 'CHANNEL' | 'SECRET' = 'GROUP'
): Promise<ChatRecord> {
  const existing = memoryChats.get(chatId);
  if (existing) return existing;

  const newChat: ChatRecord = {
    id: chatId,
    title: title || `Chat #${chatId.slice(0, 6)}`,
    type,
    currentSeqId: 0n,
    createdAt: new Date(),
  };

  memoryChats.set(chatId, newChat);
  memoryChatSeqs.set(chatId, 0n);
  if (!memoryMessages.has(chatId)) {
    memoryMessages.set(chatId, []);
  }
  saveChatsToDisk();

  // Persist to Postgres if available
  if (await isDbAvailable()) {
    try {
      await prisma.chat.upsert({
        where: { id: chatId },
        update: {},
        create: {
          id: chatId,
          title: newChat.title,
          type: newChat.type,
        },
      });
    } catch {
      dbOnline = false;
    }
  }

  return newChat;
}

export function getChatParticipantIds(chatId: string): string[] {
  const ids: string[] = [];
  const prefix = `${chatId}_`;
  for (const [key, part] of memoryParticipants.entries()) {
    if (key.startsWith(prefix)) {
      ids.push(part.userId);
    }
  }
  return ids;
}

export async function checkParticipant(chatId: string, userId: string): Promise<ChatParticipantRecord | null> {
  const key = `${chatId}_${userId}`;
  const mem = memoryParticipants.get(key);
  if (mem) return mem;

  // Try DB if available
  if (await isDbAvailable()) {
    try {
      const dbPart = await prisma.chatParticipant.findUnique({
        where: {
          chatId_userId: {
            chatId,
            userId,
          },
        },
      });

      if (dbPart) {
        const record: ChatParticipantRecord = {
          chatId: dbPart.chatId,
          userId: dbPart.userId,
          role: dbPart.role as any,
          lastReadSeqId: dbPart.lastReadSeqId,
          lastReadAt: dbPart.lastReadAt,
        };
        memoryParticipants.set(key, record);
        return record;
      }
    } catch {
      dbOnline = false;
    }
  }

  // Auto-join user if chat exists in memory or is demo chat
  await ensureChatExists(chatId);
  const autoParticipant: ChatParticipantRecord = {
    chatId,
    userId,
    role: 'MEMBER',
    lastReadSeqId: 0n,
    lastReadAt: new Date(),
  };
  memoryParticipants.set(key, autoParticipant);
  saveChatsToDisk();

  if (await isDbAvailable()) {
    try {
      await prisma.chatParticipant.upsert({
        where: {
          chatId_userId: {
            chatId,
            userId,
          },
        },
        update: {},
        create: {
          chatId,
          userId,
          role: 'MEMBER',
        },
      });
    } catch {
      dbOnline = false;
    }
  }

  return autoParticipant;
}

export async function updateParticipantReadWatermark(
  chatId: string,
  userId: string,
  maxSeqId: bigint
): Promise<void> {
  const key = `${chatId}_${userId}`;
  const p = memoryParticipants.get(key) || {
    chatId,
    userId,
    role: 'MEMBER',
    lastReadSeqId: 0n,
    lastReadAt: new Date(),
  };

  if (maxSeqId > p.lastReadSeqId) {
    p.lastReadSeqId = maxSeqId;
    p.lastReadAt = new Date();
    memoryParticipants.set(key, p);
    saveChatsToDisk();

    if (await isDbAvailable()) {
      try {
        await prisma.chatParticipant.update({
          where: {
            chatId_userId: {
              chatId,
              userId,
            },
          },
          data: {
            lastReadSeqId: maxSeqId,
            lastReadAt: p.lastReadAt,
          },
        });
      } catch {
        dbOnline = false;
      }
    }
  }
}

// ----------------------------------------------------
// Sequence Generator (Atomic Monotonic Sequence)
// ----------------------------------------------------

export async function allocateNextSeq(chatId: string): Promise<bigint> {
  // 1. Try Redis first if connected
  if (redis.status === 'ready') {
    try {
      return await getRedisChatSeq(chatId);
    } catch (err) {
      console.warn('[ChatStore] Redis sequence error, falling back:', (err as Error).message);
    }
  }

  // 2. Try PostgreSQL atomic increment if DB available
  if (await isDbAvailable()) {
    try {
      const updated = await prisma.chat.update({
        where: { id: chatId },
        data: { currentSeqId: { increment: 1 } },
        select: { currentSeqId: true },
      });
      memoryChatSeqs.set(chatId, updated.currentSeqId);
      return updated.currentSeqId;
    } catch {
      dbOnline = false;
    }
  }

  // 3. In-memory atomic monotonic sequence fallback
  const current = memoryChatSeqs.get(chatId) ?? 0n;
  const next = current + 1n;
  memoryChatSeqs.set(chatId, next);

  const chat = memoryChats.get(chatId);
  if (chat) {
    chat.currentSeqId = next;
  }
  saveChatsToDisk();
  return next;
}

// ----------------------------------------------------
// Message Persistence & Retrieval
// ----------------------------------------------------

export async function persistMessage(data: {
  chatId: string;
  senderId: string;
  seqId: bigint;
  clientMsgId: string;
  type: string;
  content: string | null;
  replyToId?: string | null;
  attachments?: Array<{
    file_url: string;
    thumbnail_url?: string | null;
    file_name: string;
    file_size: number;
    mime_type: string;
    width?: number | null;
    height?: number | null;
    duration?: number | null;
  }>;
}): Promise<MessageRecord> {
  const messageId = crypto.randomUUID();
  const createdAt = new Date();

  const formattedAttachments: MessageAttachmentRecord[] = (data.attachments || []).map((att) => ({
    id: crypto.randomUUID(),
    fileUrl: att.file_url,
    thumbnailUrl: att.thumbnail_url,
    fileName: att.file_name,
    fileSize: BigInt(att.file_size),
    mimeType: att.mime_type,
    width: att.width,
    height: att.height,
    duration: att.duration,
  }));

  const record: MessageRecord = {
    id: messageId,
    chatId: data.chatId,
    senderId: data.senderId,
    seqId: data.seqId,
    clientMsgId: data.clientMsgId,
    type: data.type,
    content: data.content,
    replyToId: data.replyToId,
    attachments: formattedAttachments,
    createdAt,
  };

  // 1. Save in memory
  if (!memoryMessages.has(data.chatId)) {
    memoryMessages.set(data.chatId, []);
  }
  memoryMessages.get(data.chatId)!.push(record);
  saveMessagesToDisk();

  // 2. Try DB persistence if DB available
  if (await isDbAvailable()) {
    try {
      const dbMsg = await prisma.$transaction(async (tx) => {
        await tx.chat.update({
          where: { id: data.chatId },
          data: { currentSeqId: data.seqId },
        });

        return await tx.message.create({
          data: {
            id: messageId,
            chatId: data.chatId,
            senderId: data.senderId,
            seqId: data.seqId,
            clientMsgId: data.clientMsgId,
            type: data.type as any,
            content: data.content,
            replyToId: data.replyToId,
            attachments: formattedAttachments.length > 0 ? {
              create: formattedAttachments.map((att) => ({
                id: att.id,
                fileUrl: att.fileUrl,
                thumbnailUrl: att.thumbnailUrl,
                fileName: att.fileName,
                fileSize: att.fileSize,
                mimeType: att.mimeType,
                width: att.width,
                height: att.height,
                duration: att.duration,
              })),
            } : undefined,
          },
          include: {
            attachments: true,
          },
        });
      });

      return {
        id: dbMsg.id,
        chatId: dbMsg.chatId,
        senderId: dbMsg.senderId,
        seqId: dbMsg.seqId,
        clientMsgId: dbMsg.clientMsgId,
        type: dbMsg.type,
        content: dbMsg.content,
        replyToId: dbMsg.replyToId,
        attachments: dbMsg.attachments.map((a) => ({
          id: a.id,
          fileUrl: a.fileUrl,
          thumbnailUrl: a.thumbnailUrl,
          fileName: a.fileName,
          fileSize: a.fileSize,
          mimeType: a.mimeType,
          width: a.width,
          height: a.height,
          duration: a.duration,
        })),
        createdAt: dbMsg.createdAt,
      };
    } catch {
      dbOnline = false;
    }
  }

  return record;
}

export async function findMessageByClientMsgId(
  chatId: string,
  clientMsgId: string
): Promise<MessageRecord | null> {
  // Check memory
  const list = memoryMessages.get(chatId) || [];
  const foundMem = list.find((m) => m.clientMsgId === clientMsgId);
  if (foundMem) return foundMem;

  // Check DB if available
  if (await isDbAvailable()) {
    try {
      const dbMsg = await prisma.message.findFirst({
        where: { chatId, clientMsgId },
        include: { attachments: true },
      });
      if (dbMsg) {
        return {
          id: dbMsg.id,
          chatId: dbMsg.chatId,
          senderId: dbMsg.senderId,
          seqId: dbMsg.seqId,
          clientMsgId: dbMsg.clientMsgId,
          type: dbMsg.type,
          content: dbMsg.content,
          replyToId: dbMsg.replyToId,
          attachments: dbMsg.attachments.map((a) => ({
            id: a.id,
            fileUrl: a.fileUrl,
            thumbnailUrl: a.thumbnailUrl,
            fileName: a.fileName,
            fileSize: a.fileSize,
            mimeType: a.mimeType,
            width: a.width,
            height: a.height,
            duration: a.duration,
          })),
          createdAt: dbMsg.createdAt,
        };
      }
    } catch {
      dbOnline = false;
    }
  }

  return null;
}

export async function findMessageById(messageId: string): Promise<MessageRecord | null> {
  // Check memory
  for (const list of memoryMessages.values()) {
    const found = list.find((m) => m.id === messageId);
    if (found) return found;
  }

  // Check DB if available
  if (await isDbAvailable()) {
    try {
      const dbMsg = await prisma.message.findUnique({
        where: { id: messageId },
        include: { attachments: true },
      });
      if (dbMsg) {
        return {
          id: dbMsg.id,
          chatId: dbMsg.chatId,
          senderId: dbMsg.senderId,
          seqId: dbMsg.seqId,
          clientMsgId: dbMsg.clientMsgId,
          type: dbMsg.type,
          content: dbMsg.content,
          replyToId: dbMsg.replyToId,
          attachments: dbMsg.attachments.map((a) => ({
            id: a.id,
            fileUrl: a.fileUrl,
            thumbnailUrl: a.thumbnailUrl,
            fileName: a.fileName,
            fileSize: a.fileSize,
            mimeType: a.mimeType,
            width: a.width,
            height: a.height,
            duration: a.duration,
          })),
          createdAt: dbMsg.createdAt,
        };
      }
    } catch {
      dbOnline = false;
    }
  }

  return null;
}

export async function getMissedMessages(
  chatId: string,
  lastSyncedSeq: bigint,
  limit: number
): Promise<{ messages: MessageRecord[]; hasMore: boolean }> {
  // Try DB if available
  if (await isDbAvailable()) {
    try {
      const missed = await prisma.message.findMany({
        where: {
          chatId,
          seqId: { gt: lastSyncedSeq },
        },
        include: {
          attachments: true,
        },
        orderBy: {
          seqId: 'asc',
        },
        take: limit,
      });

      if (missed && missed.length > 0) {
        return {
          messages: missed.map((m) => ({
            id: m.id,
            chatId: m.chatId,
            senderId: m.senderId,
            seqId: m.seqId,
            clientMsgId: m.clientMsgId,
            type: m.type,
            content: m.content,
            replyToId: m.replyToId,
            attachments: m.attachments.map((a) => ({
              id: a.id,
              fileUrl: a.fileUrl,
              thumbnailUrl: a.thumbnailUrl,
              fileName: a.fileName,
              fileSize: a.fileSize,
              mimeType: a.mimeType,
              width: a.width,
              height: a.height,
              duration: a.duration,
            })),
            createdAt: m.createdAt,
          })),
          hasMore: missed.length === limit,
        };
      }
    } catch {
      dbOnline = false;
    }
  }

  // Memory fallback
  const list = memoryMessages.get(chatId) || [];
  const filtered = list
    .filter((m) => m.seqId > lastSyncedSeq)
    .sort((a, b) => (a.seqId < b.seqId ? -1 : 1))
    .slice(0, limit);

  return {
    messages: filtered,
    hasMore: filtered.length === limit,
  };
}

export function getAllChatsForUser(userId: string): Array<{
  id: string;
  type: string;
  title: string;
  currentSeqId: string;
  createdAt: string;
  lastMessage?: string;
  lastMessageTime?: number;
  unreadCount?: number;
}> {
  const result: Array<{
    id: string;
    type: string;
    title: string;
    currentSeqId: string;
    createdAt: string;
    lastMessage?: string;
    lastMessageTime?: number;
    unreadCount?: number;
  }> = [];

  for (const [chatId, chat] of memoryChats.entries()) {
    const participantKey = `${chatId}_${userId}`;
    const isMember =
      memoryParticipants.has(participantKey) ||
      chat.type === 'GROUP' ||
      chatId === DEMO_CHAT_1 ||
      chatId === DEMO_CHAT_2;

    if (chat.type === 'DIRECT') {
      const participants = getChatParticipantIds(chatId);
      if (participants.length > 0 && !participants.includes(userId)) {
        continue;
      }
    }

    if (isMember) {
      const msgs = memoryMessages.get(chatId) || [];
      const lastMsg = msgs.length > 0 ? msgs[msgs.length - 1] : null;
      const part = memoryParticipants.get(participantKey);
      const lastRead = part?.lastReadSeqId || 0n;

      let unread = 0;
      for (const m of msgs) {
        if (m.seqId > lastRead && m.senderId !== userId) {
          unread++;
        }
      }

      result.push({
        id: chat.id,
        type: chat.type,
        title: chat.title,
        currentSeqId: chat.currentSeqId.toString(),
        createdAt: chat.createdAt.toISOString(),
        lastMessage: lastMsg ? (lastMsg.content || (lastMsg.attachments?.length ? 'Attachment' : '')) : '',
        lastMessageTime: lastMsg ? lastMsg.createdAt.getTime() : chat.createdAt.getTime(),
        unreadCount: unread,
      });
    }
  }

  return result.sort((a, b) => (b.lastMessageTime || 0) - (a.lastMessageTime || 0));
}

export function getAllMessagesForChat(
  chatId: string,
  limit = 100,
  beforeSeq?: string | null
): {
  messages: Array<{
    id: string;
    chatId: string;
    senderId: string | null;
    seqId: string;
    clientMsgId?: string | null;
    type: string;
    content: string | null;
    replyToId?: string | null;
    attachments: Array<{
      id: string;
      fileUrl: string;
      file_url: string;
      thumbnailUrl?: string | null;
      thumbnail_url?: string | null;
      fileName: string;
      file_name: string;
      fileSize: string;
      file_size: string;
      mimeType: string;
      mime_type: string;
    }>;
    createdAt: string;
  }>;
  hasMore: boolean;
} {
  const msgs = memoryMessages.get(chatId) || [];
  let eligible = msgs;

  if (beforeSeq) {
    try {
      const bSeq = BigInt(beforeSeq);
      eligible = msgs.filter((m) => m.seqId < bSeq);
    } catch {
      // ignore parse error
    }
  }

  const hasMore = eligible.length > limit;
  const chunk = eligible.slice(-limit);

  return {
    messages: chunk.map((m) => ({
      id: m.id,
      chatId: m.chatId,
      senderId: m.senderId,
      seqId: m.seqId.toString(),
      clientMsgId: m.clientMsgId,
      type: m.type,
      content: m.content,
      replyToId: m.replyToId,
      attachments: m.attachments.map((a) => ({
        id: a.id,
        fileUrl: a.fileUrl,
        file_url: a.fileUrl,
        thumbnailUrl: a.thumbnailUrl,
        thumbnail_url: a.thumbnailUrl,
        fileName: a.fileName,
        file_name: a.fileName,
        fileSize: a.fileSize.toString(),
        file_size: a.fileSize.toString(),
        mimeType: a.mimeType,
        mime_type: a.mimeType,
      })),
      createdAt: m.createdAt.toISOString(),
    })),
    hasMore,
  };
}
