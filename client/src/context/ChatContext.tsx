import React, { createContext, useContext, useState, useEffect, useCallback, useRef } from 'react';
import { useAuth, DEMO_USERS } from './AuthContext';
import {
  Chat,
  Message,
  MessageAttachment,
  Friend,
  DirectConversation,
  UserPresenceData,
  WsIncomingEvent,
  WsOutgoingEvent,
  MessageAckData,
  NewMessageData,
  UserTypingData,
  ParticipantReadData,
  SyncResponseData,
  WsEnvelope,
} from '../types';
import { wsClient } from '../services/websocket';
import {
  saveUserChatsAndMessages,
  getUserStoredChats,
  getUserStoredMessages,
} from '../utils/chatStorage';

// Default seeded chat rooms for quick testing
export const INITIAL_CHATS: Chat[] = [
  {
    id: '99999999-9999-4999-8999-999999999999',
    title: '🚀 Telegram Core Team',
    type: 'GROUP',
    lastMessage: 'Welcome to the real-time cluster!',
    lastMessageTime: Date.now() - 3600000,
    unreadCount: 0,
    currentSeqId: '1',
  },
  {
    id: '88888888-8888-4888-8888-888888888888',
    title: '💬 General Lounge',
    type: 'GROUP',
    lastMessage: 'High-throughput WebSocket messaging is active.',
    lastMessageTime: Date.now() - 1800000,
    unreadCount: 0,
    currentSeqId: '1',
  },
];

interface ChatContextType {
  chats: Chat[];
  activeChatId: string | null;
  activeChat: Chat | null;
  messages: Message[];
  messagesByChat: { [chatId: string]: Message[] };
  typingUsers: { [chatId: string]: string[] };
  serverError: string | null;
  clearServerError: () => void;
  selectChat: (chatId: string) => void;
  createChat: (title: string, type?: 'DIRECT' | 'GROUP', customId?: string) => Chat;
  sendMessage: (content: string, type?: 'TEXT' | 'IMAGE' | 'VIDEO' | 'AUDIO' | 'FILE', attachments?: MessageAttachment[]) => void;
  sendFileMessage: (file: File, caption?: string) => Promise<boolean>;
  sendTyping: (isTyping: boolean) => void;
  markChatAsRead: (chatId: string) => void;

  // Friends & Direct Messaging
  friends: Friend[];
  isLoadingFriends: boolean;
  isFriendsPanelOpen: boolean;
  toggleFriendsPanel: () => void;
  setIsFriendsPanelOpen: (open: boolean) => void;
  loadFriends: () => Promise<void>;
  addFriend: (targetUsername: string) => Promise<{ success: boolean; error?: string; friend?: Friend }>;
  removeFriend: (friendId: string) => Promise<boolean>;
  openDirectChat: (friend: Friend) => void;
  getDirectConversations: () => DirectConversation[];
  saveChatsOnLogout: () => void;

  // Previous Chat History & Scrolling
  loadEarlierMessages: (chatId: string) => Promise<boolean>;
  isLoadingEarlier: boolean;
  hasEarlierMessages: boolean;
}

const ChatContext = createContext<ChatContextType | undefined>(undefined);

export const ChatProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { currentUser, connectionState } = useAuth();

  // Load per-user stored chats on initialization
  const [chats, setChats] = useState<Chat[]>(() => {
    if (currentUser?.userId) {
      const userChats = getUserStoredChats(currentUser.userId);
      if (userChats && userChats.length > 0) return userChats;
    }
    const saved = localStorage.getItem('telegram_chats');
    return saved ? JSON.parse(saved) : INITIAL_CHATS;
  });

  const [activeChatId, setActiveChatId] = useState<string | null>(() => {
    return INITIAL_CHATS[0]?.id || null;
  });

  // Load per-user stored messages on initialization
  const [messagesByChat, setMessagesByChat] = useState<{ [chatId: string]: Message[] }>(() => {
    if (currentUser?.userId) {
      const userMsgs = getUserStoredMessages(currentUser.userId);
      if (userMsgs) return userMsgs;
    }
    return {};
  });

  const [typingUsers, setTypingUsers] = useState<{ [chatId: string]: string[] }>({});
  const [serverError, setServerError] = useState<string | null>(null);

  // Previous Messages / History Scrolling State
  const [isLoadingEarlier, setIsLoadingEarlier] = useState<boolean>(false);
  const [hasMoreEarlierByChat, setHasMoreEarlierByChat] = useState<{ [chatId: string]: boolean }>({});

  // Friends State
  const [friends, setFriends] = useState<Friend[]>([]);
  const [isLoadingFriends, setIsLoadingFriends] = useState<boolean>(false);
  const [isFriendsPanelOpen, setIsFriendsPanelOpen] = useState<boolean>(() => {
    if (typeof window !== 'undefined' && window.innerWidth >= 960) {
      return true;
    }
    return false;
  });

  const typingTimeoutRef = useRef<{ [key: string]: any }>({});
  const lastTypingSentRef = useRef<number>(0);

  // Keep references to latest states so cleanup unmount can safely persist chats when logging out
  const chatsRef = useRef(chats);
  const messagesRef = useRef(messagesByChat);
  const currentUserRef = useRef(currentUser);

  useEffect(() => {
    chatsRef.current = chats;
  }, [chats]);

  useEffect(() => {
    messagesRef.current = messagesByChat;
  }, [messagesByChat]);

  useEffect(() => {
    currentUserRef.current = currentUser;
  }, [currentUser]);

  // Persist chats and messages per user
  useEffect(() => {
    if (currentUser?.userId) {
      saveUserChatsAndMessages(
        currentUser.userId,
        currentUser.username,
        currentUser.displayName,
        chats,
        messagesByChat,
        false
      );
    } else {
      localStorage.setItem('telegram_chats', JSON.stringify(chats));
    }
  }, [chats, messagesByChat, currentUser]);

  // When unmounting (e.g. user logs out), ensure all chats and messages are flushed to stored sessions archive!
  useEffect(() => {
    return () => {
      if (currentUserRef.current?.userId) {
        saveUserChatsAndMessages(
          currentUserRef.current.userId,
          currentUserRef.current.username,
          currentUserRef.current.displayName,
          chatsRef.current,
          messagesRef.current,
          true // Marked as stored upon logout
        );
      }
    };
  }, []);

  // Explicit helper called when user clicks logout
  const saveChatsOnLogout = useCallback(() => {
    if (currentUser?.userId) {
      saveUserChatsAndMessages(
        currentUser.userId,
        currentUser.username,
        currentUser.displayName,
        chats,
        messagesByChat,
        true // isLoggedOut = true
      );
    }
  }, [currentUser, chats, messagesByChat]);

  // Re-hydrate stored chats and messages when user switches or logs in
  useEffect(() => {
    if (currentUser?.userId) {
      const storedChats = getUserStoredChats(currentUser.userId);
      if (storedChats && storedChats.length > 0) {
        setChats(storedChats);
      }
      const storedMsgs = getUserStoredMessages(currentUser.userId);
      if (storedMsgs) {
        setMessagesByChat(storedMsgs);
      }
    }
  }, [currentUser?.userId]);

  // Fetch persisted chats from server on login
  useEffect(() => {
    if (!currentUser?.userId) return;
    const fetchServerChats = async () => {
      try {
        const res = await fetch(`/api/chats?userId=${encodeURIComponent(currentUser.userId)}`, {
          headers: currentUser.token ? { Authorization: `Bearer ${currentUser.token}` } : {},
        });
        const data = await res.json();
        if (data.status === 'success' && Array.isArray(data.chats)) {
          setChats((prev) => {
            const updated = [...prev];
            let changed = false;
            for (const sc of data.chats) {
              const existingIdx = updated.findIndex((c) => c.id === sc.id);
              if (existingIdx >= 0) {
                if (sc.lastMessage && !updated[existingIdx].lastMessage) {
                  updated[existingIdx] = { ...updated[existingIdx], ...sc };
                  changed = true;
                }
              } else {
                updated.push({
                  id: sc.id,
                  title: sc.title,
                  type: sc.type,
                  lastMessage: sc.lastMessage || '',
                  lastMessageTime: sc.lastMessageTime || Date.now(),
                  unreadCount: sc.unreadCount || 0,
                  currentSeqId: sc.currentSeqId || '0',
                });
                changed = true;
              }
            }
            return changed ? updated : prev;
          });
        }
      } catch {
        // Fallback to local storage
      }
    };
    fetchServerChats();
  }, [currentUser?.userId]);

  const syncChat = useCallback((chatId: string) => {
    const currentMsgs = messagesByChat[chatId] || [];
    const highestSeq = currentMsgs.reduce((max, m) => {
      try {
        const s = BigInt(m.seqId || '0');
        return s > max ? s : max;
      } catch {
        return max;
      }
    }, 0n);

    wsClient.send(WsIncomingEvent.SYNC_REQUEST, {
      chat_id: chatId,
      last_synced_seq: highestSeq.toString(),
      limit: 50,
    });
  }, [messagesByChat]);

  // Load friends from server
  const loadFriends = useCallback(async () => {
    if (!currentUser?.userId) return;
    try {
      setIsLoadingFriends(true);
      const res = await fetch(`/api/friends?userId=${encodeURIComponent(currentUser.userId)}`, {
        headers: {
          Authorization: `Bearer ${currentUser.token || ''}`,
        },
      });
      const data = await res.json();
      if (data.status === 'success' && Array.isArray(data.friends)) {
        setFriends(data.friends);

        // Ensure direct chats for friends exist in local chats state
        setChats((prev) => {
          const updated = [...prev];
          let changed = false;
          for (const f of data.friends) {
            if (!updated.some((c) => c.id === f.directChatId)) {
              updated.push({
                id: f.directChatId,
                title: f.displayName || f.username,
                type: 'DIRECT',
                lastMessage: 'Direct chat with ' + (f.displayName || f.username),
                lastMessageTime: Date.now() - 3600000,
                unreadCount: 0,
                currentSeqId: '0',
              });
              changed = true;
            }
          }
          return changed ? updated : prev;
        });
      }
    } catch (err) {
      console.warn('Failed to fetch friends:', err);
    } finally {
      setIsLoadingFriends(false);
    }
  }, [currentUser]);

  // Fetch friends when user logs in
  useEffect(() => {
    if (currentUser?.userId) {
      loadFriends();
    }
  }, [currentUser?.userId, loadFriends]);

  // When connection turns CONNECTED and active chat exists, request SYNC
  useEffect(() => {
    if (connectionState === 'CONNECTED' && activeChatId) {
      syncChat(activeChatId);
    }
  }, [connectionState, activeChatId, syncChat]);

  // Register WebSocket listeners
  useEffect(() => {
    // 1. Handle MESSAGE_ACK
    const unsubAck = wsClient.on(WsOutgoingEvent.MESSAGE_ACK, (envelope: WsEnvelope<MessageAckData>) => {
      const ack = envelope.data;
      setMessagesByChat((prev) => {
        const chatMsgs = prev[ack.chat_id] || [];
        const updated = chatMsgs.map((m) => {
          if (m.clientMsgId === ack.client_msg_id) {
            return {
              ...m,
              id: ack.message_id || m.id,
              seqId: ack.seq_id,
              status: ack.status === 'PERSISTED' ? ('PERSISTED' as const) : ('FAILED' as const),
              timestamp: ack.server_timestamp || m.timestamp,
            };
          }
          return m;
        });
        return { ...prev, [ack.chat_id]: updated };
      });
    });

    // 2. Handle NEW_MESSAGE
    const unsubNewMsg = wsClient.on(WsOutgoingEvent.NEW_MESSAGE, (envelope: WsEnvelope<NewMessageData>) => {
      const data = envelope.data;
      const isMine = currentUser && data.sender_id === currentUser.userId;

      // Find sender name from demo users or friend list
      const sender = DEMO_USERS.find((u) => u.userId === data.sender_id);
      const senderFriend = friends.find((f) => f.id === data.sender_id);
      const senderName = sender
        ? sender.displayName
        : senderFriend
        ? senderFriend.displayName
        : isMine
        ? currentUser?.displayName
        : `User ${data.sender_id?.slice(0, 6)}`;

      const newMsg: Message = {
        id: data.message_id,
        clientMsgId: data.client_msg_id || undefined,
        chatId: data.chat_id,
        senderId: data.sender_id,
        senderName: senderName || 'Anonymous',
        seqId: data.seq_id,
        type: (data.type as any) || 'TEXT',
        content: data.content || '',
        replyToId: data.reply_to_id,
        attachments: data.attachments?.map((a: any) => ({
          ...a,
          file_url: a.file_url || a.fileUrl || '',
          fileUrl: a.file_url || a.fileUrl || '',
          file_name: a.file_name || a.fileName || 'file',
          fileName: a.file_name || a.fileName || 'file',
          file_size: (a.file_size || a.fileSize || '0').toString(),
          fileSize: (a.file_size || a.fileSize || '0').toString(),
          mime_type: a.mime_type || a.mimeType || 'application/octet-stream',
          mimeType: a.mime_type || a.mimeType || 'application/octet-stream',
        })),
        timestamp: new Date(data.created_at).getTime() || Date.now(),
        status: 'PERSISTED',
        isOutgoing: !!isMine,
      };

      setMessagesByChat((prev) => {
        const chatMsgs = prev[data.chat_id] || [];
        // Avoid duplicate insertion
        const exists = chatMsgs.some(
          (m) => (data.client_msg_id && m.clientMsgId === data.client_msg_id) || m.id === data.message_id
        );

        if (exists) {
          return {
            ...prev,
            [data.chat_id]: chatMsgs.map((m) => {
              if ((data.client_msg_id && m.clientMsgId === data.client_msg_id) || m.id === data.message_id) {
                return { ...m, ...newMsg, status: 'PERSISTED' };
              }
              return m;
            }),
          };
        }

        return {
          ...prev,
          [data.chat_id]: [...chatMsgs, newMsg],
        };
      });

      // Update sidebar chat lastMessage or insert if new direct chat
      setChats((prev) => {
        const exists = prev.some((c) => c.id === data.chat_id);
        if (exists) {
          return prev.map((c) => {
            if (c.id === data.chat_id) {
              return {
                ...c,
                lastMessage: data.content || 'Attachment',
                lastMessageTime: Date.now(),
                unreadCount: activeChatId === data.chat_id ? 0 : (c.unreadCount || 0) + 1,
              };
            }
            return c;
          });
        }

        // New conversation received in real time
        const newChatTitle = senderFriend ? senderFriend.displayName : senderName || 'Direct Message';
        const newChat: Chat = {
          id: data.chat_id,
          title: newChatTitle,
          type: 'DIRECT',
          lastMessage: data.content || 'New message',
          lastMessageTime: Date.now(),
          unreadCount: activeChatId === data.chat_id ? 0 : 1,
          currentSeqId: data.seq_id,
        };
        return [newChat, ...prev];
      });
    });

    // 3. Handle SYNC_RESPONSE
    const unsubSync = wsClient.on(WsOutgoingEvent.SYNC_RESPONSE, (envelope: WsEnvelope<SyncResponseData>) => {
      const data = envelope.data;
      if (!data || !data.chat_id || !Array.isArray(data.messages)) return;

      const formattedList: Message[] = data.messages.map((m) => {
        const isMine = currentUser && m.sender_id === currentUser.userId;
        const sender = DEMO_USERS.find((u) => u.userId === m.sender_id);
        const senderFriend = friends.find((f) => f.id === m.sender_id);
        const senderName = sender
          ? sender.displayName
          : senderFriend
          ? senderFriend.displayName
          : isMine
          ? currentUser?.displayName
          : `User ${m.sender_id?.slice(0, 6)}`;

        return {
          id: m.message_id,
          clientMsgId: m.client_msg_id || undefined,
          chatId: m.chat_id,
          senderId: m.sender_id,
          senderName: senderName || 'Anonymous',
          seqId: m.seq_id,
          type: (m.type as any) || 'TEXT',
          content: m.content || '',
          replyToId: m.reply_to_id,
          attachments: m.attachments?.map((a: any) => ({
            ...a,
            file_url: a.file_url || a.fileUrl || '',
            fileUrl: a.file_url || a.fileUrl || '',
            file_name: a.file_name || a.fileName || 'file',
            fileName: a.file_name || a.fileName || 'file',
            file_size: (a.file_size || a.fileSize || '0').toString(),
            fileSize: (a.file_size || a.fileSize || '0').toString(),
            mime_type: a.mime_type || a.mimeType || 'application/octet-stream',
            mimeType: a.mime_type || a.mimeType || 'application/octet-stream',
          })),
          timestamp: new Date(m.created_at).getTime() || Date.now(),
          status: 'PERSISTED',
          isOutgoing: !!isMine,
        };
      });

      setMessagesByChat((prev) => {
        const existing = prev[data.chat_id] || [];
        const msgMap = new Map<string, Message>();

        for (const m of existing) {
          if (m.clientMsgId) msgMap.set(m.clientMsgId, m);
          msgMap.set(m.id, m);
        }

        for (const m of formattedList) {
          if (m.clientMsgId && msgMap.has(m.clientMsgId)) {
            const old = msgMap.get(m.clientMsgId)!;
            msgMap.set(m.clientMsgId, { ...old, ...m, status: 'PERSISTED' });
          } else {
            msgMap.set(m.id, m);
          }
        }

        const merged = Array.from(new Set(msgMap.values())).sort((a, b) => {
          try {
            const seqA = BigInt(a.seqId || '0');
            const seqB = BigInt(b.seqId || '0');
            if (seqA !== seqB) return seqA < seqB ? -1 : 1;
          } catch {}
          return a.timestamp - b.timestamp;
        });

        return { ...prev, [data.chat_id]: merged };
      });
    });

    // 4. Handle PARTICIPANT_READ (Advance read watermark)
    const unsubRead = wsClient.on(WsOutgoingEvent.PARTICIPANT_READ, (envelope: WsEnvelope<ParticipantReadData>) => {
      const data = envelope.data;
      if (!data || !data.chat_id || !data.max_seq_id) return;

      try {
        const maxSeq = BigInt(data.max_seq_id);
        setMessagesByChat((prev) => {
          const chatMsgs = prev[data.chat_id] || [];
          const updated = chatMsgs.map((m) => {
            if (m.isOutgoing) {
              try {
                const s = BigInt(m.seqId || '0');
                if (s <= maxSeq && s > 0n) {
                  return { ...m, status: 'READ' as const };
                }
              } catch {}
            }
            return m;
          });
          return { ...prev, [data.chat_id]: updated };
        });
      } catch {}
    });

    // 5. Handle USER_TYPING
    const unsubTyping = wsClient.on(WsOutgoingEvent.USER_TYPING, (envelope: WsEnvelope<UserTypingData>) => {
      const data = envelope.data;
      if (currentUser && data.user_id === currentUser.userId) return;

      const user = DEMO_USERS.find((u) => u.userId === data.user_id);
      const name = user ? user.displayName : `User ${data.user_id.slice(0, 5)}`;
      const key = `${data.chat_id}_${data.user_id}`;

      setTypingUsers((prev) => {
        const currentList = prev[data.chat_id] || [];
        if (!currentList.includes(name)) {
          return { ...prev, [data.chat_id]: [...currentList, name] };
        }
        return prev;
      });

      // Auto-clear after 3.5 seconds
      if (typingTimeoutRef.current[key]) {
        clearTimeout(typingTimeoutRef.current[key]);
      }
      typingTimeoutRef.current[key] = setTimeout(() => {
        setTypingUsers((prev) => {
          const currentList = prev[data.chat_id] || [];
          return { ...prev, [data.chat_id]: currentList.filter((n) => n !== name) };
        });
      }, 3500);
    });

    // 6. Handle USER_PRESENCE (Real-time online/offline indicator for friends)
    const unsubPresence = wsClient.on(WsOutgoingEvent.USER_PRESENCE, (envelope: WsEnvelope<UserPresenceData>) => {
      const data = envelope.data;
      if (!data || !data.user_id) return;

      setFriends((prev) =>
        prev.map((f) => {
          if (f.id === data.user_id) {
            return {
              ...f,
              status: data.status === 'ONLINE' ? 'ONLINE' : 'OFFLINE',
              lastSeenAt: data.last_seen_at || Date.now(),
            };
          }
          return f;
        })
      );
    });

    // 7. Handle ERROR
    const unsubError = wsClient.on(WsOutgoingEvent.ERROR, (envelope: WsEnvelope<{ message: string; code?: string }>) => {
      const err = envelope.data;
      console.warn('[WS Server Error Event]', err);
      setServerError(`${err.code ? `[${err.code}] ` : ''}${err.message}`);
    });

    return () => {
      unsubAck();
      unsubNewMsg();
      unsubSync();
      unsubRead();
      unsubTyping();
      unsubPresence();
      unsubError();
    };
  }, [currentUser, activeChatId, friends]);

  const markChatAsRead = useCallback((chatId: string) => {
    setChats((prev) =>
      prev.map((c) => (c.id === chatId ? { ...c, unreadCount: 0 } : c))
    );

    // Compute highest seqId and broadcast read receipt to server
    const msgs = messagesByChat[chatId] || [];
    let highestSeq = 0n;
    for (const m of msgs) {
      try {
        const s = BigInt(m.seqId || '0');
        if (s > highestSeq) highestSeq = s;
      } catch {}
    }

    if (highestSeq > 0n) {
      wsClient.send(WsIncomingEvent.READ_RECEIPT, {
        chat_id: chatId,
        max_seq_id: highestSeq.toString(),
      });
    }
  }, [messagesByChat]);

  // Helper to normalize message items coming from server endpoints
  const mapServerMsgToClientMsg = useCallback(
    (m: any): Message => {
      const sId = m.senderId || m.sender_id;
      const isMine = currentUser && sId === currentUser.userId;
      const sender = DEMO_USERS.find((u) => u.userId === sId);
      const senderFriend = friends.find((f) => f.id === sId);
      const senderName = sender
        ? sender.displayName
        : senderFriend
        ? senderFriend.displayName
        : isMine
        ? currentUser?.displayName
        : `User ${(sId || '').slice(0, 6)}`;

      return {
        id: m.id || m.message_id || `msg_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
        clientMsgId: m.clientMsgId || m.client_msg_id || undefined,
        chatId: m.chatId || m.chat_id,
        senderId: sId,
        senderName: senderName || 'Anonymous',
        seqId: (m.seqId || m.seq_id || '0').toString(),
        type: (m.type as any) || 'TEXT',
        content: m.content || '',
        replyToId: m.replyToId || m.reply_to_id || null,
        attachments: (m.attachments || []).map((a: any) => ({
          ...a,
          file_url: a.file_url || a.fileUrl || '',
          fileUrl: a.file_url || a.fileUrl || '',
          thumbnail_url: a.thumbnail_url || a.thumbnailUrl || null,
          thumbnailUrl: a.thumbnail_url || a.thumbnailUrl || null,
          file_name: a.file_name || a.fileName || 'file',
          fileName: a.file_name || a.fileName || 'file',
          file_size: (a.file_size || a.fileSize || '0').toString(),
          fileSize: (a.file_size || a.fileSize || '0').toString(),
          mime_type: a.mime_type || a.mimeType || 'application/octet-stream',
          mimeType: a.mime_type || a.mimeType || 'application/octet-stream',
        })),
        timestamp: m.createdAt
          ? new Date(m.createdAt).getTime()
          : m.created_at
          ? new Date(m.created_at).getTime()
          : m.timestamp || Date.now(),
        status: 'PERSISTED' as const,
        isOutgoing: !!isMine,
      };
    },
    [currentUser, friends]
  );

  // Fetch initial/recent history when selecting a chat
  const fetchChatHistory = useCallback(
    async (chatId: string) => {
      try {
        const res = await fetch(`/api/chats/${encodeURIComponent(chatId)}/messages?limit=50`, {
          headers: currentUser?.token ? { Authorization: `Bearer ${currentUser.token}` } : {},
        });
        const data = await res.json();
        if (data.status === 'success' && Array.isArray(data.messages)) {
          const formatted = data.messages.map(mapServerMsgToClientMsg);

          setMessagesByChat((prev) => {
            const existing = prev[chatId] || [];
            const msgMap = new Map<string, Message>();
            for (const m of existing) {
              if (m.clientMsgId) msgMap.set(m.clientMsgId, m);
              msgMap.set(m.id, m);
            }
            for (const m of formatted) {
              if (m.clientMsgId && msgMap.has(m.clientMsgId)) {
                const old = msgMap.get(m.clientMsgId)!;
                msgMap.set(m.clientMsgId, { ...old, ...m, status: 'PERSISTED' });
              } else {
                msgMap.set(m.id, m);
              }
            }
            const merged = Array.from(new Set(msgMap.values())).sort((a, b) => {
              try {
                const seqA = BigInt(a.seqId || '0');
                const seqB = BigInt(b.seqId || '0');
                if (seqA !== seqB) return seqA < seqB ? -1 : 1;
              } catch {}
              return a.timestamp - b.timestamp;
            });
            return { ...prev, [chatId]: merged };
          });

          setHasMoreEarlierByChat((prev) => ({
            ...prev,
            [chatId]: !!data.hasMore,
          }));
        }
      } catch (err) {
        console.warn('Failed to fetch chat history:', err);
      }
    },
    [currentUser?.token, mapServerMsgToClientMsg]
  );

  // Load earlier/previous chat messages when scrolling up
  const loadEarlierMessages = useCallback(
    async (chatId: string): Promise<boolean> => {
      if (isLoadingEarlier) return false;
      const currentList = messagesByChat[chatId] || [];
      let lowestSeq: bigint | null = null;
      for (const m of currentList) {
        try {
          const s = BigInt(m.seqId || '0');
          if (s > 0n && (lowestSeq === null || s < lowestSeq)) {
            lowestSeq = s;
          }
        } catch {}
      }

      if (lowestSeq !== null && lowestSeq <= 1n) {
        setHasMoreEarlierByChat((prev) => ({ ...prev, [chatId]: false }));
        return false;
      }

      setIsLoadingEarlier(true);
      try {
        const url = `/api/chats/${encodeURIComponent(chatId)}/messages?limit=30${
          lowestSeq !== null ? `&beforeSeq=${lowestSeq.toString()}` : ''
        }`;
        const res = await fetch(url, {
          headers: currentUser?.token ? { Authorization: `Bearer ${currentUser.token}` } : {},
        });
        const data = await res.json();
        if (data.status === 'success' && Array.isArray(data.messages)) {
          if (data.messages.length === 0) {
            setHasMoreEarlierByChat((prev) => ({ ...prev, [chatId]: false }));
            return false;
          }

          const formatted = data.messages.map(mapServerMsgToClientMsg);

          setMessagesByChat((prev) => {
            const existing = prev[chatId] || [];
            const msgMap = new Map<string, Message>();
            for (const m of existing) {
              if (m.clientMsgId) msgMap.set(m.clientMsgId, m);
              msgMap.set(m.id, m);
            }
            for (const m of formatted) {
              if (m.clientMsgId && msgMap.has(m.clientMsgId)) {
                const old = msgMap.get(m.clientMsgId)!;
                msgMap.set(m.clientMsgId, { ...old, ...m, status: 'PERSISTED' });
              } else {
                msgMap.set(m.id, m);
              }
            }
            const merged = Array.from(new Set(msgMap.values())).sort((a, b) => {
              try {
                const seqA = BigInt(a.seqId || '0');
                const seqB = BigInt(b.seqId || '0');
                if (seqA !== seqB) return seqA < seqB ? -1 : 1;
              } catch {}
              return a.timestamp - b.timestamp;
            });
            return { ...prev, [chatId]: merged };
          });

          setHasMoreEarlierByChat((prev) => ({
            ...prev,
            [chatId]: !!data.hasMore,
          }));

          return true;
        }
      } catch (err) {
        console.warn('[loadEarlierMessages] Error:', err);
      } finally {
        setIsLoadingEarlier(false);
      }
      return false;
    },
    [isLoadingEarlier, messagesByChat, currentUser?.token, mapServerMsgToClientMsg]
  );

  const selectChat = useCallback((chatId: string) => {
    setActiveChatId(chatId);
    markChatAsRead(chatId);
    fetchChatHistory(chatId);
    syncChat(chatId);
  }, [markChatAsRead, fetchChatHistory, syncChat]);

  // Load chat history for initially active chat
  useEffect(() => {
    if (activeChatId) {
      fetchChatHistory(activeChatId);
    }
  }, [activeChatId, fetchChatHistory]);

  const createChat = (title: string, type: 'DIRECT' | 'GROUP' = 'GROUP', customId?: string): Chat => {
    const newChat: Chat = {
      id: customId || crypto.randomUUID(),
      title,
      type,
      lastMessage: 'Chat created',
      lastMessageTime: Date.now(),
      unreadCount: 0,
      currentSeqId: '0',
    };

    setChats((prev) => {
      const exists = prev.some((c) => c.id === newChat.id);
      if (exists) return prev;
      return [newChat, ...prev];
    });
    setActiveChatId(newChat.id);

    // Register room with backend API
    fetch('/api/chats', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        id: newChat.id,
        title,
        type,
        userId: currentUser?.userId,
      }),
    }).catch(() => {});

    return newChat;
  };

  const sendMessage = (
    content: string,
    type: 'TEXT' | 'IMAGE' | 'VIDEO' | 'AUDIO' | 'FILE' = 'TEXT',
    attachments: MessageAttachment[] = []
  ) => {
    if (!activeChatId || !currentUser) return;
    if (!content.trim() && attachments.length === 0) return;

    const clientMsgId = `cmsg_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
    const tempId = `temp_${Date.now()}`;

    // 1. Optimistic Message Insert in UI
    const optimisticMsg: Message = {
      id: tempId,
      clientMsgId,
      chatId: activeChatId,
      senderId: currentUser.userId,
      senderName: currentUser.displayName,
      seqId: '...',
      type,
      content,
      attachments,
      timestamp: Date.now(),
      status: 'PENDING',
      isOutgoing: true,
    };

    setMessagesByChat((prev) => ({
      ...prev,
      [activeChatId]: [...(prev[activeChatId] || []), optimisticMsg],
    }));

    // Update last message in sidebar
    const lastPreview =
      attachments.length > 0
        ? type === 'IMAGE'
          ? '📷 Photo'
          : type === 'AUDIO'
          ? '🎵 Audio'
          : type === 'VIDEO'
          ? '🎥 Video'
          : `📎 ${attachments[0].file_name}`
        : content;

    setChats((prev) =>
      prev.map((c) =>
        c.id === activeChatId
          ? { ...c, lastMessage: lastPreview, lastMessageTime: Date.now() }
          : c
      )
    );

    // 2. Dispatch SEND_MESSAGE over WebSocket
    wsClient.send(WsIncomingEvent.SEND_MESSAGE, {
      client_msg_id: clientMsgId,
      chat_id: activeChatId,
      type,
      content: content.trim() || undefined,
      attachments: attachments.map((a) => ({
        file_url: a.file_url,
        thumbnail_url: a.thumbnail_url || null,
        file_name: a.file_name,
        file_size: typeof a.file_size === 'string' ? parseInt(a.file_size, 10) || 0 : a.file_size,
        mime_type: a.mime_type,
      })),
    });
  };

  const sendFileMessage = async (file: File, caption = ''): Promise<boolean> => {
    if (!activeChatId || !currentUser) return false;

    try {
      const reader = new FileReader();
      const base64Promise = new Promise<string>((resolve, reject) => {
        reader.onload = () => resolve(reader.result as string);
        reader.onerror = reject;
      });
      reader.readAsDataURL(file);
      const dataUrl = await base64Promise;

      const res = await fetch('/api/upload', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          fileName: file.name,
          fileType: file.type || 'application/octet-stream',
          fileSize: file.size,
          fileData: dataUrl,
        }),
      });

      const data = await res.json();
      if (!res.ok || !data.attachment) {
        throw new Error(data.error || 'Upload failed');
      }

      const isImage = file.type.startsWith('image/');
      const isAudio =
        file.type.startsWith('audio/') ||
        file.name.startsWith('voice_') ||
        /\.(mp3|wav|ogg|m4a|aac|flac|weba)$/i.test(file.name);
      const isVideo =
        !isAudio &&
        (file.type.startsWith('video/') ||
          /\.(mp4|mov|mkv)$/i.test(file.name) ||
          (file.name.endsWith('.webm') && !file.type.startsWith('audio/')));
      const msgType: 'IMAGE' | 'AUDIO' | 'VIDEO' | 'FILE' = isImage
        ? 'IMAGE'
        : isAudio
        ? 'AUDIO'
        : isVideo
        ? 'VIDEO'
        : 'FILE';

      sendMessage(caption, msgType, [data.attachment]);
      return true;
    } catch (err: any) {
      setServerError(`Failed to upload ${file.name}: ${err.message}`);
      return false;
    }
  };

  const sendTyping = (isTyping: boolean) => {
    if (!activeChatId || !currentUser) return;
    const now = Date.now();
    // Throttle typing events to once per 2 seconds
    if (isTyping && now - lastTypingSentRef.current < 2000) {
      return;
    }
    lastTypingSentRef.current = now;

    wsClient.send(WsIncomingEvent.TYPING_STATUS, {
      chat_id: activeChatId,
      is_typing: isTyping,
      action: 'typing',
    });
  };

  const clearServerError = () => {
    setServerError(null);
  };

  const toggleFriendsPanel = () => {
    setIsFriendsPanelOpen((prev) => !prev);
  };

  // Add friend API call
  const addFriend = async (targetUsername: string): Promise<{ success: boolean; error?: string; friend?: Friend }> => {
    if (!currentUser?.userId) {
      return { success: false, error: 'You must be logged in to add a friend' };
    }
    try {
      const res = await fetch('/api/friends/add', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${currentUser.token || ''}`,
        },
        body: JSON.stringify({
          userId: currentUser.userId,
          targetUsername,
        }),
      });

      const data = await res.json();
      if (!res.ok || data.error) {
        return { success: false, error: data.error || 'Failed to add friend' };
      }

      const newFriend: Friend = data.friend;
      setFriends((prev) => {
        if (prev.some((f) => f.id === newFriend.id)) return prev;
        return [...prev, newFriend];
      });

      // Ensure direct chat exists in chats
      setChats((prev) => {
        if (prev.some((c) => c.id === newFriend.directChatId)) return prev;
        return [
          {
            id: newFriend.directChatId,
            title: newFriend.displayName || newFriend.username,
            type: 'DIRECT',
            lastMessage: 'Direct chat created',
            lastMessageTime: Date.now(),
            unreadCount: 0,
            currentSeqId: '0',
          },
          ...prev,
        ];
      });

      return { success: true, friend: newFriend };
    } catch (err: any) {
      return { success: false, error: err.message || 'Network error' };
    }
  };

  // Remove friend API call
  const removeFriend = async (friendId: string): Promise<boolean> => {
    if (!currentUser?.userId) return false;
    try {
      const res = await fetch('/api/friends/remove', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${currentUser.token || ''}`,
        },
        body: JSON.stringify({
          userId: currentUser.userId,
          friendId,
        }),
      });

      const data = await res.json();
      if (data.status === 'success') {
        setFriends((prev) => prev.filter((f) => f.id !== friendId));
        return true;
      }
      return false;
    } catch {
      return false;
    }
  };

  // Switch to or open a friend's direct 1-on-1 chat
  const openDirectChat = useCallback((friend: Friend) => {
    setChats((prev) => {
      if (!prev.some((c) => c.id === friend.directChatId)) {
        return [
          {
            id: friend.directChatId,
            title: friend.displayName || friend.username,
            type: 'DIRECT',
            lastMessage: 'Direct conversation',
            lastMessageTime: Date.now(),
            unreadCount: 0,
            currentSeqId: '0',
          },
          ...prev,
        ];
      }
      return prev;
    });

    selectChat(friend.directChatId);
  }, [selectChat]);

  // Auto-select the first friend's conversation if activeChatId is not set or not a friend
  useEffect(() => {
    if (friends.length > 0) {
      const activeIsFriend = friends.some((f) => f.directChatId === activeChatId);
      if (!activeIsFriend) {
        openDirectChat(friends[0]);
      }
    }
  }, [friends, activeChatId, openDirectChat]);

  // Derive direct conversations ("Whom I have messaged")
  const getDirectConversations = (): DirectConversation[] => {
    return friends.map((friend) => {
      const msgs = messagesByChat[friend.directChatId] || [];
      const lastMsg = msgs.length > 0 ? msgs[msgs.length - 1] : undefined;
      const chatItem = chats.find((c) => c.id === friend.directChatId);

      return {
        chatId: friend.directChatId,
        friend,
        lastMessage: lastMsg ? lastMsg.content : chatItem?.lastMessage,
        lastMessageTime: lastMsg ? lastMsg.timestamp : chatItem?.lastMessageTime,
        unreadCount: chatItem?.unreadCount || 0,
      };
    });
  };

  const activeFriend = friends.find(
    (f) => f.directChatId.toLowerCase() === activeChatId?.toLowerCase()
  );

  const rawActiveChat =
    chats.find((c) => c.id === activeChatId) ||
    (activeFriend
      ? {
          id: activeFriend.directChatId,
          title: activeFriend.displayName || activeFriend.username,
          type: 'DIRECT' as const,
          lastMessage: '',
          lastMessageTime: Date.now(),
          unreadCount: 0,
          currentSeqId: '0',
        }
      : null);

  const activeChat = rawActiveChat
    ? {
        ...rawActiveChat,
        title: activeFriend ? (activeFriend.displayName || activeFriend.username) : rawActiveChat.title,
      }
    : null;
  const messages = activeChatId ? messagesByChat[activeChatId] || [] : [];
  const hasEarlierMessages = activeChatId ? (hasMoreEarlierByChat[activeChatId] ?? true) : false;

  return (
    <ChatContext.Provider
      value={{
        chats,
        activeChatId,
        activeChat,
        messages,
        messagesByChat,
        typingUsers,
        serverError,
        clearServerError,
        selectChat,
        createChat,
        sendMessage,
        sendFileMessage,
        sendTyping,
        markChatAsRead,
        friends,
        isLoadingFriends,
        isFriendsPanelOpen,
        toggleFriendsPanel,
        setIsFriendsPanelOpen,
        loadFriends,
        addFriend,
        removeFriend,
        openDirectChat,
        getDirectConversations,
        saveChatsOnLogout,
        loadEarlierMessages,
        isLoadingEarlier,
        hasEarlierMessages,
      }}
    >
      {children}
    </ChatContext.Provider>
  );
};

export const useChat = () => {
  const context = useContext(ChatContext);
  if (!context) {
    throw new Error('useChat must be used within a ChatProvider');
  }
  return context;
};
