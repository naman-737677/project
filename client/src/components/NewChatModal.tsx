import React, { useState } from 'react';
import { useChat } from '../context/ChatContext';
import { X, MessageSquarePlus, Hash } from 'lucide-react';

interface NewChatModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const NewChatModal: React.FC<NewChatModalProps> = ({ isOpen, onClose }) => {
  const { createChat, selectChat, chats } = useChat();
  const [title, setTitle] = useState('');
  const [chatType, setChatType] = useState<'GROUP' | 'DIRECT'>('GROUP');
  const [joinChatId, setJoinChatId] = useState('');

  if (!isOpen) return null;

  const handleCreate = (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim()) return;

    createChat(title.trim(), chatType);
    setTitle('');
    onClose();
  };

  const handleJoin = (e: React.FormEvent) => {
    e.preventDefault();
    const id = joinChatId.trim();
    if (!id) return;

    const existing = chats.find((c) => c.id === id);
    if (existing) {
      selectChat(id);
    } else {
      // Create chat entry locally with this ID
      createChat(`Chat #${id.slice(0, 6)}`, 'GROUP', id);
      selectChat(id);
    }
    setJoinChatId('');
    onClose();
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-content" onClick={(e) => e.stopPropagation()}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
          <h2 className="modal-title" style={{ margin: 0 }}>New Conversation</h2>
          <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#6b7280' }}>
            <X size={20} />
          </button>
        </div>

        {/* Create new chat */}
        <form onSubmit={handleCreate} style={{ marginBottom: 24 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, fontWeight: 600, color: '#4b5563', marginBottom: 8 }}>
            <MessageSquarePlus size={16} />
            <span>Create New Chat Room</span>
          </div>

          <div style={{ display: 'flex', gap: 8, marginBottom: 12 }}>
            <button
              type="button"
              className={chatType === 'GROUP' ? 'btn-primary' : 'btn-secondary'}
              style={{ flex: 1, padding: '7px 0', fontSize: 13 }}
              onClick={() => setChatType('GROUP')}
            >
              Group Chat
            </button>
            <button
              type="button"
              className={chatType === 'DIRECT' ? 'btn-primary' : 'btn-secondary'}
              style={{ flex: 1, padding: '7px 0', fontSize: 13 }}
              onClick={() => setChatType('DIRECT')}
            >
              Direct Chat
            </button>
          </div>

          <input
            type="text"
            placeholder="Chat Title (e.g. Design Sync, Project Team)"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            style={{ width: '100%', padding: '9px 12px', borderRadius: 8, border: '1px solid #d1d5db', fontSize: 13, marginBottom: 12 }}
          />

          <button type="submit" className="btn-primary" style={{ width: '100%' }}>
            Create Room
          </button>
        </form>

        {/* Join by Chat ID */}
        <form onSubmit={handleJoin} style={{ borderTop: '1px solid #e5e7eb', paddingTop: 16 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, fontWeight: 600, color: '#4b5563', marginBottom: 8 }}>
            <Hash size={16} />
            <span>Join Existing Chat by UUID</span>
          </div>

          <div style={{ display: 'flex', gap: 8 }}>
            <input
              type="text"
              placeholder="e.g. 99999999-9999-4999-8999-999999999999"
              value={joinChatId}
              onChange={(e) => setJoinChatId(e.target.value)}
              style={{ flex: 1, padding: '8px 12px', borderRadius: 8, border: '1px solid #d1d5db', fontSize: 12, fontFamily: 'monospace' }}
            />
            <button type="submit" className="btn-secondary" style={{ fontSize: 13 }}>
              Join
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
