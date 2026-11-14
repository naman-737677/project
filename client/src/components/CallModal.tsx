import React, { useRef, useEffect } from 'react';
import { useCall } from '../context/CallContext';
import { getAvatarColor } from '../utils/avatar';
import {
  PhoneOff,
  Mic,
  MicOff,
  Video,
  VideoOff,
  Volume2,
  VolumeX,
  ShieldCheck,
  Sparkles,
} from 'lucide-react';

export const CallModal: React.FC = () => {
  const {
    callState,
    callType,
    callDirection,
    activeCallUser,
    formattedDuration,
    isMuted,
    isVideoEnabled,
    isSpeakerMuted,
    localStream,
    remoteStream,
    callError,
    isCallActive,
    endCall,
    toggleMute,
    toggleVideo,
    toggleSpeaker,
  } = useCall();

  const localVideoRef = useRef<HTMLVideoElement>(null);
  const remoteVideoRef = useRef<HTMLVideoElement>(null);

  // Bind local video stream
  useEffect(() => {
    if (localVideoRef.current && localStream) {
      localVideoRef.current.srcObject = localStream;
    }
  }, [localStream, callType]);

  // Bind remote video stream
  useEffect(() => {
    if (remoteVideoRef.current && remoteStream) {
      remoteVideoRef.current.srcObject = remoteStream;
    }
  }, [remoteStream, callType]);

  // Do not show full modal if call is idle or incoming (incoming uses IncomingCallModal)
  if (!isCallActive || (callState === 'RINGING' && callDirection === 'INCOMING')) {
    return null;
  }

  const isConnected = callState === 'CONNECTED';
  const isVideo = callType === 'VIDEO';

  const getStatusText = () => {
    if (callError) return callError;
    switch (callState) {
      case 'CALLING':
        return 'Calling...';
      case 'RINGING':
        return 'Ringing...';
      case 'CONNECTING':
        return 'Connecting...';
      case 'CONNECTED':
        return formattedDuration;
      case 'ENDED':
        return 'Call ended';
      default:
        return '';
    }
  };

  return (
    <div className="call-modal-overlay">
      <div className={`call-card-container ${isVideo ? 'video-mode' : ''}`}>
        {/* End-to-End Encryption Banner (Telegram Signature Emojis) */}
        <div className="call-header-bar">
          <div className="call-encryption-badge" title="End-to-End Encrypted Peer-to-Peer Call">
            <ShieldCheck size={14} className="shield-icon" />
            <span className="encryption-label">End-to-end encrypted</span>
            <span className="encryption-emojis">🔒 🍓 🚀 ⚡</span>
          </div>
        </div>

        {/* Video Stage (if video call and connected) */}
        {isVideo && (
          <div className="call-video-stage">
            {remoteStream ? (
              <video
                ref={remoteVideoRef}
                autoPlay
                playsInline
                className="call-remote-video"
              />
            ) : (
              <div className="call-video-placeholder">
                <div
                  className="avatar-circle pulse-avatar large"
                  style={{
                    background: getAvatarColor(activeCallUser?.username || 'user'),
                  }}
                >
                  {(activeCallUser?.displayName || activeCallUser?.username || 'U')[0]?.toUpperCase()}
                </div>
                <p>Waiting for video feed...</p>
              </div>
            )}

            {/* Local Video Picture-in-Picture Preview */}
            <div className="call-local-pip-container">
              <video
                ref={localVideoRef}
                autoPlay
                muted
                playsInline
                className={`call-local-pip-video ${!isVideoEnabled ? 'pip-hidden' : ''}`}
              />
              {!isVideoEnabled && (
                <div className="pip-disabled-overlay">
                  <VideoOff size={18} />
                </div>
              )}
            </div>
          </div>
        )}

        {/* Audio Mode Main Body */}
        {!isVideo && (
          <div className="call-body-content">
            <div className="call-avatar-wrapper">
              <div className={`avatar-pulse-ring ${isConnected ? 'active-speaking' : 'ringing-ring'}`} />
              <div
                className="avatar-circle large-call-avatar"
                style={{
                  background: getAvatarColor(activeCallUser?.username || 'call'),
                }}
              >
                {(activeCallUser?.displayName || activeCallUser?.username || 'C')[0]?.toUpperCase()}
              </div>
            </div>

            <div className="call-user-meta">
              <h3 className="call-user-name">
                {activeCallUser?.displayName || activeCallUser?.username || 'Friend'}
              </h3>
              {activeCallUser?.username && (
                <span className="call-user-handle">@{activeCallUser.username}</span>
              )}
              <div className={`call-status-badge ${isConnected ? 'status-connected' : 'status-waiting'}`}>
                {isConnected && <span className="status-live-dot" />}
                <span>{getStatusText()}</span>
              </div>
            </div>

            {/* Live Audio Visualizer Bars */}
            {isConnected && (
              <div className="call-soundwave-container" title="Audio connected">
                <div className="soundwave-bar bar-1" />
                <div className="soundwave-bar bar-2" />
                <div className="soundwave-bar bar-3" />
                <div className="soundwave-bar bar-4" />
                <div className="soundwave-bar bar-5" />
                <div className="soundwave-bar bar-4" />
                <div className="soundwave-bar bar-2" />
                <div className="soundwave-bar bar-1" />
              </div>
            )}
          </div>
        )}

        {/* Video Mode Sub-Header overlay for caller info */}
        {isVideo && (
          <div className="video-meta-overlay">
            <h4 className="video-user-name">
              {activeCallUser?.displayName || activeCallUser?.username}
            </h4>
            <span className="video-status-text">{getStatusText()}</span>
          </div>
        )}

        {/* Bottom Call Controls Toolbar */}
        <div className="call-controls-toolbar">
          {/* Mute Button */}
          <button
            className={`call-control-btn ${isMuted ? 'btn-active-muted' : ''}`}
            onClick={toggleMute}
            title={isMuted ? 'Unmute microphone' : 'Mute microphone'}
          >
            {isMuted ? <MicOff size={22} /> : <Mic size={22} />}
            <span className="btn-label">{isMuted ? 'Muted' : 'Mute'}</span>
          </button>

          {/* Video Toggle Button */}
          <button
            className={`call-control-btn ${isVideoEnabled ? 'btn-active-video' : ''}`}
            onClick={toggleVideo}
            title={isVideoEnabled ? 'Turn camera off' : 'Turn camera on'}
          >
            {isVideoEnabled ? <Video size={22} /> : <VideoOff size={22} />}
            <span className="btn-label">{isVideoEnabled ? 'Camera on' : 'Camera off'}</span>
          </button>

          {/* Speaker / Volume Button */}
          <button
            className={`call-control-btn ${isSpeakerMuted ? 'btn-active-muted' : ''}`}
            onClick={toggleSpeaker}
            title={isSpeakerMuted ? 'Unmute audio output' : 'Mute audio output'}
          >
            {isSpeakerMuted ? <VolumeX size={22} /> : <Volume2 size={22} />}
            <span className="btn-label">{isSpeakerMuted ? 'Deafened' : 'Speaker'}</span>
          </button>

          {/* End Call Button */}
          <button
            className="call-control-btn btn-hangup"
            onClick={endCall}
            title="End call"
          >
            <PhoneOff size={24} />
            <span className="btn-label">End</span>
          </button>
        </div>
      </div>
    </div>
  );
};
