import { SERVER_CONFIG } from '../../config.mjs';

/**
 * 解析并夹紧重要度阈值。
 */
export function toImportanceThreshold(rawValue, fallback) {
  const value = Number(rawValue);
  if (!Number.isFinite(value)) return fallback;
  return Math.max(
    SERVER_CONFIG.memory.minImportance,
    Math.min(SERVER_CONFIG.memory.maxImportance, Math.floor(value))
  );
}

/**
 * 解析并夹紧通用条数限制（1..30）。
 */
export function toPositiveLimit(rawValue, fallback) {
  const value = Number(rawValue);
  if (!Number.isFinite(value)) return fallback;
  return Math.max(1, Math.min(30, Math.floor(value)));
}

/**
 * 解析并夹紧条数限制（上限由调用方传入）。
 */
export function toPositiveLimitWithMax(rawValue, fallback, max) {
  const value = Number(rawValue);
  if (!Number.isFinite(value)) return fallback;
  return Math.max(1, Math.min(max, Math.floor(value)));
}

/**
 * 宽松解析布尔值（支持 boolean/number/string）。
 */
export function toOptionalBoolean(rawValue) {
  if (typeof rawValue === 'boolean') return rawValue;
  if (typeof rawValue === 'number') return rawValue !== 0;
  if (typeof rawValue !== 'string') return undefined;
  const normalized = rawValue.trim().toLowerCase();
  if (['1', 'true', 'yes', 'on'].includes(normalized)) return true;
  if (['0', 'false', 'no', 'off'].includes(normalized)) return false;
  return undefined;
}

/**
 * 解析回复 pipeline 模式。
 */
export function toReplyPipelineMode(rawValue) {
  return rawValue === 'two_pass' ? 'two_pass' : 'single';
}

/**
 * 把 user_profile.profile_json 规范化为 prompt 文本块。
 */
export function toProfileContext(profile) {
  if (!profile || typeof profile !== 'object' || Array.isArray(profile)) return '';

  const lines = [];
  for (const [key, value] of Object.entries(profile)) {
    if (key === 'updated_at') continue;
    if (value === null || value === undefined) continue;
    if (typeof value === 'string' && value.trim().length === 0) continue;
    if (Array.isArray(value) && value.length === 0) continue;
    lines.push(`- ${key}: ${JSON.stringify(value)}`);
  }
  return lines.join('\n');
}

/**
 * 把 memory_digest_json 规范化为可读文本块。
 */
export function toMemoryDigestContext(memoryDigest) {
  if (!memoryDigest || typeof memoryDigest !== 'object' || Array.isArray(memoryDigest)) return '';

  const lines = [];
  const highlights = Array.isArray(memoryDigest.highlights) ? memoryDigest.highlights : [];
  const stablePreferences = Array.isArray(memoryDigest.stable_preferences) ? memoryDigest.stable_preferences : [];
  const ongoingThreads = Array.isArray(memoryDigest.ongoing_threads) ? memoryDigest.ongoing_threads : [];

  if (highlights.length > 0) {
    lines.push('用户记忆梗概（highlights）:');
    for (const item of highlights) {
      if (typeof item !== 'string' || item.trim().length === 0) continue;
      lines.push(`- ${item.trim()}`);
    }
  }

  if (ongoingThreads.length > 0) {
    lines.push('用户进行中话题（ongoing_threads）:');
    for (const item of ongoingThreads) {
      if (!item || typeof item !== 'object' || Array.isArray(item)) continue;
      const topic = typeof item.topic === 'string' ? item.topic.trim() : '';
      const status = typeof item.status === 'string' ? item.status.trim() : '';
      const note = typeof item.note === 'string' ? item.note.trim() : '';
      const line = [topic && `topic=${topic}`, status && `status=${status}`, note && `note=${note}`]
        .filter(Boolean)
        .join(', ');
      if (line) lines.push(`- ${line}`);
    }
  }

  if (stablePreferences.length > 0) {
    lines.push('用户稳定偏好（stable_preferences）:');
    for (const item of stablePreferences) {
      if (typeof item !== 'string' || item.trim().length === 0) continue;
      lines.push(`- ${item.trim()}`);
    }
  }

  return lines.join('\n');
}
