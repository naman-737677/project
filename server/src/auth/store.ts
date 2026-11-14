import fs from 'fs';
import path from 'path';
import { prisma } from '../db/prisma.js';
import { hashPassword } from './totp.js';
import { isDbAvailable } from '../db/chatStore.js';

export interface UserAuthRecord {
  id: string;
  username: string;
  displayName: string;
  passwordHash: string;
  avatarUrl?: string | null;
  twoFactorSecret?: string | null;
  twoFactorEnabled: boolean;
  pendingTwoFactorSecret?: string | null;
}

// In-memory persistent cache for users and 2FA states
const usersByUsername = new Map<string, UserAuthRecord>();
const usersById = new Map<string, UserAuthRecord>();

const DATA_DIR = path.resolve(process.cwd(), 'data');
const USERS_FILE = path.join(DATA_DIR, 'users.json');

function saveUsersToDisk() {
  try {
    if (!fs.existsSync(DATA_DIR)) {
      fs.mkdirSync(DATA_DIR, { recursive: true });
    }
    const allUsers = Array.from(usersById.values());
    fs.writeFileSync(USERS_FILE, JSON.stringify(allUsers, null, 2), 'utf-8');
  } catch (err) {
    // Ignore if file write fails
  }
}

function loadUsersFromDisk() {
  try {
    if (fs.existsSync(USERS_FILE)) {
      const content = fs.readFileSync(USERS_FILE, 'utf-8');
      const saved = JSON.parse(content);
      if (Array.isArray(saved)) {
        for (const u of saved) {
          usersByUsername.set(u.username.toLowerCase(), u);
          usersById.set(u.id, u);
        }
      }
    }
  } catch {
    // Ignore corrupt or unreadable file
  }
}

// Initialize default test users: alice, bob, charlie (password: password123)
const defaultHash = hashPassword('password123');

const initialUsers: UserAuthRecord[] = [
  {
    id: '11111111-1111-4111-8111-111111111111',
    username: 'alice',
    displayName: 'Alice Johnson',
    passwordHash: defaultHash,
    twoFactorEnabled: true,
    twoFactorSecret: 'IYOBG7GF6WBAJDCJTCQKLMUN4LRHLORL',
  },
  {
    id: '22222222-2222-4222-8222-222222222222',
    username: 'bob',
    displayName: 'Bob Smith',
    passwordHash: defaultHash,
    twoFactorEnabled: true,
    twoFactorSecret: 'JBSWY3DPEHPK3PXPJBSWY3DPEHPK3PXP',
  },
  {
    id: '33333333-3333-4333-8333-333333333333',
    username: 'charlie',
    displayName: 'Charlie Brown',
    passwordHash: defaultHash,
    twoFactorEnabled: true,
    twoFactorSecret: 'LYFXXVXGJIR5BZOHRH46L47UNN5ORK2W',
  },
];

for (const u of initialUsers) {
  usersByUsername.set(u.username.toLowerCase(), u);
  usersById.set(u.id, u);
}

// Hydrate saved users from disk on startup
loadUsersFromDisk();

export async function findUserByUsername(username: string): Promise<UserAuthRecord | null> {
  const normalized = username.toLowerCase().trim();
  const cached = usersByUsername.get(normalized);
  if (cached) return cached;

  // Try DB if available
  if (await isDbAvailable()) {
    try {
      const dbUser = await prisma.user.findUnique({
        where: { username: normalized },
      });
      if (dbUser) {
        const record: UserAuthRecord = {
          id: dbUser.id,
          username: dbUser.username,
          displayName: dbUser.displayName,
          passwordHash: dbUser.passwordHash,
          twoFactorSecret: (dbUser as any).twoFactorSecret || null,
          twoFactorEnabled: !!(dbUser as any).twoFactorEnabled,
        };
        usersByUsername.set(record.username.toLowerCase(), record);
        usersById.set(record.id, record);
        return record;
      }
    } catch {
      // DB not available, fall back to memory
    }
  }

  return null;
}

export async function findUserById(userId: string): Promise<UserAuthRecord | null> {
  const cached = usersById.get(userId);
  if (cached) return cached;

  if (await isDbAvailable()) {
    try {
      const dbUser = await prisma.user.findUnique({
        where: { id: userId },
      });
      if (dbUser) {
        const record: UserAuthRecord = {
          id: dbUser.id,
          username: dbUser.username,
          displayName: dbUser.displayName,
          passwordHash: dbUser.passwordHash,
          twoFactorSecret: (dbUser as any).twoFactorSecret || null,
          twoFactorEnabled: !!(dbUser as any).twoFactorEnabled,
        };
        usersByUsername.set(record.username.toLowerCase(), record);
        usersById.set(record.id, record);
        return record;
      }
    } catch {
      // DB not available
    }
  }

  return null;
}

export async function createUser(
  username: string,
  password: string,
  displayName?: string
): Promise<UserAuthRecord> {
  const normalized = username.toLowerCase().trim();
  const id = crypto.randomUUID();
  const passwordHash = hashPassword(password);
  const record: UserAuthRecord = {
    id,
    username: normalized,
    displayName: displayName?.trim() || username,
    passwordHash,
    twoFactorEnabled: false,
  };

  usersByUsername.set(normalized, record);
  usersById.set(id, record);
  saveUsersToDisk();

  // Try persisting to Prisma DB if available
  if (await isDbAvailable()) {
    try {
      await prisma.user.create({
        data: {
          id,
          username: normalized,
          displayName: record.displayName,
          passwordHash,
        },
      });

      // Also auto-add user to default demo chat so messaging succeeds without permission errors
      const demoChatId = '99999999-9999-4999-8999-999999999999';
      await prisma.chatParticipant.create({
        data: {
          chatId: demoChatId,
          userId: id,
        },
      }).catch(() => {});
    } catch (err) {
      console.warn('[DB User Create] Note: Prisma DB unavailable, user kept in active memory store:', (err as Error).message);
    }
  }

  return record;
}

export async function updateUser2FA(
  userId: string,
  update: { twoFactorEnabled: boolean; twoFactorSecret?: string | null; pendingTwoFactorSecret?: string | null }
): Promise<void> {
  const user = await findUserById(userId);
  if (!user) return;

  if (update.twoFactorEnabled !== undefined) {
    user.twoFactorEnabled = update.twoFactorEnabled;
  }
  if (update.twoFactorSecret !== undefined) {
    user.twoFactorSecret = update.twoFactorSecret;
  }
  if (update.pendingTwoFactorSecret !== undefined) {
    user.pendingTwoFactorSecret = update.pendingTwoFactorSecret;
  }

  usersByUsername.set(user.username.toLowerCase(), user);
  usersById.set(user.id, user);
  saveUsersToDisk();

  // Also persist to DB if available
  if (await isDbAvailable()) {
    try {
      await prisma.user.update({
        where: { id: userId },
        data: {
          twoFactorEnabled: user.twoFactorEnabled,
          twoFactorSecret: user.twoFactorSecret,
          pendingTwoFactorSecret: user.pendingTwoFactorSecret,
        } as any,
      });
    } catch {
      // DB offline
    }
  }
}

export async function updateUserAvatar(
  userId: string,
  avatarUrl: string | null
): Promise<UserAuthRecord | null> {
  const user = await findUserById(userId);
  if (!user) return null;

  user.avatarUrl = avatarUrl;
  usersByUsername.set(user.username.toLowerCase(), user);
  usersById.set(user.id, user);
  saveUsersToDisk();

  if (await isDbAvailable()) {
    try {
      await prisma.user.update({
        where: { id: userId },
        data: { avatarUrl },
      });
    } catch {
      // DB offline
    }
  }

  return user;
}
