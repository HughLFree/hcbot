/**
 * 前后端共享契约层（Single Source of Truth）。
 * 这里只放“接口边界类型”，不要放业务实现。
 */

export interface ChatMessage {
  time: number;
  nick: string;
  text: string;
  type: 'message' | 'info' | 'warning';
  trip?: string;
}

export interface UserProfile {
  common_name: string | null;
  language: string | null;
  location: string | null;
  identity: string | null;
  likes: string[];
  dislikes: string[];
  updated_at?: number;
  display_name?: string;
}

export interface UserMemoryDigestThread {
  topic: string;
  status: string;
  note: string;
}

export interface UserMemoryDigest {
  highlights: string[];
  ongoing_threads: UserMemoryDigestThread[];
  stable_preferences: string[];
  updated_at?: number;
}

export interface ProfileUpdateResult {
  ok: boolean;
  updated: boolean;
  skipped?: boolean;
  reason?: string;
  max_chars?: number;
  profile_json?: UserProfile;
  error?: string;
}

export type ModelProvider = string;
export type ReplyMode = 'mention' | 'all';

export interface ModelProviderOption {
  id: ModelProvider;
  label: string;
  subtitle?: string;
  enabled: boolean;
}

export interface BotDefaults {
  channel: string;
  botName: string;
  provider: ModelProvider;
  personality: string;
  replyMode: ReplyMode;
}

export interface BotBootstrap {
  defaults: BotDefaults;
  providers: ModelProviderOption[];
}

export interface BootstrapResponse {
  ok: boolean;
  bootstrap?: BotBootstrap;
}

export interface DeepSeekReplyRequest {
  history: ChatMessage[];
  personality: string;
  targetMessage?: string;
  targetSender?: string;
  targetTrip?: string;
  room_id?: string;
  memory_prompt_min_importance?: number;
  memory_prompt_limit?: number;
  memory_store_min_importance?: number;
  memory_store_enabled?: boolean;
  reply_pipeline_mode?: 'single' | 'two_pass';
}

export interface ReplyMemoryItem {
  text: string;
  importance: number;
  tags: string[];
}

export interface ReplyMemoryPayload {
  items: ReplyMemoryItem[];
}

export interface DeepSeekReplySuccess {
  reply: string;
  memory: ReplyMemoryPayload;
}

export interface ApiErrorResponse {
  ok: false;
  error: string;
}

export type DeepSeekReplyResponse = DeepSeekReplySuccess | ApiErrorResponse;

export interface IngestMessageRequest {
  room_id: string;
  trip_code?: string;
  display_name?: string;
  seen_at?: number;
}

export interface IngestMessageResponse {
  ok: boolean;
  skipped?: boolean;
  reason?: string;
}

export interface ProfileFromMessageRequest {
  room_id: string;
  trip_code?: string;
  display_name: string;
  message_text: string;
}

export interface ProfileByTripResponse {
  ok: boolean;
  profile_json: UserProfile;
  memory_digest_json?: UserMemoryDigest;
}
