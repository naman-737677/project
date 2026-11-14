import React, { useState } from 'react';
import { useChat } from '../context/ChatContext';
import { useAuth, DEMO_USERS } from '../context/AuthContext';
import { X, UserPlus, Check, AlertCircle, Sparkles } from 'lucide-react';

interface AddFriendModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const AddFriendModal: React.FC<AddFriendModalProps> = ({ isOpen, onClose }) => {
  const { currentUser } = useAuth();
  const { friends, addFriend, openDirectChat } = useChat();
  const [usernameInput, setUsernameInput] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [statusMessage, setStatusMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  if (!isOpen) return null;

  const suggestions = DEMO_USERS.filter(
    (u) =>
      u.userId !== currentUser?.userId &&
      !friends.some((f) => f.id === u.userId || f.username.toLowerCase() === u.username.toLowerCase())
  );

  const handleAdd = async (target?: string) => {
    const toAdd = (target || usernameInput).trim();
    if (!toAdd) {
      setStatusMessage({ type: 'error', text: 'Please enter a username' });
      return;
    }

    setIsSubmitting(true);
    setStatusMessage(null);

    const res = await addFriend(toAdd);
    setIsSubmitting(false);

    if (res.success && res.friend) {
      setStatusMessage({
        type: 'success',
        text: `Added ${res.friend.displayName || res.friend.username} as friend!`,
      });
      setUsernameInput('');
      openDirectChat(res.friend);
      setTimeout(() => {
        setStatusMessage(null);
        onClose();
      }, 1000);
    } else {
      setStatusMessage({
        type: 'error',
        text: res.error || 'Failed to add friend',
      });
    }
  };

  const handleFormSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    handleAdd();
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-content" onClick={(e) => e.stopPropagation()}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <div
              style={{
                width: 32,
                height: 32,
                borderRadius: '50%',
                background: '#e6f2fb',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                color: '#2481cc',
              }}
            >
              <UserPlus size={18} />
            </div>
            <h2 className="modal-title" style={{ margin: 0 }}>Add Friend</h2>
          </div>
          <button
            onClick={onClose}
            style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#6b7280' }}
          >
            <X size={20} />
          </button>
        </div>

        {statusMessage && (
          <div
            style={{
              padding: '10px 14px',
              borderRadius: 8,
              fontSize: 13,
              marginBottom: 16,
              display: 'flex',
              alignItems: 'center',
              gap: 8,
              backgroundColor: statusMessage.type === 'success' ? '#ecfdf5' : '#fef2f2',
              color: statusMessage.type === 'success' ? '#047857' : '#b91c1c',
              border: `1px solid ${statusMessage.type === 'success' ? '#a7f3d0' : '#fecaca'}`,
            }}
          >
            {statusMessage.type === 'success' ? <Check size={16} /> : <AlertCircle size={16} />}
            <span>{statusMessage.text}</span>
          </div>
        )}

        <form onSubmit={handleFormSubmit} style={{ marginBottom: 20 }}>
          <label style={{ display: 'block', fontSize: 13, fontWeight: 500, color: '#374151', marginBottom: 6 }}>
            Enter Telegram Username
          </label>
          <div style={{ display: 'flex', gap: 8 }}>
            <div style={{ position: 'relative', flex: 1 }}>
              <span
                style={{
                  position: 'absolute',
                  left: 12,
                  top: '50%',
                  transform: 'translateY(-50%)',
                  color: '#9ca3af',
                  fontWeight: 600,
                  fontSize: 14,
                }}
              >
                @
              </span>
              <input
                type="text"
                placeholder="username (e.g. bob, charlie)"
                value={usernameInput}
                onChange={(e) => setUsernameInput(e.target.value.replace(/^@/, ''))}
                autoFocus
                style={{
                  width: '100%',
                  padding: '9px 12px 9px 28px',
                  borderRadius: 8,
                  border: '1px solid #d1d5db',
                  fontSize: 14,
                  outline: 'none',
                }}
              />
            </div>
            <button
              type="submit"
              className="btn-primary"
              disabled={isSubmitting || !usernameInput.trim()}
              style={{
                opacity: isSubmitting || !usernameInput.trim() ? 0.6 : 1,
                cursor: isSubmitting || !usernameInput.trim() ? 'not-allowed' : 'pointer',
                whiteSpace: 'nowrap',
              }}
            >
              {isSubmitting ? 'Adding...' : 'Add Friend'}
            </button>
          </div>
        </form>

        {suggestions.length > 0 && (
          <div style={{ borderTop: '1px solid #f1f5f9', paddingTop: 16 }}>
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 6,
                fontSize: 12,
                fontWeight: 600,
                color: '#64748b',
                textTransform: 'uppercase',
                letterSpacing: '0.04em',
                marginBottom: 10,
              }}
            >
              <Sparkles size={14} color="#f59e0b" />
              <span>Suggested Contacts</span>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {suggestions.map((sug) => (
                <div
                  key={sug.userId}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    padding: '8px 12px',
                    borderRadius: 8,
                    background: '#f8fafc',
                    border: '1px solid #e2e8f0',
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                    <div
                      style={{
                        width: 34,
                        height: 34,
                        borderRadius: '50%',
                        background: '#54a9eb',
                        color: '#ffffff',
                        fontWeight: 600,
                        fontSize: 14,
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                      }}
                    >
                      {sug.displayName[0]?.toUpperCase() || 'U'}
                    </div>
                    <div>
                      <div style={{ fontSize: 13, fontWeight: 600, color: '#1e293b' }}>{sug.displayName}</div>
                      <div style={{ fontSize: 11, color: '#64748b' }}>@{sug.username}</div>
                    </div>
                  </div>

                  <button
                    type="button"
                    onClick={() => handleAdd(sug.username)}
                    disabled={isSubmitting}
                    style={{
                      background: '#e6f2fb',
                      color: '#2481cc',
                      border: 'none',
                      borderRadius: 6,
                      padding: '5px 12px',
                      fontSize: 12,
                      fontWeight: 600,
                      cursor: 'pointer',
                    }}
                  >
                    + Add
                  </button>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
