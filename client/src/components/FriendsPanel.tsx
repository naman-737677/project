import React, { useState } from 'react';
import { useChat } from '../context/ChatContext';
import { useAuth, DEMO_USERS } from '../context/AuthContext';
import {
  Users,
  UserPlus,
  MessageSquare,
  X,
  Search,
  Check,
  AlertCircle,
  UserMinus,
  Sparkles,
  RefreshCw,
  Clock,
  Phone,
} from 'lucide-react';
import { useCall } from '../context/CallContext';
import { Friend } from '../types';

export const FriendsPanel: React.FC = () => {
  const { currentUser } = useAuth();
  const {
    friends,
    isLoadingFriends,
    isFriendsPanelOpen,
    toggleFriendsPanel,
    loadFriends,
    addFriend,
    removeFriend,
    openDirectChat,
    getDirectConversations,
    activeChatId,
  } = useChat();
  const { startCall } = useCall();

  const [activeTab, setActiveTab] = useState<'FRIENDS' | 'MESSAGED'>('FRIENDS');
  const [filterOnline, setFilterOnline] = useState<boolean>(false);
  const [usernameInput, setUsernameInput] = useState<string>('');
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);
  const [statusMessage, setStatusMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  if (!isFriendsPanelOpen) {
    return null;
  }

  const onlineFriends = friends.filter((f) => f.status === 'ONLINE');
  const displayedFriends = filterOnline ? onlineFriends : friends;
  const directConversations = getDirectConversations();

  // Handle adding friend
  const handleAddFriend = async (targetUsername?: string) => {
    const toAdd = targetUsername || usernameInput;
    if (!toAdd.trim()) {
      setStatusMessage({ type: 'error', text: 'Please enter a username to add' });
      return;
    }

    setIsSubmitting(true);
    setStatusMessage(null);

    const res = await addFriend(toAdd.trim());
    setIsSubmitting(false);

    if (res.success) {
      setStatusMessage({
        type: 'success',
        text: `Successfully added ${res.friend?.displayName || res.friend?.username || toAdd}!`,
      });
      setUsernameInput('');
      setTimeout(() => setStatusMessage(null), 4000);
    } else {
      setStatusMessage({
        type: 'error',
        text: res.error || 'Failed to add friend',
      });
    }
  };

  const handleRemoveFriend = async (friend: Friend) => {
    if (confirm(`Remove ${friend.displayName || friend.username} from your friends list?`)) {
      await removeFriend(friend.id);
    }
  };

  const formatTimestamp = (ts?: number) => {
    if (!ts) return '';
    const now = Date.now();
    const diff = now - ts;
    if (diff < 60000) return 'Just now';
    if (diff < 3600000) return `${Math.floor(diff / 60000)}m ago`;
    if (diff < 86400000) return `${Math.floor(diff / 3600000)}h ago`;
    const date = new Date(ts);
    return date.toLocaleDateString([], { month: 'short', day: 'numeric' });
  };

  // Demo user suggestions that aren't already friends and aren't current user
  const suggestions = DEMO_USERS.filter(
    (u) =>
      u.userId !== currentUser?.userId &&
      !friends.some((f) => f.id === u.userId || f.username.toLowerCase() === u.username.toLowerCase())
  );

  return (
    <aside className="friends-panel">
      {/* Panel Top Header */}
      <div className="friends-panel-header">
        <div className="friends-header-info">
          <div className="friends-header-title-row">
            <Users size={18} className="friends-header-icon" />
            <h3 className="friends-panel-title">Friends & Direct Chats</h3>
          </div>
          <div className="friends-presence-summary">
            <span className="presence-dot online" />
            <span>
              {onlineFriends.length} online of {friends.length} friends
            </span>
          </div>
        </div>

        <div className="friends-header-actions">
          <button
            className="panel-icon-btn"
            onClick={() => loadFriends()}
            title="Refresh Friends List"
            disabled={isLoadingFriends}
          >
            <RefreshCw size={15} className={isLoadingFriends ? 'spin' : ''} />
          </button>
          <button
            className="panel-icon-btn"
            onClick={toggleFriendsPanel}
            title="Close Panel"
          >
            <X size={17} />
          </button>
        </div>
      </div>

      {/* Tabs Switcher */}
      <div className="friends-tabs">
        <button
          className={`friends-tab-btn ${activeTab === 'FRIENDS' ? 'active' : ''}`}
          onClick={() => setActiveTab('FRIENDS')}
        >
          <Users size={15} />
          <span>Friends ({friends.length})</span>
        </button>

        <button
          className={`friends-tab-btn ${activeTab === 'MESSAGED' ? 'active' : ''}`}
          onClick={() => setActiveTab('MESSAGED')}
        >
          <MessageSquare size={15} />
          <span>Messaged ({directConversations.length})</span>
        </button>
      </div>

      {/* Add Friend Section */}
      <div className="add-friend-section">
        <label className="section-label">
          <UserPlus size={14} />
          <span>Add Friend by Username</span>
        </label>

        <form
          className="add-friend-form"
          onSubmit={(e) => {
            e.preventDefault();
            handleAddFriend();
          }}
        >
          <div className="add-friend-input-wrapper">
            <span className="add-friend-prefix">@</span>
            <input
              type="text"
              placeholder="e.g. alice, bob..."
              value={usernameInput}
              onChange={(e) => setUsernameInput(e.target.value)}
              className="add-friend-input"
            />
          </div>

          <button
            type="submit"
            className="add-friend-btn"
            disabled={isSubmitting || !usernameInput.trim()}
          >
            {isSubmitting ? 'Adding...' : 'Add'}
          </button>
        </form>

        {/* Status Feedback Message */}
        {statusMessage && (
          <div className={`status-feedback ${statusMessage.type}`}>
            {statusMessage.type === 'success' ? (
              <Check size={14} className="status-icon" />
            ) : (
              <AlertCircle size={14} className="status-icon" />
            )}
            <span>{statusMessage.text}</span>
            <button
              onClick={() => setStatusMessage(null)}
              className="status-close-btn"
            >
              <X size={12} />
            </button>
          </div>
        )}

        {/* Quick Add Suggestions */}
        {suggestions.length > 0 && (
          <div className="quick-suggestions-box">
            <div className="suggestions-header">
              <Sparkles size={12} />
              <span>Suggested Demo Contacts:</span>
            </div>
            <div className="suggestions-list">
              {suggestions.map((u) => (
                <button
                  key={u.userId}
                  type="button"
                  className="suggestion-pill"
                  onClick={() => handleAddFriend(u.username)}
                  title={`Add ${u.displayName} (@${u.username})`}
                  disabled={isSubmitting}
                >
                  <span className="suggestion-plus">+</span>
                  <span className="suggestion-name">{u.displayName}</span>
                  <span className="suggestion-username">@{u.username}</span>
                </button>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Main Body Content based on Active Tab */}
      <div className="friends-panel-content">
        {activeTab === 'FRIENDS' ? (
          <div className="friends-list-wrapper">
            {/* Filter Toggle */}
            <div className="friends-filter-bar">
              <span className="filter-title">
                {filterOnline ? 'Online Friends' : 'All Friends'} ({displayedFriends.length})
              </span>
              <button
                className={`filter-toggle-pill ${filterOnline ? 'active' : ''}`}
                onClick={() => setFilterOnline((prev) => !prev)}
              >
                <span className={`presence-dot ${filterOnline ? 'online' : 'offline'}`} />
                {filterOnline ? 'Show All' : 'Online Only'}
              </button>
            </div>

            {displayedFriends.length === 0 ? (
              <div className="empty-panel-state">
                <Users size={36} className="empty-state-icon" />
                <h4>{filterOnline ? 'No friends currently online' : 'No friends yet'}</h4>
                <p>
                  {filterOnline
                    ? 'None of your friends are currently active on WebSocket.'
                    : 'Add a friend above using their @username or choose a suggested demo user!'}
                </p>
              </div>
            ) : (
              <div className="friends-cards-container">
                {displayedFriends.map((friend) => {
                  const isChatActive = activeChatId === friend.directChatId;
                  const isOnline = friend.status === 'ONLINE';

                  return (
                    <div
                      key={friend.id}
                      className={`friend-card ${isChatActive ? 'active-chat' : ''}`}
                    >
                      <div className="friend-avatar-wrapper">
                        <div className="friend-avatar">
                          {friend.displayName?.[0]?.toUpperCase() || friend.username[0]?.toUpperCase() || 'U'}
                        </div>
                        <span
                          className={`presence-indicator ${isOnline ? 'online' : 'offline'}`}
                          title={isOnline ? 'Online now' : 'Offline'}
                        />
                      </div>

                      <div className="friend-details">
                        <div className="friend-name-row">
                          <span className="friend-display-name">{friend.displayName}</span>
                        </div>
                        <div className="friend-sub-row">
                          <span className="friend-username">@{friend.username}</span>
                          <span className={`friend-status-label ${isOnline ? 'online' : 'offline'}`}>
                            {isOnline ? 'Online' : 'Offline'}
                          </span>
                        </div>
                      </div>

                      <div className="friend-actions">
                        <button
                          className="friend-call-btn"
                          onClick={() => startCall(friend, 'AUDIO')}
                          title={`Call ${friend.displayName}`}
                        >
                          <Phone size={13} />
                        </button>
                        <button
                          className="friend-msg-btn"
                          onClick={() => openDirectChat(friend)}
                          title={`Send real-time direct message to ${friend.displayName}`}
                        >
                          <MessageSquare size={14} />
                          <span>Chat</span>
                        </button>
                        <button
                          className="friend-remove-btn"
                          onClick={() => handleRemoveFriend(friend)}
                          title={`Remove ${friend.displayName}`}
                        >
                          <UserMinus size={13} />
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        ) : (
          /* "Whom I Have Messaged" (Direct Conversations) Tab */
          <div className="direct-convs-wrapper">
            <div className="direct-convs-header">
              <span className="filter-title">Whom You Have Messaged</span>
              <span className="filter-count">{directConversations.length} conversation(s)</span>
            </div>

            {directConversations.length === 0 ? (
              <div className="empty-panel-state">
                <MessageSquare size={36} className="empty-state-icon" />
                <h4>No direct conversations yet</h4>
                <p>Click "Chat" on any friend to start a real-time 1-on-1 direct conversation.</p>
              </div>
            ) : (
              <div className="direct-convs-list">
                {directConversations.map((conv) => {
                  const isSelected = activeChatId === conv.chatId;
                  const isOnline = conv.friend.status === 'ONLINE';

                  return (
                    <div
                      key={conv.chatId}
                      className={`direct-conv-item ${isSelected ? 'selected' : ''}`}
                      onClick={() => openDirectChat(conv.friend)}
                      title={`Open chat with ${conv.friend.displayName}`}
                    >
                      <div className="conv-avatar-wrapper">
                        <div className="conv-avatar">
                          {conv.friend.displayName?.[0]?.toUpperCase() || conv.friend.username[0]?.toUpperCase() || 'U'}
                        </div>
                        <span
                          className={`presence-indicator ${isOnline ? 'online' : 'offline'}`}
                          title={isOnline ? 'Online' : 'Offline'}
                        />
                      </div>

                      <div className="conv-info">
                        <div className="conv-title-row">
                          <span className="conv-friend-name">{conv.friend.displayName}</span>
                          {conv.lastMessageTime && (
                            <span className="conv-time">
                              {formatTimestamp(conv.lastMessageTime)}
                            </span>
                          )}
                        </div>

                        <div className="conv-preview-row">
                          <span className="conv-preview">
                            {conv.lastMessage || 'No messages yet'}
                          </span>
                          {conv.unreadCount > 0 && (
                            <span className="unread-badge">{conv.unreadCount}</span>
                          )}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}
      </div>

      {/* Footer Info */}
      <div className="friends-panel-footer">
        <span className="footer-tip">
          ⚡ Real-time presence & instant message fanout powered by WebSockets
        </span>
      </div>
    </aside>
  );
};

export default FriendsPanel;
