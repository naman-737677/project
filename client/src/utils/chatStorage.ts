import { Chat, Message } from '../types';

export interface StoredUserSession {
  userId: string;
  username: string;
  displayName: string;
  loggedOutAt: number;
  chatsCount: number;
  totalMessagesCount: number;
  chats: Chat[];
  messagesByChat: { [chatId: string]: Message[] };
}

const USER_CHATS_PREFIX = 'telegram_chats_';
const USER_MSGS_PREFIX = 'telegram_messages_';
const STORED_SESSIONS_KEY = 'telegram_stored_sessions';
const LAST_STORED_SESSION_KEY = 'telegram_last_stored_session';

export function getUserChatsKey(userId: string): string {
  return `${USER_CHATS_PREFIX}${userId}`;
}

export function getUserMsgsKey(userId: string): string {
  return `${USER_MSGS_PREFIX}${userId}`;
}

/**
 * Persists all previous chats and their messages into local storage.
 * If isLoggedOut is true, updates the stored sessions archive with the logout timestamp.
 */
export function saveUserChatsAndMessages(
  userId: string,
  username: string,
  displayName: string,
  chats: Chat[],
  messagesByChat: { [chatId: string]: Message[] },
  isLoggedOut = false
): void {
  if (!userId) return;
  try {
    // 1. Save per-user chats & messages
    localStorage.setItem(getUserChatsKey(userId), JSON.stringify(chats));
    localStorage.setItem(getUserMsgsKey(userId), JSON.stringify(messagesByChat));

    // Also update global fallback key
    localStorage.setItem('telegram_chats', JSON.stringify(chats));

    // Count total messages
    let totalMessages = 0;
    for (const msgList of Object.values(messagesByChat)) {
      totalMessages += (msgList || []).length;
    }

    // 2. Update stored sessions archive for logged out sessions
    const sessions = getAllStoredSessions();
    const existingIndex = sessions.findIndex(
      (s) => s.userId === userId || s.username.toLowerCase() === username.toLowerCase()
    );

    const prevLoggedOutAt = existingIndex >= 0 ? sessions[existingIndex].loggedOutAt : Date.now();
    const loggedOutAt = isLoggedOut ? Date.now() : prevLoggedOutAt;

    const sessionData: StoredUserSession = {
      userId,
      username,
      displayName: displayName || username,
      loggedOutAt,
      chatsCount: chats.length,
      totalMessagesCount: totalMessages,
      chats,
      messagesByChat,
    };

    if (existingIndex >= 0) {
      sessions[existingIndex] = sessionData;
    } else {
      sessions.unshift(sessionData);
    }

    localStorage.setItem(STORED_SESSIONS_KEY, JSON.stringify(sessions));
    localStorage.setItem(LAST_STORED_SESSION_KEY, JSON.stringify(sessionData));
  } catch (err) {
    console.warn('[chatStorage] Failed to save chats to localStorage:', err);
  }
}

/**
 * Retrieve saved chats for a specific user ID.
 */
export function getUserStoredChats(userId: string): Chat[] | null {
  if (!userId) return null;
  try {
    const raw = localStorage.getItem(getUserChatsKey(userId));
    if (raw) {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed) && parsed.length > 0) return parsed;
    }
    const session = getStoredSession(userId);
    if (session?.chats && session.chats.length > 0) return session.chats;
  } catch {
    return null;
  }
  return null;
}

/**
 * Retrieve saved messages by chatId for a specific user ID.
 */
export function getUserStoredMessages(userId: string): { [chatId: string]: Message[] } | null {
  if (!userId) return null;
  try {
    const raw = localStorage.getItem(getUserMsgsKey(userId));
    if (raw) {
      const parsed = JSON.parse(raw);
      if (parsed && typeof parsed === 'object') return parsed;
    }
    const session = getStoredSession(userId);
    if (session?.messagesByChat) return session.messagesByChat;
  } catch {
    return null;
  }
  return null;
}

/**
 * Get all stored user sessions that have been archived upon logout.
 */
export function getAllStoredSessions(): StoredUserSession[] {
  try {
    const raw = localStorage.getItem(STORED_SESSIONS_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) return parsed;
    }
  } catch {}
  return [];
}

/**
 * Get a specific stored session by userId or username.
 */
export function getStoredSession(userIdOrUsername: string): StoredUserSession | null {
  const sessions = getAllStoredSessions();
  const clean = userIdOrUsername.toLowerCase().trim().replace(/^@+/, '');
  const found = sessions.find(
    (s) =>
      s.userId === userIdOrUsername ||
      s.username.toLowerCase() === clean
  );
  return found || null;
}

/**
 * Remove an archived session for a user.
 */
export function clearStoredSession(userId: string): void {
  try {
    localStorage.removeItem(getUserChatsKey(userId));
    localStorage.removeItem(getUserMsgsKey(userId));
    const sessions = getAllStoredSessions().filter((s) => s.userId !== userId);
    localStorage.setItem(STORED_SESSIONS_KEY, JSON.stringify(sessions));
  } catch {}
}

/**
 * Clear all stored previous sessions.
 */
export function clearAllStoredSessions(): void {
  try {
    const sessions = getAllStoredSessions();
    for (const s of sessions) {
      localStorage.removeItem(getUserChatsKey(s.userId));
      localStorage.removeItem(getUserMsgsKey(s.userId));
    }
    localStorage.removeItem(STORED_SESSIONS_KEY);
    localStorage.removeItem(LAST_STORED_SESSION_KEY);
  } catch {}
}

/**
 * Exports a stored session as a formatted JSON string.
 */
export function exportSessionAsJson(session: StoredUserSession): string {
  return JSON.stringify(session, null, 2);
}

/**
 * Triggers a client-side download of the stored chats and messages JSON file.
 */
export function downloadSessionExport(session: StoredUserSession): void {
  const dataStr = 'data:text/json;charset=utf-8,' + encodeURIComponent(exportSessionAsJson(session));
  const downloadAnchor = document.createElement('a');
  const dateStr = new Date(session.loggedOutAt).toISOString().slice(0, 10);
  downloadAnchor.setAttribute('href', dataStr);
  downloadAnchor.setAttribute('download', `telegram_chats_${session.username}_${dateStr}.json`);
  document.body.appendChild(downloadAnchor);
  downloadAnchor.click();
  downloadAnchor.remove();
}
