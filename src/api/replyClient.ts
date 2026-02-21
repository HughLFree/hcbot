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

function isObjectLike(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

/**
 * [Function]
 * Name: generateDeepSeekReply
 * Purpose: 请求后端 DeepSeek 路由并返回回复文本。
 * Input: history/personality/targetMessage/targetSender/targetTrip/roomId
 * Output: string（失败时返回空字符串）
 */
export const generateDeepSeekReply = async (
  history: ChatMessage[],
  personality: string,
  targetMessage?: string,
  targetSender?: string,
  targetTrip?: string,
  roomId?: string
): Promise<string> => {
  try {
    const payload: DeepSeekReplyRequest = {
      history,
      personality,
      targetMessage,
      targetSender,
      targetTrip,
      room_id: roomId,
    };

    const response = await fetch('/api/reply/deepseek', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload),
    });
    if (!response.ok) return '';

    const data = (await response.json()) as DeepSeekReplyResponse | Record<string, unknown>;
    if (isObjectLike(data) && typeof data.reply === 'string') return data.reply;

    const legacyData = isObjectLike(data) ? data : null;
    if (legacyData?.ok === true && typeof legacyData?.text === 'string') return legacyData.text;
    return '';
  } catch (error) {
    console.error('DeepSeek API Error:', error);
    return "";
  }
};
