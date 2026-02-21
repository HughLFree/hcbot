/**
 * ======================
 * Module: replyStrategy
 * Layer: Frontend Hook Helper
 * Responsibility:
 * - 统一封装“是否触发回复”的策略判断
 * - 把 mention/all 模式决策从协议处理层解耦
 * ======================
 */
import type { ReplyMode } from '../../types';

interface ReplyDecisionInput {
  replyMode: ReplyMode;
  botName: string;
  text: string;
  random?: () => number;
}

export function isBotMentioned(text: string, botName: string): boolean {
  const lowerText = text.toLowerCase();
  const lowerBotName = botName.toLowerCase();
  return lowerText.includes(lowerBotName);
}

/**
 * 根据当前回复模式判断是否要触发回复。
 * - mention: 仅被点名时回复
 * - all: 被点名或按概率随机回复
 */
export function shouldReplyToMessage({
  replyMode,
  botName,
  text,
  random = Math.random,
}: ReplyDecisionInput): boolean {
  const mentioned = isBotMentioned(text, botName);
  if (replyMode === 'mention') return mentioned;
  return mentioned || random() < 0.1;
}
