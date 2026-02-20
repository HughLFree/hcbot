/**
 * 模块职责：
 * 封装 DeepSeek 回复生成逻辑（prompt 组装 + 模型调用）。
 * 路由层只做入参校验与错误映射，不关心模型细节。
 */
import { OpenAI } from 'openai';
import { SERVER_CONFIG } from '../config.mjs';

const DEEPSEEK_API_URL = 'https://api.deepseek.com';

const deepseekClient = process.env.DEEPSEEK_API_KEY
  ? new OpenAI({
      baseURL: DEEPSEEK_API_URL,
      apiKey: process.env.DEEPSEEK_API_KEY,
    })
  : null;

function buildContext(history) {
  return (history || [])
    .slice(-15)
    .filter((msg) => msg?.type === 'message')
    .map((msg) => `${msg.nick}: ${msg.text}`)
    .join('\n');
}

/**
 * 检查回复服务是否可用（是否已配置模型 key）。
 * @returns true 表示可调用模型；false 表示应返回配置错误
 */
export function isReplyServiceReady() {
  return Boolean(deepseekClient);
}

/**
 * 生成 DeepSeek 回复文本。
 * @param params.history 最近消息数组（会在内部裁剪上下文）
 * @param params.personality 人格系统提示词
 * @param params.targetMessage 当前触发消息
 * @param params.targetSender 当前触发者昵称
 * @param params.profileContext 画像注入文本（可选）
 * @returns 模型最终回复文本
 * @throws 当服务未配置 key 或调用异常时抛错，由路由层处理
 */
export async function generateDeepSeekReply({
  history,
  personality,
  targetMessage,
  targetSender,
  profileContext,
}) {
  if (!deepseekClient) {
    throw new Error('DEEPSEEK_API_KEY is missing on API server');
  }

  const context = buildContext(history);
  const prompt = `
Here is the recent chat history from a public chatroom. Pay close attention to the nicknames to distinguish who is speaking.
---
${context}
---

Current situation: ${targetMessage && targetSender ? `The user "${targetSender}" just said: "${targetMessage}"` : 'Respond to the conversation.'}
${profileContext ? `\nKnown user profile fields (only non-empty values):\n${profileContext}\n` : ''}

Your instructions:
1. Respond strictly as the character defined in the system instructions.
2. Keep your response concise (under 120 words).
3. Do not prefix your name in the response (e.g., don't say "Bot: Hello"). Just say "Hello".
4. Distinguish between different users based on their nicknames. If addressing a specific user helps clarity, you may use their nickname, but do so naturally.
`;

  const systemPrompt = `${personality || ''}
只在自然合适的情况下使用用户资料。
不要刻意重复或过度引用。`;

  const response = await deepseekClient.chat.completions.create({
    model: SERVER_CONFIG.profile.model,
    messages: [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: prompt },
    ],
    max_tokens: 1500,
    temperature: 1.4,
  });

  return response.choices[0]?.message?.content || '';
}
