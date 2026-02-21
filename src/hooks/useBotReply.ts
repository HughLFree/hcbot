/**
 * ===================
 * Module: useBotReply
 * Layer: Frontend Hook
 * Responsibility:
 * - 编排回复生成流程（不直接发送）
 * - 校验 provider 可用性
 * - 注入用户画像上下文
 * ===================
 */
import { useCallback } from 'react';
import { BotConfig, ChatMessage, ModelProviderOption } from '../types';
import { isProviderEnabled } from '../config/botConfig';
import { generateDeepSeekReply } from '../api/replyClient';

interface UseBotReplyOptions {
  getConfig: () => BotConfig;
  getProviders: () => ModelProviderOption[];
}

interface ReplyInput {
  history: ChatMessage[];
  triggerMessage: string;
  sender: string;
  senderTrip?: string;
}

/**
 * [Function]
 * Name: useBotReply
 * Purpose: 暴露统一回复生成函数，屏蔽 provider 细节。
 * Input:
 * - getConfig: 获取最新配置
 * - getProviders: 获取当前 provider 列表
 * Output:
 * - { generateReply }
 */
export const useBotReply = ({ getConfig, getProviders }: UseBotReplyOptions) => {
  /**
   * [Function]
   * Name: generateReply
   * Purpose: 仅生成回复文本，不处理发送动作。
   */
  const generateReply = useCallback(async ({
    history,
    triggerMessage,
    sender,
    senderTrip,
  }: ReplyInput): Promise<string> => {
    const currentConfig = getConfig();
    const providers = getProviders();

    if (!isProviderEnabled(providers, currentConfig.provider)) {
      console.error(`Provider "${currentConfig.provider}" is disabled by backend bootstrap config`);
      return '';
    }

    if (currentConfig.provider === 'deepseek') {
      return generateDeepSeekReply(
        history,
        currentConfig.personality,
        triggerMessage,
        sender,
        senderTrip,
        currentConfig.channel
      );
    }

    console.error(`Provider "${currentConfig.provider}" is not implemented yet.`);
    return '';
  }, [getConfig, getProviders]);

  return { generateReply };
};
