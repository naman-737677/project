"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.findUserByUsername = findUserByUsername;
exports.findUserById = findUserById;
exports.createUser = createUser;
exports.updateUser2FA = updateUser2FA;
exports.updateUserAvatar = updateUserAvatar;
const fs_1 = __importDefault(require("fs"));
const path_1 = __importDefault(require("path"));
const prisma_js_1 = require("../db/prisma.js");
const totp_js_1 = require("./totp.js");
const chatStore_js_1 = require("../db/chatStore.js");
// In-memory persistent cache for users and 2FA states
const usersByUsername = new Map();
const usersById = new Map();
const DATA_DIR = path_1.default.resolve(process.cwd(), 'data');
const USERS_FILE = path_1.default.join(DATA_DIR, 'users.json');
function saveUsersToDisk() {
    try {
        if (!fs_1.default.existsSync(DATA_DIR)) {
            fs_1.default.mkdirSync(DATA_DIR, { recursive: true });
        }
        const allUsers = Array.from(usersById.values());
        fs_1.default.writeFileSync(USERS_FILE, JSON.stringify(allUsers, null, 2), 'utf-8');
    }
    catch (err) {
        // Ignore if file write fails
    }
}
function loadUsersFromDisk() {
    try {
        if (fs_1.default.existsSync(USERS_FILE)) {
            const content = fs_1.default.readFileSync(USERS_FILE, 'utf-8');
            const saved = JSON.parse(content);
            if (Array.isArray(saved)) {
                for (const u of saved) {
                    usersByUsername.set(u.username.toLowerCase(), u);
                    usersById.set(u.id, u);
                }
            }
        }
    }
    catch {
        // Ignore corrupt or unreadable file
    }
}
// Initialize default test users: alice, bob, charlie (password: password123)
const defaultHash = (0, totp_js_1.hashPassword)('password123');
const initialUsers = [
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
async function findUserByUsername(username) {
    const normalized = username.toLowerCase().trim();
    const cached = usersByUsername.get(normalized);
    if (cached)
        return cached;
    // Try DB if available
    if (await (0, chatStore_js_1.isDbAvailable)()) {
        try {
            const dbUser = await prisma_js_1.prisma.user.findUnique({
                where: { username: normalized },
            });
            if (dbUser) {
                const record = {
                    id: dbUser.id,
                    username: dbUser.username,
                    displayName: dbUser.displayName,
                    passwordHash: dbUser.passwordHash,
                    twoFactorSecret: dbUser.twoFactorSecret || null,
                    twoFactorEnabled: !!dbUser.twoFactorEnabled,
                };
                usersByUsername.set(record.username.toLowerCase(), record);
                usersById.set(record.id, record);
                return record;
            }
        }
        catch {
            // DB not available, fall back to memory
        }
    }
    return null;
}
async function findUserById(userId) {
    const cached = usersById.get(userId);
    if (cached)
        return cached;
    if (await (0, chatStore_js_1.isDbAvailable)()) {
        try {
            const dbUser = await prisma_js_1.prisma.user.findUnique({
                where: { id: userId },
            });
            if (dbUser) {
                const record = {
                    id: dbUser.id,
                    username: dbUser.username,
                    displayName: dbUser.displayName,
                    passwordHash: dbUser.passwordHash,
                    twoFactorSecret: dbUser.twoFactorSecret || null,
                    twoFactorEnabled: !!dbUser.twoFactorEnabled,
                };
                usersByUsername.set(record.username.toLowerCase(), record);
                usersById.set(record.id, record);
                return record;
            }
        }
        catch {
            // DB not available
        }
    }
    return null;
}
async function createUser(username, password, displayName) {
    const normalized = username.toLowerCase().trim();
    const id = crypto.randomUUID();
    const passwordHash = (0, totp_js_1.hashPassword)(password);
    const record = {
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
    if (await (0, chatStore_js_1.isDbAvailable)()) {
        try {
            await prisma_js_1.prisma.user.create({
                data: {
                    id,
                    username: normalized,
                    displayName: record.displayName,
                    passwordHash,
                },
            });
            // Also auto-add user to default demo chat so messaging succeeds without permission errors
            const demoChatId = '99999999-9999-4999-8999-999999999999';
            await prisma_js_1.prisma.chatParticipant.create({
                data: {
                    chatId: demoChatId,
                    userId: id,
                },
            }).catch(() => { });
        }
        catch (err) {
            console.warn('[DB User Create] Note: Prisma DB unavailable, user kept in active memory store:', err.message);
        }
    }
    return record;
}
async function updateUser2FA(userId, update) {
    const user = await findUserById(userId);
    if (!user)
        return;
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
    if (await (0, chatStore_js_1.isDbAvailable)()) {
        try {
            await prisma_js_1.prisma.user.update({
                where: { id: userId },
                data: {
                    twoFactorEnabled: user.twoFactorEnabled,
                    twoFactorSecret: user.twoFactorSecret,
                    pendingTwoFactorSecret: user.pendingTwoFactorSecret,
                },
            });
        }
        catch {
            // DB offline
        }
    }
}
async function updateUserAvatar(userId, avatarUrl) {
    const user = await findUserById(userId);
    if (!user)
        return null;
    user.avatarUrl = avatarUrl;
    usersByUsername.set(user.username.toLowerCase(), user);
    usersById.set(user.id, user);
    saveUsersToDisk();
    if (await (0, chatStore_js_1.isDbAvailable)()) {
        try {
            await prisma_js_1.prisma.user.update({
                where: { id: userId },
                data: { avatarUrl },
            });
        }
        catch {
            // DB offline
        }
    }
    return user;
}
