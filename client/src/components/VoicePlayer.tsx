import React, { useState, useRef, useEffect, useCallback } from 'react';
import { Play, Pause, Volume2, VolumeX, Download, AlertCircle } from 'lucide-react';

interface VoicePlayerProps {
  src: string;
  fileName?: string;
  fileSize?: string | number;
  isOutgoing?: boolean;
}

export const VoicePlayer: React.FC<VoicePlayerProps> = ({
  src,
  fileName = 'voice_message.webm',
  fileSize,
  isOutgoing = false,
}) => {
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const progressBarRef = useRef<HTMLDivElement | null>(null);

  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [playbackRate, setPlaybackRate] = useState(1);
  const [isMuted, setIsMuted] = useState(false);
  const [hasError, setHasError] = useState(false);
  const [isLoaded, setIsLoaded] = useState(false);

  // Format seconds to mm:ss
  const formatTime = (seconds: number) => {
    if (!seconds || isNaN(seconds) || !isFinite(seconds)) return '0:00';
    const m = Math.floor(seconds / 60);
    const s = Math.floor(seconds % 60);
    return `${m}:${s < 10 ? '0' : ''}${s}`;
  };

  // Format file size
  const formatSize = (bytes: number | string | undefined) => {
    if (!bytes) return '';
    const num = typeof bytes === 'string' ? parseInt(bytes, 10) : bytes;
    if (isNaN(num) || num <= 0) return '';
    if (num < 1024) return `${num} B`;
    if (num < 1024 * 1024) return `${(num / 1024).toFixed(1)} KB`;
    return `${(num / (1024 * 1024)).toFixed(1)} MB`;
  };

  // Fix Chromium WebM duration (which can report Infinity or NaN)
  const handleDurationDiscovery = useCallback(() => {
    const audio = audioRef.current;
    if (!audio) return;

    if (isFinite(audio.duration) && !isNaN(audio.duration) && audio.duration > 0) {
      setDuration(audio.duration);
      setIsLoaded(true);
      return;
    }

    // Workaround for MediaRecorder WebM files missing duration metadata
    const handleDurationSeek = () => {
      audio.removeEventListener('timeupdate', handleDurationSeek);
      if (isFinite(audio.duration) && !isNaN(audio.duration)) {
        setDuration(audio.duration);
      }
      audio.currentTime = 0;
      setIsLoaded(true);
    };

    audio.addEventListener('timeupdate', handleDurationSeek);
    audio.currentTime = 1e101; // Seek to infinity to force browser to calculate true duration
  }, []);

  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;

    audio.volume = 1.0;

    const onPlay = () => setIsPlaying(true);
    const onPause = () => setIsPlaying(false);
    const onTimeUpdate = () => {
      setCurrentTime(audio.currentTime);
      if (isFinite(audio.duration) && !isNaN(audio.duration) && audio.duration > 0) {
        setDuration(audio.duration);
      }
    };
    const onLoadedMetadata = () => {
      handleDurationDiscovery();
    };
    const onEnded = () => {
      setIsPlaying(false);
      setCurrentTime(0);
      audio.currentTime = 0;
    };
    const onError = () => {
      console.warn('[VoicePlayer] Audio load error for:', src);
      setHasError(true);
    };

    audio.addEventListener('play', onPlay);
    audio.addEventListener('pause', onPause);
    audio.addEventListener('timeupdate', onTimeUpdate);
    audio.addEventListener('loadedmetadata', onLoadedMetadata);
    audio.addEventListener('ended', onEnded);
    audio.addEventListener('error', onError);

    return () => {
      audio.removeEventListener('play', onPlay);
      audio.removeEventListener('pause', onPause);
      audio.removeEventListener('timeupdate', onTimeUpdate);
      audio.removeEventListener('loadedmetadata', onLoadedMetadata);
      audio.removeEventListener('ended', onEnded);
      audio.removeEventListener('error', onError);
    };
  }, [src, handleDurationDiscovery]);

  const togglePlayPause = async () => {
    const audio = audioRef.current;
    if (!audio) return;

    if (isPlaying) {
      audio.pause();
    } else {
      try {
        setHasError(false);
        // Ensure volume is up
        audio.volume = 1.0;
        await audio.play();
      } catch (err) {
        console.error('[VoicePlayer] Playback error:', err);
        setHasError(true);
      }
    }
  };

  const toggleMute = () => {
    const audio = audioRef.current;
    if (!audio) return;
    audio.muted = !audio.muted;
    setIsMuted(audio.muted);
  };

  const cycleSpeed = () => {
    const audio = audioRef.current;
    if (!audio) return;
    const speeds = [1, 1.5, 2];
    const nextIdx = (speeds.indexOf(playbackRate) + 1) % speeds.length;
    const nextSpeed = speeds[nextIdx];
    audio.playbackRate = nextSpeed;
    setPlaybackRate(nextSpeed);
  };

  const handleSeek = (e: React.MouseEvent<HTMLDivElement>) => {
    const audio = audioRef.current;
    const bar = progressBarRef.current;
    if (!audio || !bar || !duration) return;

    const rect = bar.getBoundingClientRect();
    const clickX = e.clientX - rect.left;
    const ratio = Math.max(0, Math.min(1, clickX / rect.width));
    const newTime = ratio * duration;

    audio.currentTime = newTime;
    setCurrentTime(newTime);
  };

  const progressPercent = duration > 0 ? Math.min(100, (currentTime / duration) * 100) : 0;

  // Render stylized waveform bars (visualizer simulation)
  const barHeights = [40, 75, 30, 90, 60, 45, 80, 50, 95, 70, 35, 85, 60, 40, 75, 90, 55, 30, 65, 80];

  return (
    <div className={`tg-voice-player ${isOutgoing ? 'outgoing' : 'incoming'} ${hasError ? 'has-error' : ''}`}>
      <audio
        ref={audioRef}
        src={src}
        preload="metadata"
        crossOrigin="anonymous"
      />

      {/* Main Player Row */}
      <div className="tg-voice-player-main">
        {/* Play / Pause Circular Button */}
        <button
          type="button"
          className="tg-voice-play-btn"
          onClick={togglePlayPause}
          title={isPlaying ? 'Pause' : 'Play voice message'}
          aria-label={isPlaying ? 'Pause' : 'Play voice message'}
        >
          {isPlaying ? <Pause size={17} /> : <Play size={17} style={{ marginLeft: 2 }} />}
        </button>

        {/* Waveform / Scrubber Track */}
        <div className="tg-voice-track-container" ref={progressBarRef} onClick={handleSeek}>
          <div className="tg-voice-waveform">
            {barHeights.map((h, i) => {
              const barPos = (i / barHeights.length) * 100;
              const isPassed = barPos <= progressPercent;
              return (
                <span
                  key={i}
                  className={`tg-voice-wave-bar ${isPassed ? 'passed' : ''} ${isPlaying ? 'playing' : ''}`}
                  style={{ height: `${h}%` }}
                />
              );
            })}
          </div>
          {/* Subtle progress fill */}
          <div className="tg-voice-progress-fill" style={{ width: `${progressPercent}%` }} />
        </div>

        {/* Speed button (1x / 1.5x / 2x) */}
        <button
          type="button"
          className={`tg-voice-speed-btn ${playbackRate > 1 ? 'active' : ''}`}
          onClick={cycleSpeed}
          title="Playback speed"
        >
          {playbackRate}x
        </button>

        {/* Volume / Mute toggle */}
        <button
          type="button"
          className="tg-voice-icon-btn"
          onClick={toggleMute}
          title={isMuted ? 'Unmute' : 'Mute'}
        >
          {isMuted ? <VolumeX size={15} /> : <Volume2 size={15} />}
        </button>

        {/* Download file button */}
        <a
          href={src}
          download={fileName}
          className="tg-voice-icon-btn"
          title={`Download ${fileName}`}
        >
          <Download size={15} />
        </a>
      </div>

      {/* Time & Info Bar */}
      <div className="tg-voice-meta-row">
        <span className="tg-voice-time">
          {isPlaying ? `${formatTime(currentTime)} / ${formatTime(duration)}` : formatTime(duration || currentTime)}
        </span>
        <span className="tg-voice-subinfo">
          {fileName.startsWith('voice_') ? 'Voice message' : fileName}
          {fileSize ? ` • ${formatSize(fileSize)}` : ''}
        </span>
      </div>

      {hasError && (
        <div className="tg-voice-error-hint">
          <AlertCircle size={13} style={{ marginRight: 4 }} />
          <span>Playback issue. Tap download to play directly.</span>
        </div>
      )}
    </div>
  );
};
