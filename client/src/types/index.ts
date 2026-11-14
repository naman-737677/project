export enum WsIncomingEvent {
  SEND_MESSAGE = 'SEND_MESSAGE',
  TYPING_STATUS = 'TYPING_STATUS',
  READ_RECEIPT = 'READ_RECEIPT',
  HEARTBEAT = 'HEARTBEAT',
  SYNC_REQUEST = 'SYNC_REQUEST',
  CALL_SIGNAL = 'CALL_SIGNAL',
}

export enum WsOutgoingEvent {
  MESSAGE_ACK = 'MESSAGE_ACK',
  NEW_MESSAGE = 'NEW_MESSAGE',
  USER_TYPING = 'USER_TYPING',
  PARTICIPANT_READ = 'PARTICIPANT_READ',
  HEARTBEAT_ACK = 'HEARTBEAT_ACK',
  USER_PRESENCE = 'USER_PRESENCE',
  SYNC_RESPONSE = 'SYNC_RESPONSE',
  CALL_SIGNAL = 'CALL_SIGNAL',
  ERROR = 'ERROR',
}

export interface WsEnvelope<T = any> {
  event: string;
  trace_id: string;
  timestamp: number;
  data: T;
}

export interface User {
  id: string;
  username: string;
  displayName?: string;
  avatarUrl?: string;
  status?: 'ONLINE' | 'OFFLINE' | 'AWAY';
  lastSeen?: number;
}

export interface Chat {
  id: string;
  title: string;
  type: 'DIRECT' | 'GROUP' | 'CHANNEL' | 'SECRET';
  avatarUrl?: string;
  lastMessage?: string;
  lastMessageTime?: number;
  unreadCount?: number;
  currentSeqId?: string;
  participants?: User[];
}

export interface MessageAttachment {
  id: string;
  file_url: string;
  thumbnail_url?: string | null;
  file_name: string;
  file_size: string | number;
  mime_type: string;
}

export interface Message {
  id: string;
  clientMsgId?: string;
  chatId: string;
  senderId: string | null;
  senderName?: string;
  seqId: string;
  type: 'TEXT' | 'IMAGE' | 'VIDEO' | 'AUDIO' | 'FILE' | 'LOCATION' | 'SYSTEM';
  content: string;
  replyToId?: string | null;
  attachments?: MessageAttachment[];
  timestamp: number;
  status: 'PENDING' | 'PERSISTED' | 'FAILED' | 'READ';
  isOutgoing: boolean;
}

export interface MessageAckData {
  client_msg_id: string;
  message_id: string;
  chat_id: string;
  seq_id: string;
  server_timestamp: number;
  status: 'PERSISTED' | 'QUEUED' | 'FAILED';
  error?: string;
}

export interface NewMessageData {
  message_id: string;
  client_msg_id?: string | null;
  chat_id: string;
  sender_id: string | null;
  seq_id: string;
  type: string;
  content: string | null;
  reply_to_id: string | null;
  attachments: Array<{
    id: string;
    file_url: string;
    thumbnail_url: string | null;
    file_name: string;
    file_size: string;
    mime_type: string;
  }>;
  created_at: string;
}

export interface UserTypingData {
  chat_id: string;
  user_id: string;
  action: string;
}

export interface UserPresenceData {
  user_id: string;
  status: 'ONLINE' | 'OFFLINE' | 'AWAY';
  last_seen_at: number;
}

export interface ParticipantReadData {
  chat_id: string;
  user_id: string;
  max_seq_id: string;
  read_at: number;
}

export interface SyncResponseData {
  chat_id: string;
  messages: NewMessageData[];
  has_more: boolean;
}

export interface Friend {
  id: string;
  username: string;
  displayName: string;
  status: 'ONLINE' | 'OFFLINE';
  lastSeenAt?: number;
  directChatId: string;
}

export interface DirectConversation {
  chatId: string;
  friend: Friend;
  lastMessage?: string;
  lastMessageTime?: number;
  unreadCount: number;
}

export type CallType = 'AUDIO' | 'VIDEO';
export type CallState = 'IDLE' | 'CALLING' | 'RINGING' | 'CONNECTING' | 'CONNECTED' | 'ENDED';

export interface CallSignalData {
  target_user_id: string;
  signal_type: 'OFFER' | 'ANSWER' | 'ICE_CANDIDATE' | 'RINGING' | 'REJECT' | 'END' | 'BUSY' | 'TIMEOUT';
  call_id: string;
  call_type: CallType;
  sdp?: any;
  candidate?: any;
  caller_info?: {
    user_id: string;
    username: string;
    display_name: string;
  };
  chat_id?: string;
  reason?: string;
}

export interface CallUser {
  id: string;
  username: string;
  displayName: string;
  avatarUrl?: string;
}



