/**
 * ===================
 * Module: replyClient
 * Layer: Frontend API
 * Responsibility:
 * - 封装前端到后端的回复请求
 * - 前端不直接持有模型 key
 * ===================
 */
import type { DeepSeekReplyRequest, DeepSeekReplyResponse } from '../../shared/contracts';
import { ChatMessage } from "../types";

/**
 * [Function]
 * Name: generateDeepSeekReply
 * Purpose: 请求后端 DeepSeek 路由并返回回复文本。
 * Input: history/personality/targetMessage/targetSender/profileContext
 * Output: string（失败时返回空字符串）
 */
export const generateDeepSeekReply = async (
  history: ChatMessage[],
  personality: string,
  targetMessage?: string,
  targetSender?: string,
  profileContext?: string
): Promise<string> => {
  try {
    const payload: DeepSeekReplyRequest = {
      history,
      personality,
      targetMessage,
      targetSender,
      profileContext,
    };

    const response = await fetch('/api/reply/deepseek', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload),
    });
    if (!response.ok) return '';

    const data = (await response.json()) as DeepSeekReplyResponse;
    return data.ok && typeof data.text === 'string' ? data.text : '';
  } catch (error) {
    console.error('DeepSeek API Error:', error);
    return "";
  }
};
