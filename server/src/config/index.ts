import dotenv from 'dotenv';
dotenv.config();

export const config = {
  port: parseInt(process.env.PORT || '4000', 10),
  nodeEnv: process.env.NODE_ENV || 'development',
  databaseUrl: process.env.DATABASE_URL || 'postgresql://postgres:postgres@localhost:5432/telegram_db?schema=public',
  redisUrl: process.env.REDIS_URL || 'redis://localhost:6379',
  jwtSecret: process.env.JWT_SECRET || 'super-secret-jwt-key-replace-in-production-min-32-chars',
  jwtExpiresIn: process.env.JWT_EXPIRES_IN || '7d',
  wsHeartbeatIntervalMs: parseInt(process.env.WS_HEARTBEAT_INTERVAL_MS || '30000', 10),
  wsHeartbeatTimeoutMs: parseInt(process.env.WS_HEARTBEAT_TIMEOUT_MS || '10000', 10),
};
