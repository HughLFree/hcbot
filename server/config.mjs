/**
 * ==============
 * Module: config
 * Layer: Backend
 * Responsibility:
 * - 读取并规范化服务端配置
 * - 提供统一的 SERVER_CONFIG 对象
 * - 作为前端 bootstrap 的配置来源
 * ==============
 */
import fs from 'node:fs';
import path from 'node:path';

/**
 * [Function]
 * Name: parseNumber
 * Purpose: 读取数值型配置并提供兜底值。
 * Input: value/fallback
 * Output: number
 */
function parseNumber(value, fallback) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

/**
 * [Function]
 * Name: readJsonObject
 * Purpose: 读取 JSON 文件并返回对象；读取失败时返回 null。
 * Input: filePath
 * Output: object | null
 */
function readJsonObject(filePath) {
  if (!fs.existsSync(filePath)) return null;
  try {
    const parsed = JSON.parse(fs.readFileSync(filePath, 'utf8'));
    return parsed && typeof parsed === 'object' ? parsed : null;
  } catch (error) {
    console.warn(`[config] invalid JSON file ignored: ${filePath}`, error);
    return null;
  }
}

/** @type {import('../shared/contracts').ModelProviderOption[]} */
const FALLBACK_PROVIDERS = [
  {
    id: 'deepseek',
    label: 'DeepSeek',
    subtitle: 'V3 Chat',
    enabled: true,
  },
];

/** @type {import('../shared/contracts').BotDefaults} */
const FALLBACK_DEFAULTS = {
  channel: 'bot',
  botName: 'bot',
  provider: 'deepseek',
  personality: '',
  replyMode: 'mention',
};

/**
 * [Function]
 * Name: normalizeProviders
 * Purpose: 规范化 providers 配置并过滤非法项。
 * @param {unknown} rawProviders
 * @returns {import('../shared/contracts').ModelProviderOption[]}
 */
function normalizeProviders(rawProviders) {
  if (!Array.isArray(rawProviders)) return FALLBACK_PROVIDERS;

  const normalized = rawProviders
    .filter((item) => item && typeof item === 'object')
    .map((item) => {
      if (typeof item.id !== 'string' || item.id.trim().length === 0) return null;
      if (typeof item.label !== 'string' || item.label.trim().length === 0) return null;
      return {
        id: item.id.trim(),
        label: item.label.trim(),
        subtitle: typeof item.subtitle === 'string' ? item.subtitle : undefined,
        enabled: item.enabled !== false,
      };
    })
    .filter(Boolean);

  return normalized.length > 0 ? normalized : FALLBACK_PROVIDERS;
}

/**
 * [Function]
 * Name: normalizeDefaults
 * Purpose: 规范化 defaults 配置，并保证 provider 与 providers 一致。
 * @param {unknown} rawDefaults
 * @param {import('../shared/contracts').ModelProviderOption[]} providers
 * @returns {import('../shared/contracts').BotDefaults}
 */
function normalizeDefaults(rawDefaults, providers) {
  const defaults = { ...FALLBACK_DEFAULTS };
  if (!rawDefaults || typeof rawDefaults !== 'object') return defaults;
  const safeDefaults = /** @type {Record<string, unknown>} */ (rawDefaults);

  if (typeof safeDefaults.channel === 'string' && safeDefaults.channel.trim().length > 0) {
    defaults.channel = safeDefaults.channel.trim();
  }
  if (typeof safeDefaults.botName === 'string' && safeDefaults.botName.trim().length > 0) {
    defaults.botName = safeDefaults.botName.trim();
  }
  if (typeof safeDefaults.provider === 'string' && safeDefaults.provider.trim().length > 0) {
    defaults.provider = safeDefaults.provider.trim();
  }
  if (typeof safeDefaults.personality === 'string' && safeDefaults.personality.trim().length > 0) {
    defaults.personality = safeDefaults.personality.trim();
  }
  if (safeDefaults.replyMode === 'mention' || safeDefaults.replyMode === 'all') {
    defaults.replyMode = safeDefaults.replyMode;
  }

  if (!providers.some((item) => item.id === defaults.provider)) {
    defaults.provider = providers[0]?.id || FALLBACK_DEFAULTS.provider;
  }

  return defaults;
}

/**
 * [Function]
 * Name: readBotBootstrap
 * Purpose: 从本地/示例 JSON 读取 bootstrap，并返回最终可用配置。
 * @returns {import('../shared/contracts').BotBootstrap}
 */
function readBotBootstrap() {
  const localJsonPath = path.resolve(process.cwd(), 'server/bot.defaults.local.json');
  const exampleJsonPath = path.resolve(process.cwd(), 'server/bot.defaults.example.json');

  const rawJson = readJsonObject(localJsonPath) || readJsonObject(exampleJsonPath) || {};
  const safeJson = /** @type {Record<string, unknown>} */ (rawJson);
  const rawDefaults = safeJson.defaults && typeof safeJson.defaults === 'object'
    ? safeJson.defaults
    : {};
  const providers = normalizeProviders(safeJson.providers);
  const defaults = normalizeDefaults(rawDefaults, providers);

  return {
    defaults,
    providers,
  };
}

/**
 * [Constant]
 * Name: SERVER_CONFIG
 * Purpose: 后端运行时统一配置对象（建议所有模块都从这里读取配置）。
 */
export const SERVER_CONFIG = {
  apiPort: parseNumber(process.env.API_PORT, 8787),
  embeddingDim: parseNumber(process.env.EMBEDDING_DIM, 1536),
  dataDir: path.resolve(process.cwd(), 'data'),
  dbFilename: 'chat_memory.sqlite3',

  memory: {
    minImportance: 1,
    maxImportance: 10,
    defaultImportance: 5,

    /**
     * 记忆 TTL 默认值（单位：天）
     * - null: 永久不过期（当前默认）
     * - 例如 30: 默认 30 天过期
     */
    defaultTtlDays: null,
  },

  profile: {
    // 触发更新资料的命令前缀（大小写不敏感）
    command: 'setprofile',
    // setprofile 内容最大长度（超出则拒绝处理）
    maxInputChars: 200,
    // DeepSeek 模型名
    model: 'deepseek-chat',
  },

  // 前端启动时读取的单一配置源（后端为准）
  bootstrap: readBotBootstrap(),
};
