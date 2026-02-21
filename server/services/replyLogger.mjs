/**
 * 模块职责：
 * 记录 reply 请求的结构化日志（JSON Lines）。
 * 设计原则：日志失败不影响主业务流程。
 */
import fs from 'node:fs';
import path from 'node:path';
import { SERVER_CONFIG } from '../config.mjs';

const REPLY_LOG_PATH = path.join(SERVER_CONFIG.dataDir, 'reply.log');

fs.mkdirSync(SERVER_CONFIG.dataDir, { recursive: true });

function safeStringify(payload) {
  try {
    return JSON.stringify(payload, null, 2);
  } catch (error) {
    return JSON.stringify({
      log_error: 'stringify_failed',
      reason: error instanceof Error ? error.message : 'unknown error',
    }, null, 2);
  }
}

/**
 * 追加一条回复日志，采用 JSON Lines（一行一条 JSON）。
 */
export function appendReplyLog(entry) {
  const line = `${safeStringify({
    logged_at: new Date().toISOString(),
    ...entry,
  })}\n\n`;

  fs.appendFile(REPLY_LOG_PATH, line, (error) => {
    if (error) {
      console.warn('[reply-log] append failed:', error.message);
    }
  });
}

/**
 * 获取 reply 日志文件路径。
 */
export function getReplyLogPath() {
  return REPLY_LOG_PATH;
}
