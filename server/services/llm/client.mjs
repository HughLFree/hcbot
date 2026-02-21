import { OpenAI } from 'openai';

/**
 * 模块职责：
 * 提供统一的 DeepSeek 客户端单例，避免在多个 service 中重复初始化。
 */
const DEEPSEEK_API_URL = 'https://api.deepseek.com';

const deepseekClient = process.env.DEEPSEEK_API_KEY
  ? new OpenAI({
      baseURL: DEEPSEEK_API_URL,
      apiKey: process.env.DEEPSEEK_API_KEY,
    })
  : null;

/**
 * 判断 DeepSeek 客户端是否可用（是否配置了 API key）。
 */
export function isDeepSeekClientReady() {
  return Boolean(deepseekClient);
}

/**
 * 获取 DeepSeek 客户端实例。
 * 未配置 key 时抛错，交由上层路由做错误映射。
 */
export function getDeepSeekClient() {
  if (!deepseekClient) {
    throw new Error('DEEPSEEK_API_KEY is missing on API server');
  }
  return deepseekClient;
}
