"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.saveChatsToDisk = saveChatsToDisk;
exports.saveMessagesToDisk = saveMessagesToDisk;
exports.loadChatsAndMessagesFromDisk = loadChatsAndMessagesFromDisk;
exports.isDbAvailable = isDbAvailable;
exports.ensureChatExists = ensureChatExists;
exports.getChatParticipantIds = getChatParticipantIds;
exports.checkParticipant = checkParticipant;
exports.updateParticipantReadWatermark = updateParticipantReadWatermark;
exports.allocateNextSeq = allocateNextSeq;
exports.persistMessage = persistMessage;
exports.findMessageByClientMsgId = findMessageByClientMsgId;
exports.findMessageById = findMessageById;
exports.getMissedMessages = getMissedMessages;
exports.getAllChatsForUser = getAllChatsForUser;
exports.getAllMessagesForChat = getAllMessagesForChat;
const fs_1 = __importDefault(require("fs"));
const path_1 = __importDefault(require("path"));
const prisma_js_1 = require("./prisma.js");
const client_js_1 = require("../redis/client.js");
// ----------------------------------------------------
// In-Memory Persistent Fallback Stores
// ----------------------------------------------------
const memoryChats = new Map();
const memoryParticipants = new Map(); // key: `${chatId}_${userId}`
const memoryMessages = new Map(); // key: chatId -> messages
const memoryChatSeqs = new Map(); // key: chatId -> currentSeqId
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
function getDataDir() {
    const primary = path_1.default.resolve(process.cwd(), 'data');
    if (fs_1.default.existsSync(primary))
        return primary;
    const parent = path_1.default.resolve(process.cwd(), '..', 'data');
    if (fs_1.default.existsSync(parent))
        return parent;
    try {
        fs_1.default.mkdirSync(primary, { recursive: true });
        return primary;
    }
    catch {
        return primary;
    }
}
function saveChatsToDisk() {
    try {
        const dataDir = getDataDir();
        if (!fs_1.default.existsSync(dataDir)) {
            fs_1.default.mkdirSync(dataDir, { recursive: true });
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
        const seqsRecord = {};
        for (const [k, v] of memoryChatSeqs.entries()) {
            seqsRecord[k] = v.toString();
        }
        const data = {
            chats: chatsArray,
            participants: participantsArray,
            chatSeqs: seqsRecord,
        };
        fs_1.default.writeFileSync(path_1.default.join(dataDir, 'chats.json'), JSON.stringify(data, null, 2), 'utf-8');
    }
    catch {
        // Ignore error
    }
}
function saveMessagesToDisk() {
    try {
        const dataDir = getDataDir();
        if (!fs_1.default.existsSync(dataDir)) {
            fs_1.default.mkdirSync(dataDir, { recursive: true });
        }
        const msgsRecord = {};
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
        fs_1.default.writeFileSync(path_1.default.join(dataDir, 'messages.json'), JSON.stringify(msgsRecord, null, 2), 'utf-8');
    }
    catch {
        // Ignore error
    }
}
function loadChatsAndMessagesFromDisk() {
    try {
        const dataDir = getDataDir();
        const chatsFile = path_1.default.join(dataDir, 'chats.json');
        if (fs_1.default.existsSync(chatsFile)) {
            const content = fs_1.default.readFileSync(chatsFile, 'utf-8');
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
                    memoryChatSeqs.set(k, BigInt(v || '0'));
                }
            }
        }
        const messagesFile = path_1.default.join(dataDir, 'messages.json');
        if (fs_1.default.existsSync(messagesFile)) {
            const content = fs_1.default.readFileSync(messagesFile, 'utf-8');
            const data = JSON.parse(content);
            if (data && typeof data === 'object') {
                for (const [chatId, msgs] of Object.entries(data)) {
                    if (Array.isArray(msgs)) {
                        const parsedMsgs = msgs.map((m) => ({
                            ...m,
                            seqId: BigInt(m.seqId || '0'),
                            createdAt: new Date(m.createdAt),
                            attachments: Array.isArray(m.attachments)
                                ? m.attachments.map((a) => ({
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
    }
    catch {
        // Ignore
    }
}
loadChatsAndMessagesFromDisk();
// ----------------------------------------------------
// Fast Database Availability Probe
// ----------------------------------------------------
let dbOnline = null;
let lastDbProbe = 0;
const DB_PROBE_INTERVAL = 30000;
async function isDbAvailable() {
    const now = Date.now();
    if (dbOnline !== null && now - lastDbProbe < DB_PROBE_INTERVAL) {
        return dbOnline;
    }
    lastDbProbe = now;
    try {
        const timeout = new Promise((_, reject) => setTimeout(() => reject(new Error('DB Timeout')), 1000));
        await Promise.race([prisma_js_1.prisma.$queryRaw `SELECT 1`, timeout]);
        dbOnline = true;
    }
    catch {
        dbOnline = false;
    }
    return dbOnline;
}
// ----------------------------------------------------
// Chat & Participation Methods
// ----------------------------------------------------
async function ensureChatExists(chatId, title, type = 'GROUP') {
    const existing = memoryChats.get(chatId);
    if (existing)
        return existing;
    const newChat = {
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
            await prisma_js_1.prisma.chat.upsert({
                where: { id: chatId },
                update: {},
                create: {
                    id: chatId,
                    title: newChat.title,
                    type: newChat.type,
                },
            });
        }
        catch {
            dbOnline = false;
        }
    }
    return newChat;
}
function getChatParticipantIds(chatId) {
    const ids = [];
    const prefix = `${chatId}_`;
    for (const [key, part] of memoryParticipants.entries()) {
        if (key.startsWith(prefix)) {
            ids.push(part.userId);
        }
    }
    return ids;
}
async function checkParticipant(chatId, userId) {
    const key = `${chatId}_${userId}`;
    const mem = memoryParticipants.get(key);
    if (mem)
        return mem;
    // Try DB if available
    if (await isDbAvailable()) {
        try {
            const dbPart = await prisma_js_1.prisma.chatParticipant.findUnique({
                where: {
                    chatId_userId: {
                        chatId,
                        userId,
                    },
                },
            });
            if (dbPart) {
                const record = {
                    chatId: dbPart.chatId,
                    userId: dbPart.userId,
                    role: dbPart.role,
                    lastReadSeqId: dbPart.lastReadSeqId,
                    lastReadAt: dbPart.lastReadAt,
                };
                memoryParticipants.set(key, record);
                return record;
            }
        }
        catch {
            dbOnline = false;
        }
    }
    // Auto-join user if chat exists in memory or is demo chat
    await ensureChatExists(chatId);
    const autoParticipant = {
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
            await prisma_js_1.prisma.chatParticipant.upsert({
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
        }
        catch {
            dbOnline = false;
        }
    }
    return autoParticipant;
}
async function updateParticipantReadWatermark(chatId, userId, maxSeqId) {
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
                await prisma_js_1.prisma.chatParticipant.update({
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
            }
            catch {
                dbOnline = false;
            }
        }
    }
}
// ----------------------------------------------------
// Sequence Generator (Atomic Monotonic Sequence)
// ----------------------------------------------------
async function allocateNextSeq(chatId) {
    // 1. Try Redis first if connected
    if (client_js_1.redis.status === 'ready') {
        try {
            return await (0, client_js_1.getNextChatSeq)(chatId);
        }
        catch (err) {
            console.warn('[ChatStore] Redis sequence error, falling back:', err.message);
        }
    }
    // 2. Try PostgreSQL atomic increment if DB available
    if (await isDbAvailable()) {
        try {
            const updated = await prisma_js_1.prisma.chat.update({
                where: { id: chatId },
                data: { currentSeqId: { increment: 1 } },
                select: { currentSeqId: true },
            });
            memoryChatSeqs.set(chatId, updated.currentSeqId);
            return updated.currentSeqId;
        }
        catch {
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
async function persistMessage(data) {
    const messageId = crypto.randomUUID();
    const createdAt = new Date();
    const formattedAttachments = (data.attachments || []).map((att) => ({
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
    const record = {
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
    memoryMessages.get(data.chatId).push(record);
    saveMessagesToDisk();
    // 2. Try DB persistence if DB available
    if (await isDbAvailable()) {
        try {
            const dbMsg = await prisma_js_1.prisma.$transaction(async (tx) => {
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
                        type: data.type,
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
        }
        catch {
            dbOnline = false;
        }
    }
    return record;
}
async function findMessageByClientMsgId(chatId, clientMsgId) {
    // Check memory
    const list = memoryMessages.get(chatId) || [];
    const foundMem = list.find((m) => m.clientMsgId === clientMsgId);
    if (foundMem)
        return foundMem;
    // Check DB if available
    if (await isDbAvailable()) {
        try {
            const dbMsg = await prisma_js_1.prisma.message.findFirst({
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
        }
        catch {
            dbOnline = false;
        }
    }
    return null;
}
async function findMessageById(messageId) {
    // Check memory
    for (const list of memoryMessages.values()) {
        const found = list.find((m) => m.id === messageId);
        if (found)
            return found;
    }
    // Check DB if available
    if (await isDbAvailable()) {
        try {
            const dbMsg = await prisma_js_1.prisma.message.findUnique({
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
        }
        catch {
            dbOnline = false;
        }
    }
    return null;
}
async function getMissedMessages(chatId, lastSyncedSeq, limit) {
    // Try DB if available
    if (await isDbAvailable()) {
        try {
            const missed = await prisma_js_1.prisma.message.findMany({
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
        }
        catch {
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
function getAllChatsForUser(userId) {
    const result = [];
    for (const [chatId, chat] of memoryChats.entries()) {
        const participantKey = `${chatId}_${userId}`;
        const isMember = memoryParticipants.has(participantKey) ||
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
function getAllMessagesForChat(chatId, limit = 100, beforeSeq) {
    const msgs = memoryMessages.get(chatId) || [];
    let eligible = msgs;
    if (beforeSeq) {
        try {
            const bSeq = BigInt(beforeSeq);
            eligible = msgs.filter((m) => m.seqId < bSeq);
        }
        catch {
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
