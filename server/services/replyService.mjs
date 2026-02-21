/**
 * 模块职责：
 * 封装 DeepSeek 回复生成逻辑（prompt 组装 + 模型调用）。
 * 路由层只做入参校验与错误映射，不关心模型细节。
 */
import { SERVER_CONFIG } from '../config.mjs';
import { buildSinglePassPrompt, buildTwoPassMemoryPrompt, buildTwoPassReplyPrompt } from '../prompts/replyPrompts.mjs';
import { getReplyClient, isReplyClientReady } from './reply/client.mjs';
import {
  normalizeMemoryItems,
  normalizeModelOutput,
  normalizeString,
  parseModelJson,
} from './reply/responseNormalizer.mjs';

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
  return isReplyClientReady();
}

/**
 * 生成 DeepSeek 回复 JSON（reply + memory）。
 * @param params.history 最近消息数组（会在内部裁剪上下文）
 * @param params.personality 人格系统提示词
 * @param params.targetMessage 当前触发消息
 * @param params.targetSender 当前触发者昵称
 * @param params.profileContext 画像注入文本（可选）
 * @param params.memoryContext 记忆注入 JSON（可选）
 * @returns 模型输出结构化 JSON
 * @throws 当服务未配置 key 或调用异常时抛错，由路由层处理
 */
export async function generateDeepSeekReply({
  history,
  personality,
  targetMessage,
  targetSender,
  profileContext,
  memoryContext,
}) {
  const deepseekClient = getReplyClient();

  const context = buildContext(history);
  const memoryContextJson = JSON.stringify(Array.isArray(memoryContext) ? memoryContext : [], null, 2);
  const prompt = buildSinglePassPrompt({
    context,
    targetMessage,
    targetSender,
    profileContext,
    memoryContextJson,
  });


  const response = await deepseekClient.chat.completions.create({
    model: SERVER_CONFIG.profile.model,
    messages: [
      { role: 'system', content: personality },
      { role: 'user', content: prompt },
    ],
    response_format: { type: 'json_object' },
    max_tokens: 1900,
    temperature: 1.4,
  });

  const text = response.choices[0]?.message?.content || '{}';
  const parsed = parseModelJson(text);
  if (!parsed) {
    return {
      reply: '',
      memory: {
        items: [],
      },
    };
  }

  return normalizeModelOutput(parsed);
}

/**
 * 两阶段调用：
 * 1) 生成 reply
 * 2) 独立提取 memory + importance
 * 输出结构与 generateDeepSeekReply 保持一致。
 */
export async function generateDeepSeekReplyTwoPass({
  history,
  personality,
  targetMessage,
  targetSender,
  profileContext,
  memoryContext,
}) {
  const deepseekClient = getReplyClient();

  const context = buildContext(history);
  const memoryContextJson = JSON.stringify(Array.isArray(memoryContext) ? memoryContext : [], null, 2);
  const replyPrompt = buildTwoPassReplyPrompt({
    context,
    targetMessage,
    targetSender,
    profileContext,
    memoryContextJson,
  });

  const replyResp = await deepseekClient.chat.completions.create({
    model: SERVER_CONFIG.profile.model,
    messages: [
      { role: 'system', content: personality },
      { role: 'user', content: replyPrompt },
    ],
    response_format: { type: 'json_object' },
    max_tokens: 1200,
    temperature: 1.4,
  });

  const replyText = replyResp.choices[0]?.message?.content || '{}';
  const parsedReply = parseModelJson(replyText);
  const reply = normalizeString(parsedReply?.reply);

  const memoryPrompt = buildTwoPassMemoryPrompt({
    context,
    targetMessage,
    targetSender,
    memoryContextJson,
  });

  const memoryResp = await deepseekClient.chat.completions.create({
    model: SERVER_CONFIG.profile.model,
    messages: [
      { role: 'system', content: personality },
      { role: 'user', content: memoryPrompt },
    ],
    response_format: { type: 'json_object' },
    max_tokens: 1200,
    temperature: 1.0,
  });

  const memoryText = memoryResp.choices[0]?.message?.content || '{}';
  const parsedMemory = parseModelJson(memoryText);
  const items = normalizeMemoryItems(parsedMemory || {});

  return {
    reply,
    memory: {
      items,
    },
  };
}
