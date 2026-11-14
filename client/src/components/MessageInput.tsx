import React, { useState, useRef, useEffect } from 'react';
import { useChat } from '../context/ChatContext';
import {
  Send,
  Paperclip,
  X,
  FileText,
  Loader2,
  Image as ImageIcon,
  Music,
  Film,
  Smile,
  Mic,
  Trash2,
  AlertCircle,
} from 'lucide-react';
import { EmojiPicker } from './EmojiPicker';

export const MessageInput: React.FC = () => {
  const { sendMessage, sendFileMessage, sendTyping } = useChat();
  const [text, setText] = useState('');
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [filePreview, setFilePreview] = useState<string | null>(null);
  const [isUploading, setIsUploading] = useState(false);
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const [isEmojiPickerOpen, setIsEmojiPickerOpen] = useState(false);

  // Live Audio / Voice Recording State
  const [isRecording, setIsRecording] = useState(false);
  const [recordingSeconds, setRecordingSeconds] = useState(0);
  const [micError, setMicError] = useState<string | null>(null);
  const [micVolume, setMicVolume] = useState<number>(0);
  const [noSoundDetected, setNoSoundDetected] = useState<boolean>(false);

  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const emojiRef = useRef<HTMLDivElement>(null);
  const typingTimerRef = useRef<any>(null);

  // Audio recording refs
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const timerIntervalRef = useRef<any>(null);
  const audioStreamRef = useRef<MediaStream | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const animFrameRef = useRef<number | null>(null);

  const cleanupAudioContext = () => {
    if (animFrameRef.current) {
      cancelAnimationFrame(animFrameRef.current);
      animFrameRef.current = null;
    }
    if (audioContextRef.current && audioContextRef.current.state !== 'closed') {
      try {
        audioContextRef.current.close();
      } catch {}
      audioContextRef.current = null;
    }
    analyserRef.current = null;
    setMicVolume(0);
    setNoSoundDetected(false);
  };

  // Close attachment and emoji popups when clicking outside or pressing Escape
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      const target = e.target as Node;
      if (menuRef.current && !menuRef.current.contains(target)) {
        setIsMenuOpen(false);
      }
      if (emojiRef.current && !emojiRef.current.contains(target)) {
        setIsEmojiPickerOpen(false);
      }
    };

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setIsMenuOpen(false);
        setIsEmojiPickerOpen(false);
        if (isRecording) {
          cancelRecording();
        }
      }
    };

    if (isMenuOpen || isEmojiPickerOpen || isRecording) {
      document.addEventListener('mousedown', handleClickOutside);
      document.addEventListener('keydown', handleKeyDown);
    }

    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [isMenuOpen, isEmojiPickerOpen, isRecording]);

  // Clean up recording stream on component unmount
  useEffect(() => {
    return () => {
      if (timerIntervalRef.current) {
        clearInterval(timerIntervalRef.current);
      }
      if (audioStreamRef.current) {
        audioStreamRef.current.getTracks().forEach((track) => track.stop());
      }
      cleanupAudioContext();
    };
  }, []);

  const handleInputChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    setText(e.target.value);
    sendTyping(true);

    if (typingTimerRef.current) {
      clearTimeout(typingTimerRef.current);
    }
    typingTimerRef.current = setTimeout(() => {
      sendTyping(false);
    }, 2000);
  };

  // Insert emoji at cursor position
  const handleInsertEmoji = (emoji: string) => {
    const textarea = textareaRef.current;
    if (!textarea) {
      setText((prev) => prev + emoji);
      return;
    }

    const start = textarea.selectionStart ?? text.length;
    const end = textarea.selectionEnd ?? text.length;
    const updated = text.substring(0, start) + emoji + text.substring(end);
    setText(updated);
    sendTyping(true);

    requestAnimationFrame(() => {
      textarea.focus();
      const newPos = start + emoji.length;
      textarea.setSelectionRange(newPos, newPos);
    });
  };

  const triggerAttachmentOption = (acceptType: string) => {
    setIsMenuOpen(false);
    if (fileInputRef.current) {
      fileInputRef.current.accept = acceptType;
      fileInputRef.current.click();
    }
  };

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setSelectedFile(file);
    if (file.type.startsWith('image/')) {
      const url = URL.createObjectURL(file);
      setFilePreview(url);
    } else {
      setFilePreview(null);
    }

    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  const handleRemoveFile = () => {
    if (filePreview) {
      URL.revokeObjectURL(filePreview);
    }
    setSelectedFile(null);
    setFilePreview(null);
  };

  const formatFileSize = (bytes: number) => {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  };

  const getFileCategory = (file: File) => {
    if (file.type.startsWith('image/')) return 'Photo';
    if (file.type.startsWith('audio/') || /\.(mp3|wav|ogg|m4a|aac|flac)$/i.test(file.name)) return 'Audio';
    if (file.type.startsWith('video/') || /\.(mp4|webm|mov)$/i.test(file.name)) return 'Video';
    return 'Document';
  };

  // ----------------------------------------------------
  // Audio Voice Recording Handlers
  // ----------------------------------------------------
  const startRecording = async () => {
    if (isUploading) return;
    setMicError(null);
    setNoSoundDetected(false);
    setIsEmojiPickerOpen(false);
    setIsMenuOpen(false);

    try {
      if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
        throw new Error('Voice recording is not supported on this browser.');
      }

      // Request microphone stream with voice-optimized constraints
      let stream: MediaStream;
      try {
        stream = await navigator.mediaDevices.getUserMedia({
          audio: {
            echoCancellation: true,
            noiseSuppression: false, // Avoid aggressive noise gating that mutes soft speech
            autoGainControl: true,   // Automatically boosts microphone gain
          },
        });
      } catch {
        stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      }

      audioStreamRef.current = stream;

      // Real-time audio volume analyzer to verify microphone is picking up sound
      try {
        const AudioCtx = window.AudioContext || (window as any).webkitAudioContext;
        if (AudioCtx) {
          const actx = new AudioCtx();
          audioContextRef.current = actx;
          const srcNode = actx.createMediaStreamSource(stream);
          const analyser = actx.createAnalyser();
          analyser.fftSize = 64;
          srcNode.connect(analyser);
          analyserRef.current = analyser;

          const dataArray = new Uint8Array(analyser.frequencyBinCount);
          let peakSeen = false;

          const tickVolume = () => {
            if (!analyserRef.current) return;
            analyserRef.current.getByteFrequencyData(dataArray);
            let sum = 0;
            for (let i = 0; i < dataArray.length; i++) {
              sum += dataArray[i];
            }
            const avg = sum / dataArray.length;
            const vol = Math.min(100, Math.round((avg / 128) * 100));
            setMicVolume(vol);
            if (vol > 8) peakSeen = true;
            animFrameRef.current = requestAnimationFrame(tickVolume);
          };
          animFrameRef.current = requestAnimationFrame(tickVolume);

          // If no sound is detected after 3.5 seconds, show warning
          setTimeout(() => {
            if (!peakSeen && isRecording) {
              setNoSoundDetected(true);
            }
          }, 3500);
        }
      } catch (err) {
        console.warn('AudioContext volume meter unavailable:', err);
      }

      // Select supported audio MIME type
      let mimeType = 'audio/webm';
      if (typeof MediaRecorder !== 'undefined') {
        if (MediaRecorder.isTypeSupported('audio/webm;codecs=opus')) {
          mimeType = 'audio/webm;codecs=opus';
        } else if (MediaRecorder.isTypeSupported('audio/ogg;codecs=opus')) {
          mimeType = 'audio/ogg;codecs=opus';
        } else if (MediaRecorder.isTypeSupported('audio/mp4')) {
          mimeType = 'audio/mp4';
        }
      }

      const recorder = new MediaRecorder(stream, { mimeType });
      mediaRecorderRef.current = recorder;
      audioChunksRef.current = [];

      recorder.ondataavailable = (event) => {
        if (event.data && event.data.size > 0) {
          audioChunksRef.current.push(event.data);
        }
      };

      recorder.start(100);
      setIsRecording(true);
      setRecordingSeconds(0);

      if (timerIntervalRef.current) clearInterval(timerIntervalRef.current);
      timerIntervalRef.current = setInterval(() => {
        setRecordingSeconds((prev) => prev + 1);
      }, 1000);
    } catch (err: any) {
      console.warn('[Voice Recording Error]', err);
      cleanupAudioContext();
      setMicError(
        err.name === 'NotAllowedError' || err.name === 'PermissionDeniedError'
          ? 'Microphone permission denied. Please allow microphone access to record audio messages.'
          : err.message || 'Microphone unavailable.'
      );
      setTimeout(() => setMicError(null), 5000);
    }
  };

  const stopAndSendRecording = async () => {
    const recorder = mediaRecorderRef.current;
    if (!recorder || recorder.state === 'inactive') return;

    if (timerIntervalRef.current) {
      clearInterval(timerIntervalRef.current);
      timerIntervalRef.current = null;
    }

    // Explicitly request any remaining buffered audio frames
    if (recorder.state === 'recording') {
      try {
        recorder.requestData();
      } catch {}
    }

    cleanupAudioContext();

    recorder.onstop = async () => {
      try {
        const mime = recorder.mimeType || 'audio/webm';
        const ext = mime.includes('ogg') ? 'ogg' : mime.includes('mp4') ? 'm4a' : 'webm';
        const audioBlob = new Blob(audioChunksRef.current, { type: mime });

        if (audioStreamRef.current) {
          audioStreamRef.current.getTracks().forEach((track) => track.stop());
          audioStreamRef.current = null;
        }

        if (audioBlob.size > 200) {
          const audioFile = new File([audioBlob], `voice_${Date.now()}.${ext}`, { type: mime });
          setIsUploading(true);
          await sendFileMessage(audioFile, '');
          setIsUploading(false);
        } else {
          setMicError('Recording was too short or empty. Please hold to speak.');
          setTimeout(() => setMicError(null), 4000);
        }
      } catch (err) {
        console.error('Failed to send recorded audio message:', err);
      } finally {
        setIsRecording(false);
        setRecordingSeconds(0);
        audioChunksRef.current = [];
      }
    };

    recorder.stop();
  };

  const cancelRecording = () => {
    if (timerIntervalRef.current) {
      clearInterval(timerIntervalRef.current);
      timerIntervalRef.current = null;
    }

    cleanupAudioContext();

    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
      mediaRecorderRef.current.onstop = null;
      try {
        mediaRecorderRef.current.stop();
      } catch {}
    }

    if (audioStreamRef.current) {
      audioStreamRef.current.getTracks().forEach((track) => track.stop());
      audioStreamRef.current = null;
    }

    audioChunksRef.current = [];
    setIsRecording(false);
    setRecordingSeconds(0);
  };

  const formatRecordTime = (sec: number) => {
    const mins = Math.floor(sec / 60);
    const rem = sec % 60;
    return `${mins.toString().padStart(2, '0')}:${rem.toString().padStart(2, '0')}`;
  };

  const handleSend = async () => {
    const trimmed = text.trim();
    if (!trimmed && !selectedFile) return;

    if (selectedFile) {
      setIsUploading(true);
      await sendFileMessage(selectedFile, trimmed);
      setIsUploading(false);
      handleRemoveFile();
      setText('');
      sendTyping(false);
    } else {
      sendMessage(trimmed, 'TEXT');
      setText('');
      sendTyping(false);
    }

    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto';
      textareaRef.current.focus();
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  useEffect(() => {
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto';
      textareaRef.current.style.height = `${Math.min(textareaRef.current.scrollHeight, 120)}px`;
    }
  }, [text]);

  const canSend = !isUploading && (text.trim().length > 0 || !!selectedFile);
  const fileCategory = selectedFile ? getFileCategory(selectedFile) : null;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', width: '100%', position: 'relative' }}>
      {/* Microphone Error Alert Banner */}
      {micError && (
        <div
          style={{
            background: '#fef2f2',
            border: '1px solid #fecaca',
            color: '#b91c1c',
            padding: '8px 16px',
            fontSize: 12.5,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: 8,
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <AlertCircle size={16} />
            <span>{micError}</span>
          </div>
          <button
            type="button"
            onClick={() => setMicError(null)}
            style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#b91c1c' }}
          >
            <X size={15} />
          </button>
        </div>
      )}

      {/* Selected File / Attachment Preview Bar */}
      {selectedFile && (
        <div className="attachment-preview-bar">
          <div className="attachment-preview-item">
            {filePreview ? (
              <img src={filePreview} alt="Preview" className="attachment-preview-thumb" />
            ) : fileCategory === 'Audio' ? (
              <div className="attachment-preview-icon audio" style={{ background: '#fef3c7', color: '#d97706' }}>
                <Music size={22} />
              </div>
            ) : fileCategory === 'Video' ? (
              <div className="attachment-preview-icon video" style={{ background: '#e0f2fe', color: '#0284c7' }}>
                <Film size={22} />
              </div>
            ) : (
              <div className="attachment-preview-icon document" style={{ background: '#f3e8ff', color: '#7c3aed' }}>
                <FileText size={22} />
              </div>
            )}
            <div style={{ display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
              <span
                style={{
                  fontSize: 13,
                  fontWeight: 600,
                  color: '#1e293b',
                  whiteSpace: 'nowrap',
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                  maxWidth: 280,
                }}
              >
                {selectedFile.name}
              </span>
              <span style={{ fontSize: 11, color: '#64748b' }}>
                {formatFileSize(selectedFile.size)} • {fileCategory}
              </span>
            </div>
          </div>

          <button
            type="button"
            onClick={handleRemoveFile}
            style={{
              background: 'none',
              border: 'none',
              color: '#64748b',
              cursor: 'pointer',
              padding: 4,
              borderRadius: '50%',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}
            title="Cancel attachment"
          >
            <X size={18} />
          </button>
        </div>
      )}

      {/* Main Input Bar */}
      <div className="chat-input-bar">
        {/* Hidden File Input with dynamic accept attribute */}
        <input
          type="file"
          ref={fileInputRef}
          style={{ display: 'none' }}
          onChange={handleFileSelect}
        />

        {/* When Voice Recording is Active: Show Telegram Audio Recording Bar */}
        {isRecording ? (
          <div className="voice-recording-bar">
            <div className="voice-recording-indicator">
              <span className="pulse-red-dot" />
              <span className="voice-recording-timer">{formatRecordTime(recordingSeconds)}</span>
            </div>

            <div className="voice-recording-waves">
              {[0.4, 0.75, 0.35, 0.95, 0.6, 0.85, 0.5, 0.7].map((factor, idx) => {
                const dynamicHeight = Math.max(
                  25,
                  Math.min(100, Math.round(20 + factor * (micVolume > 0 ? micVolume : 20) * 0.8))
                );
                return (
                  <span
                    key={idx}
                    className={`wave-bar bar-${idx + 1}`}
                    style={{ height: `${dynamicHeight}%` }}
                  />
                );
              })}
            </div>

            <span
              className="voice-recording-label"
              style={{
                color: noSoundDetected ? '#ea580c' : undefined,
                fontWeight: noSoundDetected ? 600 : undefined,
              }}
            >
              {noSoundDetected
                ? '⚠️ Microphone quiet. Speak closer to mic.'
                : micVolume > 15
                ? 'Listening to your voice...'
                : 'Recording Voice Message...'}
            </span>

            <button
              type="button"
              className="voice-cancel-btn"
              onClick={cancelRecording}
              title="Cancel Recording"
            >
              <Trash2 size={16} />
              <span>Cancel</span>
            </button>

            <button
              type="button"
              className="voice-send-btn"
              onClick={stopAndSendRecording}
              title="Send Voice Message"
            >
              <Send size={16} />
            </button>
          </div>
        ) : (
          /* Normal Message Input Bar Controls */
          <>
            {/* 1. Emoji Button & Emoji Picker Popup */}
            <div className="emoji-menu-container" ref={emojiRef}>
              <button
                type="button"
                className={`input-action-btn ${isEmojiPickerOpen ? 'active' : ''}`}
                onClick={() => {
                  setIsEmojiPickerOpen((prev) => !prev);
                  setIsMenuOpen(false);
                }}
                title="Add Emoji"
                disabled={isUploading}
                style={{
                  color: isEmojiPickerOpen ? '#2481cc' : undefined,
                  background: isEmojiPickerOpen ? '#e0f2fe' : undefined,
                }}
              >
                <Smile size={20} />
              </button>

              {isEmojiPickerOpen && (
                <EmojiPicker
                  onSelectEmoji={handleInsertEmoji}
                  onClose={() => setIsEmojiPickerOpen(false)}
                />
              )}
            </div>

            {/* 2. Attachment Pin & Popup Menu */}
            <div className="attachment-menu-container" ref={menuRef}>
              <button
                type="button"
                className={`input-action-btn ${isMenuOpen || selectedFile ? 'active' : ''}`}
                onClick={() => {
                  setIsMenuOpen((prev) => !prev);
                  setIsEmojiPickerOpen(false);
                }}
                title="Attach Media or File"
                disabled={isUploading}
                style={{
                  color: isMenuOpen || selectedFile ? '#2481cc' : undefined,
                  background: isMenuOpen ? '#e0f2fe' : undefined,
                }}
              >
                <Paperclip size={20} />
              </button>

              {/* Attachment Popup Menu */}
              {isMenuOpen && (
                <div className="attachment-popup-menu" role="menu">
                  {/* Option 1: Photo or Video */}
                  <button
                    type="button"
                    className="attachment-menu-item"
                    onClick={() => triggerAttachmentOption('image/*,video/*')}
                    title="Send photos or video clips"
                  >
                    <div className="attachment-icon-badge photo">
                      <ImageIcon size={19} />
                    </div>
                    <div className="attachment-menu-text">
                      <span className="attachment-menu-title">Photo or Video</span>
                      <span className="attachment-menu-subtitle">JPG, PNG, GIF, MP4</span>
                    </div>
                  </button>

                  {/* Option 2: Document */}
                  <button
                    type="button"
                    className="attachment-menu-item"
                    onClick={() => triggerAttachmentOption('*/*')}
                    title="Send documents or any file"
                  >
                    <div className="attachment-icon-badge document">
                      <FileText size={19} />
                    </div>
                    <div className="attachment-menu-text">
                      <span className="attachment-menu-title">Document</span>
                      <span className="attachment-menu-subtitle">PDF, Word, ZIP, files</span>
                    </div>
                  </button>

                  {/* Option 3: Audio File */}
                  <button
                    type="button"
                    className="attachment-menu-item"
                    onClick={() => triggerAttachmentOption('audio/*')}
                    title="Send music or audio files"
                  >
                    <div className="attachment-icon-badge audio">
                      <Music size={19} />
                    </div>
                    <div className="attachment-menu-text">
                      <span className="attachment-menu-title">Audio File</span>
                      <span className="attachment-menu-subtitle">Music, MP3, recordings</span>
                    </div>
                  </button>
                </div>
              )}
            </div>

            {/* 3. Text Input Box */}
            <textarea
              ref={textareaRef}
              className="message-textarea"
              placeholder={selectedFile ? 'Add an optional caption...' : 'Write a message...'}
              rows={1}
              value={text}
              onChange={handleInputChange}
              onKeyDown={handleKeyDown}
              disabled={isUploading}
            />

            {/* 4. Audio Voice Recording Button */}
            <button
              type="button"
              className="mic-action-btn"
              onClick={startRecording}
              title="Record Voice Message"
              disabled={isUploading}
            >
              <Mic size={20} />
            </button>

            {/* 5. Send Message Button */}
            <button
              type="button"
              className="send-btn"
              disabled={!canSend}
              onClick={handleSend}
              title={isUploading ? 'Uploading...' : 'Send Message (Enter)'}
              style={{
                opacity: canSend ? 1 : 0.45,
                cursor: canSend ? 'pointer' : 'default',
              }}
            >
              {isUploading ? <Loader2 size={18} className="animate-spin" /> : <Send size={18} />}
            </button>
          </>
        )}
      </div>
    </div>
  );
};

export default MessageInput;
