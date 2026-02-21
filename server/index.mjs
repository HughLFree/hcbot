/**
 * ===================
 * Module: serverEntry
 * Layer: Backend Entry
 * Responsibility:
 * - 启动 Express 应用
 * - 注册路由与中间件
 * - 执行启动清理并输出运行信息
 * ===================
 */
import express from 'express';
import cors from 'cors';
import { SERVER_CONFIG } from './config.mjs';
import { cleanupTtlAndVectors, getDbInfo, initDb } from './db/index.mjs';
import { registerRoutes } from './routes/index.mjs';
import { getReplyLogPath } from './services/replyLogger.mjs';

/**
 * [Function]
 * Name: bootstrapServer
 * Purpose: 初始化并启动 API 服务。
 * Output: void
 */
function bootstrapServer() {
  initDb();

  const app = express();
  app.use(cors());
  app.use(express.json({ limit: '1mb' }));

  registerRoutes(app);

  const startupCleanup = cleanupTtlAndVectors();
  const dbInfo = getDbInfo();
  console.log(`[db] startup cleanup: memories=${startupCleanup.removedMemories}, vectors=${startupCleanup.removedVectors}`);
  console.log(`[db] sqlite path: ${dbInfo.dbPath}`);
  console.log(`[reply-log] path: ${getReplyLogPath()}`);

  app.listen(SERVER_CONFIG.apiPort, () => {
    console.log(`[api] listening on http://localhost:${SERVER_CONFIG.apiPort}`);
  });
}

bootstrapServer();
