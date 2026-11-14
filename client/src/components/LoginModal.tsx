import React, { useState } from 'react';
import { useAuth, DEMO_USERS } from '../context/AuthContext';
import { useChat } from '../context/ChatContext';
import { X, Key, Server, UserCheck } from 'lucide-react';

interface LoginModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const LoginModal: React.FC<LoginModalProps> = ({ isOpen, onClose }) => {
  const { currentUser, login, loginAsDemoUser, logout, gatewayUrl, setGatewayUrl } = useAuth();
  const { saveChatsOnLogout } = useChat();
  const [username, setUsername] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [userId, setUserId] = useState('');
  const [customToken, setCustomToken] = useState('');
  const [urlInput, setUrlInput] = useState(gatewayUrl);

  if (!isOpen) return null;

  const handleCustomLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!username.trim()) return;

    await login({
      userId: userId.trim() || crypto.randomUUID(),
      username: username.trim(),
      displayName: displayName.trim() || username.trim(),
      token: customToken.trim() || undefined,
    });
    onClose();
  };

  const handleSelectDemo = async (demo: (typeof DEMO_USERS)[0]) => {
    await loginAsDemoUser(demo);
    onClose();
  };

  const handleSaveGateway = () => {
    setGatewayUrl(urlInput);
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-content" onClick={(e) => e.stopPropagation()}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
          <h2 className="modal-title" style={{ margin: 0 }}>Telegram Account & Gateway</h2>
          <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#6b7280' }}>
            <X size={20} />
          </button>
        </div>

        {/* Current status */}
        {currentUser && (
          <div style={{ background: '#f0fdf4', border: '1px solid #bbf7d0', borderRadius: 8, padding: 12, marginBottom: 16 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, color: '#166534', fontWeight: 600 }}>
              <UserCheck size={18} />
              <span>Signed in as {currentUser.displayName} (@{currentUser.username})</span>
            </div>
            <div style={{ fontSize: 11, color: '#4b5563', marginTop: 4, fontFamily: 'monospace' }}>
              UUID: {currentUser.userId}
            </div>
            <button
              onClick={() => {
                saveChatsOnLogout();
                logout();
              }}
              style={{
                marginTop: 8,
                background: '#fee2e2',
                color: '#991b1b',
                border: 'none',
                padding: '4px 10px',
                borderRadius: 6,
                fontSize: 12,
                cursor: 'pointer',
              }}
            >
              Sign Out
            </button>
          </div>
        )}

        {/* Fast Demo Users */}
        <div style={{ marginBottom: 20 }}>
          <label style={{ display: 'block', fontSize: 13, fontWeight: 600, color: '#4b5563', marginBottom: 8 }}>
            Quick Demo Accounts (Instant Test)
          </label>
          {DEMO_USERS.map((demo) => (
            <div
              key={demo.username}
              className="demo-user-card"
              onClick={() => handleSelectDemo(demo)}
            >
              <div className="avatar-circle" style={{ background: demo.avatarColor, width: 36, height: 36 }}>
                {demo.displayName[0]}
              </div>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 14, fontWeight: 600 }}>{demo.displayName}</div>
                <div style={{ fontSize: 12, color: '#6b7280' }}>@{demo.username}</div>
              </div>
              <span style={{ fontSize: 12, color: '#2481cc', fontWeight: 500 }}>Login →</span>
            </div>
          ))}
        </div>

        {/* Custom Login Form */}
        <form onSubmit={handleCustomLogin} style={{ marginBottom: 20 }}>
          <label style={{ display: 'block', fontSize: 13, fontWeight: 600, color: '#4b5563', marginBottom: 8 }}>
            Or Custom User
          </label>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginBottom: 8 }}>
            <input
              type="text"
              placeholder="Username (e.g. dev_user)"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              style={{ padding: '8px 12px', borderRadius: 8, border: '1px solid #d1d5db', fontSize: 13 }}
            />
            <input
              type="text"
              placeholder="Display Name"
              value={displayName}
              onChange={(e) => setDisplayName(e.target.value)}
              style={{ padding: '8px 12px', borderRadius: 8, border: '1px solid #d1d5db', fontSize: 13 }}
            />
          </div>
          <input
            type="text"
            placeholder="User UUID (optional, auto-generated if blank)"
            value={userId}
            onChange={(e) => setUserId(e.target.value)}
            style={{ width: '100%', padding: '8px 12px', borderRadius: 8, border: '1px solid #d1d5db', fontSize: 12, marginBottom: 8 }}
          />
          <button type="submit" className="btn-primary" style={{ width: '100%' }}>
            Login with Custom Profile
          </button>
        </form>

        {/* Gateway Endpoint Settings */}
        <div style={{ borderTop: '1px solid #e5e7eb', paddingTop: 14 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13, fontWeight: 600, color: '#4b5563', marginBottom: 6 }}>
            <Server size={15} />
            <span>WebSocket Gateway Endpoint</span>
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            <input
              type="text"
              value={urlInput}
              onChange={(e) => setUrlInput(e.target.value)}
              style={{ flex: 1, padding: '7px 10px', borderRadius: 8, border: '1px solid #d1d5db', fontSize: 12 }}
            />
            <button
              type="button"
              className="btn-secondary"
              onClick={handleSaveGateway}
              style={{ padding: '7px 12px', fontSize: 12 }}
            >
              Apply
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
