import type {
  BotBootstrap as SharedBotBootstrap,
  BotDefaults as SharedBotDefaults,
  BootstrapResponse as SharedBootstrapResponse,
  ModelProvider as SharedModelProvider,
  ModelProviderOption as SharedModelProviderOption,
  ReplyMode as SharedReplyMode,
} from '../../shared/contracts';

export type ModelProvider = SharedModelProvider;
export type ReplyMode = SharedReplyMode;

export interface BotConfig {
  channel: string;
  botName: string;
  password?: string; // Optional password for tripcode
  personality: string;
  replyMode: ReplyMode;
  provider: ModelProvider;
}

export type ModelProviderOption = SharedModelProviderOption;
export type BotDefaults = SharedBotDefaults;
export type BotBootstrap = SharedBotBootstrap;
export type ServerBootstrapResponse = SharedBootstrapResponse;

export type ConnectionStatus = 'disconnected' | 'connecting' | 'connected' | 'error';
