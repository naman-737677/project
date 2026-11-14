import React, { useRef, useLayoutEffect, useState } from 'react';
import { useChat } from '../context/ChatContext';
import { ChatHeader } from './ChatHeader';
import { MessageItem } from './MessageItem';
import { MessageInput } from './MessageInput';
import { X, MessageSquare, ChevronDown, Loader2, History, Clock } from 'lucide-react';
import { getAvatarColor } from '../utils/avatar';

interface ChatAreaProps {
  onToggleDevTools: () => void;
  isDevToolsOpen: boolean;
}

export const ChatArea: React.FC<ChatAreaProps> = ({ onToggleDevTools, isDevToolsOpen }) => {
  const {
    activeChat,
    messages,
    serverError,
    clearServerError,
    friends,
    activeChatId,
    loadEarlierMessages,
    isLoadingEarlier,
    hasEarlierMessages,
  } = useChat();

  const messagesWrapperRef = useRef<HTMLDivElement>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const [isScrolledUp, setIsScrolledUp] = useState(false);
  const [unreadWhileScrolled, setUnreadWhileScrolled] = useState(0);

  const isUserScrolledUpRef = useRef(false);
  const prevMessagesLengthRef = useRef(messages.length);
  const prevActiveChatIdRef = useRef(activeChatId);
  const isPrependingRef = useRef(false);
  const scrollAnchoringDataRef = useRef<{ scrollHeight: number; scrollTop: number } | null>(null);

  // Jump to bottom helper
  const scrollToBottom = () => {
    const el = messagesWrapperRef.current;
    if (el) {
      el.scrollTo({ top: el.scrollHeight, behavior: 'smooth' });
    }
    isUserScrolledUpRef.current = false;
    setIsScrolledUp(false);
    setUnreadWhileScrolled(0);
  };

  // Trigger loading earlier/previous messages
  const triggerLoadEarlier = async () => {
    if (isLoadingEarlier || !hasEarlierMessages || !activeChatId) return;
    const el = messagesWrapperRef.current;
    if (!el) return;

    // Snapshot current scroll metrics for anchoring
    scrollAnchoringDataRef.current = {
      scrollHeight: el.scrollHeight,
      scrollTop: el.scrollTop,
    };
    isPrependingRef.current = true;

    await loadEarlierMessages(activeChatId);
  };

  // Scroll event handler: track distance from bottom and trigger load earlier at top
  const handleScroll = () => {
    const el = messagesWrapperRef.current;
    if (!el) return;

    const distanceFromBottom = el.scrollHeight - el.scrollTop - el.clientHeight;
    const isUp = distanceFromBottom > 100;
    isUserScrolledUpRef.current = isUp;
    setIsScrolledUp(isUp);

    if (!isUp) {
      setUnreadWhileScrolled(0);
    }

    // When scrolled near the top (< 60px), load older previous chat messages
    if (el.scrollTop < 60 && hasEarlierMessages && !isLoadingEarlier && activeChatId) {
      triggerLoadEarlier();
    }
  };

  // Handle scroll positioning and anchoring when messages change or chat switches
  useLayoutEffect(() => {
    const el = messagesWrapperRef.current;
    if (!el) return;

    // Case 1: Switched to a different chat room -> scroll directly to newest messages
    if (prevActiveChatIdRef.current !== activeChatId) {
      prevActiveChatIdRef.current = activeChatId;
      prevMessagesLengthRef.current = messages.length;
      isUserScrolledUpRef.current = false;
      setIsScrolledUp(false);
      setUnreadWhileScrolled(0);
      el.scrollTop = el.scrollHeight;
      return;
    }

    // Case 2: We prepended earlier messages -> preserve exact scroll position so view doesn't jump
    if (isPrependingRef.current && scrollAnchoringDataRef.current) {
      const { scrollHeight: oldHeight, scrollTop: oldTop } = scrollAnchoringDataRef.current;
      const newHeight = el.scrollHeight;
      const heightDiff = newHeight - oldHeight;
      el.scrollTop = oldTop + heightDiff;
      isPrependingRef.current = false;
      scrollAnchoringDataRef.current = null;
      prevMessagesLengthRef.current = messages.length;
      return;
    }

    // Case 3: New message added to chat
    if (messages.length > prevMessagesLengthRef.current) {
      const latestMsg = messages[messages.length - 1];
      const isOutgoing = latestMsg?.isOutgoing;

      if (isUserScrolledUpRef.current && !isOutgoing) {
        // User was reading earlier messages, do not force scroll down!
        setUnreadWhileScrolled((prev) => prev + 1);
      } else {
        // Auto scroll to bottom smoothly
        el.scrollTo({ top: el.scrollHeight, behavior: 'smooth' });
      }
    }

    prevMessagesLengthRef.current = messages.length;
  }, [messages, activeChatId]);

  // Date Separators helpers
  const formatSeparatorDate = (ts: number) => {
    const date = new Date(ts);
    const now = new Date();
    if (date.toDateString() === now.toDateString()) {
      return 'Today';
    }
    const yesterday = new Date();
    yesterday.setDate(now.getDate() - 1);
    if (date.toDateString() === yesterday.toDateString()) {
      return 'Yesterday';
    }
    const isSameYear = date.getFullYear() === now.getFullYear();
    return date.toLocaleDateString([], {
      month: 'long',
      day: 'numeric',
      year: isSameYear ? undefined : 'numeric',
    });
  };

  const isSameDay = (ts1: number, ts2: number) => {
    return new Date(ts1).toDateString() === new Date(ts2).toDateString();
  };

  const currentFriend = friends.find(
    (f) => f.directChatId.toLowerCase() === activeChatId?.toLowerCase()
  );
  const friendName = currentFriend ? (currentFriend.displayName || currentFriend.username) : activeChat?.title;
  const isOnline = currentFriend?.status === 'ONLINE';

  if (!activeChat) {
    return (
      <div className="chat-container" style={{ alignItems: 'center', justifyContent: 'center' }}>
        <div style={{ textAlign: 'center', color: '#707579' }}>
          <MessageSquare size={48} style={{ margin: '0 auto 12px auto', opacity: 0.5 }} />
          <h3>Select a friend to start messaging</h3>
          <p style={{ fontSize: 14, marginTop: 4 }}>
            Direct messages are delivered in real time over end-to-end WebSocket connections.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="chat-container">
      <ChatHeader onToggleDevTools={onToggleDevTools} isDevToolsOpen={isDevToolsOpen} />

      {serverError && (
        <div className="alert-banner">
          <span>{serverError}</span>
          <button
            onClick={clearServerError}
            style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'inherit' }}
          >
            <X size={16} />
          </button>
        </div>
      )}

      {/* Messages Scrollable List */}
      <div
        className="messages-wrapper"
        ref={messagesWrapperRef}
        onScroll={handleScroll}
      >
        {/* Top earlier messages status & loader */}
        {isLoadingEarlier && (
          <div className="chat-history-loader">
            <Loader2 size={16} className="spin-icon" />
            <span>Loading previous messages...</span>
          </div>
        )}

        {!isLoadingEarlier && hasEarlierMessages && messages.length > 0 && (
          <div style={{ textAlign: 'center', margin: '4px 0 12px 0' }}>
            <button
              type="button"
              onClick={triggerLoadEarlier}
              className="load-earlier-btn"
            >
              <History size={14} />
              <span>Load earlier messages</span>
            </button>
          </div>
        )}

        {!hasEarlierMessages && messages.length > 0 && (
          <div className="chat-history-start">
            <Clock size={13} />
            <span>Beginning of conversation history</span>
          </div>
        )}

        {messages.length === 0 ? (
          <div style={{ textAlign: 'center', margin: 'auto', padding: '24px 16px', maxWidth: 360 }}>
            {currentFriend ? (
              <>
                <div
                  className="avatar-circle"
                  style={{
                    width: 68,
                    height: 68,
                    fontSize: 26,
                    fontWeight: 600,
                    background: getAvatarColor(currentFriend.username),
                    margin: '0 auto 12px auto',
                    position: 'relative',
                  }}
                >
                  {(currentFriend.displayName || currentFriend.username)[0]?.toUpperCase() || 'U'}
                  <span
                    className={`presence-dot ${isOnline ? 'online' : ''}`}
                    style={{
                      width: 16,
                      height: 16,
                      border: '3px solid #ffffff',
                      backgroundColor: isOnline ? '#16a34a' : '#94a3b8',
                    }}
                  />
                </div>
                <h3 style={{ margin: 0, fontSize: 18, color: '#111827', fontWeight: 600 }}>
                  {friendName}
                </h3>
                <div style={{ marginTop: 6, display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                  <span
                    style={{
                      width: 7,
                      height: 7,
                      borderRadius: '50%',
                      backgroundColor: isOnline ? '#16a34a' : '#94a3b8',
                    }}
                  />
                  <span
                    style={{
                      fontSize: 13,
                      fontWeight: 600,
                      color: isOnline ? '#16a34a' : '#64748b',
                    }}
                  >
                    {isOnline ? 'Online' : 'Offline'}
                  </span>
                  <span style={{ fontSize: 13, color: '#94a3b8' }}>
                    @{currentFriend.username}
                  </span>
                </div>
                <p style={{ margin: '14px 0 0 0', fontSize: 13, color: '#64748b' }}>
                  No messages yet. Say hello to start the conversation!
                </p>
              </>
            ) : (
              <div style={{ color: '#888', fontSize: 14 }}>
                No messages yet. Send a message to start chatting!
              </div>
            )}
          </div>
        ) : (
          messages.map((msg, index) => {
            const prevMsg = index > 0 ? messages[index - 1] : null;
            const showDateSep = !prevMsg || !isSameDay(prevMsg.timestamp, msg.timestamp);

            return (
              <React.Fragment key={msg.id || msg.clientMsgId || index}>
                {showDateSep && (
                  <div className="chat-date-separator">
                    <span>{formatSeparatorDate(msg.timestamp)}</span>
                  </div>
                )}
                <MessageItem message={msg} />
              </React.Fragment>
            );
          })
        )}
        <div ref={messagesEndRef} />
      </div>

      {/* Floating Telegram Scroll-To-Bottom Button */}
      {isScrolledUp && (
        <button
          type="button"
          onClick={scrollToBottom}
          className="telegram-scroll-bottom-btn"
          aria-label="Scroll to newest messages"
          title="Scroll to bottom"
        >
          <ChevronDown size={22} />
          {unreadWhileScrolled > 0 && (
            <span className="telegram-scroll-badge">
              {unreadWhileScrolled > 99 ? '99+' : unreadWhileScrolled}
            </span>
          )}
        </button>
      )}

      <MessageInput />
    </div>
  );
};
