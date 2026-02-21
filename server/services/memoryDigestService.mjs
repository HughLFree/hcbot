/**
 * 模块职责：
 * 把用户原始 memories 汇总为“记忆梗概”结构。
 */
import { SERVER_CONFIG } from '../config.mjs';
import { getDeepSeekClient, isDeepSeekClientReady } from './llm/client.mjs';

function normalizeStringArray(value, maxLength = 12) {
  if (!Array.isArray(value)) return [];
  const seen = new Set();
  const items = [];
  for (const item of value) {
    if (typeof item !== 'string') continue;
    const trimmed = item.trim();
    if (!trimmed) continue;
    const key = trimmed.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    items.push(trimmed);
    if (items.length >= maxLength) break;
  }
  return items;
}

function normalizeOngoingThreads(value, maxLength = 10) {
  if (!Array.isArray(value)) return [];
  const items = [];
  for (const item of value) {
    if (!item || typeof item !== 'object' || Array.isArray(item)) continue;
    const topic = typeof item.topic === 'string' ? item.topic.trim() : '';
    const status = typeof item.status === 'string' ? item.status.trim() : '';
    const note = typeof item.note === 'string' ? item.note.trim() : '';
    if (!topic && !note) continue;
    items.push({ topic, status, note });
    if (items.length >= maxLength) break;
  }
  return items;
}

function normalizeDigest(rawDigest, updatedAt) {
  const safe = rawDigest && typeof rawDigest === 'object' && !Array.isArray(rawDigest)
    ? rawDigest
    : {};

  return {
    highlights: normalizeStringArray(safe.highlights, 12),
    ongoing_threads: normalizeOngoingThreads(safe.ongoing_threads, 10),
    stable_preferences: normalizeStringArray(safe.stable_preferences, 12),
    updated_at: updatedAt,
  };
}

function parseJsonResponse(text) {
  try {
    return JSON.parse(text);
  } catch {
    const start = text.indexOf('{');
    const end = text.lastIndexOf('}');
    if (start === -1 || end <= start) return null;
    try {
      return JSON.parse(text.slice(start, end + 1));
    } catch {
      return null;
    }
  }
}

/**
 * 当前是否可用（是否已配置 DeepSeek key）。
 */
export function isMemoryDigestServiceReady() {
  return isDeepSeekClientReady();
}

/**
 * 使用模型把单个用户记忆列表压缩为梗概 JSON。
 */
export async function summarizeUserMemoryDigest({ tripCode, memories, now }) {
  const deepseekClient = getDeepSeekClient();

  const safeMemories = Array.isArray(memories) ? memories : [];
  if (!safeMemories.length) {
    return normalizeDigest({}, now);
  }

  const memoryPayload = safeMemories.map((item) => ({
    text: item.text,
    importance: item.importance,
    tags: item.tags || [],
    created_at: item.created_at,
    last_used_at: item.last_used_at,
  }));

  const systemPrompt = [
    '你是一个严格的JSON生成器和记忆摘要器。',
    '只输出 JSON，不要输出解释。',
    '不要臆造用户未提到的信息。',
  ].join('\n');

  const userPrompt = `
请将该用户历史记忆压缩为“可长期复用”的梗概。

用户标识：
${tripCode}

原始记忆：
${JSON.stringify(memoryPayload, null, 2)}

输出 JSON 格式：
{
  "highlights": [
    "一句话高价值事实"
  ],
  "ongoing_threads": [
    { "topic": "主题", "status": "状态", "note": "备注" }
  ],
  "stable_preferences": [
    "长期偏好或禁忌"
  ]
}

要求：
1. highlights 只保留高价值事实，避免重复。
2. ongoing_threads 只放仍在进行的事项。
3. stable_preferences 只放稳定偏好/雷区。
4. 各字段可为空数组。
`;

  const response = await deepseekClient.chat.completions.create({
    model: SERVER_CONFIG.profile.model,
    messages: [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: userPrompt },
    ],
    response_format: { type: 'json_object' },
    max_tokens: 1200,
    temperature: 0.7,
  });

  const text = response.choices[0]?.message?.content || '{}';
  const parsed = parseJsonResponse(text);
  return normalizeDigest(parsed || {}, now);
}
