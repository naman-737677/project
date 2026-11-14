import React from 'react';
import { useChat } from '../context/ChatContext';
import { useAuth } from '../context/AuthContext';
import { useCall } from '../context/CallContext';
import { Terminal, Users, Phone, Video } from 'lucide-react';
import { getAvatarColor } from '../utils/avatar';

interface ChatHeaderProps {
  onToggleDevTools: () => void;
  isDevToolsOpen: boolean;
}

export const ChatHeader: React.FC<ChatHeaderProps> = ({ onToggleDevTools, isDevToolsOpen }) => {
  const { activeChat, typingUsers, activeChatId, friends } = useChat();
  const { connectionState } = useAuth();
  const { startCall } = useCall();

  if (!activeChat) return null;

  const currentFriend = friends.find(
    (f) =>
      f.directChatId.toLowerCase() === activeChatId?.toLowerCase() ||
      f.id === activeChat.id ||
      f.username.toLowerCase() === activeChat.title.toLowerCase()
  );
  const friendName = currentFriend ? (currentFriend.displayName || currentFriend.username) : activeChat.title;
  const isFriendOnline = currentFriend?.status === 'ONLINE';

  const typers = activeChatId ? typingUsers[activeChatId] || [] : [];
  const isTyping = typers.length > 0;

  const renderSubtitle = () => {
    if (isTyping) {
      return (
        <span className="chat-header-subtitle typing">
          {typers.join(', ')} {typers.length > 1 ? 'are' : 'is'} typing...
        </span>
      );
    }
    if (currentFriend) {
      return (
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 1 }}>
          <span
            style={{
              width: 7,
              height: 7,
              borderRadius: '50%',
              backgroundColor: isFriendOnline ? '#16a34a' : '#94a3b8',
              boxShadow: isFriendOnline ? '0 0 0 2px rgba(22, 163, 74, 0.2)' : 'none',
              display: 'inline-block',
            }}
          />
          <span
            className={`chat-header-subtitle ${isFriendOnline ? 'online' : 'offline'}`}
            style={{
              fontSize: 12.5,
              fontWeight: isFriendOnline ? 600 : 500,
              color: isFriendOnline ? '#16a34a' : '#64748b',
              textTransform: 'lowercase',
            }}
          >
            {isFriendOnline ? 'online' : 'offline'}
          </span>
          {currentFriend.username && (
            <span style={{ fontSize: 12, color: '#94a3b8', marginLeft: 2 }}>
              (@{currentFriend.username})
            </span>
          )}
        </div>
      );
    }
    if (activeChat.type === 'GROUP') {
      return <span className="chat-header-subtitle">Group conversation</span>;
    }
    return <span className="chat-header-subtitle">online</span>;
  };

  const getStatusClass = () => {
    switch (connectionState) {
      case 'CONNECTED':
        return 'connected';
      case 'CONNECTING':
        return 'connecting';
      case 'RECONNECTING':
        return 'reconnecting';
      case 'DISCONNECTED':
      default:
        return 'disconnected';
    }
  };

  return (
    <div className="chat-top-header">
      <div className="chat-header-info">
        <div
          className="avatar-circle"
          style={{
            background: currentFriend ? getAvatarColor(currentFriend.username) : '#2481cc',
            position: 'relative',
            width: 44,
            height: 44,
            fontSize: 17,
            fontWeight: 600,
          }}
        >
          {currentFriend
            ? (currentFriend.displayName || currentFriend.username)[0]?.toUpperCase()
            : (activeChat.type === 'GROUP' ? <Users size={20} /> : activeChat.title[0]?.toUpperCase() || 'C')}
          {currentFriend && (
            <span
              className={`presence-dot ${isFriendOnline ? 'online' : ''}`}
              style={{
                width: 12,
                height: 12,
                border: '2px solid #ffffff',
                backgroundColor: isFriendOnline ? '#16a34a' : '#94a3b8',
              }}
              title={`${friendName} is ${isFriendOnline ? 'online' : 'offline'}`}
            />
          )}
        </div>
        <div>
          <div className="chat-header-title" style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <span>{friendName}</span>
            {currentFriend && (
              <span
                style={{
                  fontSize: 11,
                  padding: '2px 8px',
                  borderRadius: 10,
                  fontWeight: 600,
                  backgroundColor: isFriendOnline ? '#dcfce7' : '#f1f5f9',
                  color: isFriendOnline ? '#15803d' : '#64748b',
                  border: `1px solid ${isFriendOnline ? '#bbf7d0' : '#e2e8f0'}`,
                }}
              >
                {isFriendOnline ? 'Online' : 'Offline'}
              </span>
            )}
          </div>
          {renderSubtitle()}
        </div>
      </div>

      <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
        {currentFriend && (
          <div className="header-call-actions" style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <button
              className="header-call-btn voice-call-btn"
              onClick={() => startCall(currentFriend, 'AUDIO')}
              title={`Call ${friendName}`}
            >
              <Phone size={17} />
              <span className="call-btn-text">Call</span>
            </button>

            <button
              className="header-call-btn video-call-btn"
              onClick={() => startCall(currentFriend, 'VIDEO')}
              title={`Video call ${friendName}`}
            >
              <Video size={18} />
            </button>
          </div>
        )}

        <div className={`connection-pill ${getStatusClass()}`}>
          <span
            style={{
              width: 8,
              height: 8,
              borderRadius: '50%',
              backgroundColor:
                connectionState === 'CONNECTED'
                  ? '#4fae4e'
                  : connectionState === 'DISCONNECTED'
                  ? '#ef4444'
                  : '#f59e0b',
            }}
          />
          {connectionState}
        </div>

        <button
          className="input-action-btn"
          style={{
            color: isDevToolsOpen ? '#2481cc' : '#6b7280',
            backgroundColor: isDevToolsOpen ? '#e6f2fb' : 'transparent',
          }}
          onClick={onToggleDevTools}
          title="Toggle WebSocket Live Frame Inspector"
        >
          <Terminal size={19} />
        </button>
      </div>
    </div>
  );
};
