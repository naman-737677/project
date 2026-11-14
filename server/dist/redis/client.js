"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.CHANNELS = exports.redisSub = exports.redisPub = exports.redis = void 0;
exports.initRedis = initRedis;
exports.getNextChatSeq = getNextChatSeq;
exports.checkAndSetIdempotency = checkAndSetIdempotency;
exports.clearIdempotency = clearIdempotency;
exports.setUserOnline = setUserOnline;
exports.setUserOffline = setUserOffline;
exports.isUserOnline = isUserOnline;
const ioredis_1 = __importDefault(require("ioredis"));
const index_js_1 = require("../config/index.js");
const prisma_js_1 = require("../db/prisma.js");
const commonRetryStrategy = (times) => {
    const delay = Math.min(times * 300, 3000);
    return delay;
};
exports.redis = new ioredis_1.default(index_js_1.config.redisUrl, {
    lazyConnect: true,
    maxRetriesPerRequest: 3,
    retryStrategy: commonRetryStrategy,
});
exports.redisPub = new ioredis_1.default(index_js_1.config.redisUrl, {
    lazyConnect: true,
    maxRetriesPerRequest: 3,
    retryStrategy: commonRetryStrategy,
});
exports.redisSub = new ioredis_1.default(index_js_1.config.redisUrl, {
    lazyConnect: true,
    maxRetriesPerRequest: null, // Subscribers should retry continuously
    retryStrategy: commonRetryStrategy,
});
let lastErrorLogTime = 0;
function logRedisError(label, err) {
    const now = Date.now();
    if (now - lastErrorLogTime > 3000) {
        lastErrorLogTime = now;
        const msg = err?.message || err?.code || String(err);
        console.warn(`${label}: ${msg}`);
    }
}
exports.redis.on('error', (err) => logRedisError('[Redis Client Error]', err));
exports.redisPub.on('error', (err) => logRedisError('[Redis Pub Error]', err));
exports.redisSub.on('error', (err) => logRedisError('[Redis Sub Error]', err));
async function initRedis() {
    const clients = [exports.redis, exports.redisPub, exports.redisSub];
    await Promise.all(clients.map((c) => {
        if (c.status === 'wait') {
            return c.connect();
        }
        return Promise.resolve();
    }));
    console.log('[Redis] Connected to cluster/instance at', index_js_1.config.redisUrl);
}
// ----------------------------------------------------------------------
// Monotonic Sequence Generation (Telegram-style PTS / seq_id)
// ----------------------------------------------------------------------
async function getNextChatSeq(chatId) {
    if (exports.redis.status === 'ready') {
        try {
            const exists = await exports.redis.exists(`chat:${chatId}:seq`);
            if (!exists) {
                const chat = await prisma_js_1.prisma.chat.findUnique({
                    where: { id: chatId },
                    select: { currentSeqId: true },
                });
                const current = chat?.currentSeqId ?? 0n;
                await exports.redis.set(`chat:${chatId}:seq`, current.toString(), 'NX');
            }
            const seq = await exports.redis.incr(`chat:${chatId}:seq`);
            return BigInt(seq);
        }
        catch (err) {
            console.warn('[Redis] getNextChatSeq fallback to database:', err.message);
        }
    }
    // Fallback: database atomic increment
    const updated = await prisma_js_1.prisma.chat.update({
        where: { id: chatId },
        data: { currentSeqId: { increment: 1 } },
        select: { currentSeqId: true },
    });
    return updated.currentSeqId;
}
// ----------------------------------------------------------------------
// Idempotency Lock
// ----------------------------------------------------------------------
async function checkAndSetIdempotency(userId, clientMsgId) {
    if (exports.redis.status !== 'ready') {
        return true; // Bypass cache check if Redis is offline
    }
    try {
        const result = await exports.redis.set(`idempotency:${userId}:${clientMsgId}`, '1', 'EX', 60, 'NX');
        return result === 'OK';
    }
    catch {
        return true;
    }
}
async function clearIdempotency(userId, clientMsgId) {
    if (exports.redis.status === 'ready') {
        try {
            await exports.redis.del(`idempotency:${userId}:${clientMsgId}`);
        }
        catch {
            // Ignore
        }
    }
}
// ----------------------------------------------------------------------
// Presence & Heartbeat State
// ----------------------------------------------------------------------
const PRESENCE_TTL_SECONDS = 45;
async function setUserOnline(userId) {
    if (exports.redis.status === 'ready') {
        try {
            await exports.redis.set(`presence:${userId}`, 'ONLINE', 'EX', PRESENCE_TTL_SECONDS);
            await exports.redis.sadd('online_users', userId);
        }
        catch {
            // Ignore Redis presence cache failure
        }
    }
}
async function setUserOffline(userId) {
    if (exports.redis.status === 'ready') {
        try {
            await exports.redis.del(`presence:${userId}`);
            await exports.redis.srem('online_users', userId);
        }
        catch {
            // Ignore Redis presence cache failure
        }
    }
}
async function isUserOnline(userId) {
    if (exports.redis.status === 'ready') {
        try {
            const status = await exports.redis.get(`presence:${userId}`);
            return status === 'ONLINE';
        }
        catch {
            return false;
        }
    }
    return false;
}
// ----------------------------------------------------------------------
// Pub/Sub Channels
// ----------------------------------------------------------------------
exports.CHANNELS = {
    chat: (chatId) => `pubsub:chat:${chatId}`,
    user: (userId) => `pubsub:user:${userId}`,
    presence: () => 'pubsub:presence',
};
