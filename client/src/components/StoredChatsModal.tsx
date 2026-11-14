import React, { useState, useEffect, useRef } from 'react';
import {
  X,
  Archive,
  MessageSquare,
  Download,
  Trash2,
  LogIn,
  Search,
  Clock,
  ArrowLeft,
  CheckCheck,
  Check,
  FileText,
  Image as ImageIcon,
  User,
  ChevronDown,
} from 'lucide-react';
import {
  StoredUserSession,
  getAllStoredSessions,
  clearStoredSession,
  clearAllStoredSessions,
  downloadSessionExport,
} from '../utils/chatStorage';
import { Chat, Message } from '../types';
import { getAvatarColor } from '../utils/avatar';

interface StoredChatsModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSelectUserForLogin?: (username: string) => void;
}

export const StoredChatsModal: React.FC<StoredChatsModalProps> = ({
  isOpen,
  onClose,
  onSelectUserForLogin,
}) => {
  const [sessions, setSessions] = useState<StoredUserSession[]>([]);
  const [selectedSession, setSelectedSession] = useState<StoredUserSession | null>(null);
  const [selectedChat, setSelectedChat] = useState<Chat | null>(null);
  const [chatSearch, setChatSearch] = useState('');
  const [isModalScrolledUp, setIsModalScrolledUp] = useState(false);
  const storedChatListRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (selectedChat && storedChatListRef.current) {
      storedChatListRef.current.scrollTop = storedChatListRef.current.scrollHeight;
      setIsModalScrolledUp(false);
    }
  }, [selectedChat]);

  const handleModalScroll = () => {
    const el = storedChatListRef.current;
    if (!el) return;
    const isUp = el.scrollHeight - el.scrollTop - el.clientHeight > 80;
    setIsModalScrolledUp(isUp);
  };

  const scrollModalToBottom = () => {
    if (storedChatListRef.current) {
      storedChatListRef.current.scrollTo({
        top: storedChatListRef.current.scrollHeight,
        behavior: 'smooth',
      });
      setIsModalScrolledUp(false);
    }
  };

  const refreshSessions = () => {
    const list = getAllStoredSessions();
    setSessions(list);
    if (list.length > 0 && !selectedSession) {
      setSelectedSession(list[0]);
    } else if (selectedSession) {
      const updated = list.find((s) => s.userId === selectedSession.userId);
      setSelectedSession(updated || list[0] || null);
    }
  };

  useEffect(() => {
    if (isOpen) {
      refreshSessions();
    }
  }, [isOpen]);

  if (!isOpen) return null;

  const handleClearSession = (userId: string, e: React.MouseEvent) => {
    e.stopPropagation();
    if (confirm('Delete saved chat archive for this user?')) {
      clearStoredSession(userId);
      refreshSessions();
      if (selectedSession?.userId === userId) {
        setSelectedSession(null);
        setSelectedChat(null);
      }
    }
  };

  const handleClearAll = () => {
    if (confirm('Delete all stored chat archives for all users?')) {
      clearAllStoredSessions();
      setSessions([]);
      setSelectedSession(null);
      setSelectedChat(null);
    }
  };

  const formatLogoutTime = (timestamp: number) => {
    if (!timestamp) return 'Unknown';
    const diff = Date.now() - timestamp;
    if (diff < 60000) return 'Just now';
    if (diff < 3600000) return `${Math.floor(diff / 60000)}m ago`;
    if (diff < 86400000) return `${Math.floor(diff / 3600000)}h ago`;
    return new Date(timestamp).toLocaleDateString([], {
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  const filteredChats = (selectedSession?.chats || []).filter((c) => {
    const q = chatSearch.toLowerCase().trim();
    if (!q) return true;
    return c.title.toLowerCase().includes(q) || (c.lastMessage && c.lastMessage.toLowerCase().includes(q));
  });

  const chatMessages: Message[] =
    selectedSession && selectedChat ? selectedSession.messagesByChat[selectedChat.id] || [] : [];

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div
        className="modal-card"
        onClick={(e) => e.stopPropagation()}
        style={{
          width: '95%',
          maxWidth: selectedChat ? 820 : 720,
          maxHeight: '90vh',
          display: 'flex',
          flexDirection: 'column',
          padding: 0,
          overflow: 'hidden',
          borderRadius: 12,
        }}
      >
        {/* Modal Header */}
        <div
          style={{
            padding: '16px 20px',
            borderBottom: '1px solid #e2e8f0',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            background: '#f8fafc',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            {selectedChat ? (
              <button
                onClick={() => setSelectedChat(null)}
                style={{
                  background: 'none',
                  border: 'none',
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  color: '#0284c7',
                  padding: 4,
                }}
                title="Back to chat list"
              >
                <ArrowLeft size={20} />
              </button>
            ) : (
              <div
                style={{
                  width: 36,
                  height: 36,
                  borderRadius: '50%',
                  background: '#e0f2fe',
                  color: '#0284c7',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                }}
              >
                <Archive size={20} />
              </div>
            )}
            <div>
              <h3 style={{ margin: 0, fontSize: 17, fontWeight: 700, color: '#0f172a' }}>
                {selectedChat ? selectedChat.title : 'Stored Previous Chats (Logged Out Archive)'}
              </h3>
              <p style={{ margin: '2px 0 0 0', fontSize: 12, color: '#64748b' }}>
                {selectedChat
                  ? `${chatMessages.length} messages preserved offline`
                  : 'Chats and messages preserved locally when user is logged out'}
              </p>
            </div>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            {sessions.length > 0 && !selectedChat && (
              <button
                onClick={handleClearAll}
                style={{
                  background: 'none',
                  border: '1px solid #fca5a5',
                  color: '#dc2626',
                  borderRadius: 6,
                  padding: '5px 10px',
                  fontSize: 12,
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  gap: 4,
                }}
                title="Clear all stored archives"
              >
                <Trash2 size={14} /> Clear All
              </button>
            )}
            <button
              onClick={onClose}
              style={{
                background: 'none',
                border: 'none',
                color: '#64748b',
                cursor: 'pointer',
                padding: 4,
                borderRadius: 6,
              }}
            >
              <X size={20} />
            </button>
          </div>
        </div>

        {/* Modal Body */}
        {sessions.length === 0 ? (
          <div style={{ padding: '48px 24px', textAlign: 'center', color: '#64748b' }}>
            <div
              style={{
                width: 60,
                height: 60,
                borderRadius: '50%',
                background: '#f1f5f9',
                color: '#94a3b8',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                margin: '0 auto 16px auto',
              }}
            >
              <MessageSquare size={30} />
            </div>
            <h4 style={{ margin: 0, fontSize: 16, color: '#1e293b', fontWeight: 600 }}>
              No Stored Previous Chats Yet
            </h4>
            <p style={{ margin: '8px auto 0 auto', fontSize: 13, maxWidth: 380, lineHeight: 1.5 }}>
              Whenever you sign in and chat with friends or groups, all previous chats and messages will be
              automatically stored here when you log out.
            </p>
          </div>
        ) : selectedChat ? (
          /* Single Chat Messages View */
          <div style={{ display: 'flex', flexDirection: 'column', flex: 1, minHeight: 400, overflow: 'hidden', position: 'relative' }}>
            <div
              style={{
                background: '#eff6ff',
                borderBottom: '1px solid #dbeafe',
                padding: '8px 16px',
                fontSize: 12,
                color: '#1e40af',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
              }}
            >
              <span>📁 Read-only offline archive for @{selectedSession?.username}</span>
              {selectedSession && onSelectUserForLogin && (
                <button
                  onClick={() => {
                    onSelectUserForLogin(selectedSession.username);
                    onClose();
                  }}
                  style={{
                    background: '#0284c7',
                    color: '#ffffff',
                    border: 'none',
                    borderRadius: 4,
                    padding: '3px 8px',
                    fontSize: 11,
                    fontWeight: 600,
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    gap: 4,
                  }}
                >
                  <LogIn size={12} /> Sign In to Reply
                </button>
              )}
            </div>

            <div
              ref={storedChatListRef}
              onScroll={handleModalScroll}
              style={{
                flex: 1,
                overflowY: 'auto',
                padding: 16,
                background: '#f8fafc',
                display: 'flex',
                flexDirection: 'column',
                gap: 12,
                maxHeight: 460,
                scrollBehavior: 'smooth',
                position: 'relative',
              }}
            >
              {chatMessages.length === 0 ? (
                <div style={{ textAlign: 'center', color: '#94a3b8', padding: 32, fontSize: 13 }}>
                  No messages stored for this chat.
                </div>
              ) : (
                chatMessages.map((msg, idx) => {
                  const isOut = msg.isOutgoing;
                  const timeStr = msg.timestamp
                    ? new Date(msg.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
                    : '';

                  const prevMsg = idx > 0 ? chatMessages[idx - 1] : null;
                  const isNewDay =
                    !prevMsg ||
                    new Date(prevMsg.timestamp).toDateString() !== new Date(msg.timestamp).toDateString();
                  const dateStr = new Date(msg.timestamp).toLocaleDateString([], {
                    month: 'short',
                    day: 'numeric',
                  });

                  return (
                    <React.Fragment key={msg.id || idx}>
                      {isNewDay && (
                        <div style={{ display: 'flex', justifyContent: 'center', margin: '4px 0' }}>
                          <span
                            style={{
                              background: '#e2e8f0',
                              color: '#64748b',
                              fontSize: 11,
                              fontWeight: 600,
                              padding: '2px 10px',
                              borderRadius: 10,
                            }}
                          >
                            {dateStr}
                          </span>
                        </div>
                      )}
                      <div
                        style={{
                          display: 'flex',
                          flexDirection: 'column',
                          alignItems: isOut ? 'flex-end' : 'flex-start',
                        }}
                      >
                        <div
                          style={{
                            maxWidth: '75%',
                            padding: '10px 14px',
                            borderRadius: isOut ? '12px 12px 2px 12px' : '12px 12px 12px 2px',
                            background: isOut ? '#2481cc' : '#ffffff',
                            color: isOut ? '#ffffff' : '#1e293b',
                            boxShadow: '0 1px 2px rgba(0,0,0,0.06)',
                            border: isOut ? 'none' : '1px solid #e2e8f0',
                          }}
                        >
                          {!isOut && (
                            <div
                              style={{
                                fontSize: 11,
                                fontWeight: 700,
                                color: getAvatarColor(msg.senderName || 'Sender'),
                                marginBottom: 4,
                              }}
                            >
                              {msg.senderName || 'Member'}
                            </div>
                          )}

                          {/* Attachments preview */}
                          {msg.attachments && msg.attachments.length > 0 && (
                            <div style={{ marginBottom: msg.content ? 6 : 0 }}>
                              {msg.attachments.map((att, aIdx) => (
                                <div
                                  key={aIdx}
                                  style={{
                                    display: 'flex',
                                    alignItems: 'center',
                                    gap: 6,
                                    background: isOut ? 'rgba(255,255,255,0.15)' : '#f1f5f9',
                                    padding: '6px 10px',
                                    borderRadius: 6,
                                    fontSize: 12,
                                  }}
                                >
                                  {att.mime_type.startsWith('image/') ? (
                                    <ImageIcon size={15} />
                                  ) : (
                                    <FileText size={15} />
                                  )}
                                  <span style={{ wordBreak: 'break-all' }}>{att.file_name}</span>
                                </div>
                              ))}
                            </div>
                          )}

                          <div style={{ fontSize: 13.5, lineHeight: 1.45, wordBreak: 'break-word' }}>
                            {msg.content}
                          </div>

                          <div
                            style={{
                              fontSize: 10,
                              color: isOut ? 'rgba(255,255,255,0.75)' : '#94a3b8',
                              marginTop: 4,
                              display: 'flex',
                              alignItems: 'center',
                              justifyContent: 'flex-end',
                              gap: 3,
                            }}
                          >
                            <span>{timeStr}</span>
                            {isOut && (
                              msg.status === 'READ' ? <CheckCheck size={12} /> : <Check size={12} />
                            )}
                          </div>
                        </div>
                      </div>
                    </React.Fragment>
                  );
                })
              )}
            </div>

            {isModalScrolledUp && (
              <button
                type="button"
                onClick={scrollModalToBottom}
                style={{
                  position: 'absolute',
                  right: 20,
                  bottom: 20,
                  width: 36,
                  height: 36,
                  borderRadius: '50%',
                  background: '#2481cc',
                  color: '#ffffff',
                  border: 'none',
                  boxShadow: '0 2px 8px rgba(0,0,0,0.2)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  cursor: 'pointer',
                  zIndex: 10,
                }}
                title="Scroll to bottom"
              >
                <ChevronDown size={20} />
              </button>
            )}
          </div>
        ) : (
          /* Multi-session / Accounts and Chat Overview */
          <div style={{ display: 'grid', gridTemplateColumns: '260px 1fr', minHeight: 420, maxHeight: 520 }}>
            {/* User Sessions List */}
            <div
              style={{
                borderRight: '1px solid #e2e8f0',
                background: '#f8fafc',
                overflowY: 'auto',
                padding: '12px 8px',
                display: 'flex',
                flexDirection: 'column',
                gap: 6,
              }}
            >
              <div
                style={{
                  fontSize: 11,
                  fontWeight: 700,
                  color: '#64748b',
                  textTransform: 'uppercase',
                  padding: '4px 8px',
                  letterSpacing: '0.04em',
                }}
              >
                Logged Out Accounts ({sessions.length})
              </div>

              {sessions.map((sess) => {
                const isSelected = selectedSession?.userId === sess.userId;
                return (
                  <div
                    key={sess.userId}
                    onClick={() => {
                      setSelectedSession(sess);
                      setSelectedChat(null);
                    }}
                    style={{
                      padding: '10px 12px',
                      borderRadius: 8,
                      cursor: 'pointer',
                      background: isSelected ? '#e0f2fe' : 'transparent',
                      border: isSelected ? '1px solid #bae6fd' : '1px solid transparent',
                      transition: 'all 0.15s ease',
                    }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                      <div
                        style={{
                          width: 36,
                          height: 36,
                          borderRadius: '50%',
                          background: getAvatarColor(sess.username),
                          color: '#ffffff',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          fontWeight: 700,
                          fontSize: 14,
                          flexShrink: 0,
                        }}
                      >
                        {(sess.displayName || sess.username)[0]?.toUpperCase()}
                      </div>
                      <div style={{ minWidth: 0, flex: 1 }}>
                        <div
                          style={{
                            fontWeight: 600,
                            fontSize: 13,
                            color: '#1e293b',
                            whiteSpace: 'nowrap',
                            overflow: 'hidden',
                            textOverflow: 'ellipsis',
                          }}
                        >
                          {sess.displayName || sess.username}
                        </div>
                        <div style={{ fontSize: 11, color: '#64748b' }}>
                          @{sess.username}
                        </div>
                      </div>
                    </div>

                    <div
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        marginTop: 8,
                        fontSize: 11,
                        color: '#64748b',
                      }}
                    >
                      <span style={{ display: 'flex', alignItems: 'center', gap: 3 }}>
                        <Clock size={11} /> {formatLogoutTime(sess.loggedOutAt)}
                      </span>
                      <span
                        style={{
                          background: '#e2e8f0',
                          padding: '1px 6px',
                          borderRadius: 10,
                          fontSize: 10,
                          fontWeight: 600,
                        }}
                      >
                        {sess.chatsCount} chats
                      </span>
                    </div>

                    <div style={{ display: 'flex', gap: 4, marginTop: 8 }}>
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          downloadSessionExport(sess);
                        }}
                        style={{
                          flex: 1,
                          fontSize: 11,
                          background: '#ffffff',
                          border: '1px solid #cbd5e1',
                          borderRadius: 4,
                          padding: '3px 6px',
                          cursor: 'pointer',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          gap: 4,
                          color: '#334155',
                        }}
                        title="Export JSON"
                      >
                        <Download size={11} /> Export
                      </button>
                      <button
                        onClick={(e) => handleClearSession(sess.userId, e)}
                        style={{
                          fontSize: 11,
                          background: '#ffffff',
                          border: '1px solid #fecaca',
                          borderRadius: 4,
                          padding: '3px 8px',
                          cursor: 'pointer',
                          color: '#dc2626',
                        }}
                        title="Delete Stored Data"
                      >
                        <Trash2 size={11} />
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>

            {/* Selected User Chats */}
            <div style={{ display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
              {selectedSession ? (
                <>
                  <div
                    style={{
                      padding: '12px 16px',
                      borderBottom: '1px solid #e2e8f0',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      background: '#ffffff',
                    }}
                  >
                    <div>
                      <span style={{ fontWeight: 600, fontSize: 14, color: '#0f172a' }}>
                        Stored Chats for {selectedSession.displayName} (@{selectedSession.username})
                      </span>
                      <div style={{ fontSize: 11, color: '#64748b', marginTop: 1 }}>
                        {selectedSession.totalMessagesCount} total messages stored locally
                      </div>
                    </div>

                    {onSelectUserForLogin && (
                      <button
                        onClick={() => {
                          onSelectUserForLogin(selectedSession.username);
                          onClose();
                        }}
                        className="btn-primary"
                        style={{ fontSize: 12, padding: '5px 12px', display: 'flex', alignItems: 'center', gap: 4 }}
                      >
                        <LogIn size={13} /> Sign In
                      </button>
                    )}
                  </div>

                  {/* Chat Search */}
                  <div style={{ padding: '8px 16px', borderBottom: '1px solid #f1f5f9' }}>
                    <div style={{ position: 'relative' }}>
                      <Search
                        size={14}
                        style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', color: '#94a3b8' }}
                      />
                      <input
                        type="text"
                        placeholder="Search stored chats or messages..."
                        value={chatSearch}
                        onChange={(e) => setChatSearch(e.target.value)}
                        style={{
                          width: '100%',
                          padding: '6px 10px 6px 30px',
                          border: '1px solid #cbd5e1',
                          borderRadius: 6,
                          fontSize: 12,
                          boxSizing: 'border-box',
                        }}
                      />
                    </div>
                  </div>

                  {/* Chats List */}
                  <div style={{ flex: 1, overflowY: 'auto', padding: '8px 12px' }}>
                    {filteredChats.length === 0 ? (
                      <div style={{ textAlign: 'center', color: '#94a3b8', padding: 32, fontSize: 13 }}>
                        No stored chats found.
                      </div>
                    ) : (
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                        {filteredChats.map((chat) => {
                          const msgs = selectedSession.messagesByChat[chat.id] || [];
                          const lastMsg = msgs.length > 0 ? msgs[msgs.length - 1] : null;

                          return (
                            <div
                              key={chat.id}
                              onClick={() => setSelectedChat(chat)}
                              style={{
                                padding: '10px 12px',
                                borderRadius: 8,
                                border: '1px solid #e2e8f0',
                                background: '#ffffff',
                                cursor: 'pointer',
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'space-between',
                                transition: 'background 0.15s ease',
                              }}
                              onMouseEnter={(e) => (e.currentTarget.style.background = '#f8fafc')}
                              onMouseLeave={(e) => (e.currentTarget.style.background = '#ffffff')}
                            >
                              <div style={{ display: 'flex', alignItems: 'center', gap: 10, minWidth: 0, flex: 1 }}>
                                <div
                                  style={{
                                    width: 38,
                                    height: 38,
                                    borderRadius: '50%',
                                    background: getAvatarColor(chat.title),
                                    color: '#ffffff',
                                    display: 'flex',
                                    alignItems: 'center',
                                    justifyContent: 'center',
                                    fontWeight: 600,
                                    fontSize: 14,
                                    flexShrink: 0,
                                  }}
                                >
                                  {chat.type === 'DIRECT' ? (
                                    chat.title[0]?.toUpperCase() || 'D'
                                  ) : (
                                    <MessageSquare size={16} />
                                  )}
                                </div>
                                <div style={{ minWidth: 0, flex: 1 }}>
                                  <div
                                    style={{
                                      fontWeight: 600,
                                      fontSize: 13,
                                      color: '#1e293b',
                                      display: 'flex',
                                      alignItems: 'center',
                                      gap: 6,
                                    }}
                                  >
                                    <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                      {chat.title}
                                    </span>
                                    <span
                                      style={{
                                        fontSize: 10,
                                        padding: '1px 5px',
                                        background: chat.type === 'DIRECT' ? '#e0f2fe' : '#fef3c7',
                                        color: chat.type === 'DIRECT' ? '#0369a1' : '#b45309',
                                        borderRadius: 4,
                                        fontWeight: 600,
                                      }}
                                    >
                                      {chat.type}
                                    </span>
                                  </div>
                                  <div
                                    style={{
                                      fontSize: 12,
                                      color: '#64748b',
                                      overflow: 'hidden',
                                      textOverflow: 'ellipsis',
                                      whiteSpace: 'nowrap',
                                      marginTop: 2,
                                    }}
                                  >
                                    {lastMsg?.content || chat.lastMessage || 'No messages'}
                                  </div>
                                </div>
                              </div>

                              <div style={{ textAlign: 'right', flexShrink: 0, marginLeft: 12 }}>
                                <div style={{ fontSize: 11, color: '#94a3b8' }}>
                                  {msgs.length} msgs
                                </div>
                                <span style={{ fontSize: 11, color: '#0284c7', fontWeight: 600 }}>
                                  View →
                                </span>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>
                </>
              ) : (
                <div style={{ textAlign: 'center', padding: 48, color: '#94a3b8' }}>
                  Select an account from the left to view its stored previous chats.
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default StoredChatsModal;
