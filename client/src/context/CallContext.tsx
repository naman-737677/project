import React, { createContext, useContext, useState, useEffect, useRef, useCallback } from 'react';
import { useAuth } from './AuthContext';
import { useChat } from './ChatContext';
import {
  CallState,
  CallType,
  CallUser,
  CallSignalData,
  WsIncomingEvent,
  WsOutgoingEvent,
  WsEnvelope,
} from '../types';
import { wsClient } from '../services/websocket';
import { callAudio } from '../utils/callAudio';

interface CallContextType {
  callState: CallState;
  callDirection: 'OUTGOING' | 'INCOMING' | null;
  callType: CallType;
  activeCallUser: CallUser | null;
  callDuration: number;
  formattedDuration: string;
  isMuted: boolean;
  isVideoEnabled: boolean;
  isSpeakerMuted: boolean;
  localStream: MediaStream | null;
  remoteStream: MediaStream | null;
  callError: string | null;
  isCallActive: boolean;
  isIncomingCall: boolean;

  // Actions
  startCall: (targetUser: CallUser, type?: CallType) => Promise<void>;
  acceptCall: () => Promise<void>;
  rejectCall: (reason?: string) => void;
  endCall: () => void;
  toggleMute: () => void;
  toggleVideo: () => void;
  toggleSpeaker: () => void;
}

const CallContext = createContext<CallContextType | undefined>(undefined);

// Public Google STUN servers for WebRTC peer-to-peer audio/video connection
const RTC_CONFIG: RTCConfiguration = {
  iceServers: [
    { urls: 'stun:stun.l.google.com:19302' },
    { urls: 'stun:stun1.l.google.com:19302' },
    { urls: 'stun:stun2.l.google.com:19302' },
  ],
};

export const CallProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { currentUser } = useAuth();
  const { sendMessage, activeChatId } = useChat();

  const [callState, setCallState] = useState<CallState>('IDLE');
  const [callDirection, setCallDirection] = useState<'OUTGOING' | 'INCOMING' | null>(null);
  const [callType, setCallType] = useState<CallType>('AUDIO');
  const [activeCallUser, setActiveCallUser] = useState<CallUser | null>(null);
  const [callId, setCallId] = useState<string | null>(null);
  const [callDuration, setCallDuration] = useState<number>(0);
  const [isMuted, setIsMuted] = useState<boolean>(false);
  const [isVideoEnabled, setIsVideoEnabled] = useState<boolean>(false);
  const [isSpeakerMuted, setIsSpeakerMuted] = useState<boolean>(false);
  const [localStream, setLocalStream] = useState<MediaStream | null>(null);
  const [remoteStream, setRemoteStream] = useState<MediaStream | null>(null);
  const [callError, setCallError] = useState<string | null>(null);

  const peerConnectionRef = useRef<RTCPeerConnection | null>(null);
  const localStreamRef = useRef<MediaStream | null>(null);
  const remoteAudioRef = useRef<HTMLAudioElement | null>(null);
  const durationIntervalRef = useRef<any>(null);
  const pendingCandidatesRef = useRef<RTCIceCandidateInit[]>([]);
  const incomingOfferRef = useRef<CallSignalData | null>(null);
  const callDurationRef = useRef<number>(0);
  const activeCallChatIdRef = useRef<string | null>(null);

  // Keep ref up to date
  useEffect(() => {
    callDurationRef.current = callDuration;
  }, [callDuration]);

  // Audio element for remote voice playback
  useEffect(() => {
    const audio = new Audio();
    audio.autoplay = true;
    (audio as any).playsInline = true;
    remoteAudioRef.current = audio;

    return () => {
      audio.pause();
      audio.srcObject = null;
    };
  }, []);

  // Format call duration helper mm:ss
  const formatDuration = (totalSeconds: number): string => {
    const mins = Math.floor(totalSeconds / 60);
    const secs = totalSeconds % 60;
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  };

  // Helper: Acquire local media stream with silent fallback if hardware mic is unavailable
  const acquireLocalMedia = async (type: CallType): Promise<MediaStream> => {
    try {
      if (navigator.mediaDevices && navigator.mediaDevices.getUserMedia) {
        const stream = await navigator.mediaDevices.getUserMedia({
          audio: {
            echoCancellation: true,
            noiseSuppression: true,
            autoGainControl: true,
          },
          video: type === 'VIDEO' ? { width: { ideal: 640 }, height: { ideal: 480 } } : false,
        });
        return stream;
      }
    } catch (err) {
      console.warn('[CallMedia] Hardware media access not granted or unavailable, generating fallback audio stream:', err);
    }

    // Silent fallback audio track using Web Audio API
    const AudioCtx = window.AudioContext || (window as any).webkitAudioContext;
    const ctx = new AudioCtx();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    gain.gain.value = 0; // Silent
    osc.connect(gain);
    const dest = ctx.createMediaStreamDestination();
    gain.connect(dest);
    osc.start();

    // If video requested, generate a canvas stream
    if (type === 'VIDEO') {
      const canvas = document.createElement('canvas');
      canvas.width = 320;
      canvas.height = 240;
      const cCtx = canvas.getContext('2d');
      if (cCtx) {
        cCtx.fillStyle = '#1e293b';
        cCtx.fillRect(0, 0, 320, 240);
      }
      const canvasStream = canvas.captureStream ? canvas.captureStream(10) : null;
      if (canvasStream && canvasStream.getVideoTracks().length > 0) {
        dest.stream.addTrack(canvasStream.getVideoTracks()[0]);
      }
    }

    return dest.stream;
  };

  // Clean up all streams, connections and intervals
  const cleanupCall = useCallback((logChatEvent: boolean = true) => {
    callAudio.stopAll();

    if (durationIntervalRef.current) {
      clearInterval(durationIntervalRef.current);
      durationIntervalRef.current = null;
    }

    // Stop all local tracks
    if (localStreamRef.current) {
      localStreamRef.current.getTracks().forEach((track) => {
        try {
          track.stop();
        } catch {}
      });
      localStreamRef.current = null;
    }
    setLocalStream(null);

    // Stop remote audio element
    if (remoteAudioRef.current) {
      remoteAudioRef.current.pause();
      remoteAudioRef.current.srcObject = null;
    }
    setRemoteStream(null);

    // Close WebRTC peer connection
    if (peerConnectionRef.current) {
      try {
        peerConnectionRef.current.close();
      } catch {}
      peerConnectionRef.current = null;
    }

    pendingCandidatesRef.current = [];
    incomingOfferRef.current = null;

    // Optionally post a call log message into chat
    if (logChatEvent && callDurationRef.current > 0 && activeCallChatIdRef.current) {
      const durationStr = formatDuration(callDurationRef.current);
      try {
        sendMessage(`📞 Call ended (${durationStr})`, 'TEXT');
      } catch {}
    }

    setCallDuration(0);
    setIsMuted(false);
    setIsVideoEnabled(false);
  }, [sendMessage]);

  // Handle incoming call signals from WebSocket
  useEffect(() => {
    const unsub = wsClient.on(WsOutgoingEvent.CALL_SIGNAL, async (envelope: WsEnvelope<CallSignalData>) => {
      const signal = envelope.data;
      if (!signal) return;

      console.log('[CallContext] Received call signal:', signal.signal_type, signal);

      switch (signal.signal_type) {
        case 'OFFER': {
          // If already in a call, reply with BUSY
          if (callState !== 'IDLE') {
            wsClient.send(WsIncomingEvent.CALL_SIGNAL, {
              target_user_id: signal.caller_info?.user_id || '',
              signal_type: 'BUSY',
              call_id: signal.call_id,
              call_type: signal.call_type,
              reason: 'User is on another call',
            });
            return;
          }

          // Incoming Call Received
          incomingOfferRef.current = signal;
          setCallId(signal.call_id);
          setCallType(signal.call_type || 'AUDIO');
          setIsVideoEnabled(signal.call_type === 'VIDEO');
          setCallDirection('INCOMING');
          setCallState('RINGING');
          setCallError(null);

          if (signal.caller_info) {
            setActiveCallUser({
              id: signal.caller_info.user_id,
              username: signal.caller_info.username,
              displayName: signal.caller_info.display_name,
            });
          }

          if (signal.chat_id) {
            activeCallChatIdRef.current = signal.chat_id;
          }

          // Play incoming call ringtone
          callAudio.playIncomingRing();
          break;
        }

        case 'ANSWER': {
          // Caller receives answer from callee
          if (peerConnectionRef.current && signal.sdp) {
            callAudio.stopAll();
            try {
              await peerConnectionRef.current.setRemoteDescription(new RTCSessionDescription(signal.sdp));

              // Process any queued ICE candidates
              while (pendingCandidatesRef.current.length > 0) {
                const cand = pendingCandidatesRef.current.shift();
                if (cand) {
                  await peerConnectionRef.current.addIceCandidate(new RTCIceCandidate(cand));
                }
              }

              setCallState('CONNECTING');
            } catch (err) {
              console.error('[CallContext] Error setting remote description (ANSWER):', err);
            }
          }
          break;
        }

        case 'ICE_CANDIDATE': {
          if (signal.candidate) {
            if (peerConnectionRef.current && peerConnectionRef.current.remoteDescription) {
              try {
                await peerConnectionRef.current.addIceCandidate(new RTCIceCandidate(signal.candidate));
              } catch (err) {
                console.warn('[CallContext] Error adding ICE candidate:', err);
              }
            } else {
              pendingCandidatesRef.current.push(signal.candidate);
            }
          }
          break;
        }

        case 'REJECT':
        case 'BUSY': {
          callAudio.playEndBeep();
          const reasonMsg = signal.reason || (signal.signal_type === 'BUSY' ? 'User is busy on another call' : 'Call declined');
          setCallError(reasonMsg);
          setCallState('ENDED');

          setTimeout(() => {
            cleanupCall(false);
            setCallState('IDLE');
            setCallDirection(null);
            setActiveCallUser(null);
            setCallError(null);
          }, 2500);
          break;
        }

        case 'END': {
          callAudio.playEndBeep();
          setCallError('Call ended');
          setCallState('ENDED');

          setTimeout(() => {
            cleanupCall(true);
            setCallState('IDLE');
            setCallDirection(null);
            setActiveCallUser(null);
            setCallError(null);
          }, 1500);
          break;
        }
      }
    });

    return () => {
      unsub();
    };
  }, [callState, cleanupCall]);

  // Initiate an Outgoing Call to a friend
  const startCall = async (targetUser: CallUser, type: CallType = 'AUDIO') => {
    if (!currentUser) return;
    cleanupCall(false);

    const newCallId = `call_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
    setCallId(newCallId);
    setCallType(type);
    setIsVideoEnabled(type === 'VIDEO');
    setCallDirection('OUTGOING');
    setActiveCallUser(targetUser);
    setCallState('CALLING');
    setCallError(null);
    activeCallChatIdRef.current = activeChatId;

    // Start outgoing ringback chime
    callAudio.playOutgoingRing();

    try {
      // 1. Acquire local microphone/camera
      const stream = await acquireLocalMedia(type);
      localStreamRef.current = stream;
      setLocalStream(stream);

      // 2. Initialize WebRTC PeerConnection
      const pc = new RTCPeerConnection(RTC_CONFIG);
      peerConnectionRef.current = pc;

      // Add local stream tracks to WebRTC peer connection
      stream.getTracks().forEach((track) => pc.addTrack(track, stream));

      // Handle remote media track reception
      pc.ontrack = (event) => {
        console.log('[CallContext] Received remote track:', event.track.kind);
        const [stream] = event.streams;
        if (stream) {
          setRemoteStream(stream);
          if (remoteAudioRef.current) {
            remoteAudioRef.current.srcObject = stream;
            remoteAudioRef.current.play().catch(() => {});
          }
        }
      };

      // Handle ICE candidates
      pc.onicecandidate = (event) => {
        if (event.candidate) {
          wsClient.send(WsIncomingEvent.CALL_SIGNAL, {
            target_user_id: targetUser.id,
            signal_type: 'ICE_CANDIDATE',
            call_id: newCallId,
            call_type: type,
            candidate: event.candidate.toJSON(),
          });
        }
      };

      // Handle peer connection state transitions
      pc.onconnectionstatechange = () => {
        console.log('[CallContext] Connection state changed:', pc.connectionState);
        if (pc.connectionState === 'connected') {
          callAudio.playConnectedChime();
          setCallState('CONNECTED');

          // Start duration timer
          if (!durationIntervalRef.current) {
            setCallDuration(0);
            durationIntervalRef.current = setInterval(() => {
              setCallDuration((prev) => prev + 1);
            }, 1000);
          }
        } else if (pc.connectionState === 'failed' || pc.connectionState === 'disconnected') {
          if (callState === 'CONNECTED') {
            setCallError('Connection lost');
            endCall();
          }
        }
      };

      // 3. Create and set local Offer SDP
      const offer = await pc.createOffer({
        offerToReceiveAudio: true,
        offerToReceiveVideo: type === 'VIDEO',
      });
      await pc.setLocalDescription(offer);

      // 4. Send Offer to target friend over WebSocket gateway
      wsClient.send(WsIncomingEvent.CALL_SIGNAL, {
        target_user_id: targetUser.id,
        signal_type: 'OFFER',
        call_id: newCallId,
        call_type: type,
        sdp: pc.localDescription?.toJSON(),
        chat_id: activeChatId || undefined,
        caller_info: {
          user_id: currentUser.userId,
          username: currentUser.username,
          display_name: currentUser.displayName,
        },
      });
    } catch (err: any) {
      console.error('[CallContext] Failed to start call:', err);
      callAudio.stopAll();
      setCallError(err?.message || 'Failed to initialize call');
      setCallState('ENDED');
      setTimeout(() => {
        cleanupCall(false);
        setCallState('IDLE');
        setActiveCallUser(null);
      }, 3000);
    }
  };

  // Accept an incoming call
  const acceptCall = async () => {
    const offerSignal = incomingOfferRef.current;
    if (!offerSignal || !offerSignal.sdp || !currentUser) return;

    callAudio.stopAll();
    setCallState('CONNECTING');

    try {
      const type = offerSignal.call_type || 'AUDIO';
      setCallType(type);
      setIsVideoEnabled(type === 'VIDEO');

      // 1. Acquire local media
      const stream = await acquireLocalMedia(type);
      localStreamRef.current = stream;
      setLocalStream(stream);

      // 2. Initialize PeerConnection
      const pc = new RTCPeerConnection(RTC_CONFIG);
      peerConnectionRef.current = pc;

      stream.getTracks().forEach((track) => pc.addTrack(track, stream));

      pc.ontrack = (event) => {
        console.log('[CallContext] Received remote stream track on accept:', event.track.kind);
        const [rStream] = event.streams;
        if (rStream) {
          setRemoteStream(rStream);
          if (remoteAudioRef.current) {
            remoteAudioRef.current.srcObject = rStream;
            remoteAudioRef.current.play().catch(() => {});
          }
        }
      };

      pc.onicecandidate = (event) => {
        if (event.candidate && offerSignal.caller_info) {
          wsClient.send(WsIncomingEvent.CALL_SIGNAL, {
            target_user_id: offerSignal.caller_info.user_id,
            signal_type: 'ICE_CANDIDATE',
            call_id: offerSignal.call_id,
            call_type: type,
            candidate: event.candidate.toJSON(),
          });
        }
      };

      pc.onconnectionstatechange = () => {
        console.log('[CallContext Callee] Connection state:', pc.connectionState);
        if (pc.connectionState === 'connected') {
          callAudio.playConnectedChime();
          setCallState('CONNECTED');

          if (!durationIntervalRef.current) {
            setCallDuration(0);
            durationIntervalRef.current = setInterval(() => {
              setCallDuration((prev) => prev + 1);
            }, 1000);
          }
        } else if (pc.connectionState === 'failed' || pc.connectionState === 'disconnected') {
          if (callState === 'CONNECTED') {
            setCallError('Connection lost');
            endCall();
          }
        }
      };

      // 3. Set Remote Description (Offer)
      await pc.setRemoteDescription(new RTCSessionDescription(offerSignal.sdp));

      // Flush queued candidates
      while (pendingCandidatesRef.current.length > 0) {
        const cand = pendingCandidatesRef.current.shift();
        if (cand) {
          await pc.addIceCandidate(new RTCIceCandidate(cand));
        }
      }

      // 4. Create and set Local Description (Answer)
      const answer = await pc.createAnswer();
      await pc.setLocalDescription(answer);

      // 5. Send Answer back to caller
      wsClient.send(WsIncomingEvent.CALL_SIGNAL, {
        target_user_id: offerSignal.caller_info!.user_id,
        signal_type: 'ANSWER',
        call_id: offerSignal.call_id,
        call_type: type,
        sdp: pc.localDescription?.toJSON(),
      });
    } catch (err: any) {
      console.error('[CallContext] Failed to accept call:', err);
      setCallError('Failed to accept call: ' + (err?.message || ''));
      rejectCall('Hardware or connection error');
    }
  };

  // Reject an incoming call
  const rejectCall = (reason: string = 'Call declined') => {
    callAudio.stopAll();
    const offerSignal = incomingOfferRef.current;
    if (offerSignal && offerSignal.caller_info) {
      wsClient.send(WsIncomingEvent.CALL_SIGNAL, {
        target_user_id: offerSignal.caller_info.user_id,
        signal_type: 'REJECT',
        call_id: offerSignal.call_id,
        call_type: offerSignal.call_type,
        reason,
      });
    }

    cleanupCall(false);
    setCallState('IDLE');
    setCallDirection(null);
    setActiveCallUser(null);
  };

  // End an active or calling call
  const endCall = () => {
    callAudio.playEndBeep();

    if (activeCallUser && callId) {
      wsClient.send(WsIncomingEvent.CALL_SIGNAL, {
        target_user_id: activeCallUser.id,
        signal_type: 'END',
        call_id: callId,
        call_type: callType,
      });
    }

    setCallState('ENDED');
    setTimeout(() => {
      cleanupCall(true);
      setCallState('IDLE');
      setCallDirection(null);
      setActiveCallUser(null);
      setCallError(null);
    }, 1200);
  };

  // Toggle microphone mute
  const toggleMute = () => {
    if (localStreamRef.current) {
      const audioTracks = localStreamRef.current.getAudioTracks();
      audioTracks.forEach((track) => {
        track.enabled = !track.enabled;
      });
      setIsMuted((prev) => !prev);
    }
  };

  // Toggle video camera on/off
  const toggleVideo = () => {
    if (localStreamRef.current) {
      const videoTracks = localStreamRef.current.getVideoTracks();
      videoTracks.forEach((track) => {
        track.enabled = !track.enabled;
      });
      setIsVideoEnabled((prev) => !prev);
    }
  };

  // Toggle speaker mute
  const toggleSpeaker = () => {
    if (remoteAudioRef.current) {
      remoteAudioRef.current.muted = !remoteAudioRef.current.muted;
      setIsSpeakerMuted(remoteAudioRef.current.muted);
    }
  };

  return (
    <CallContext.Provider
      value={{
        callState,
        callDirection,
        callType,
        activeCallUser,
        callDuration,
        formattedDuration: formatDuration(callDuration),
        isMuted,
        isVideoEnabled,
        isSpeakerMuted,
        localStream,
        remoteStream,
        callError,
        isCallActive: callState !== 'IDLE',
        isIncomingCall: callState === 'RINGING' && callDirection === 'INCOMING',
        startCall,
        acceptCall,
        rejectCall,
        endCall,
        toggleMute,
        toggleVideo,
        toggleSpeaker,
      }}
    >
      {children}
    </CallContext.Provider>
  );
};

export const useCall = () => {
  const context = useContext(CallContext);
  if (!context) {
    throw new Error('useCall must be used within a CallProvider');
  }
  return context;
};
