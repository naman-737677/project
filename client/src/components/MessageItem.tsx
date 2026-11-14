import React, { useState } from 'react';
import { Message, MessageAttachment } from '../types';
import { Check, CheckCheck, Clock, AlertCircle, FileText, Download, X, Music, Film } from 'lucide-react';
import { VoicePlayer } from './VoicePlayer';

interface MessageItemProps {
  message: Message;
}

export const MessageItem: React.FC<MessageItemProps> = ({ message }) => {
  const isOutgoing = message.isOutgoing;
  const [previewImage, setPreviewImage] = useState<string | null>(null);

  const formatTime = (ts: number) => {
    return new Date(ts).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  };

  const formatFileSize = (bytes: string | number) => {
    const num = typeof bytes === 'string' ? parseInt(bytes, 10) : bytes;
    if (isNaN(num) || num <= 0) return '0 B';
    if (num < 1024) return `${num} B`;
    if (num < 1024 * 1024) return `${(num / 1024).toFixed(1)} KB`;
    return `${(num / (1024 * 1024)).toFixed(1)} MB`;
  };

  const isImageAttachment = (att: MessageAttachment) => {
    const attAny = att as any;
    const mime = (att.mime_type || attAny.mimeType || '').toLowerCase();
    const name = att.file_name || attAny.fileName || '';
    return (
      mime.startsWith('image/') ||
      /\.(jpg|jpeg|png|gif|webp|svg)$/i.test(name)
    );
  };

  const renderStatus = () => {
    if (!isOutgoing) return null;

    switch (message.status) {
      case 'PENDING':
        return <Clock size={13} color="#9ca3af" />;
      case 'PERSISTED':
        return <Check size={14} color="#4fae4e" />;
      case 'READ':
        return <CheckCheck size={14} color="#4fae4e" />;
      case 'FAILED':
        return <AlertCircle size={13} color="#ef4444" />;
      default:
        return null;
    }
  };

  return (
    <>
      <div className={`message-bubble-row ${isOutgoing ? 'outgoing' : 'incoming'}`}>
        <div className={`message-bubble ${isOutgoing ? 'outgoing' : 'incoming'}`}>
          {!isOutgoing && message.senderName && (
            <div className="message-sender-name">{message.senderName}</div>
          )}

          {/* Render Attachments (Photos / Videos / Audio / Documents / Files) */}
          {message.attachments && message.attachments.length > 0 && (
            <div className="message-attachments">
              {message.attachments.map((att, idx) => {
                const attAny = att as any;
                const fileUrl = att.file_url || attAny.fileUrl || '';
                const fileName = att.file_name || attAny.fileName || 'file';
                const mimeType = (att.mime_type || attAny.mimeType || '').toLowerCase();
                const fileSize = att.file_size || attAny.fileSize || 0;

                const isImg = isImageAttachment(att);
                const isAudio =
                  mimeType.startsWith('audio/') ||
                  fileName.startsWith('voice_') ||
                  /\.(mp3|wav|ogg|m4a|aac|flac|weba)$/i.test(fileName);
                const isVideo =
                  !isAudio &&
                  (mimeType.startsWith('video/') ||
                    /\.(mp4|mov|mkv)$/i.test(fileName) ||
                    (fileName.endsWith('.webm') && !mimeType.startsWith('audio/')));

                if (isImg) {
                  return (
                    <div key={att.id || idx} className="message-image-container">
                      <img
                        src={fileUrl}
                        alt={fileName}
                        className="message-image"
                        onClick={() => setPreviewImage(fileUrl)}
                        title="Click to view full photo"
                      />
                    </div>
                  );
                }

                if (isAudio) {
                  return (
                    <VoicePlayer
                      key={att.id || idx}
                      src={fileUrl}
                      fileName={fileName}
                      fileSize={fileSize}
                      isOutgoing={isOutgoing}
                    />
                  );
                }

                if (isVideo) {
                  return (
                    <div key={att.id || idx} className="message-video-container">
                      <video
                        controls
                        src={fileUrl}
                        className="message-video"
                        preload="metadata"
                      />
                    </div>
                  );
                }

                return (
                  <a
                    key={att.id || idx}
                    href={fileUrl}
                    download={fileName}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="message-file-card"
                    title={`Download ${fileName}`}
                  >
                    <div className="message-file-icon">
                      <FileText size={20} />
                    </div>
                    <div className="message-file-meta">
                      <span className="message-file-name">{fileName}</span>
                      <span className="message-file-size">
                        {formatFileSize(fileSize)} • Tap to download
                      </span>
                    </div>
                    <Download size={16} color="#64748b" style={{ marginLeft: 8 }} />
                  </a>
                );
              })}
            </div>
          )}

          {/* Text content / caption */}
          {message.content && <div className="message-text">{message.content}</div>}

          <div className="message-footer">
            {message.seqId && message.seqId !== '...' && (
              <span className="seq-tag" title="Monotonic Sequence ID">
                #{message.seqId}
              </span>
            )}
            <span>{formatTime(message.timestamp)}</span>
            {renderStatus()}
          </div>
        </div>
      </div>

      {/* Fullscreen Photo Lightbox Modal */}
      {previewImage && (
        <div
          className="modal-overlay"
          onClick={() => setPreviewImage(null)}
          style={{ zIndex: 9999, background: 'rgba(0,0,0,0.85)' }}
        >
          <div style={{ position: 'relative', maxWidth: '90vw', maxHeight: '90vh' }}>
            <img
              src={previewImage}
              alt="Preview"
              style={{
                maxWidth: '90vw',
                maxHeight: '85vh',
                objectFit: 'contain',
                borderRadius: 8,
                boxShadow: '0 8px 30px rgba(0,0,0,0.5)',
              }}
              onClick={(e) => e.stopPropagation()}
            />
            <button
              onClick={() => setPreviewImage(null)}
              style={{
                position: 'absolute',
                top: -40,
                right: 0,
                background: 'rgba(255,255,255,0.2)',
                border: 'none',
                color: '#ffffff',
                borderRadius: '50%',
                width: 32,
                height: 32,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                cursor: 'pointer',
              }}
              title="Close"
            >
              <X size={20} />
            </button>
          </div>
        </div>
      )}
    </>
  );
};
