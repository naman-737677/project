import React, { useState, useRef, useEffect } from 'react';
import { useAuth } from '../context/AuthContext';
import { useChat } from '../context/ChatContext';
import { Search, UserPlus, ShieldCheck, LogOut, Archive, Camera, Trash2, Loader2 } from 'lucide-react';
import { getAvatarColor } from '../utils/avatar';

interface SidebarProps {
  onOpenLogin: () => void;
  onOpenNewChat: () => void;
  onOpenAddFriend: () => void;
  onOpen2FA: () => void;
  onOpenStoredChats?: () => void;
}

export const Sidebar: React.FC<SidebarProps> = ({
  onOpenAddFriend,
  onOpen2FA,
  onOpenStoredChats,
}) => {
  const { currentUser, connectionState, logout, updateProfilePicture, removeProfilePicture } = useAuth();
  const {
    friends,
    isLoadingFriends,
    openDirectChat,
    activeChatId,
    messagesByChat,
    chats,
    saveChatsOnLogout,
  } = useChat();

  const handleSignOut = () => {
    saveChatsOnLogout();
    logout();
  };

  const [searchTerm, setSearchTerm] = useState('');
  const [isAvatarMenuOpen, setIsAvatarMenuOpen] = useState(false);
  const [isUploadingAvatar, setIsUploadingAvatar] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const avatarWrapperRef = useRef<HTMLDivElement>(null);

  // Close avatar dropdown menu when clicking outside
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (avatarWrapperRef.current && !avatarWrapperRef.current.contains(e.target as Node)) {
        setIsAvatarMenuOpen(false);
      }
    };
    if (isAvatarMenuOpen) {
      document.addEventListener('mousedown', handleClickOutside);
    }
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [isAvatarMenuOpen]);

  const handleAvatarFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    try {
      setIsUploadingAvatar(true);
      await updateProfilePicture(file);
      setIsAvatarMenuOpen(false);
    } catch (err: any) {
      alert(err.message || 'Failed to update profile picture');
    } finally {
      setIsUploadingAvatar(false);
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
    }
  };

  const handleRemoveAvatar = async (e: React.MouseEvent) => {
    e.stopPropagation();
    try {
      setIsUploadingAvatar(true);
      await removeProfilePicture();
      setIsAvatarMenuOpen(false);
    } catch (err: any) {
      alert(err.message || 'Failed to remove profile picture');
    } finally {
      setIsUploadingAvatar(false);
    }
  };

  const filteredFriends = friends.filter((f) => {
    const query = searchTerm.toLowerCase().trim();
    if (!query) return true;
    return (
      (f.displayName && f.displayName.toLowerCase().includes(query)) ||
      f.username.toLowerCase().includes(query)
    );
  });

  const onlineCount = friends.filter((f) => f.status === 'ONLINE').length;

  const formatChatTime = (timestamp?: number) => {
    if (!timestamp) return '';
    const date = new Date(timestamp);
    const now = new Date();
    if (date.toDateString() === now.toDateString()) {
      return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    }
    return date.toLocaleDateString([], { month: 'short', day: 'numeric' });
  };

  return (
    <div className="sidebar">
      {/* Top Header */}
      <div className="sidebar-header">
        <div className="user-profile-bar">
          {/* Avatar Icon with Profile Picture Option */}
          <div
            className="user-profile-avatar-wrapper"
            ref={avatarWrapperRef}
            onClick={(e) => {
              e.stopPropagation();
              setIsAvatarMenuOpen((prev) => !prev);
            }}
            title="Click to add or change profile picture"
          >
            <div
              className="avatar-circle"
              style={{
                background: currentUser?.avatarUrl
                  ? 'transparent'
                  : getAvatarColor(currentUser?.username || 'user'),
                overflow: 'hidden',
              }}
            >
              {isUploadingAvatar ? (
                <Loader2 size={18} className="spin-icon" />
              ) : currentUser?.avatarUrl ? (
                <img
                  src={currentUser.avatarUrl}
                  alt={currentUser.displayName || currentUser.username}
                  className="user-avatar-image"
                />
              ) : (
                currentUser?.displayName?.[0]?.toUpperCase() || 'U'
              )}

              {/* Hover overlay hint */}
              <div className="avatar-hover-overlay">
                <Camera size={16} />
              </div>
            </div>

            {/* Online status indicator */}
            <span className={`presence-dot ${connectionState === 'CONNECTED' ? 'online' : ''}`} />

            {/* Camera badge icon */}
            <button
              type="button"
              className="avatar-camera-btn"
              onClick={(e) => {
                e.stopPropagation();
                setIsAvatarMenuOpen((prev) => !prev);
              }}
              title="Add or Change Profile Picture"
            >
              <Camera size={11} />
            </button>

            {/* Hidden file input */}
            <input
              type="file"
              ref={fileInputRef}
              accept="image/*"
              style={{ display: 'none' }}
              onChange={handleAvatarFileChange}
            />

            {/* Avatar Options Dropdown Menu */}
            {isAvatarMenuOpen && (
              <div className="avatar-dropdown-menu" onClick={(e) => e.stopPropagation()}>
                <div className="avatar-menu-header">Profile Picture</div>
                <button
                  type="button"
                  className="avatar-menu-item"
                  onClick={() => {
                    fileInputRef.current?.click();
                  }}
                >
                  <Camera size={15} color="#0284c7" />
                  <span>{currentUser?.avatarUrl ? 'Change Picture' : 'Add Profile Picture'}</span>
                </button>

                {currentUser?.avatarUrl && (
                  <button
                    type="button"
                    className="avatar-menu-item danger"
                    onClick={handleRemoveAvatar}
                  >
                    <Trash2 size={15} />
                    <span>Remove Picture</span>
                  </button>
                )}
              </div>
            )}
          </div>

          {/* User metadata */}
          <div
            className="user-meta-header"
            onClick={onOpen2FA}
            style={{ cursor: 'pointer', flex: 1, minWidth: 0 }}
            title="Click to View Profile & 2FA Settings"
          >
            <span className="user-name" style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
              {currentUser?.displayName || 'Guest'}
              {currentUser?.twoFactorEnabled && (
                <span title="2FA Active (Google Authenticator)" style={{ display: 'inline-flex' }}>
                  <ShieldCheck size={14} color="#0284c7" />
                </span>
              )}
            </span>
            <span className="user-status-text">
              @{currentUser?.username || 'not_logged_in'}
            </span>
          </div>
        </div>

        <div style={{ display: 'flex', gap: 4 }}>
          {onOpenStoredChats && (
            <button className="input-action-btn" onClick={onOpenStoredChats} title="View Stored Previous Chats Archive">
              <Archive size={19} />
            </button>
          )}
          <button className="input-action-btn" onClick={onOpenAddFriend} title="Add Friend by username">
            <UserPlus size={19} />
          </button>
          <button className="input-action-btn" onClick={onOpen2FA} title="Two-Step Verification (Google Authenticator)">
            <ShieldCheck size={19} color={currentUser?.twoFactorEnabled ? '#0284c7' : '#9ca3af'} />
          </button>
          <button className="input-action-btn" onClick={handleSignOut} title="Sign Out">
            <LogOut size={18} />
          </button>
        </div>
      </div>

      {/* Search Bar */}
      <div className="search-bar-wrapper">
        <Search className="search-icon" size={16} />
        <input
          type="text"
          className="search-input"
          placeholder="Search friends..."
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
        />
      </div>

      {/* Friends Count / Status Header */}
      <div
        style={{
          padding: '8px 16px 6px 16px',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          borderBottom: '1px solid #f1f5f9',
          background: '#ffffff',
        }}
      >
        <span
          style={{
            fontSize: 11,
            fontWeight: 700,
            color: '#64748b',
            textTransform: 'uppercase',
            letterSpacing: '0.05em',
          }}
        >
          Friends ({filteredFriends.length})
        </span>
        {onlineCount > 0 && (
          <span style={{ fontSize: 11, color: '#16a34a', fontWeight: 600 }}>
            {onlineCount} online
          </span>
        )}
      </div>

      {/* Friend List */}
      {isLoadingFriends ? (
        <div style={{ padding: '32px 16px', textAlign: 'center', color: '#94a3b8', fontSize: 13 }}>
          Loading friends...
        </div>
      ) : filteredFriends.length === 0 ? (
        <div style={{ padding: '32px 20px', textAlign: 'center', color: '#64748b' }}>
          {searchTerm ? (
            <>
              <p style={{ margin: 0, fontWeight: 500, fontSize: 14 }}>No friends found</p>
              <p style={{ margin: '4px 0 0 0', fontSize: 12, color: '#94a3b8' }}>
                No friends match "{searchTerm}"
              </p>
            </>
          ) : (
            <>
              <div
                style={{
                  width: 48,
                  height: 48,
                  borderRadius: '50%',
                  background: '#e0f2fe',
                  color: '#0284c7',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  margin: '0 auto 12px auto',
                }}
              >
                <UserPlus size={24} />
              </div>
              <p style={{ margin: 0, fontWeight: 600, fontSize: 14, color: '#1e293b' }}>No friends yet</p>
              <p style={{ margin: '6px 0 16px 0', fontSize: 12, color: '#64748b' }}>
                Add your friends by username to start real-time messaging!
              </p>
              <button
                onClick={onOpenAddFriend}
                className="btn-primary"
                style={{ fontSize: 13, padding: '7px 16px' }}
              >
                Add Friend
              </button>
            </>
          )}
        </div>
      ) : (
        <ul className="chat-list">
          {filteredFriends.map((friend) => {
            const isActive = friend.directChatId === activeChatId;
            const msgs = messagesByChat[friend.directChatId] || [];
            const lastMsg = msgs.length > 0 ? msgs[msgs.length - 1] : null;
            const chatItem = chats.find((c) => c.id === friend.directChatId);
            const isOnline = friend.status === 'ONLINE';

            let previewText = 'No messages yet';
            if (lastMsg) {
              if (lastMsg.type === 'IMAGE') {
                previewText = '📷 Photo';
              } else if (lastMsg.type === 'AUDIO') {
                previewText = '🎵 Audio';
              } else if (lastMsg.type === 'VIDEO') {
                previewText = '🎥 Video';
              } else if (lastMsg.type === 'FILE') {
                previewText = '📎 Document';
              } else {
                previewText = (lastMsg.isOutgoing ? 'You: ' : '') + lastMsg.content;
              }
            } else if (chatItem?.lastMessage && chatItem.lastMessage !== 'Direct conversation') {
              previewText = chatItem.lastMessage;
            } else if (isOnline) {
              previewText = 'Online • Tap to chat';
            }

            const previewTime = lastMsg?.timestamp || chatItem?.lastMessageTime;
            const unreadCount = chatItem?.unreadCount || 0;

            return (
              <li
                key={friend.id}
                className={`chat-item ${isActive ? 'active' : ''}`}
                onClick={() => openDirectChat(friend)}
              >
                <div
                  className="avatar-circle"
                  style={{
                    background: getAvatarColor(friend.username),
                    width: 46,
                    height: 46,
                    position: 'relative',
                  }}
                >
                  {(friend.displayName || friend.username)[0]?.toUpperCase() || 'U'}
                  <span className={`presence-dot ${isOnline ? 'online' : ''}`} />
                </div>

                <div className="chat-info">
                  <div className="chat-header-row">
                    <span className="chat-title" style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                      {friend.displayName || friend.username}
                    </span>
                    <span className="chat-time">{formatChatTime(previewTime)}</span>
                  </div>
                  <div className="chat-preview-row">
                    <span className="chat-preview" style={{ fontSize: 13 }}>
                      {previewText}
                    </span>
                    {unreadCount > 0 && <span className="unread-badge">{unreadCount}</span>}
                  </div>
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
};

export default Sidebar;
