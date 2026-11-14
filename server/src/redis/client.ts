import Redis from 'ioredis';
import { config } from '../config/index.js';
import { prisma } from '../db/prisma.js';

const commonRetryStrategy = (times: number) => {
  const delay = Math.min(times * 300, 3000);
  return delay;
};

export const redis = new Redis(config.redisUrl, {
  lazyConnect: true,
  maxRetriesPerRequest: 3,
  retryStrategy: commonRetryStrategy,
});

export const redisPub = new Redis(config.redisUrl, {
  lazyConnect: true,
  maxRetriesPerRequest: 3,
  retryStrategy: commonRetryStrategy,
});

export const redisSub = new Redis(config.redisUrl, {
  lazyConnect: true,
  maxRetriesPerRequest: null, // Subscribers should retry continuously
  retryStrategy: commonRetryStrategy,
});

let lastErrorLogTime = 0;
function logRedisError(label: string, err: unknown) {
  const now = Date.now();
  if (now - lastErrorLogTime > 3000) {
    lastErrorLogTime = now;
    const msg = (err as Error)?.message || (err as any)?.code || String(err);
    console.warn(`${label}: ${msg}`);
  }
}

redis.on('error', (err) => logRedisError('[Redis Client Error]', err));
redisPub.on('error', (err) => logRedisError('[Redis Pub Error]', err));
redisSub.on('error', (err) => logRedisError('[Redis Sub Error]', err));

export async function initRedis(): Promise<void> {
  const clients = [redis, redisPub, redisSub];
  await Promise.all(
    clients.map((c) => {
      if (c.status === 'wait') {
        return c.connect();
      }
      return Promise.resolve();
    })
  );
  console.log('[Redis] Connected to cluster/instance at', config.redisUrl);
}

// ----------------------------------------------------------------------
// Monotonic Sequence Generation (Telegram-style PTS / seq_id)
// ----------------------------------------------------------------------

export async function getNextChatSeq(chatId: string): Promise<bigint> {
  if (redis.status === 'ready') {
    try {
      const exists = await redis.exists(`chat:${chatId}:seq`);
      if (!exists) {
        const chat = await prisma.chat.findUnique({
          where: { id: chatId },
          select: { currentSeqId: true },
        });
        const current = chat?.currentSeqId ?? 0n;
        await redis.set(`chat:${chatId}:seq`, current.toString(), 'NX');
      }
      const seq = await redis.incr(`chat:${chatId}:seq`);
      return BigInt(seq);
    } catch (err) {
      console.warn('[Redis] getNextChatSeq fallback to database:', (err as Error).message);
    }
  }

  // Fallback: database atomic increment
  const updated = await prisma.chat.update({
    where: { id: chatId },
    data: { currentSeqId: { increment: 1 } },
    select: { currentSeqId: true },
  });
  return updated.currentSeqId;
}

// ----------------------------------------------------------------------
// Idempotency Lock
// ----------------------------------------------------------------------

export async function checkAndSetIdempotency(userId: string, clientMsgId: string): Promise<boolean> {
  if (redis.status !== 'ready') {
    return true; // Bypass cache check if Redis is offline
  }
  try {
    const result = await redis.set(`idempotency:${userId}:${clientMsgId}`, '1', 'EX', 60, 'NX');
    return result === 'OK';
  } catch {
    return true;
  }
}

export async function clearIdempotency(userId: string, clientMsgId: string): Promise<void> {
  if (redis.status === 'ready') {
    try {
      await redis.del(`idempotency:${userId}:${clientMsgId}`);
    } catch {
      // Ignore
    }
  }
}

// ----------------------------------------------------------------------
// Presence & Heartbeat State
// ----------------------------------------------------------------------

const PRESENCE_TTL_SECONDS = 45;

export async function setUserOnline(userId: string): Promise<void> {
  if (redis.status === 'ready') {
    try {
      await redis.set(`presence:${userId}`, 'ONLINE', 'EX', PRESENCE_TTL_SECONDS);
      await redis.sadd('online_users', userId);
    } catch {
      // Ignore Redis presence cache failure
    }
  }
}

export async function setUserOffline(userId: string): Promise<void> {
  if (redis.status === 'ready') {
    try {
      await redis.del(`presence:${userId}`);
      await redis.srem('online_users', userId);
    } catch {
      // Ignore Redis presence cache failure
    }
  }
}

export async function isUserOnline(userId: string): Promise<boolean> {
  if (redis.status === 'ready') {
    try {
      const status = await redis.get(`presence:${userId}`);
      return status === 'ONLINE';
    } catch {
      return false;
    }
  }
  return false;
}

// ----------------------------------------------------------------------
// Pub/Sub Channels
// ----------------------------------------------------------------------

export const CHANNELS = {
  chat: (chatId: string) => `pubsub:chat:${chatId}`,
  user: (userId: string) => `pubsub:user:${userId}`,
  presence: () => 'pubsub:presence',
};
