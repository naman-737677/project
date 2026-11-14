import React, { useEffect } from 'react';
import { useCall } from '../context/CallContext';
import { getAvatarColor } from '../utils/avatar';
import { Phone, PhoneOff, Video, ShieldCheck } from 'lucide-react';

export const IncomingCallModal: React.FC = () => {
  const { isIncomingCall, activeCallUser, callType, acceptCall, rejectCall } = useCall();

  // Keyboard shortcut support: Enter to accept, Escape to reject
  useEffect(() => {
    if (!isIncomingCall) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Enter') {
        acceptCall();
      } else if (e.key === 'Escape') {
        rejectCall('Declined by user');
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [isIncomingCall, acceptCall, rejectCall]);

  if (!isIncomingCall) return null;

  const isVideo = callType === 'VIDEO';

  return (
    <div className="incoming-call-overlay">
      <div className="incoming-call-card">
        {/* Top Header Badge */}
        <div className="incoming-header">
          <div className="incoming-tag">
            <span className="incoming-pulse-dot" />
            <span>Telegram Incoming {isVideo ? 'Video' : 'Voice'} Call</span>
          </div>
          <div className="call-encryption-mini" title="End-to-End Encrypted">
            <ShieldCheck size={13} />
            <span>Encrypted</span>
          </div>
        </div>

        {/* Center Avatar with Pulsing Rings */}
        <div className="incoming-avatar-container">
          <div className="incoming-ring ring-1" />
          <div className="incoming-ring ring-2" />
          <div className="incoming-ring ring-3" />
          <div
            className="avatar-circle incoming-avatar"
            style={{
              background: getAvatarColor(activeCallUser?.username || 'incoming'),
            }}
          >
            {(activeCallUser?.displayName || activeCallUser?.username || 'C')[0]?.toUpperCase()}
          </div>
        </div>

        {/* Caller Info */}
        <div className="incoming-caller-info">
          <h2 className="incoming-caller-name">
            {activeCallUser?.displayName || activeCallUser?.username || 'Unknown Friend'}
          </h2>
          {activeCallUser?.username && (
            <span className="incoming-caller-handle">@{activeCallUser.username}</span>
          )}
          <p className="incoming-call-prompt">
            {isVideo ? 'Incoming video call...' : 'Incoming audio call...'}
          </p>
        </div>

        {/* Accept & Decline Action Buttons */}
        <div className="incoming-actions">
          {/* Decline Button */}
          <button
            className="incoming-btn btn-decline"
            onClick={() => rejectCall('Call declined')}
            title="Decline call (Esc)"
          >
            <div className="incoming-btn-icon">
              <PhoneOff size={24} />
            </div>
            <span className="incoming-btn-text">Decline</span>
          </button>

          {/* Accept Button */}
          <button
            className="incoming-btn btn-accept"
            onClick={acceptCall}
            title="Accept call (Enter)"
          >
            <div className="incoming-btn-icon bounce-icon">
              {isVideo ? <Video size={24} /> : <Phone size={24} />}
            </div>
            <span className="incoming-btn-text">Accept</span>
          </button>
        </div>
      </div>
    </div>
  );
};
