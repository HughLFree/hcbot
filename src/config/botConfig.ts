import { BotBootstrap, BotConfig, ModelProvider, ModelProviderOption } from '../types';

/**
 * 前端兜底配置（仅在后端 bootstrap 请求失败时使用）。
 * 正常情况下，实际 defaults/providers 以后端 `/api/config/bootstrap` 为准。
 */
export const FALLBACK_BOOTSTRAP: BotBootstrap = {
  defaults: {
    channel: 'bot',
    botName: 'Bot',
    provider: 'deepseek',
    personality: '',
    replyMode: 'mention',
  },
  providers: [
    {
      id: 'deepseek',
      label: 'DeepSeek',
      subtitle: 'V3 Chat',
      enabled: true,
    },
  ],
};

export const toBotConfig = (defaults: BotBootstrap['defaults']): BotConfig => ({
  ...defaults,
});

export const getProviderOption = (
  providers: ModelProviderOption[],
  providerId: ModelProvider
) => providers.find((item) => item.id === providerId);

export const isProviderEnabled = (
  providers: ModelProviderOption[],
  providerId: ModelProvider
) => Boolean(getProviderOption(providers, providerId)?.enabled);
