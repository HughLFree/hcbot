/**
 * 模块职责：
 * 处理用户画像抽取相关逻辑：
 * - setprofile 命令解析
 * - DeepSeek 结构化抽取
 * - 画像合并与字段清洗规则
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

function normalizeNullableString(value) {
  if (value === null || value === undefined) return null;
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function sourceIncludesPhrase(sourceText, phrase) {
  return sourceText.toLowerCase().includes(phrase.toLowerCase());
}

function isPronounNoise(text) {
  const lowered = text.toLowerCase();
  if (
    lowered === '你' || lowered === '我' || lowered === '他' || lowered === '她' ||
    lowered === '它' || lowered === 'you' || lowered === 'me' || lowered === 'him' ||
    lowered === 'her' || lowered === 'them'
  ) {
    return true;
  }
  if (/^你[@#].+/u.test(text)) return true;
  if (/^@[^\s]+$/u.test(text)) return true;
  return false;
}

function normalizeStringArray(value, options = {}) {
  const { sourceText = '', strictFromSource = false } = options;
  if (!Array.isArray(value)) return [];
  const seen = new Set();
  const result = [];

  for (const item of value) {
    if (typeof item !== 'string') continue;
    const trimmed = item.trim();
    if (!trimmed || isPronounNoise(trimmed)) continue;
    if (strictFromSource && sourceText && !sourceIncludesPhrase(sourceText, trimmed)) continue;
    const dedupeKey = trimmed.toLowerCase();
    if (!seen.has(dedupeKey)) {
      seen.add(dedupeKey);
      result.push(trimmed);
    }
  }
  return result;
}

function validateAndNormalizeExtractedProfile(raw, sourceText) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    throw new Error('profile JSON must be an object');
  }

  return {
    common_name: normalizeNullableString(raw.common_name),
    language: normalizeNullableString(raw.language),
    location: normalizeNullableString(raw.location),
    identity: normalizeNullableString(raw.identity),
    likes: normalizeStringArray(raw.likes, { sourceText, strictFromSource: true }),
    dislikes: normalizeStringArray(raw.dislikes, { sourceText, strictFromSource: true }),
  };
}

/**
 * 解析 setprofile 命令正文。
 * @param messageText 原始聊天消息
 * @returns matched=false 表示不是命令；matched=true 时返回去前缀后的 content
 */
export function parseSetProfileInput(messageText) {
  const command = SERVER_CONFIG.profile.command;
  const regex = new RegExp(`^\\s*${command}\\b[:：]?\\s*`, 'i');
  if (!regex.test(messageText || '')) return { matched: false, content: '' };
  return { matched: true, content: String(messageText).replace(regex, '').trim() };
}

/**
 * 按业务规则合并旧画像与新画像。
 * @param oldProfile 旧画像对象
 * @param newProfile 新抽取画像对象
 * @param displayName 当前显示昵称
 * @param updatedAt 更新时间戳（秒）
 * @returns 合并后的画像对象（null 不覆盖、数组去重）
 */
export function mergeProfile(oldProfile, newProfile, displayName, updatedAt) {
  const safeOld = oldProfile && typeof oldProfile === 'object' && !Array.isArray(oldProfile) ? oldProfile : {};
  const merged = {
    common_name: normalizeNullableString(safeOld.common_name),
    language: normalizeNullableString(safeOld.language),
    location: normalizeNullableString(safeOld.location),
    identity: normalizeNullableString(safeOld.identity),
    likes: normalizeStringArray(safeOld.likes),
    dislikes: normalizeStringArray(safeOld.dislikes),
  };

  for (const key of ['common_name', 'language', 'location', 'identity']) {
    const incoming = newProfile[key];
    if (incoming !== null) merged[key] = incoming;
  }

  merged.likes = normalizeStringArray([...merged.likes, ...newProfile.likes]);
  merged.dislikes = normalizeStringArray([...merged.dislikes, ...newProfile.dislikes]);
  merged.updated_at = updatedAt;
  merged.display_name = displayName;
  return merged;
}

/**
 * 调用 DeepSeek 从自由文本中抽取结构化画像。
 * @param content setprofile 命令正文
 * @returns 经过结构校验与清洗的画像对象
 * @throws 当 key 缺失、JSON 非法或调用失败时抛错
 */
export async function extractProfileWithDeepSeek(content) {
  if (!deepseekClient) {
    throw new Error('DEEPSEEK_API_KEY is missing on API server');
  }

  const systemPrompt = [
    '你是一个严格的JSON生成器。',
    '',
    '任务：',
    '从用户输入中提取个人资料信息。',
    '',
    '要求：',
    '1. 只输出 JSON，不要输出任何解释或多余文字。',
    '2. 不要添加用户未明确提到的信息。',
    '3. 未提到的字段使用 null 或 空数组。',
    '4. 输出字段必须严格匹配指定格式。',
    '5. 不要把“你/我/他”等代词、@提及、称呼词放入 likes/dislikes。',
  ].join('\n');

  const userPrompt = [
    '请从下面的文本中提取用户个人资料信息。',
    '',
    '需要提取字段：',
    '- common_name（常用名）',
    '- language（语言）',
    '- location（居住地）',
    '- identity（身份）',
    '- likes（喜欢的内容，数组）',
    '- dislikes（不喜欢的内容，数组）',
    '',
    '文本：',
    `"${content}"`,
    '',
    '请严格按照以下 JSON 格式输出：',
    '',
    '{',
    '  "common_name": "",',
    '  "language": "",',
    '  "location": "",',
    '  "identity": "",',
    '  "likes": [],',
    '  "dislikes": []',
    '}',
  ].join('\n');

  const response = await deepseekClient.chat.completions.create({
    model: SERVER_CONFIG.profile.model,
    messages: [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: userPrompt },
    ],
    response_format: { type: 'json_object' },
    max_tokens: 500,
    temperature: 1.0,
  });

  const text = response.choices[0]?.message?.content || '{}';
  let parsed;
  try {
    parsed = JSON.parse(text);
  } catch (error) {
    throw new Error(`invalid JSON from DeepSeek: ${error.message}`);
  }

  return validateAndNormalizeExtractedProfile(parsed, content);
}
